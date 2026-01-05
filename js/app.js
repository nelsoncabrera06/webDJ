/**
 * DJ Mix Web - Main Application
 * Integrates all components
 */

class DJMixApp {
    constructor() {
        this.audioEngine = null;
        this.deckA = null;
        this.deckB = null;
        this.mixer = null;
        this.midiController = null;

        this.isInitialized = false;
    }

    /**
     * Initialize the application
     */
    async init() {
        if (this.isInitialized) return;

        // Create audio engine
        this.audioEngine = new AudioEngine();

        // Initialize on first user interaction
        await this.initAudioContext();

        // Create controllers
        this.deckA = new DeckController('A', this.audioEngine);
        this.deckB = new DeckController('B', this.audioEngine);
        this.mixer = new MixerController(this.audioEngine);

        // Setup keyboard shortcuts
        this.setupKeyboardShortcuts();

        // Setup master BPM display
        this.setupMasterBPM();

        // Setup settings
        this.setupSettings();

        // Setup MIDI controller
        this.setupMIDI();

        this.isInitialized = true;
        console.log('DJ Mix Web initialized');
    }

    /**
     * Initialize audio context (requires user interaction)
     */
    async initAudioContext() {
        const startOverlay = document.getElementById('startOverlay');

        return new Promise((resolve) => {
            const initHandler = async () => {
                await this.audioEngine.init();
                document.removeEventListener('click', initHandler);
                document.removeEventListener('keydown', initHandler);
                // Hide the start overlay
                if (startOverlay) {
                    startOverlay.classList.add('hidden');
                    setTimeout(() => startOverlay.remove(), 300);
                }
                resolve();
            };

            // Try to init immediately (might work if called from user event)
            if (document.readyState === 'complete') {
                this.audioEngine.init().then(() => {
                    if (startOverlay) {
                        startOverlay.classList.add('hidden');
                        setTimeout(() => startOverlay.remove(), 300);
                    }
                    resolve();
                }).catch(() => {
                    // If failed, wait for user interaction
                    document.addEventListener('click', initHandler, { once: true });
                    document.addEventListener('keydown', initHandler, { once: true });
                });
            } else {
                document.addEventListener('click', initHandler, { once: true });
                document.addEventListener('keydown', initHandler, { once: true });
            }
        });
    }

    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ignore if typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            switch (e.code) {
                // Deck A controls
                case 'KeyQ':
                    e.preventDefault();
                    this.audioEngine.play('A');
                    break;
                case 'KeyW':
                    e.preventDefault();
                    this.audioEngine.pause('A');
                    break;
                case 'KeyE':
                    e.preventDefault();
                    this.audioEngine.stop('A');
                    break;
                case 'KeyA':
                    e.preventDefault();
                    this.deckA.cue();
                    break;
                case 'KeyS':
                    e.preventDefault();
                    this.audioEngine.sync('A');
                    break;

                // Deck A Hot Cues (1-4)
                case 'Digit1':
                    e.preventDefault();
                    this.audioEngine.goToHotCue('A', 1);
                    break;
                case 'Digit2':
                    e.preventDefault();
                    this.audioEngine.goToHotCue('A', 2);
                    break;
                case 'Digit3':
                    e.preventDefault();
                    this.audioEngine.goToHotCue('A', 3);
                    break;
                case 'Digit4':
                    e.preventDefault();
                    this.audioEngine.goToHotCue('A', 4);
                    break;

                // Deck B controls
                case 'KeyU':
                    e.preventDefault();
                    this.audioEngine.play('B');
                    break;
                case 'KeyI':
                    e.preventDefault();
                    this.audioEngine.pause('B');
                    break;
                case 'KeyO':
                    e.preventDefault();
                    this.audioEngine.stop('B');
                    break;
                case 'KeyJ':
                    e.preventDefault();
                    this.deckB.cue();
                    break;
                case 'KeyK':
                    e.preventDefault();
                    this.audioEngine.sync('B');
                    break;

                // Deck B Hot Cues (7-0)
                case 'Digit7':
                    e.preventDefault();
                    this.audioEngine.goToHotCue('B', 1);
                    break;
                case 'Digit8':
                    e.preventDefault();
                    this.audioEngine.goToHotCue('B', 2);
                    break;
                case 'Digit9':
                    e.preventDefault();
                    this.audioEngine.goToHotCue('B', 3);
                    break;
                case 'Digit0':
                    e.preventDefault();
                    this.audioEngine.goToHotCue('B', 4);
                    break;

                // Tempo adjustments
                case 'ArrowUp':
                    if (e.shiftKey) {
                        e.preventDefault();
                        this.adjustTempo('A', 0.01);
                    }
                    break;
                case 'ArrowDown':
                    if (e.shiftKey) {
                        e.preventDefault();
                        this.adjustTempo('A', -0.01);
                    }
                    break;
                case 'ArrowRight':
                    if (e.shiftKey) {
                        e.preventDefault();
                        this.adjustTempo('B', 0.01);
                    }
                    break;
                case 'ArrowLeft':
                    if (e.shiftKey) {
                        e.preventDefault();
                        this.adjustTempo('B', -0.01);
                    }
                    break;

                // Crossfader
                case 'KeyZ':
                    e.preventDefault();
                    this.audioEngine.setCrossfader(0); // Full A
                    document.getElementById('crossfader').value = 0;
                    break;
                case 'KeyX':
                    e.preventDefault();
                    this.audioEngine.setCrossfader(0.5); // Center
                    document.getElementById('crossfader').value = 0.5;
                    break;
                case 'KeyC':
                    e.preventDefault();
                    this.audioEngine.setCrossfader(1); // Full B
                    document.getElementById('crossfader').value = 1;
                    break;

                // Space to play/pause active deck
                case 'Space':
                    e.preventDefault();
                    this.togglePlayPause();
                    break;
            }
        });
    }

    /**
     * Adjust tempo for a deck
     */
    adjustTempo(deckId, delta) {
        const deck = this.audioEngine.decks[deckId];
        const newTempo = Utils.clamp(deck.tempo + delta, 0.5, 2.0);
        this.audioEngine.setTempo(deckId, newTempo);
    }

    /**
     * Toggle play/pause for the last active deck or deck A
     */
    togglePlayPause() {
        // Find which deck is playing or was last used
        const deckA = this.audioEngine.decks.A;
        const deckB = this.audioEngine.decks.B;

        let targetDeck = 'A';

        if (deckA.isPlaying && !deckA.isPaused) {
            this.audioEngine.pause('A');
            return;
        }
        if (deckB.isPlaying && !deckB.isPaused) {
            this.audioEngine.pause('B');
            return;
        }

        // If both paused or stopped, play the one with a track loaded
        if (deckA.audioBuffer) {
            this.audioEngine.play('A');
        } else if (deckB.audioBuffer) {
            this.audioEngine.play('B');
        }
    }

    /**
     * Setup master BPM display
     */
    setupMasterBPM() {
        const masterBpmDisplay = document.getElementById('masterBpm');

        // Update master BPM when tracks load or tempo changes
        const updateMasterBPM = () => {
            const deckA = this.audioEngine.decks.A;
            const deckB = this.audioEngine.decks.B;

            let masterBPM = null;

            // Use the BPM of the playing deck, or deck A if both playing
            if (deckA.isPlaying && deckA.bpm > 0) {
                masterBPM = (deckA.bpm * deckA.tempo).toFixed(1);
            } else if (deckB.isPlaying && deckB.bpm > 0) {
                masterBPM = (deckB.bpm * deckB.tempo).toFixed(1);
            } else if (deckA.bpm > 0) {
                masterBPM = (deckA.bpm * deckA.tempo).toFixed(1);
            } else if (deckB.bpm > 0) {
                masterBPM = (deckB.bpm * deckB.tempo).toFixed(1);
            }

            if (masterBPM) {
                masterBpmDisplay.textContent = `Master: ${masterBPM} BPM`;
            } else {
                masterBpmDisplay.textContent = 'Master: -- BPM';
            }
        };

        // Listen for relevant events
        this.audioEngine.on('trackLoaded', updateMasterBPM);
        this.audioEngine.on('tempoChange', updateMasterBPM);
        this.audioEngine.on('play', updateMasterBPM);
        this.audioEngine.on('stop', updateMasterBPM);
    }

    /**
     * Setup settings modal and controls
     */
    setupSettings() {
        const settingsBtn = document.getElementById('settingsBtn');
        const settingsModal = document.getElementById('settingsModal');
        const closeSettings = document.getElementById('closeSettings');
        const pitchModeSelect = document.getElementById('pitchMode');

        // Load saved settings
        const savedPitchMode = localStorage.getItem('pitchMode') || 'linked';
        pitchModeSelect.value = savedPitchMode;
        this.applyPitchMode(savedPitchMode);

        // Open modal
        settingsBtn.addEventListener('click', () => {
            settingsModal.classList.add('open');
        });

        // Close modal
        closeSettings.addEventListener('click', () => {
            settingsModal.classList.remove('open');
        });

        // Close on backdrop click
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.classList.remove('open');
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && settingsModal.classList.contains('open')) {
                settingsModal.classList.remove('open');
            }
        });

        // Pitch mode change
        pitchModeSelect.addEventListener('change', (e) => {
            const mode = e.target.value;
            localStorage.setItem('pitchMode', mode);
            this.applyPitchMode(mode);
        });
    }

    /**
     * Apply pitch mode setting
     */
    applyPitchMode(mode) {
        if (mode === 'independent') {
            document.body.classList.add('pitch-independent');
            // Independent mode: tempo affects pitch (like vinyl)
            this.audioEngine.setPreservesPitch('A', false);
            this.audioEngine.setPreservesPitch('B', false);
        } else {
            document.body.classList.remove('pitch-independent');
            // Linked mode: tempo doesn't affect pitch (time-stretching)
            this.audioEngine.setPreservesPitch('A', true);
            this.audioEngine.setPreservesPitch('B', true);
        }
    }

    /**
     * Setup MIDI controller
     */
    async setupMIDI() {
        const midiIndicator = document.getElementById('midiIndicator');

        // Check if Web MIDI API is available
        if (!navigator.requestMIDIAccess) {
            console.log('Web MIDI API not supported');
            if (midiIndicator) {
                midiIndicator.title = 'MIDI not supported in this browser';
            }
            return;
        }

        // Create MIDI controller
        this.midiController = new MIDIController(
            this.audioEngine,
            this.deckA,
            this.deckB,
            this.mixer
        );

        // Set up connection callback
        this.midiController.onConnectionChange = (connected, deviceNames) => {
            if (midiIndicator) {
                if (connected) {
                    midiIndicator.classList.add('connected');
                    midiIndicator.title = `MIDI Connected: ${deviceNames.join(', ')}`;
                    console.log(`MIDI devices connected: ${deviceNames.join(', ')}`);
                } else {
                    midiIndicator.classList.remove('connected');
                    midiIndicator.title = 'MIDI Controller: Not connected';
                    console.log('MIDI disconnected');
                }
            }
        };

        // Initialize MIDI
        const success = await this.midiController.init();
        if (!success) {
            console.log('Failed to initialize MIDI controller');
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.djApp = new DJMixApp();
    window.djApp.init();
});

// Add CSS for knob rotation
const knobStyles = document.createElement('style');
knobStyles.textContent = `
    .knob::before {
        transform: translateX(-50%) translateY(-100%) rotate(var(--rotation, 0deg));
    }

    .mini-waveform-container::after {
        left: var(--position, 0%);
    }
`;
document.head.appendChild(knobStyles);
