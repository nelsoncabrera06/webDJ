/**
 * DJ Mix Web - Audio Engine
 * Core audio processing using HTML5 Audio + Web Audio API
 * Uses <audio> elements for playback (with preservesPitch support)
 * Uses Web Audio API for EQ and mixing
 */

class AudioEngine {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;

        // Deck states
        this.decks = {
            A: this.createDeckState('A'),
            B: this.createDeckState('B')
        };

        // Mixer state
        this.crossfaderPosition = 0.5;

        // Event emitter
        this.events = Utils.createEventEmitter();

        // Position update loop
        this.positionLoop = null;

        // Sync (master/slave phase-locked loop)
        this.masterDeckId = null;       // 'A' | 'B' | null
        this.PLL_KP = 0.15;             // proportional gain (rate per beat of phase error); τ≈3s
        this.PLL_MAX_CORRECTION = 0.04; // ±4% clamp on rate correction while holding lock
        this.PLL_DEADBAND = 0.002;      // beats; below this, no correction (avoids hunting)
        this.PLL_SLEW_CLAMP = 0.08;     // wider clamp during the capture window after pressing SYNC
        this.PLL_SLEW_MS = 3000;        // duration of the capture window (faster initial pull-in)
        this.PHASE_EMA_ALPHA = 0.3;     // low-pass on measured phase error
        this.MAX_RATE_SLEW = 0.5;       // max playbackRate change per second (ramping)
    }

    /**
     * Create initial deck state
     */
    createDeckState(id) {
        return {
            id,

            // HTML5 Audio element
            audioElement: null,
            mediaSource: null,  // MediaElementAudioSourceNode
            objectUrl: null,    // For cleanup

            // Audio nodes (Web Audio API)
            gainNode: null,
            eqLow: null,
            eqMid: null,
            eqHigh: null,
            analyser: null,

            // Playback state
            isPlaying: false,
            isPaused: false,
            duration: 0,
            tempo: 1.0,

            // Sync / PLL state
            syncEnabled: false,         // is this deck a slave currently locked?
            syncRole: null,             // 'master' | 'slave' | null
            baseTempo: 1.0,             // user-intended tempo (slider); separate from playbackRate
            syncRatio: 1.0,             // multiplier to match master effective BPM (half/double)
            pllCorrection: 0,           // current PLL output added to the rate
            pllPhaseError: 0,           // EMA-smoothed phase error (beats)
            pllSuspended: false,        // suspend correction during scratch/nudge gestures
            slewUntil: 0,               // timestamp (ms) until which the wider capture clamp applies
            rateTarget: 1.0,            // target playbackRate for the ramp

            // Volume
            volume: 1.0,

            // EQ values (dB)
            eqLowValue: 0,
            eqMidValue: 0,
            eqHighValue: 0,

            // Cue points
            cuePoint: 0,
            hotCues: [null, null, null, null, null, null, null, null],

            // Track info
            trackName: '',
            bpm: 0,

            // Pitch shift in semitones (for independent mode)
            pitchSemitones: 0,
            pitchRatio: 1.0,    // playback-rate multiplier from pitch (independent mode)

            // For linked/independent mode
            preservesPitch: true,

            // Original audio buffer for waveform/BPM
            audioBuffer: null,

            // Loop state
            loopEnabled: false,
            loopStart: 0,        // En segundos
            loopEnd: 0,          // En segundos
            loopBeats: 4,        // Beats (puede ser fracción: 0.03125 = 1/32)

            // Beat grid offset (time of first beat in seconds)
            beatOffset: 0,

            // Beat grid (used for sync phase alignment)
            beatGrid: { bpm: 0, firstBeatTime: 0, confidence: 0 }
        };
    }

    /**
     * Initialize audio context (must be called after user interaction)
     */
    async init() {
        if (this.audioContext) return;

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Create master gain
        this.masterGain = this.audioContext.createGain();
        this.masterGain.connect(this.audioContext.destination);

        // Initialize deck nodes
        for (const deckId of ['A', 'B']) {
            this.initDeckNodes(deckId);
        }

        // Start position update loop
        this.startPositionLoop();

        console.log('Audio Engine initialized (HTML5 Audio mode)');
    }

    /**
     * Initialize audio nodes for a deck
     */
    initDeckNodes(deckId) {
        const deck = this.decks[deckId];

        // Create audio element
        deck.audioElement = new Audio();
        deck.audioElement.crossOrigin = 'anonymous';

        // Create gain node
        deck.gainNode = this.audioContext.createGain();

        // Create EQ nodes (biquad filters)
        deck.eqLow = this.audioContext.createBiquadFilter();
        deck.eqLow.type = 'lowshelf';
        deck.eqLow.frequency.value = 100;
        deck.eqLow.gain.value = 0;

        deck.eqMid = this.audioContext.createBiquadFilter();
        deck.eqMid.type = 'peaking';
        deck.eqMid.frequency.value = 1000;
        deck.eqMid.Q.value = 1;
        deck.eqMid.gain.value = 0;

        deck.eqHigh = this.audioContext.createBiquadFilter();
        deck.eqHigh.type = 'highshelf';
        deck.eqHigh.frequency.value = 10000;
        deck.eqHigh.gain.value = 0;

        // Create analyser for volume metering
        deck.analyser = this.audioContext.createAnalyser();
        deck.analyser.fftSize = 256;

        // Connect EQ chain: eqLow -> eqMid -> eqHigh -> gain -> analyser -> master
        deck.eqLow.connect(deck.eqMid);
        deck.eqMid.connect(deck.eqHigh);
        deck.eqHigh.connect(deck.gainNode);
        deck.gainNode.connect(deck.analyser);
        deck.analyser.connect(this.masterGain);

        // Setup audio element events
        this.setupAudioElementEvents(deckId);
    }

    /**
     * Setup events for audio element
     */
    setupAudioElementEvents(deckId) {
        const deck = this.decks[deckId];
        const audio = deck.audioElement;

        audio.addEventListener('ended', () => {
            deck.isPlaying = false;
            deck.isPaused = false;
            // Track ended → tear down any sync involving this deck
            if (deck.syncRole) this.clearSync(deckId);
            this.events.emit('trackEnded', deckId);
            this.events.emit('stop', deckId);
        });

        audio.addEventListener('play', () => {
            deck.isPlaying = true;
            deck.isPaused = false;
        });

        audio.addEventListener('pause', () => {
            if (deck.isPlaying) {
                deck.isPaused = true;
            }
        });

        audio.addEventListener('loadedmetadata', () => {
            deck.duration = audio.duration;
        });
    }

    /**
     * Connect audio element to Web Audio API
     */
    connectAudioElement(deckId) {
        const deck = this.decks[deckId];

        // Disconnect existing source if any
        if (deck.mediaSource) {
            try {
                deck.mediaSource.disconnect();
            } catch (e) {}
        }

        // Create new MediaElementSourceNode
        deck.mediaSource = this.audioContext.createMediaElementSource(deck.audioElement);

        // Connect to EQ chain
        deck.mediaSource.connect(deck.eqLow);
    }

    /**
     * Load audio file into a deck
     */
    async loadTrack(deckId, file) {
        const deck = this.decks[deckId];

        // Stop current playback
        this.stop(deckId);

        // Cleanup previous object URL
        if (deck.objectUrl) {
            URL.revokeObjectURL(deck.objectUrl);
        }

        // Create object URL for the file
        deck.objectUrl = URL.createObjectURL(file);

        // Create new audio element (needed to change source)
        const oldAudio = deck.audioElement;

        // If this is the first load, connect to Web Audio API
        if (!deck.mediaSource) {
            this.connectAudioElement(deckId);
        }

        // Set the source
        deck.audioElement.src = deck.objectUrl;

        // Apply current settings
        deck.baseTempo = deck.tempo;
        this.applyPlaybackRate(deckId);
        this.setAudioPreservesPitch(deck.audioElement, deck.preservesPitch);

        // Wait for metadata
        await new Promise((resolve, reject) => {
            const onLoaded = () => {
                deck.audioElement.removeEventListener('loadedmetadata', onLoaded);
                deck.audioElement.removeEventListener('error', onError);
                resolve();
            };
            const onError = (e) => {
                deck.audioElement.removeEventListener('loadedmetadata', onLoaded);
                deck.audioElement.removeEventListener('error', onError);
                reject(e);
            };
            deck.audioElement.addEventListener('loadedmetadata', onLoaded);
            deck.audioElement.addEventListener('error', onError);
            deck.audioElement.load();
        });

        // Store track info
        deck.trackName = Utils.getFileNameWithoutExt(file.name);
        deck.duration = deck.audioElement.duration;
        deck.cuePoint = 0;
        deck.hotCues = [null, null, null, null];

        // Decode audio for waveform and BPM detection
        const arrayBuffer = await file.arrayBuffer();
        deck.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

        // Detect BPM and beat grid
        const bpmDetector = new BPMDetector();
        const bpmResult = await bpmDetector.detect(deck.audioBuffer);
        deck.bpm = bpmResult.bpm;
        deck.beatOffset = bpmResult.beatOffset;
        deck.beatGrid = bpmResult.beatGrid || { bpm: deck.bpm, firstBeatTime: 0, confidence: 0 };

        // A new track invalidates any sync involving this deck
        this.clearSync(deckId);

        // Generate waveform
        const waveformGenerator = new WaveformGenerator();
        const waveformData = waveformGenerator.generate(deck.audioBuffer);

        // Emit events
        this.events.emit('trackLoaded', deckId, {
            name: deck.trackName,
            duration: deck.duration,
            bpm: deck.bpm,
            beatOffset: deck.beatOffset,
            waveformData
        });

        return {
            name: deck.trackName,
            duration: deck.duration,
            bpm: deck.bpm,
            beatOffset: deck.beatOffset,
            waveformData
        };
    }

    /**
     * Set preservesPitch on audio element (with vendor prefixes)
     */
    setAudioPreservesPitch(audio, preserve) {
        if ('preservesPitch' in audio) {
            audio.preservesPitch = preserve;
        } else if ('mozPreservesPitch' in audio) {
            audio.mozPreservesPitch = preserve;
        } else if ('webkitPreservesPitch' in audio) {
            audio.webkitPreservesPitch = preserve;
        }
    }

    /**
     * Play a deck
     */
    play(deckId) {
        const deck = this.decks[deckId];
        if (!deck.audioElement.src) return;

        // If already playing, do nothing
        if (deck.isPlaying && !deck.isPaused) return;

        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        deck.audioElement.play();
        deck.isPlaying = true;
        deck.isPaused = false;

        // If the master just (re)started, the slave is off-phase → re-capture
        if (deckId === this.masterDeckId) {
            const slaveId = deckId === 'A' ? 'B' : 'A';
            const slave = this.decks[slaveId];
            if (slave.syncEnabled) {
                slave.pllPhaseError = 0;
                if (!slave.isPlaying || slave.isPaused) {
                    this.alignBeatPhasePaused(slaveId, deckId);
                } else {
                    slave.slewUntil = (typeof performance !== 'undefined' ? performance.now() : 0) + this.PLL_SLEW_MS;
                }
            }
        }

        this.updateCrossfaderGains();
        this.events.emit('play', deckId);
    }

    /**
     * Pause a deck
     */
    pause(deckId) {
        const deck = this.decks[deckId];
        if (!deck.isPlaying || deck.isPaused) return;

        deck.audioElement.pause();
        deck.isPaused = true;
        this.events.emit('pause', deckId);
    }

    /**
     * Stop a deck (reset to cue point)
     */
    stop(deckId) {
        const deck = this.decks[deckId];

        deck.audioElement.pause();
        deck.audioElement.currentTime = deck.cuePoint;

        deck.isPlaying = false;
        deck.isPaused = false;

        this.events.emit('stop', deckId);
    }

    /**
     * Get current playback position in seconds
     */
    getPosition(deckId) {
        const deck = this.decks[deckId];
        return deck.audioElement.currentTime || 0;
    }

    /**
     * Seek to a position in seconds
     */
    seek(deckId, position) {
        const deck = this.decks[deckId];
        if (!deck.audioElement.src) return;
        if (!isFinite(position)) return; // Prevent non-finite values

        position = Utils.clamp(position, 0, deck.duration);
        deck.audioElement.currentTime = position;

        this.events.emit('seek', deckId, position);
    }

    /**
     * Set tempo (user slider intent). Does NOT write playbackRate directly —
     * the rate is composed (tempo × syncRatio × pitch + PLL correction) and
     * ramped smoothly in the position loop to avoid clicks.
     */
    setTempo(deckId, tempo) {
        const deck = this.decks[deckId];
        tempo = Utils.clamp(tempo, 0.5, 1.5);

        deck.tempo = tempo;
        deck.baseTempo = tempo;
        deck.rateTarget = this.composedRate(deckId);

        // While stopped/paused there's no audio, so apply instantly (no click possible)
        if (!deck.isPlaying || deck.isPaused) {
            this.applyPlaybackRate(deckId);
        }

        this.events.emit('tempoChange', deckId, tempo);
    }

    /**
     * Compose the target playback rate from all contributing factors.
     * rate = baseTempo × syncRatio × pitchRatio + (synced ? pllCorrection : 0)
     */
    composedRate(deckId) {
        const deck = this.decks[deckId];
        let rate = deck.baseTempo * deck.syncRatio * deck.pitchRatio;
        if (deck.syncEnabled) rate += deck.pllCorrection;
        return Utils.clamp(rate, 0.25, 4.0);
    }

    /**
     * Write the composed rate to the audio element immediately (no ramp).
     * Used for inaudible contexts (stopped deck, sync ratio change).
     */
    applyPlaybackRate(deckId) {
        const deck = this.decks[deckId];
        if (!deck.audioElement) return;
        const rate = this.composedRate(deckId);
        deck.rateTarget = rate;
        deck.audioElement.playbackRate = rate;
    }

    /**
     * Smoothly move playbackRate toward its composed target, capped per second.
     * Called every frame from the position loop (kills clicks on tempo changes).
     */
    rampRate(deckId, dtSec) {
        const deck = this.decks[deckId];
        if (!deck.audioElement) return;

        const target = this.composedRate(deckId);
        const cur = deck.audioElement.playbackRate;
        const maxStep = this.MAX_RATE_SLEW * dtSec;
        const diff = target - cur;

        if (Math.abs(diff) <= maxStep) {
            if (cur !== target) deck.audioElement.playbackRate = target;
        } else {
            deck.audioElement.playbackRate = cur + Math.sign(diff) * maxStep;
        }
    }

    /**
     * Set volume (0-1)
     */
    setVolume(deckId, volume) {
        const deck = this.decks[deckId];
        deck.volume = Utils.clamp(volume, 0, 1);
        this.updateCrossfaderGains();
        this.events.emit('volumeChange', deckId, volume);
    }

    /**
     * Set EQ band value in dB (-12 to +12)
     */
    setEQ(deckId, band, value) {
        const deck = this.decks[deckId];
        value = Utils.clamp(value, -12, 12);

        switch (band) {
            case 'low':
                deck.eqLowValue = value;
                deck.eqLow.gain.value = value;
                break;
            case 'mid':
                deck.eqMidValue = value;
                deck.eqMid.gain.value = value;
                break;
            case 'high':
                deck.eqHighValue = value;
                deck.eqHigh.gain.value = value;
                break;
        }

        this.events.emit('eqChange', deckId, band, value);
    }

    /**
     * Set crossfader position (0 = A, 0.5 = center, 1 = B)
     */
    setCrossfader(position) {
        this.crossfaderPosition = Utils.clamp(position, 0, 1);
        this.updateCrossfaderGains();
        this.events.emit('crossfaderChange', position);
    }

    /**
     * Update deck gains based on crossfader position and individual volumes
     */
    updateCrossfaderGains() {
        const { gainA, gainB } = Utils.crossfadeGains(this.crossfaderPosition);

        this.decks.A.gainNode.gain.value = this.decks.A.volume * gainA;
        this.decks.B.gainNode.gain.value = this.decks.B.volume * gainB;
    }

    /**
     * Set cue point at current position
     */
    setCuePoint(deckId) {
        const deck = this.decks[deckId];
        deck.cuePoint = this.getPosition(deckId);
        this.events.emit('cuePointSet', deckId, deck.cuePoint);
    }

    /**
     * Jump to cue point
     */
    goToCue(deckId) {
        const deck = this.decks[deckId];
        this.seek(deckId, deck.cuePoint);
    }

    /**
     * Set hot cue (1-4)
     */
    setHotCue(deckId, index) {
        const deck = this.decks[deckId];
        if (index < 1 || index > 8) return;

        const position = this.getPosition(deckId);
        deck.hotCues[index - 1] = position;
        this.events.emit('hotCueSet', deckId, index, position);
    }

    /**
     * Jump to hot cue (1-4)
     */
    goToHotCue(deckId, index) {
        const deck = this.decks[deckId];
        if (index < 1 || index > 8) return;

        const position = deck.hotCues[index - 1];
        if (position != null && isFinite(position)) {
            // Hot cue is set, jump to it
            this.seek(deckId, position);
            if (!deck.isPlaying || deck.isPaused) {
                this.play(deckId);
            }
        } else {
            // If not set, set it
            this.setHotCue(deckId, index);
        }
    }

    /**
     * Clear hot cue (1-4)
     */
    clearHotCue(deckId, index) {
        const deck = this.decks[deckId];
        if (index < 1 || index > 8) return;

        deck.hotCues[index - 1] = null;
        this.events.emit('hotCueCleared', deckId, index);
    }

    /**
     * Set pitch preservation mode
     * In linked mode: tempo doesn't affect pitch (preservesPitch = true)
     * In independent mode: tempo affects pitch like vinyl (preservesPitch = false)
     */
    setPreservesPitch(deckId, preserve) {
        const deck = this.decks[deckId];
        deck.preservesPitch = preserve;

        this.setAudioPreservesPitch(deck.audioElement, preserve);

        // pitch shift only contributes to the rate in independent mode
        deck.pitchRatio = preserve ? 1.0 : Math.pow(2, deck.pitchSemitones / 12);
        deck.rateTarget = this.composedRate(deckId);
        if (!deck.isPlaying || deck.isPaused) this.applyPlaybackRate(deckId);

        console.log(`Deck ${deckId}: preservesPitch = ${preserve}`);
    }

    /**
     * Set pitch shift in semitones (-12 to +12)
     * Note: With HTML5 Audio, pitch shift requires changing playbackRate
     * This only works meaningfully in independent mode
     */
    setPitch(deckId, semitones) {
        const deck = this.decks[deckId];
        semitones = Utils.clamp(semitones, -12, 12);
        deck.pitchSemitones = semitones;

        // In independent mode, pitch shift is applied via playbackRate.
        // In linked mode (keylock) it does not affect the rate.
        deck.pitchRatio = deck.preservesPitch ? 1.0 : Math.pow(2, semitones / 12);
        deck.rateTarget = this.composedRate(deckId);
        if (!deck.isPlaying || deck.isPaused) this.applyPlaybackRate(deckId);

        this.events.emit('pitchChange', deckId, semitones);
    }

    // ---- Sync (master/slave phase-locked loop) ----------------------------

    /**
     * Get the BPM used for the beat grid of a deck (grid bpm preferred).
     */
    getGridBpm(deckId) {
        const deck = this.decks[deckId];
        return deck.beatGrid && deck.beatGrid.bpm ? deck.beatGrid.bpm : deck.bpm;
    }

    /**
     * Absolute beat phase of a deck in [0, 1).
     * Uses MEDIA time (currentTime) and the ORIGINAL bpm — phase is a
     * dimensionless fraction, so it is invariant to playbackRate.
     */
    getBeatPhase(deckId) {
        const deck = this.decks[deckId];
        const bpm = this.getGridBpm(deckId);
        if (!bpm) return null;

        const spb = 60 / bpm;                 // media seconds per beat (original tempo)
        const t = this.getPosition(deckId);
        const firstBeat = deck.beatGrid ? deck.beatGrid.firstBeatTime : 0;
        let phase = ((t - firstBeat) / spb) % 1;
        if (phase < 0) phase += 1;
        return phase;
    }

    /**
     * Phase error (master relative to slave), wrapped to (-0.5, 0.5] beats.
     * Positive => slave is behind the master and should speed up.
     */
    getPhaseError(masterId, slaveId) {
        const pm = this.getBeatPhase(masterId);
        const ps = this.getBeatPhase(slaveId);
        if (pm == null || ps == null) return 0;
        let e = pm - ps;
        e -= Math.round(e); // wrap to (-0.5, 0.5]
        return e;
    }

    /**
     * Compute the tempo ratio that matches the slave's effective BPM to the
     * master's, folding by ×2/÷2 to resolve half/double-time mismatches.
     */
    computeSyncRatio(masterId, slaveId) {
        const masterBpm = this.getGridBpm(masterId);
        const slaveBpm = this.getGridBpm(slaveId);
        const masterDeck = this.decks[masterId];
        if (!masterBpm || !slaveBpm) return 1.0;

        const masterEffective = masterBpm * masterDeck.baseTempo * masterDeck.syncRatio;
        let ratio = masterEffective / slaveBpm;

        // Fold into a comfortable band so 70 vs 140 locks correctly
        while (ratio > 1.4) ratio /= 2;
        while (ratio < 0.7) ratio *= 2;

        return Utils.clamp(ratio, 0.25, 4.0);
    }

    /**
     * Toggle persistent master/slave sync on a deck.
     * Pressing SYNC makes this deck the SLAVE of the other (the MASTER); a PLL
     * keeps it locked in tempo and beat phase. Pressing again un-syncs it.
     */
    sync(deckId) {
        const slave = this.decks[deckId];
        const masterId = deckId === 'A' ? 'B' : 'A';
        const master = this.decks[masterId];

        // Toggle off if this deck is already the slave
        if (slave.syncEnabled && slave.syncRole === 'slave') {
            this.clearSync(deckId);
            return;
        }

        // If this deck is currently the master, swap roles (sync to the other)
        if (slave.syncRole === 'master') {
            this.clearSync(deckId);
        }

        // Need a valid beat grid on both decks
        if (!this.getGridBpm(deckId) || !this.getGridBpm(masterId)) {
            this.events.emit('syncFailed', deckId);
            return;
        }

        // Assign roles
        this.masterDeckId = masterId;
        master.syncRole = 'master';
        master.syncEnabled = false;     // master is never PLL-corrected
        slave.syncRole = 'slave';
        slave.syncEnabled = true;
        slave.pllCorrection = 0;
        slave.pllPhaseError = 0;
        slave.pllSuspended = false;

        // Match tempo (half/double aware)
        slave.syncRatio = this.computeSyncRatio(masterId, deckId);
        slave.rateTarget = this.composedRate(deckId);

        if (!slave.isPlaying || slave.isPaused) {
            // Inaudible: hard-align phase and apply tempo instantly
            this.applyPlaybackRate(deckId);
            this.alignBeatPhasePaused(deckId, masterId);
        } else {
            // Playing: never seek. Open a brief capture window so the PLL
            // pulls into phase faster, then settles to the holding clamp.
            slave.slewUntil = (typeof performance !== 'undefined' ? performance.now() : 0) + this.PLL_SLEW_MS;
        }

        this.events.emit('syncChanged', {
            masterId,
            slaveId: deckId,
            ratio: slave.syncRatio,
            enabled: true
        });
    }

    /**
     * Hard-align the slave's beat phase to the master by seeking currentTime.
     * Only safe (inaudible) when the slave is NOT playing.
     */
    alignBeatPhasePaused(slaveId, masterId) {
        const slave = this.decks[slaveId];
        const bpm = this.getGridBpm(slaveId);
        if (!bpm) return;

        const err = this.getPhaseError(masterId, slaveId); // beats
        const spbMedia = 60 / bpm;
        const newPos = this.getPosition(slaveId) + err * spbMedia;

        if (newPos >= 0 && newPos < slave.duration) {
            slave.audioElement.currentTime = newPos;
        }
    }

    /**
     * Clear sync state for a deck (and its partner role if it was master).
     * Freezes the current playback rate so there is no audible jump.
     */
    clearSync(deckId) {
        const deck = this.decks[deckId];
        const wasSlave = deck.syncRole === 'slave';

        // Freeze rate: bake the current matched tempo into baseTempo, drop PLL
        if (wasSlave) {
            const held = deck.baseTempo * deck.syncRatio;
            deck.baseTempo = Utils.clamp(held, 0.5, 1.5);
            deck.tempo = deck.baseTempo;
        }
        deck.syncEnabled = false;
        deck.syncRole = null;
        deck.syncRatio = 1.0;
        deck.pllCorrection = 0;
        deck.pllPhaseError = 0;
        deck.pllSuspended = false;
        deck.slewUntil = 0;
        deck.rateTarget = this.composedRate(deckId);

        // Clear the partner's role too
        const otherId = deckId === 'A' ? 'B' : 'A';
        const other = this.decks[otherId];
        if (this.masterDeckId === deckId || this.masterDeckId === otherId) {
            other.syncEnabled = false;
            other.syncRole = null;
            this.masterDeckId = null;
        }

        this.events.emit('syncChanged', {
            masterId: this.masterDeckId,
            slaveId: deckId,
            ratio: deck.syncRatio,
            enabled: false
        });
    }

    /**
     * PLL: continuously nudge the slave's playbackRate to hold beat phase with
     * the master. Runs once per frame from the position loop.
     */
    updatePLL() {
        const masterId = this.masterDeckId;
        if (!masterId) return;

        const slaveId = masterId === 'A' ? 'B' : 'A';
        const slave = this.decks[slaveId];
        const master = this.decks[masterId];

        if (!slave.syncEnabled || !slave.isPlaying || slave.isPaused || slave.pllSuspended) return;
        // Master not playing → freeze correction (keep matched tempo)
        if (!master.isPlaying || master.isPaused) return;

        // Smooth the measured phase error to reject currentTime read jitter
        const raw = this.getPhaseError(masterId, slaveId);
        slave.pllPhaseError += this.PHASE_EMA_ALPHA * (raw - slave.pllPhaseError);
        const err = slave.pllPhaseError;

        let correction = 0;
        if (Math.abs(err) > this.PLL_DEADBAND) {
            const now = (typeof performance !== 'undefined' ? performance.now() : 0);
            const clamp = now < slave.slewUntil ? this.PLL_SLEW_CLAMP : this.PLL_MAX_CORRECTION;
            correction = Utils.clamp(err * this.PLL_KP, -clamp, clamp);
        }
        slave.pllCorrection = correction;
        // The ramp in the loop will move playbackRate toward the new composed target
        slave.rateTarget = this.composedRate(slaveId);
    }

    /**
     * Toggle loop on/off
     */
    toggleLoop(deckId) {
        const deck = this.decks[deckId];

        if (deck.loopEnabled) {
            // Disable loop
            deck.loopEnabled = false;
            this.events.emit('loopDisabled', deckId);
        } else {
            // Enable loop at current position
            if (!deck.bpm || deck.bpm <= 0) return;

            // Cuantizar al beat más cercano
            const currentPos = this.getPosition(deckId);
            deck.loopStart = this.quantizeToNearestBeat(deckId, currentPos);

            this.calculateLoopEnd(deckId);
            deck.loopEnabled = true;
            this.events.emit('loopEnabled', deckId, deck.loopStart, deck.loopEnd);
        }
    }

    /**
     * Quantize a time position to the nearest beat
     */
    quantizeToNearestBeat(deckId, time) {
        const deck = this.decks[deckId];
        if (!deck.bpm || deck.bpm <= 0) return time;

        // Quantize against the detected beat grid (firstBeatTime offset) so a
        // loop wrap preserves beat phase for a synced deck.
        const secondsPerBeat = 60 / deck.bpm;
        const firstBeat = deck.beatGrid ? deck.beatGrid.firstBeatTime : 0;
        const beatNumber = Math.round((time - firstBeat) / secondsPerBeat);
        return firstBeat + beatNumber * secondsPerBeat;
    }

    /**
     * Calculate loop end based on BPM and beats
     */
    calculateLoopEnd(deckId) {
        const deck = this.decks[deckId];
        if (!deck.bpm || deck.bpm <= 0) return;

        // seconds per beat = 60 / bpm
        // loop duration = beats * (60 / bpm)
        const secondsPerBeat = 60 / deck.bpm;
        const loopDuration = deck.loopBeats * secondsPerBeat;
        deck.loopEnd = deck.loopStart + loopDuration;

        // Make sure loopEnd doesn't exceed track duration
        if (deck.loopEnd > deck.duration) {
            deck.loopEnd = deck.duration;
        }
    }

    /**
     * Set loop length in beats
     */
    setLoopBeats(deckId, beats) {
        const deck = this.decks[deckId];

        // Clamp to valid range (1/32 to 64)
        beats = Utils.clamp(beats, 0.03125, 64);
        deck.loopBeats = beats;

        // Recalculate loop end if loop is active
        if (deck.loopEnabled) {
            this.calculateLoopEnd(deckId);
            this.events.emit('loopEnabled', deckId, deck.loopStart, deck.loopEnd);
        }

        this.events.emit('loopBeatsChanged', deckId, beats);
    }

    /**
     * Halve the loop length
     */
    halveLoop(deckId) {
        const deck = this.decks[deckId];
        const newBeats = deck.loopBeats / 2;

        // Minimum 1/32 beat
        if (newBeats >= 0.03125) {
            this.setLoopBeats(deckId, newBeats);
        }
    }

    /**
     * Double the loop length
     */
    doubleLoop(deckId) {
        const deck = this.decks[deckId];
        const newBeats = deck.loopBeats * 2;

        // Maximum 64 beats
        if (newBeats <= 64) {
            this.setLoopBeats(deckId, newBeats);
        }
    }

    /**
     * Get volume level from analyser (for metering)
     */
    getVolumeLevel(deckId) {
        const deck = this.decks[deckId];
        if (!deck.analyser) return 0;

        const dataArray = new Uint8Array(deck.analyser.frequencyBinCount);
        deck.analyser.getByteFrequencyData(dataArray);

        // Calculate average
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }

        return sum / dataArray.length / 255;
    }

    /**
     * Start position update loop
     */
    startPositionLoop() {
        if (this.positionLoop) return;

        this.positionLoop = Utils.createAnimationLoop((time, deltaTime) => {
            const dtSec = deltaTime / 1000;

            // Phase-locked loop: nudge the slave's correction toward beat lock
            this.updatePLL();

            for (const deckId of ['A', 'B']) {
                const deck = this.decks[deckId];

                // Smoothly ramp playbackRate toward its composed target (no clicks)
                this.rampRate(deckId, dtSec);

                if (deck.isPlaying && !deck.isPaused) {
                    const position = this.getPosition(deckId);

                    // Loop wrap: jump back to start when reaching end
                    if (deck.loopEnabled && position >= deck.loopEnd) {
                        deck.audioElement.currentTime = deck.loopStart;
                    }

                    this.events.emit('positionUpdate', deckId, position, deck.duration);
                }

                // Volume metering
                const level = this.getVolumeLevel(deckId);
                this.events.emit('volumeLevel', deckId, level);
            }
        }, 30); // 30 FPS for UI updates

        this.positionLoop.start();
    }

    /**
     * Stop position update loop
     */
    stopPositionLoop() {
        if (this.positionLoop) {
            this.positionLoop.stop();
            this.positionLoop = null;
        }
    }

    /**
     * Get deck state
     */
    getDeckState(deckId) {
        const deck = this.decks[deckId];
        return {
            isPlaying: deck.isPlaying,
            isPaused: deck.isPaused,
            position: this.getPosition(deckId),
            duration: deck.duration,
            tempo: deck.tempo,
            volume: deck.volume,
            bpm: deck.bpm,
            trackName: deck.trackName,
            cuePoint: deck.cuePoint,
            hotCues: [...deck.hotCues]
        };
    }

    /**
     * Event subscription
     */
    on(event, callback) {
        return this.events.on(event, callback);
    }

    off(event, callback) {
        this.events.off(event, callback);
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AudioEngine;
}
