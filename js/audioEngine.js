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
    }

    /**
     * Create initial deck state
     */
    createDeckState(id) {
        return {
            id,
            audioBuffer: null,
            source: null,
            gainNode: null,
            eqLow: null,
            eqMid: null,
            eqHigh: null,
            analyser: null,

            // Playback state
            isPlaying: false,
            isPaused: false,
            startTime: 0, // AudioContext time when playback started
            pauseTime: 0, // Position in seconds when paused
            duration: 0,
            tempo: 1.0,
            pitch: 0, // Semitones

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
            bpm: 0
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

        // Connect chain: source -> eqLow -> eqMid -> eqHigh -> gain -> analyser -> master
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
        deck.pauseTime = 0;
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

        // Create new source node
        deck.source = this.audioContext.createBufferSource();
        deck.source.buffer = deck.audioBuffer;
        deck.source.playbackRate.value = deck.tempo;

        // Connect to EQ chain
        deck.source.connect(deck.eqLow);

        // Handle end of playback
        deck.source.onended = () => {
            if (deck.isPlaying && !deck.isPaused) {
                this.stop(deckId);
                this.events.emit('trackEnded', deckId);
            }
        };

        // Start playback
        const offset = deck.pauseTime;
        deck.source.start(0, offset);
        deck.startTime = this.audioContext.currentTime - offset / deck.tempo;

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

        // Save current position
        deck.pauseTime = this.getPosition(deckId);

        // Stop source
        if (deck.source) {
            deck.source.onended = null;
            deck.source.stop();
            deck.source.disconnect();
            deck.source = null;
        }

        deck.isPaused = true;
        this.events.emit('pause', deckId);
    }

    /**
     * Stop a deck (reset to beginning or cue point)
     */
    stop(deckId) {
        const deck = this.decks[deckId];

        // Stop source
        if (deck.source) {
            deck.source.onended = null;
            try {
                deck.source.stop();
            } catch (e) {
                // Source may already be stopped
            }
            deck.source.disconnect();
            deck.source = null;
        }

        deck.isPlaying = false;
        deck.isPaused = false;
        deck.pauseTime = deck.cuePoint;
        deck.startTime = 0;

        this.events.emit('stop', deckId);
    }

    /**
     * Get current playback position in seconds
     */
    getPosition(deckId) {
        const deck = this.decks[deckId];

        if (!deck.audioBuffer) return 0;

        if (deck.isPaused || !deck.isPlaying) {
            return deck.pauseTime;
        }

        const elapsed = (this.audioContext.currentTime - deck.startTime) * deck.tempo;
        return Math.min(elapsed, deck.duration);
    }

    /**
     * Seek to a position in seconds
     */
    seek(deckId, position) {
        const deck = this.decks[deckId];
        if (!deck.audioBuffer) return;

        position = Utils.clamp(position, 0, deck.duration);

        const wasPlaying = deck.isPlaying && !deck.isPaused;

        if (wasPlaying) {
            this.pause(deckId);
        }

        deck.pauseTime = position;

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

        // Update position before changing tempo
        if (deck.isPlaying && !deck.isPaused) {
            deck.pauseTime = this.getPosition(deckId);
            deck.startTime = this.audioContext.currentTime - deck.pauseTime / tempo;
        }

        deck.tempo = tempo;

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
     * Sync deck B to deck A's tempo (or vice versa)
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
