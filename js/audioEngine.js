/**
 * DJ Mix Web - Audio Engine
 * Core audio processing using Web Audio API
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

        // Browser support flags
        this.supportsPreservesPitch = false;
    }

    /**
     * Create initial deck state
     */
    createDeckState(id) {
        return {
            id,
            audioBuffer: null,

            // Audio source node (recreated each play)
            source: null,

            // Audio nodes
            gainNode: null,
            eqLow: null,
            eqMid: null,
            eqHigh: null,
            analyser: null,

            // Playback state
            isPlaying: false,
            isPaused: false,
            startTime: 0,        // AudioContext time when playback started
            startOffset: 0,      // Position in track when playback started
            currentPosition: 0,  // Current position in seconds
            duration: 0,
            tempo: 1.0,

            // Volume
            volume: 1.0,

            // EQ values (dB)
            eqLowValue: 0,
            eqMidValue: 0,
            eqHighValue: 0,

            // Cue points
            cuePoint: 0,
            hotCues: [null, null, null, null],

            // Track info
            trackName: '',
            bpm: 0,

            // Pitch shift in semitones
            pitchSemitones: 0,

            // For linked/independent mode
            preservesPitch: true
        };
    }

    /**
     * Check if browser supports preservesPitch
     */
    checkPreservesPitchSupport() {
        const testSource = this.audioContext.createBufferSource();
        // Use typeof for more robust detection (some browsers expose it as getter)
        return typeof testSource.preservesPitch === 'boolean' ||
               typeof testSource.mozPreservesPitch === 'boolean' ||
               typeof testSource.webkitPreservesPitch === 'boolean';
    }

    /**
     * Set preservesPitch on a source node (handles vendor prefixes)
     */
    setSourcePreservesPitch(source, preserve) {
        if ('preservesPitch' in source) {
            source.preservesPitch = preserve;
        } else if ('mozPreservesPitch' in source) {
            source.mozPreservesPitch = preserve;
        } else if ('webkitPreservesPitch' in source) {
            source.webkitPreservesPitch = preserve;
        }
    }

    /**
     * Initialize audio context (must be called after user interaction)
     */
    async init() {
        if (this.audioContext) return;

        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Check browser support
        this.supportsPreservesPitch = this.checkPreservesPitchSupport();

        if (this.supportsPreservesPitch) {
            console.log('Browser supports preservesPitch - time-stretching enabled');
        } else {
            console.warn('Browser does NOT support preservesPitch - tempo changes will affect pitch (vinyl-like behavior)');
        }

        // Create master gain
        this.masterGain = this.audioContext.createGain();
        this.masterGain.connect(this.audioContext.destination);

        // Initialize deck nodes
        for (const deckId of ['A', 'B']) {
            this.initDeckNodes(deckId);
        }

        // Start position update loop
        this.startPositionLoop();

        console.log('Audio Engine initialized');
    }

    /**
     * Initialize audio nodes for a deck
     */
    initDeckNodes(deckId) {
        const deck = this.decks[deckId];

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

        // Connect chain: [source] -> eqLow -> eqMid -> eqHigh -> gain -> analyser -> master
        deck.eqLow.connect(deck.eqMid);
        deck.eqMid.connect(deck.eqHigh);
        deck.eqHigh.connect(deck.gainNode);
        deck.gainNode.connect(deck.analyser);
        deck.analyser.connect(this.masterGain);
    }

    /**
     * Load audio file into a deck
     */
    async loadTrack(deckId, file) {
        const deck = this.decks[deckId];

        // Stop current playback
        this.stop(deckId);

        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();

        // Decode audio data
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

        // Store in deck
        deck.audioBuffer = audioBuffer;
        deck.duration = audioBuffer.duration;
        deck.trackName = Utils.getFileNameWithoutExt(file.name);
        deck.currentPosition = 0;
        deck.cuePoint = 0;
        deck.hotCues = [null, null, null, null];

        // Detect BPM
        const bpmDetector = new BPMDetector();
        deck.bpm = await bpmDetector.detect(audioBuffer);

        // Generate waveform
        const waveformGenerator = new WaveformGenerator();
        const waveformData = waveformGenerator.generate(audioBuffer);

        // Emit events
        this.events.emit('trackLoaded', deckId, {
            name: deck.trackName,
            duration: deck.duration,
            bpm: deck.bpm,
            waveformData
        });

        return {
            name: deck.trackName,
            duration: deck.duration,
            bpm: deck.bpm,
            waveformData
        };
    }

    /**
     * Create audio source for a deck
     */
    createSource(deckId) {
        const deck = this.decks[deckId];
        if (!deck.audioBuffer) return null;

        // Create buffer source
        const source = this.audioContext.createBufferSource();
        source.buffer = deck.audioBuffer;

        // Set playback rate (tempo)
        source.playbackRate.value = deck.tempo;

        // Set preservesPitch based on mode and browser support
        if (this.supportsPreservesPitch) {
            // In linked mode: preserve pitch (tempo doesn't affect pitch)
            // In independent mode: don't preserve pitch (vinyl-like)
            this.setSourcePreservesPitch(source, deck.preservesPitch);
        }

        // Set detune for pitch shifting (100 cents = 1 semitone)
        // Only apply in linked mode when preservesPitch is true
        if (deck.preservesPitch && deck.pitchSemitones !== 0) {
            source.detune.value = deck.pitchSemitones * 100;
        }

        // Connect to EQ chain
        source.connect(deck.eqLow);

        // Handle track end
        source.onended = () => {
            if (deck.isPlaying && !deck.isPaused) {
                const position = this.getPosition(deckId);
                if (position >= deck.duration - 0.1) {
                    this.stop(deckId);
                    this.events.emit('trackEnded', deckId);
                }
            }
        };

        return source;
    }

    /**
     * Play a deck
     */
    play(deckId) {
        const deck = this.decks[deckId];
        if (!deck.audioBuffer) return;

        // If already playing, do nothing
        if (deck.isPlaying && !deck.isPaused) return;

        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        // Stop existing source
        if (deck.source) {
            try {
                deck.source.stop();
                deck.source.disconnect();
            } catch (e) {}
            deck.source = null;
        }

        // Create new source
        deck.source = this.createSource(deckId);
        if (!deck.source) return;

        // Calculate start offset
        const offset = deck.isPaused ? deck.currentPosition : deck.currentPosition;

        // Store timing info
        deck.startTime = this.audioContext.currentTime;
        deck.startOffset = offset;

        // Start playback from offset
        deck.source.start(0, offset);

        deck.isPlaying = true;
        deck.isPaused = false;

        this.updateCrossfaderGains();
        this.events.emit('play', deckId);
    }

    /**
     * Pause a deck
     */
    pause(deckId) {
        const deck = this.decks[deckId];
        if (!deck.isPlaying || deck.isPaused) return;

        // Save current position before stopping
        deck.currentPosition = this.getPosition(deckId);

        // Stop source
        if (deck.source) {
            try {
                deck.source.stop();
                deck.source.disconnect();
            } catch (e) {}
            deck.source = null;
        }

        deck.isPaused = true;
        this.events.emit('pause', deckId);
    }

    /**
     * Stop a deck (reset to cue point)
     */
    stop(deckId) {
        const deck = this.decks[deckId];

        // Stop source
        if (deck.source) {
            try {
                deck.source.stop();
                deck.source.disconnect();
            } catch (e) {}
            deck.source = null;
        }

        deck.isPlaying = false;
        deck.isPaused = false;
        deck.currentPosition = deck.cuePoint;

        this.events.emit('stop', deckId);
    }

    /**
     * Get current playback position in seconds
     */
    getPosition(deckId) {
        const deck = this.decks[deckId];

        if (!deck.audioBuffer) return 0;

        if (deck.isPaused || !deck.isPlaying) {
            return deck.currentPosition;
        }

        // Calculate position based on elapsed time and playback rate
        const elapsed = this.audioContext.currentTime - deck.startTime;
        const position = deck.startOffset + (elapsed * deck.tempo);

        return Math.min(position, deck.duration);
    }

    /**
     * Seek to a position in seconds
     */
    seek(deckId, position) {
        const deck = this.decks[deckId];
        if (!deck.audioBuffer) return;

        position = Utils.clamp(position, 0, deck.duration);

        const wasPlaying = deck.isPlaying && !deck.isPaused;

        // Stop current playback
        if (deck.source) {
            try {
                deck.source.stop();
                deck.source.disconnect();
            } catch (e) {}
            deck.source = null;
        }

        // Update position
        deck.currentPosition = position;
        deck.isPlaying = false;
        deck.isPaused = false;

        // Resume if was playing
        if (wasPlaying) {
            this.play(deckId);
        }

        this.events.emit('seek', deckId, position);
    }

    /**
     * Set tempo (playback rate)
     */
    setTempo(deckId, tempo) {
        const deck = this.decks[deckId];
        tempo = Utils.clamp(tempo, 0.5, 1.5);

        // Save current position before changing tempo
        if (deck.isPlaying && !deck.isPaused) {
            deck.currentPosition = this.getPosition(deckId);
            deck.startTime = this.audioContext.currentTime;
            deck.startOffset = deck.currentPosition;
        }

        deck.tempo = tempo;

        // Update source playback rate if playing
        if (deck.source) {
            deck.source.playbackRate.value = tempo;
        }

        this.events.emit('tempoChange', deckId, tempo);
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
        if (index < 1 || index > 4) return;

        const position = this.getPosition(deckId);
        deck.hotCues[index - 1] = position;
        this.events.emit('hotCueSet', deckId, index, position);
    }

    /**
     * Jump to hot cue (1-4)
     */
    goToHotCue(deckId, index) {
        const deck = this.decks[deckId];
        if (index < 1 || index > 4) return;

        const position = deck.hotCues[index - 1];
        if (position !== null) {
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
        if (index < 1 || index > 4) return;

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

        if (!this.supportsPreservesPitch && preserve) {
            console.warn(`Deck ${deckId}: preservesPitch not supported - tempo will affect pitch`);
        }

        // If playing, restart to apply changes
        if (deck.isPlaying && !deck.isPaused) {
            const currentPos = this.getPosition(deckId);
            if (deck.source) {
                try {
                    deck.source.stop();
                    deck.source.disconnect();
                } catch (e) {}
                deck.source = null;
            }
            deck.currentPosition = currentPos;
            deck.isPlaying = false;
            this.play(deckId);
        }
    }

    /**
     * Set pitch shift in semitones (-12 to +12)
     * Uses detune parameter (100 cents = 1 semitone)
     * Only works when preservesPitch is true (linked mode)
     */
    setPitch(deckId, semitones) {
        const deck = this.decks[deckId];
        semitones = Utils.clamp(semitones, -12, 12);
        deck.pitchSemitones = semitones;

        // Update source detune if playing
        if (deck.source && deck.source.detune) {
            // Only apply detune in linked mode
            if (deck.preservesPitch) {
                deck.source.detune.value = semitones * 100;
            }
        }

        this.events.emit('pitchChange', deckId, semitones);
    }

    /**
     * Sync deck to the other deck's tempo
     */
    sync(deckId) {
        const sourceDeck = deckId === 'A' ? this.decks.B : this.decks.A;
        const targetDeck = this.decks[deckId];

        if (!sourceDeck.bpm || !targetDeck.bpm) return;

        // Calculate tempo ratio
        const tempoRatio = sourceDeck.bpm * sourceDeck.tempo / targetDeck.bpm;
        this.setTempo(deckId, Utils.clamp(tempoRatio, 0.5, 1.5));

        this.events.emit('sync', deckId, tempoRatio);
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
            for (const deckId of ['A', 'B']) {
                const deck = this.decks[deckId];
                if (deck.isPlaying && !deck.isPaused) {
                    const position = this.getPosition(deckId);
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
