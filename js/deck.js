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

        // Platter controller
        this.platter = null;

        // State
        this.waveformData = null;
        this.duration = 0;
        this.deleteMode = false;
        // What the shared 8 buttons do right now: 'hotcue' (default) or 'pads'.
        // The MIDI hot-cue notes press these same buttons, so they follow the mode too.
        this.padMode = 'hotcue';

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

            // Load zone / drop area
            dropArea: document.getElementById(`dropArea${id}`),
            fileInput: document.getElementById(`fileInput${id}`),

            // Tempo & Pitch
            tempoSlider: document.getElementById(`tempo${id}`),
            tempoValue: document.getElementById(`tempoValue${id}`),
            resetTempoBtn: document.getElementById(`resetTempo${id}`),
            pitchSlider: document.getElementById(`pitch${id}`),
            pitchValue: document.getElementById(`pitchValue${id}`),

            // Transport
            playPauseBtn: document.getElementById(`playPause${id}`),
            stopBtn: document.getElementById(`stop${id}`),
            cueBtn: document.getElementById(`cue${id}`),
            syncBtn: document.getElementById(`sync${id}`),
            masterBadge: document.getElementById(`masterBadge${id}`),

            // Shared performance pads (hot cues in HOT CUE mode, samples in PADS mode)
            padSection: this.element.querySelector('.pads-section'),
            padModeBtns: [...this.element.querySelectorAll('.pad-mode-btn')],
            delBtn: document.getElementById(`del${id}`),

            // Loop controls
            loopHalveBtn: document.getElementById(`loopHalve${id}`),
            loopToggleBtn: document.getElementById(`loopToggle${id}`),
            loopDoubleBtn: document.getElementById(`loopDouble${id}`),

            // One-shot sample pads
            padBtns: Array.from({ length: 8 }, (_, index) =>
                document.getElementById(`pad${id}${index + 1}`))
        };
    }

    /**
     * Initialize deck controller
     */
    init() {
        this.setupWaveforms();
        this.setupEventListeners();
        this.setupAudioEngineListeners();
        this.setupPlatter();
        this.setupFx();
        this.setupPadModes();
    }

    /**
     * Setup platter controller
     */
    setupPlatter() {
        this.platter = new PlatterController(this.deckId, this.audioEngine);
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
        this.elements.playPauseBtn.addEventListener('click', () => this.togglePlayPause());
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
        if (this.elements.pitchSlider) {
            this.elements.pitchSlider.addEventListener('input', (e) => {
                const pitch = parseFloat(e.target.value);
                this.elements.pitchValue.textContent = `${pitch > 0 ? '+' : ''}${pitch.toFixed(1)} st`;
                this.audioEngine.setPitch(this.deckId, pitch);
            });
        }

        // Shared performance pads: each button presses the active mode.
        // Hot cue (default): click jumps/sets, right click clears, DEL erases.
        // Pads: click fires the assigned one-shot and the button accepts sample drops.
        this.elements.padBtns.forEach((button, index) => {
            if (!button) return;

            button.addEventListener('click', () => this.handlePadPress(index + 1));

            button.addEventListener('contextmenu', (event) => {
                if (this.padMode !== 'hotcue') return;
                event.preventDefault();
                this.audioEngine.clearHotCue(this.deckId, index + 1);
            });

            button.addEventListener('dragover', (event) => {
                if (this.padMode !== 'pads') return;
                if (!event.dataTransfer.types.includes('application/x-webdj-sample')) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'copy';
                button.classList.add('drop-target');
            });
            button.addEventListener('dragleave', () => button.classList.remove('drop-target'));
            button.addEventListener('drop', (event) => {
                if (this.padMode !== 'pads') return;
                event.preventDefault();
                button.classList.remove('drop-target');
                const sampleIndex = Number(event.dataTransfer.getData('application/x-webdj-sample'));
                if (this.audioEngine.assignSampleToPad(this.deckId, index, sampleIndex)) {
                    this.updatePadButtons();
                }
            });
        });

        // DEL button - toggle delete mode
        if (this.elements.delBtn) {
            this.elements.delBtn.addEventListener('click', () => {
                this.toggleDeleteMode();
            });
        }

        // Loop controls
        this.elements.loopHalveBtn?.addEventListener('click', () => {
            this.audioEngine.halveLoop(this.deckId);
        });

        this.elements.loopToggleBtn?.addEventListener('click', () => {
            this.audioEngine.toggleLoop(this.deckId);
        });

        this.elements.loopDoubleBtn?.addEventListener('click', () => {
            this.audioEngine.doubleLoop(this.deckId);
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
     * Setup the pad mode row: HOT CUE (default) and PADS are the working modes; ROLL and
     * SCRATCH stay disabled until they have an implementation (same idea as FX slot 4).
     */
    setupPadModes() {
        this.elements.padModeBtns.forEach(button => {
            const mode = button.dataset.padMode;
            if (!mode || button.disabled) return;
            button.addEventListener('click', () => this.setPadMode(mode));
        });

        this.updatePadModeButtons();
        this.updatePadButtons();
    }

    /**
     * Switch the shared buttons between hot cues and sample pads.
     * Everything that reads this.elements.padBtns (screen and MIDI) follows the mode.
     */
    setPadMode(mode) {
        if (mode !== 'hotcue' && mode !== 'pads') return;
        if (this.padMode === mode) return;

        this.padMode = mode;
        if (mode !== 'hotcue') this.exitDeleteMode();
        this.updatePadModeButtons();
        this.updatePadButtons();
    }

    /**
     * Reflect the active mode on the mode row, the section class and the DEL button.
     */
    updatePadModeButtons() {
        const inHotCueMode = this.padMode === 'hotcue';

        if (this.elements.padSection) {
            this.elements.padSection.classList.toggle('mode-hotcue', inHotCueMode);
            this.elements.padSection.classList.toggle('mode-pads', !inHotCueMode);
        }

        this.elements.padModeBtns.forEach(button => {
            const active = button.dataset.padMode === this.padMode;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });

        if (this.elements.delBtn) {
            // DEL only makes sense for hot cues; in PADS mode there is nothing to erase.
            this.elements.delBtn.disabled = !inHotCueMode;
            this.elements.delBtn.title = inHotCueMode
                ? 'Borrar hot cues (activa el modo borrar)'
                : 'DEL sólo se usa en modo HOT CUE';
        }
    }

    /**
     * Draw the 8 buttons for the active mode: number always visible, hot cue border only
     * in HOT CUE mode, sample name in the tooltip only in PADS mode.
     */
    updatePadButtons() {
        const deck = this.audioEngine.decks[this.deckId];
        const inPadsMode = this.padMode === 'pads';

        this.elements.padBtns.forEach((button, index) => {
            if (!button) return;

            button.textContent = String(index + 1);
            // A cue at position 0 is valid, so compare against null instead of using Boolean()
            button.classList.toggle('set', !inPadsMode && deck.hotCues[index] != null);
            button.classList.toggle('delete-mode', !inPadsMode && this.deleteMode);

            if (inPadsMode) {
                const sampleIndex = deck.padSampleAssignments[index];
                const sampleName = this.audioEngine.sampleLibrary[sampleIndex]?.name || 'Sin sample';
                button.title = `Pad ${index + 1}: ${sampleName} · arrastrá un sample para reemplazarlo`;
                button.setAttribute('aria-label', `Pad ${index + 1}, sample ${sampleName}`);
            } else {
                const hasCue = deck.hotCues[index] != null;
                button.title = hasCue
                    ? `Hot Cue ${index + 1} (asignado) · clic para ir, clic derecho para borrar`
                    : `Hot Cue ${index + 1} (sin asignar) · clic para marcar, clic derecho para borrar`;
                button.setAttribute('aria-label', `Hot Cue ${index + 1}`);
            }
        });
    }

    /**
     * Press one of the shared buttons (1-based). Used by the screen and by MIDI, so both
     * drive exactly the same mode-dependent action.
     */
    handlePadPress(index) {
        const padIndex = index - 1;
        const button = this.elements.padBtns[padIndex];

        if (this.padMode === 'pads') {
            if (!this.audioEngine.playPad(this.deckId, padIndex)) return;
            this.flashPad(button);
            return;
        }

        if (this.deleteMode) {
            this.audioEngine.clearHotCue(this.deckId, index);
            this.exitDeleteMode();
            return;
        }

        this.handleHotCue(index);
    }

    /**
     * Short deck-coloured flash on a pad that just fired a sample.
     */
    flashPad(button) {
        if (!button) return;
        button.classList.add('active');
        clearTimeout(button.activeTimer);
        button.activeTimer = setTimeout(() => button.classList.remove('active'), 140);
    }

    /**
     * Setup the FX slots: the knob of each slot sends its value (0..100) to the engine and
     * the button under it switches the effect on/off (lit while it is on).
     * Slots 1-3 are real effects (filter, flanger, echo); slot 4 only stores its state.
     */
    setupFx() {
        const groups = this.element.querySelectorAll('.fx-knob-group');

        this.fxSlots = [...groups].map(group => {
            const slot = parseInt(group.dataset.fxSlot, 10);
            const type = group.dataset.fxType || null;
            const toggleButton = group.querySelector('.fx-toggle-btn');

            const knob = new Knob(group.querySelector('.fx-knob'), {
                // FX values are 0..100, shown plain (the EQ readout adds the +/- sign)
                formatValue: (value) => String(Math.round(value)),
                onChange: (value) => this.audioEngine.setDeckFxValue(this.deckId, slot, value)
            });

            toggleButton.addEventListener('click', () => {
                this.setFxEnabled(slot, !group.classList.contains('on'));
            });

            return { slot, type, element: group, knob, toggleButton };
        });
    }

    /**
     * Switch an FX slot on/off and reflect it on screen. Shared by the on-screen button and
     * the MIDI FX buttons, so both always drive the same state.
     */
    setFxEnabled(slot, enabled) {
        const fx = this.fxSlots?.find(f => f.slot === slot);
        if (!fx) return;

        fx.element.classList.toggle('on', enabled);
        fx.toggleButton.setAttribute('aria-pressed', String(enabled));
        this.audioEngine.setDeckFxEnabled(this.deckId, slot, enabled);
    }

    /**
     * Toggle an FX slot from outside the UI (MIDI on/off button).
     */
    toggleFxSlot(slot) {
        const fx = this.fxSlots?.find(f => f.slot === slot);
        if (!fx) return;

        this.setFxEnabled(slot, !fx.element.classList.contains('on'));
    }

    /**
     * Move an FX knob from outside the UI (MIDI knob). Knob.setValue() redraws it and, through
     * its onChange, updates the engine; for a slot without a knob the engine is set directly.
     */
    setFxKnobValue(slot, value) {
        const fx = this.fxSlots?.find(f => f.slot === slot);
        if (!fx) {
            this.audioEngine.setDeckFxValue(this.deckId, slot, value);
            return;
        }

        fx.knob.setValue(value);
    }

    /**
     * Setup drag and drop for file loading.
     * The whole song area (header + waveform + load zone) accepts the drop, not just the
     * small load zone, so a track can be dropped anywhere over the deck's upper half.
     */
    setupDragAndDrop() {
        const dropArea = this.elements.dropArea;
        let dragDepth = 0;

        // Required so the browser allows the drop and does not open the file itself
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        // dragenter/dragleave also fire when moving between the children of the area
        // (canvases, button, labels), so they are counted to avoid a flickering highlight.
        dropArea.addEventListener('dragenter', () => {
            dragDepth++;
            dropArea.classList.add('drag-over');
        });

        dropArea.addEventListener('dragover', (e) => {
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
            dropArea.classList.add('drag-over');
        });

        dropArea.addEventListener('dragleave', () => {
            dragDepth = Math.max(0, dragDepth - 1);
            if (dragDepth === 0) {
                dropArea.classList.remove('drag-over');
            }
        });

        dropArea.addEventListener('drop', async (e) => {
            dragDepth = 0;
            dropArea.classList.remove('drag-over');

            // Check for browser file drop
            const audioFileData = e.dataTransfer.getData('application/x-audio-file');
            if (audioFileData && window.djApp && window.djApp.fileBrowser) {
                const draggedFileData = window.djApp.fileBrowser.getDraggedFileData();
                if (draggedFileData) {
                    const file = await window.djApp.fileBrowser.getFileObject(draggedFileData);
                    if (file) {
                        this.loadFile(file);
                        return;
                    }
                }
            }

            // Native file drop
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

        this.audioEngine.on('sampleRemoved', () => {
            this.updatePadButtons();
        });

        this.audioEngine.on('padSampleAssigned', (deckId) => {
            if (deckId !== this.deckId) return;
            this.updatePadButtons();
        });

        // Transport state changes (single merged play/pause button)
        this.audioEngine.on('play', (deckId) => {
            if (deckId !== this.deckId) return;
            this.setTransportState('playing');
        });

        this.audioEngine.on('pause', (deckId) => {
            if (deckId !== this.deckId) return;
            this.setTransportState('paused');
        });

        this.audioEngine.on('stop', (deckId) => {
            if (deckId !== this.deckId) return;
            this.setTransportState('stopped');
            this.updatePosition(this.audioEngine.decks[deckId].cuePoint, this.duration);
        });

        // Hot cue events (the shared buttons only show cue borders in HOT CUE mode)
        this.audioEngine.on('hotCueSet', (deckId) => {
            if (deckId !== this.deckId) return;
            this.updatePadButtons();
            this.updateWaveformHotCues();
        });

        this.audioEngine.on('hotCueCleared', (deckId) => {
            if (deckId !== this.deckId) return;
            this.updatePadButtons();
            this.updateWaveformHotCues();
        });

        // Tempo changes
        this.audioEngine.on('tempoChange', (deckId, tempo) => {
            if (deckId !== this.deckId) return;
            this.elements.tempoSlider.value = tempo;
            this.elements.tempoValue.textContent = `${tempo.toFixed(2)}x`;
            this.updateBpmDisplay();
            // Update waveform beat grid with new tempo
            if (this.zoomedWaveform) {
                this.zoomedWaveform.setTempo(tempo);
            }
        });

        // Sync state changes (master/slave)
        this.audioEngine.on('syncChanged', () => {
            this.updateSyncState();
        });
        this.audioEngine.on('syncFailed', (deckId) => {
            if (deckId !== this.deckId) return;
            // brief flash to signal there's nothing to sync to
            this.elements.syncBtn.classList.add('sync-failed');
            setTimeout(() => this.elements.syncBtn.classList.remove('sync-failed'), 300);
        });

        // Loop events
        this.audioEngine.on('loopEnabled', (deckId) => {
            if (deckId !== this.deckId) return;
            this.elements.loopToggleBtn?.classList.add('active');
        });

        this.audioEngine.on('loopDisabled', (deckId) => {
            if (deckId !== this.deckId) return;
            this.elements.loopToggleBtn?.classList.remove('active');
        });

        this.audioEngine.on('loopBeatsChanged', (deckId, beats) => {
            if (deckId !== this.deckId) return;
            this.updateLoopDisplay(beats);
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
            this.miniWaveform.setBPM(trackInfo.bpm);
            this.zoomedWaveform.setData(this.waveformData, this.duration);
            this.zoomedWaveform.setBPM(trackInfo.bpm);
            this.zoomedWaveform.setBeatOffset(trackInfo.beatOffset);
            // Set current tempo for beat grid alignment
            const deck = this.audioEngine.decks[this.deckId];
            this.zoomedWaveform.setTempo(deck.tempo);

            // Reset position indicator
            this.updatePosition(0, this.duration);

            // A new track starts without hot cues: clear any lit border from the previous one
            this.updatePadButtons();

        } catch (error) {
            console.error('Error loading track:', error);
            this.elements.trackName.textContent = 'Error loading file';
        }
    }

    /**
     * Load audio file from a URL/path
     */
    async loadFileFromUrl(url, trackName) {
        try {
            if (this.elements.trackName) {
                this.elements.trackName.textContent = 'Loading...';
            }
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: Failed to fetch audio from ${url}`);
            }
            const blob = await response.blob();
            const fileName = trackName || url.split('/').pop();
            const file = new File([blob], fileName, { type: blob.type || 'audio/mpeg' });
            return await this.loadFile(file);
        } catch (error) {
            console.warn(`Could not load audio from ${url}:`, error);
            if (this.elements.trackName) {
                this.elements.trackName.textContent = 'No Track Loaded';
            }
            throw error;
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
     * Reflect the transport state on the merged play/pause button.
     * playing -> green + ▶   paused -> yellow + ⏸   stopped -> neutral + ▶
     * Driven by the engine events so keyboard, MIDI, AutoMixer and track end stay in sync.
     */
    setTransportState(state) {
        const btn = this.elements.playPauseBtn;
        btn.classList.toggle('active', state === 'playing');
        btn.classList.toggle('paused', state === 'paused');
        btn.querySelector('.icon').textContent = state === 'paused' ? '⏸' : '▶';
    }

    /**
     * Transport controls
     */
    togglePlayPause() {
        // Read the engine state instead of a local flag so the merged button stays
        // correct even when playback started/stopped from keyboard, MIDI or AutoMixer.
        const deck = this.audioEngine.decks[this.deckId];
        if (deck.isPlaying && !deck.isPaused) {
            this.pause();
        } else {
            this.play();
        }
    }

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

    /**
     * Reflect master/slave sync state in the UI (SYNC button + MASTER badge).
     */
    updateSyncState() {
        const deck = this.audioEngine.decks[this.deckId];
        const isSlave = deck.syncRole === 'slave' && deck.syncEnabled;
        const isMaster = deck.syncRole === 'master';

        this.elements.syncBtn.classList.toggle('active', isSlave);
        if (this.elements.masterBadge) {
            this.elements.masterBadge.classList.toggle('visible', isMaster);
        }
    }

    handleHotCue(index) {
        this.audioEngine.goToHotCue(this.deckId, index);
    }

    /**
     * Toggle delete mode for hot cues. DEL only belongs to HOT CUE mode.
     */
    toggleDeleteMode() {
        if (this.padMode !== 'hotcue') return;

        this.deleteMode = !this.deleteMode;
        if (this.elements.delBtn) {
            this.elements.delBtn.classList.toggle('active', this.deleteMode);
        }
        this.updatePadButtons();
    }

    /**
     * Exit delete mode
     */
    exitDeleteMode() {
        this.deleteMode = false;
        if (this.elements.delBtn) {
            this.elements.delBtn.classList.remove('active');
        }
        this.updatePadButtons();
    }

    /**
     * Reset tempo to original (1.0x)
     */
    resetTempo() {
        this.audioEngine.setTempo(this.deckId, 1.0);
        this.elements.tempoSlider.value = 1.0;
        this.elements.tempoValue.textContent = '1.00x';
    }

    /**
     * Update waveform visualizers with hot cue positions
     */
    updateWaveformHotCues() {
        const deck = this.audioEngine.decks[this.deckId];
        if (this.miniWaveform) {
            this.miniWaveform.setHotCues([...deck.hotCues]);
        }
        if (this.zoomedWaveform) {
            this.zoomedWaveform.setHotCues([...deck.hotCues]);
        }
    }

    /**
     * Update loop display with current beat value
     */
    updateLoopDisplay(beats) {
        if (!this.elements.loopToggleBtn) return;

        // Format the display (1/32, 1/16, etc. or whole numbers)
        let display;
        if (beats >= 1) {
            display = beats.toString();
        } else {
            // Convert fraction to "1/X" format
            display = `1/${Math.round(1/beats)}`;
        }
        this.elements.loopToggleBtn.textContent = display;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DeckController;
}
