/**
 * DJ Mix Web - Auto Mixer
 * Automatic simple mixing functionality
 * Crossfades between decks when a track is about to end
 */

class AutoMixer {
    constructor(audioEngine) {
        this.audioEngine = audioEngine;
        this.enabled = false;

        // Configuration
        this.fadeTime = 10; // Seconds before track ends to start mixing
        this.fadeInterval = 100; // Update interval in ms

        // State
        this.isMixing = false;
        this.mixingFromDeck = null;
        this.mixingToDeck = null;
        this.fadeStartTime = null;
        this.fadeTimer = null;

        // Store original values
        this.originalVolumes = { A: 1, B: 1 };
        this.originalTempo = null;
        this.targetTempo = null;

        // Tempo reset after mix
        this.tempoResetTimer = null;
        this.tempoResetDuration = 3000; // 3 seconds to reset tempo

        // Bind methods
        this.checkPosition = this.checkPosition.bind(this);
        this.performFade = this.performFade.bind(this);

        // Subscribe to position updates
        this.audioEngine.on('positionUpdate', this.checkPosition);
    }

    /**
     * Enable/disable auto mixing
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        console.log(`Auto Mix: ${enabled ? 'Enabled' : 'Disabled'}`);

        if (!enabled && this.isMixing) {
            this.cancelMix();
        }
    }

    /**
     * Check if we should start mixing
     */
    checkPosition(deckId, position, duration) {
        if (!this.enabled || this.isMixing) return;

        const deck = this.audioEngine.decks[deckId];

        // Only check if this deck is playing
        if (!deck.isPlaying || deck.isPaused) return;

        // Check if we're approaching the end
        const timeRemaining = duration - position;

        if (timeRemaining <= this.fadeTime && timeRemaining > 0) {
            // Check if the other deck is ready
            const otherDeckId = deckId === 'A' ? 'B' : 'A';
            const otherDeck = this.audioEngine.decks[otherDeckId];

            // Other deck must have a track loaded and be stopped/paused
            if (otherDeck.audioBuffer && (!otherDeck.isPlaying || otherDeck.isPaused)) {
                this.startMix(deckId, otherDeckId);
            }
        }
    }

    /**
     * Start the automatic mix
     */
    startMix(fromDeckId, toDeckId) {
        if (this.isMixing) return;

        console.log(`Auto Mix: Starting mix from Deck ${fromDeckId} to Deck ${toDeckId}`);

        this.isMixing = true;
        this.mixingFromDeck = fromDeckId;
        this.mixingToDeck = toDeckId;
        this.fadeStartTime = Date.now();

        const fromDeck = this.audioEngine.decks[fromDeckId];
        const toDeck = this.audioEngine.decks[toDeckId];

        // Store original volumes
        this.originalVolumes[fromDeckId] = fromDeck.volume;
        this.originalVolumes[toDeckId] = toDeck.volume;

        // Store target deck's original tempo for reset after mix
        this.targetTempo = toDeck.tempo;

        // Set incoming deck volume to 0 before starting
        this.audioEngine.setVolume(toDeckId, 0);
        this.updateVolumeSlider(toDeckId, 0);

        // Sync and play the incoming deck
        this.audioEngine.sync(toDeckId);
        this.audioEngine.play(toDeckId);

        // Start the fade
        this.fadeTimer = setInterval(this.performFade, this.fadeInterval);

        // Emit event
        this.audioEngine.events.emit('autoMixStart', fromDeckId, toDeckId);
    }

    /**
     * Perform the volume fade
     */
    performFade() {
        if (!this.isMixing) return;

        const elapsed = (Date.now() - this.fadeStartTime) / 1000;
        const progress = Math.min(elapsed / this.fadeTime, 1);

        const fromDeck = this.mixingFromDeck;
        const toDeck = this.mixingToDeck;

        // Calculate new volumes
        // Outgoing deck: original -> 0
        const outgoingVolume = this.originalVolumes[fromDeck] * (1 - progress);
        // Incoming deck: 0 -> original (or max)
        const incomingVolume = this.originalVolumes[toDeck] * progress;

        // Apply volumes
        this.audioEngine.setVolume(fromDeck, outgoingVolume);
        this.audioEngine.setVolume(toDeck, incomingVolume);

        // Update UI sliders
        this.updateVolumeSlider(fromDeck, outgoingVolume);
        this.updateVolumeSlider(toDeck, incomingVolume);

        // Check if mix is complete
        if (progress >= 1) {
            this.completeMix();
        }
    }

    /**
     * Complete the mix
     */
    completeMix() {
        console.log(`Auto Mix: Mix complete`);

        clearInterval(this.fadeTimer);
        this.fadeTimer = null;

        const fromDeck = this.mixingFromDeck;
        const toDeck = this.mixingToDeck;

        // Ensure final volumes are set
        this.audioEngine.setVolume(fromDeck, 0);
        this.audioEngine.setVolume(toDeck, this.originalVolumes[toDeck]);
        this.updateVolumeSlider(fromDeck, 0);
        this.updateVolumeSlider(toDeck, this.originalVolumes[toDeck]);

        // Stop the outgoing deck
        this.audioEngine.stop(fromDeck);

        // Reset outgoing deck volume for next use
        setTimeout(() => {
            this.audioEngine.setVolume(fromDeck, this.originalVolumes[fromDeck]);
            this.updateVolumeSlider(fromDeck, this.originalVolumes[fromDeck]);
        }, 500);

        // Start gradual tempo reset on the new playing deck
        this.startTempoReset(toDeck);

        // Emit event
        this.audioEngine.events.emit('autoMixComplete', fromDeck, toDeck);

        this.isMixing = false;
        this.mixingFromDeck = null;
        this.mixingToDeck = null;
    }

    /**
     * Gradually reset tempo to original
     */
    startTempoReset(deckId) {
        const deck = this.audioEngine.decks[deckId];
        const currentTempo = deck.tempo;
        const targetTempo = 1.0; // Reset to original tempo (1.0)

        if (Math.abs(currentTempo - targetTempo) < 0.01) return;

        const steps = 30; // Number of steps for reset
        const stepTime = this.tempoResetDuration / steps;
        const tempoStep = (targetTempo - currentTempo) / steps;

        let currentStep = 0;

        const resetStep = () => {
            currentStep++;
            const newTempo = currentTempo + (tempoStep * currentStep);
            this.audioEngine.setTempo(deckId, newTempo);

            // Update tempo slider UI
            this.updateTempoSlider(deckId, newTempo);

            if (currentStep < steps) {
                this.tempoResetTimer = setTimeout(resetStep, stepTime);
            } else {
                // Ensure we end exactly at target
                this.audioEngine.setTempo(deckId, targetTempo);
                this.updateTempoSlider(deckId, targetTempo);
                console.log(`Auto Mix: Tempo reset complete for Deck ${deckId}`);
            }
        };

        console.log(`Auto Mix: Resetting tempo for Deck ${deckId} from ${currentTempo.toFixed(2)} to ${targetTempo.toFixed(2)}`);
        this.tempoResetTimer = setTimeout(resetStep, stepTime);
    }

    /**
     * Cancel ongoing mix
     */
    cancelMix() {
        if (this.fadeTimer) {
            clearInterval(this.fadeTimer);
            this.fadeTimer = null;
        }

        if (this.tempoResetTimer) {
            clearTimeout(this.tempoResetTimer);
            this.tempoResetTimer = null;
        }

        // Restore volumes
        if (this.mixingFromDeck) {
            this.audioEngine.setVolume(this.mixingFromDeck, this.originalVolumes[this.mixingFromDeck]);
            this.updateVolumeSlider(this.mixingFromDeck, this.originalVolumes[this.mixingFromDeck]);
        }
        if (this.mixingToDeck) {
            this.audioEngine.setVolume(this.mixingToDeck, this.originalVolumes[this.mixingToDeck]);
            this.updateVolumeSlider(this.mixingToDeck, this.originalVolumes[this.mixingToDeck]);
        }

        this.isMixing = false;
        this.mixingFromDeck = null;
        this.mixingToDeck = null;

        console.log('Auto Mix: Mix cancelled');
    }

    /**
     * Update volume slider UI
     */
    updateVolumeSlider(deckId, volume) {
        const slider = document.getElementById(`volume${deckId}`);
        if (slider) {
            slider.value = volume;
        }
    }

    /**
     * Update tempo slider UI
     */
    updateTempoSlider(deckId, tempo) {
        const slider = document.getElementById(`tempo${deckId}`);
        const valueDisplay = document.getElementById(`tempoValue${deckId}`);

        if (slider) {
            slider.value = tempo;
        }
        if (valueDisplay) {
            valueDisplay.textContent = `${tempo.toFixed(2)}x`;
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AutoMixer;
}
