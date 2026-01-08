/**
 * DJ Mix Web - Platter Controller
 * Touch-sensitive jog wheel for scratching and nudging
 */

class PlatterController {
    constructor(deckId, audioEngine) {
        this.deckId = deckId;
        this.audioEngine = audioEngine;

        // DOM element
        this.element = document.getElementById(`platter${deckId}`);
        this.vinyl = this.element?.querySelector('.vinyl-disc');

        // State
        this.isDragging = false;
        this.lastAngle = 0;
        this.currentRotation = 0;
        this.originalTempo = 1.0;

        // Scratch state
        this.scratchStartPosition = 0;
        this.scratchStartAngle = 0;

        // Settings
        this.nudgeStrength = 0.15;        // Max tempo change when nudging
        this.scratchSensitivity = 0.5;    // Seconds per full rotation when scratching

        // MIDI jog state
        this.midiNudgeTimeout = null;
        this.originalMidiTempo = 1.0;

        this.init();
    }

    init() {
        if (!this.element) return;
        this.setupEventListeners();
        this.setupPositionUpdates();
    }

    setupEventListeners() {
        // Mouse events
        this.element.addEventListener('mousedown', (e) => this.onDragStart(e));
        document.addEventListener('mousemove', (e) => this.onDragMove(e));
        document.addEventListener('mouseup', () => this.onDragEnd());

        // Touch events
        this.element.addEventListener('touchstart', (e) => this.onDragStart(e));
        document.addEventListener('touchmove', (e) => this.onDragMove(e));
        document.addEventListener('touchend', () => this.onDragEnd());

        // Prevent context menu
        this.element.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    setupPositionUpdates() {
        // Update vinyl rotation based on playback position
        this.audioEngine.on('positionUpdate', (deckId, position, duration) => {
            if (deckId !== this.deckId || this.isDragging) return;

            // Rotate vinyl based on position (1 rotation = ~2 seconds at 33 RPM)
            const rpm = 33;
            const rotationsPerSecond = rpm / 60;
            this.currentRotation = position * rotationsPerSecond * 360;
            this.updateVinylRotation();
        });
    }

    getAngleFromEvent(e) {
        const rect = this.element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const deltaX = clientX - centerX;
        const deltaY = clientY - centerY;

        return Math.atan2(deltaY, deltaX) * (180 / Math.PI);
    }

    onDragStart(e) {
        e.preventDefault();
        this.isDragging = true;
        this.lastAngle = this.getAngleFromEvent(e);

        const deck = this.audioEngine.decks[this.deckId];

        if (deck.isPlaying && !deck.isPaused) {
            // Playing: save original tempo for nudge
            this.originalTempo = deck.tempo;
        } else {
            // Stopped: save position for scratch
            this.scratchStartPosition = this.audioEngine.getPosition(this.deckId);
            this.scratchStartAngle = this.currentRotation;
        }

        this.element.classList.add('active');
    }

    onDragMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();

        const currentAngle = this.getAngleFromEvent(e);
        let deltaAngle = currentAngle - this.lastAngle;

        // Handle wrap-around at 180/-180
        if (deltaAngle > 180) deltaAngle -= 360;
        if (deltaAngle < -180) deltaAngle += 360;

        this.lastAngle = currentAngle;
        this.currentRotation += deltaAngle;

        const deck = this.audioEngine.decks[this.deckId];

        if (deck.isPlaying && !deck.isPaused) {
            // NUDGE: temporary speed adjustment
            // deltaAngle positive = clockwise = speed up
            const nudgeAmount = (deltaAngle / 30) * this.nudgeStrength;
            const newTempo = Utils.clamp(
                this.originalTempo + nudgeAmount,
                0.5,
                1.5
            );
            this.audioEngine.setTempo(this.deckId, newTempo);
        } else {
            // SCRATCH: seek through track
            const totalRotation = this.currentRotation - this.scratchStartAngle;
            const secondsChange = (totalRotation / 360) * this.scratchSensitivity * 10;
            const newPosition = Utils.clamp(
                this.scratchStartPosition + secondsChange,
                0,
                deck.duration
            );
            this.audioEngine.seek(this.deckId, newPosition);
            // Emit position update to refresh waveforms
            this.audioEngine.events.emit('positionUpdate', this.deckId, newPosition, deck.duration);
        }

        this.updateVinylRotation();
    }

    onDragEnd() {
        if (!this.isDragging) return;
        this.isDragging = false;

        const deck = this.audioEngine.decks[this.deckId];

        if (deck.isPlaying && !deck.isPaused) {
            // Return to original tempo
            this.audioEngine.setTempo(this.deckId, this.originalTempo);
        }

        this.element.classList.remove('active');
    }

    updateVinylRotation() {
        if (this.vinyl) {
            this.vinyl.style.transform = `rotate(${this.currentRotation}deg)`;
        }
    }

    /**
     * Handle MIDI jog wheel input
     * @param {number} delta - Relative value from MIDI (positive = clockwise, negative = counter-clockwise)
     */
    handleMIDIJog(delta) {
        const deck = this.audioEngine.decks[this.deckId];

        // Scale factor for MIDI input (delta range: approx -26 to +16)
        const midiVisualSensitivity = 2; // degrees per delta unit for visual rotation

        // Update visual rotation
        this.currentRotation += delta * midiVisualSensitivity;
        this.updateVinylRotation();

        if (deck.isPlaying && !deck.isPaused) {
            // NUDGE: temporary speed adjustment
            // Store original tempo on first nudge of this series
            if (!this.midiNudgeTimeout) {
                this.originalMidiTempo = deck.tempo;
            }

            // delta positive = clockwise = speed up
            // Reduced sensitivity: divide by 40 instead of 10 for smoother nudging
            const nudgeAmount = (delta / 40) * this.nudgeStrength;
            const newTempo = Utils.clamp(
                deck.tempo + nudgeAmount,
                0.5,
                1.5
            );
            this.audioEngine.setTempo(this.deckId, newTempo);

            // Auto-return to original tempo after a short delay
            clearTimeout(this.midiNudgeTimeout);
            this.midiNudgeTimeout = setTimeout(() => {
                // Return to original tempo
                this.audioEngine.setTempo(this.deckId, this.originalMidiTempo);
                this.midiNudgeTimeout = null;
            }, 150);
        } else {
            // SCRATCH: seek through track when stopped
            const secondsChange = (delta / 50) * this.scratchSensitivity;
            const currentPosition = this.audioEngine.getPosition(this.deckId);
            const newPosition = Utils.clamp(
                currentPosition + secondsChange,
                0,
                deck.duration
            );
            this.audioEngine.seek(this.deckId, newPosition);
            // Emit position update to refresh waveforms
            this.audioEngine.events.emit('positionUpdate', this.deckId, newPosition, deck.duration);
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlatterController;
}
