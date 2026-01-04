/**
 * DJ Mix Web - Mixer Controller
 * Handles EQ, Volume, and Crossfader controls
 */

class MixerController {
    constructor(audioEngine) {
        this.audioEngine = audioEngine;

        // DOM elements
        this.elements = this.getElements();

        // Knob instances
        this.knobs = {};

        // Initialize
        this.init();
    }

    /**
     * Get DOM elements
     */
    getElements() {
        return {
            // EQ Knobs
            eqHighA: document.getElementById('eqHighA'),
            eqMidA: document.getElementById('eqMidA'),
            eqLowA: document.getElementById('eqLowA'),
            eqHighB: document.getElementById('eqHighB'),
            eqMidB: document.getElementById('eqMidB'),
            eqLowB: document.getElementById('eqLowB'),

            // Volume Faders
            volumeA: document.getElementById('volumeA'),
            volumeB: document.getElementById('volumeB'),

            // Volume Meters
            meterA: document.getElementById('meterA'),
            meterB: document.getElementById('meterB'),

            // Crossfader
            crossfader: document.getElementById('crossfader')
        };
    }

    /**
     * Initialize mixer controller
     */
    init() {
        this.setupEQKnobs();
        this.setupVolumeFaders();
        this.setupCrossfader();
        this.setupAudioEngineListeners();
    }

    /**
     * Setup EQ knobs
     */
    setupEQKnobs() {
        // Deck A EQ
        this.knobs.eqHighA = new Knob(this.elements.eqHighA, {
            onChange: (value) => this.audioEngine.setEQ('A', 'high', value)
        });

        this.knobs.eqMidA = new Knob(this.elements.eqMidA, {
            onChange: (value) => this.audioEngine.setEQ('A', 'mid', value)
        });

        this.knobs.eqLowA = new Knob(this.elements.eqLowA, {
            onChange: (value) => this.audioEngine.setEQ('A', 'low', value)
        });

        // Deck B EQ
        this.knobs.eqHighB = new Knob(this.elements.eqHighB, {
            onChange: (value) => this.audioEngine.setEQ('B', 'high', value)
        });

        this.knobs.eqMidB = new Knob(this.elements.eqMidB, {
            onChange: (value) => this.audioEngine.setEQ('B', 'mid', value)
        });

        this.knobs.eqLowB = new Knob(this.elements.eqLowB, {
            onChange: (value) => this.audioEngine.setEQ('B', 'low', value)
        });
    }

    /**
     * Setup volume faders
     */
    setupVolumeFaders() {
        this.elements.volumeA.addEventListener('input', (e) => {
            const volume = parseFloat(e.target.value);
            this.audioEngine.setVolume('A', volume);
        });

        this.elements.volumeB.addEventListener('input', (e) => {
            const volume = parseFloat(e.target.value);
            this.audioEngine.setVolume('B', volume);
        });
    }

    /**
     * Setup crossfader
     */
    setupCrossfader() {
        this.elements.crossfader.addEventListener('input', (e) => {
            const position = parseFloat(e.target.value);
            this.audioEngine.setCrossfader(position);
        });

        // Double click to center
        this.elements.crossfader.addEventListener('dblclick', () => {
            this.elements.crossfader.value = 0.5;
            this.audioEngine.setCrossfader(0.5);
        });
    }

    /**
     * Setup audio engine event listeners
     */
    setupAudioEngineListeners() {
        // Volume level updates for meters
        this.audioEngine.on('volumeLevel', (deckId, level) => {
            this.updateMeter(deckId, level);
        });
    }

    /**
     * Update volume meter
     */
    updateMeter(deckId, level) {
        const meter = deckId === 'A' ? this.elements.meterA : this.elements.meterB;
        if (!meter) return;

        const fill = meter.querySelector('.meter-fill');
        if (fill) {
            // Apply some smoothing and scaling
            const displayLevel = Math.pow(level, 0.7) * 100;
            fill.style.height = `${Math.min(displayLevel, 100)}%`;
        }
    }

    /**
     * Reset all mixer controls
     */
    reset() {
        // Reset EQ
        Object.values(this.knobs).forEach(knob => knob.reset());

        // Reset volume
        this.elements.volumeA.value = 1;
        this.elements.volumeB.value = 1;
        this.audioEngine.setVolume('A', 1);
        this.audioEngine.setVolume('B', 1);

        // Reset crossfader
        this.elements.crossfader.value = 0.5;
        this.audioEngine.setCrossfader(0.5);
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MixerController;
}
