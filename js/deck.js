/**
 * DJ Mix Web - Deck Controller
 * Handles UI for individual deck controls
 */

class DeckController {
    constructor(deckId, audioEngine) {
        this.deckId = deckId;
        this.audioEngine = audioEngine;

        // DOM elements
        this.element = document.getElementById(`deck${deckId}`);
        this.elements = this.getElements();

        // Waveform visualizers
        this.miniWaveform = null;
        this.zoomedWaveform = null;

        // State
        this.waveformData = null;
        this.duration = 0;

        // Initialize
        this.init();
    }

    /**
     * Get DOM elements
     */
    getElements() {
        const id = this.deckId;
        return {
            // Track info
            trackName: document.getElementById(`trackName${id}`),
            trackBpm: document.getElementById(`trackBpm${id}`),

            // Waveforms
            miniWaveformCanvas: document.getElementById(`waveform${id}`),
            zoomedWaveformCanvas: document.getElementById(`zoomedWaveform${id}`),
            miniWaveformContainer: this.element.querySelector('.mini-waveform-container'),

            // Time display
            currentTime: document.getElementById(`currentTime${id}`),
            totalTime: document.getElementById(`totalTime${id}`),

            // Load zone
            loadZone: document.getElementById(`loadZone${id}`),
            fileInput: document.getElementById(`fileInput${id}`),

            // Tempo & Pitch
            tempoSlider: document.getElementById(`tempo${id}`),
            tempoValue: document.getElementById(`tempoValue${id}`),
            resetTempoBtn: document.getElementById(`resetTempo${id}`),
            pitchSlider: document.getElementById(`pitch${id}`),
            pitchValue: document.getElementById(`pitchValue${id}`),

            // Transport
            playBtn: document.getElementById(`play${id}`),
            pauseBtn: document.getElementById(`pause${id}`),
            stopBtn: document.getElementById(`stop${id}`),
            cueBtn: document.getElementById(`cue${id}`),
            syncBtn: document.getElementById(`sync${id}`),

            // Hot cues
            hotCueBtns: [
                document.getElementById(`hotCue${id}1`),
                document.getElementById(`hotCue${id}2`),
                document.getElementById(`hotCue${id}3`),
                document.getElementById(`hotCue${id}4`)
            ]
        };
    }

    /**
     * Initialize deck controller
     */
    init() {
        this.setupWaveforms();
        this.setupEventListeners();
        this.setupAudioEngineListeners();
    }

    /**
     * Setup waveform visualizers
     */
    setupWaveforms() {
        const colors = this.deckId === 'A' ? {
            colorTop: 'rgba(0, 212, 255, 0.9)',
            colorBottom: 'rgba(0, 150, 200, 0.7)',
            playedColor: 'rgba(0, 212, 255, 0.4)'
        } : {
            colorTop: 'rgba(255, 107, 53, 0.9)',
            colorBottom: 'rgba(200, 80, 40, 0.7)',
            playedColor: 'rgba(255, 107, 53, 0.4)'
        };

        // Mini waveform
        this.miniWaveform = new WaveformVisualizer(this.elements.miniWaveformCanvas, {
            ...colors,
            mirror: true,
            barWidth: 2,
            barGap: 1
        });

        // Zoomed waveform
        this.zoomedWaveform = new ZoomedWaveformVisualizer(this.elements.zoomedWaveformCanvas, {
            ...colors,
            windowSeconds: 8
        });
    }

    /**
     * Setup UI event listeners
     */
    setupEventListeners() {
        // File input
        this.elements.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.loadFile(e.target.files[0]);
            }
        });

        // Drag and drop
        this.setupDragAndDrop();

        // Transport buttons
        this.elements.playBtn.addEventListener('click', () => this.play());
        this.elements.pauseBtn.addEventListener('click', () => this.pause());
        this.elements.stopBtn.addEventListener('click', () => this.stop());
        this.elements.cueBtn.addEventListener('click', () => this.cue());
        this.elements.syncBtn.addEventListener('click', () => this.sync());

        // Tempo slider
        this.elements.tempoSlider.addEventListener('input', (e) => {
            const tempo = parseFloat(e.target.value);
            this.audioEngine.setTempo(this.deckId, tempo);
            this.elements.tempoValue.textContent = `${tempo.toFixed(2)}x`;
        });

        // Reset tempo button
        this.elements.resetTempoBtn.addEventListener('click', () => {
            this.resetTempo();
        });

        // Pitch slider - uses detune to shift pitch in semitones
        this.elements.pitchSlider.addEventListener('input', (e) => {
            const pitch = parseFloat(e.target.value);
            this.elements.pitchValue.textContent = `${pitch > 0 ? '+' : ''}${pitch.toFixed(1)} st`;
            this.audioEngine.setPitch(this.deckId, pitch);
        });

        // Hot cues
        this.elements.hotCueBtns.forEach((btn, index) => {
            btn.addEventListener('click', () => this.handleHotCue(index + 1));
            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                this.audioEngine.clearHotCue(this.deckId, index + 1);
                btn.classList.remove('set');
            });
        });

        // Mini waveform click to seek
        this.elements.miniWaveformContainer.addEventListener('click', (e) => {
            if (this.duration <= 0) return;

            const rect = this.elements.miniWaveformContainer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const position = (x / rect.width) * this.duration;
            this.audioEngine.seek(this.deckId, position);
        });
    }

    /**
     * Setup drag and drop for file loading
     */
    setupDragAndDrop() {
        const loadZone = this.elements.loadZone;

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            loadZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            loadZone.addEventListener(eventName, () => {
                loadZone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            loadZone.addEventListener(eventName, () => {
                loadZone.classList.remove('drag-over');
            });
        });

        loadZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (files.length > 0 && Utils.isAudioFile(files[0])) {
                this.loadFile(files[0]);
            }
        });
    }

    /**
     * Setup audio engine event listeners
     */
    setupAudioEngineListeners() {
        // Position updates
        this.audioEngine.on('positionUpdate', (deckId, position, duration) => {
            if (deckId !== this.deckId) return;
            this.updatePosition(position, duration);
        });

        // Play state changes
        this.audioEngine.on('play', (deckId) => {
            if (deckId !== this.deckId) return;
            this.elements.playBtn.classList.add('active');
            this.elements.pauseBtn.classList.remove('active');
        });

        this.audioEngine.on('pause', (deckId) => {
            if (deckId !== this.deckId) return;
            this.elements.pauseBtn.classList.add('active');
            this.elements.playBtn.classList.remove('active');
        });

        this.audioEngine.on('stop', (deckId) => {
            if (deckId !== this.deckId) return;
            this.elements.playBtn.classList.remove('active');
            this.elements.pauseBtn.classList.remove('active');
            this.updatePosition(this.audioEngine.decks[deckId].cuePoint, this.duration);
        });

        // Hot cue events
        this.audioEngine.on('hotCueSet', (deckId, index, position) => {
            if (deckId !== this.deckId) return;
            this.elements.hotCueBtns[index - 1].classList.add('set');
        });

        this.audioEngine.on('hotCueCleared', (deckId, index) => {
            if (deckId !== this.deckId) return;
            this.elements.hotCueBtns[index - 1].classList.remove('set');
        });

        // Tempo changes
        this.audioEngine.on('tempoChange', (deckId, tempo) => {
            if (deckId !== this.deckId) return;
            this.elements.tempoSlider.value = tempo;
            this.elements.tempoValue.textContent = `${tempo.toFixed(2)}x`;
            this.updateBpmDisplay();
        });
    }

    /**
     * Load audio file
     */
    async loadFile(file) {
        try {
            this.elements.trackName.textContent = 'Loading...';

            const trackInfo = await this.audioEngine.loadTrack(this.deckId, file);

            // Update UI
            this.elements.trackName.textContent = trackInfo.name;
            this.elements.totalTime.textContent = Utils.formatTime(trackInfo.duration);
            this.elements.currentTime.textContent = '0:00';

            // Store data
            this.waveformData = trackInfo.waveformData;
            this.duration = trackInfo.duration;

            // Update BPM display
            this.updateBpmDisplay();

            // Set waveform data
            this.miniWaveform.setData(this.waveformData, this.duration);
            this.zoomedWaveform.setData(this.waveformData, this.duration);
            this.zoomedWaveform.setBPM(trackInfo.bpm);

            // Reset position indicator
            this.updatePosition(0, this.duration);

        } catch (error) {
            console.error('Error loading track:', error);
            this.elements.trackName.textContent = 'Error loading file';
        }
    }

    /**
     * Update BPM display with tempo adjustment
     */
    updateBpmDisplay() {
        const deck = this.audioEngine.decks[this.deckId];
        if (deck.bpm > 0) {
            const adjustedBpm = (deck.bpm * deck.tempo).toFixed(1);
            this.elements.trackBpm.textContent = `${adjustedBpm} BPM`;
        } else {
            this.elements.trackBpm.textContent = '-- BPM';
        }
    }

    /**
     * Update position display and waveforms
     */
    updatePosition(position, duration) {
        // Time display
        this.elements.currentTime.textContent = Utils.formatTime(position);

        // Normalized position
        const normalizedPosition = duration > 0 ? position / duration : 0;

        // Update waveforms
        this.miniWaveform.setPosition(normalizedPosition);
        this.zoomedWaveform.setPosition(normalizedPosition);

        // Update position indicator on mini waveform
        if (this.elements.miniWaveformContainer) {
            this.elements.miniWaveformContainer.style.setProperty(
                '--position',
                `${normalizedPosition * 100}%`
            );
        }
    }

    /**
     * Transport controls
     */
    play() {
        this.audioEngine.play(this.deckId);
    }

    pause() {
        this.audioEngine.pause(this.deckId);
    }

    stop() {
        this.audioEngine.stop(this.deckId);
    }

    cue() {
        const deck = this.audioEngine.decks[this.deckId];
        if (deck.isPlaying && !deck.isPaused) {
            // If playing, set cue point and stop
            this.audioEngine.setCuePoint(this.deckId);
            this.audioEngine.stop(this.deckId);
        } else {
            // If stopped, go to cue point
            this.audioEngine.goToCue(this.deckId);
        }
    }

    sync() {
        this.audioEngine.sync(this.deckId);
    }

    handleHotCue(index) {
        this.audioEngine.goToHotCue(this.deckId, index);
    }

    /**
     * Reset tempo to original (1.0x)
     */
    resetTempo() {
        this.audioEngine.setTempo(this.deckId, 1.0);
        this.elements.tempoSlider.value = 1.0;
        this.elements.tempoValue.textContent = '1.00x';
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeckController;
}
