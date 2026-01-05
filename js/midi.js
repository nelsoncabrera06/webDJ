/**
 * DJ Mix Web - MIDI Controller
 * Handles MIDI input from physical DJ controllers
 * Specifically mapped for Behringer CMD Studio 4A
 */

class MIDIController {
    constructor(audioEngine, deckA, deckB, mixer) {
        this.audioEngine = audioEngine;
        this.deckA = deckA;
        this.deckB = deckB;
        this.mixer = mixer;

        this.midiAccess = null;
        this.inputs = [];
        this.outputs = [];
        this.isConnected = false;

        // Behringer CMD Studio 4A MIDI Mapping
        this.mapping = {
            // Deck A (Channel 0)
            deckA: {
                channel: 0,
                play: 44,      // Note
                cue: 43,       // Note
                sync: 45,      // Note
                volume: 112,   // CC
                eqHigh: 96,    // CC
                eqMid: 97,     // CC
                eqLow: 98      // CC
                // Tempo uses Pitch Bend on CH0
            },
            // Deck B (Channel 1)
            deckB: {
                channel: 1,
                play: 76,      // Note
                cue: 75,       // Note
                sync: 77,      // Note
                volume: 113,   // CC
                eqHigh: 99,    // CC
                eqMid: 100,    // CC
                eqLow: 101     // CC
                // Tempo uses Pitch Bend on CH1
            },
            // Global controls
            crossfader: {
                channel: 0,
                cc: 114
            }
        };

        // Callbacks for UI updates
        this.onConnectionChange = null;
    }

    /**
     * Initialize MIDI access
     */
    async init() {
        if (!navigator.requestMIDIAccess) {
            console.warn('Web MIDI API not supported in this browser');
            return false;
        }

        try {
            this.midiAccess = await navigator.requestMIDIAccess();
            this.midiAccess.onstatechange = (e) => this.onStateChange(e);

            // Connect to all available inputs
            this.connectInputs();

            console.log('MIDI Controller initialized');
            return true;
        } catch (error) {
            console.error('Failed to access MIDI devices:', error);
            return false;
        }
    }

    /**
     * Connect to all MIDI inputs
     */
    connectInputs() {
        this.inputs = [];

        for (const input of this.midiAccess.inputs.values()) {
            input.onmidimessage = (e) => this.onMIDIMessage(e);
            this.inputs.push(input);
            console.log(`MIDI Input connected: ${input.name} (${input.manufacturer})`);
        }

        // Store outputs for potential LED feedback
        this.outputs = [];
        for (const output of this.midiAccess.outputs.values()) {
            this.outputs.push(output);
            console.log(`MIDI Output available: ${output.name}`);
        }

        this.isConnected = this.inputs.length > 0;

        if (this.onConnectionChange) {
            this.onConnectionChange(this.isConnected, this.inputs.map(i => i.name));
        }
    }

    /**
     * Handle device connection/disconnection
     */
    onStateChange(event) {
        const port = event.port;
        console.log(`MIDI ${port.type} ${port.state}: ${port.name}`);

        // Reconnect all inputs when devices change
        this.connectInputs();
    }

    /**
     * Process incoming MIDI message
     */
    onMIDIMessage(event) {
        const data = event.data;
        const status = data[0];
        const statusType = status & 0xF0;
        const channel = status & 0x0F;

        // Note On: 0x90-0x9F
        if (statusType === 0x90) {
            const note = data[1];
            const velocity = data[2];
            if (velocity > 0) {
                this.handleNoteOn(channel, note, velocity);
            } else {
                // Note On with velocity 0 = Note Off
                this.handleNoteOff(channel, note);
            }
        }
        // Note Off: 0x80-0x8F
        else if (statusType === 0x80) {
            const note = data[1];
            this.handleNoteOff(channel, note);
        }
        // Control Change: 0xB0-0xBF
        else if (statusType === 0xB0) {
            const controller = data[1];
            const value = data[2];
            this.handleControlChange(channel, controller, value);
        }
        // Pitch Bend: 0xE0-0xEF
        else if (statusType === 0xE0) {
            const lsb = data[1];
            const msb = data[2];
            const value = (msb << 7) | lsb;
            this.handlePitchBend(channel, value);
        }
    }

    /**
     * Handle Note On messages (buttons)
     */
    handleNoteOn(channel, note, velocity) {
        console.log(`Note On: CH${channel} Note:${note} Vel:${velocity}`);

        // Deck A (Channel 0)
        if (channel === this.mapping.deckA.channel) {
            if (note === this.mapping.deckA.play) {
                this.togglePlayPause('A');
            } else if (note === this.mapping.deckA.cue) {
                this.deckA.cue();
            } else if (note === this.mapping.deckA.sync) {
                this.audioEngine.sync('A');
            }
        }
        // Deck B (Channel 1)
        else if (channel === this.mapping.deckB.channel) {
            if (note === this.mapping.deckB.play) {
                this.togglePlayPause('B');
            } else if (note === this.mapping.deckB.cue) {
                this.deckB.cue();
            } else if (note === this.mapping.deckB.sync) {
                this.audioEngine.sync('B');
            }
        }
    }

    /**
     * Handle Note Off messages
     */
    handleNoteOff(channel, note) {
        // Currently not used, but could be used for momentary buttons
        console.log(`Note Off: CH${channel} Note:${note}`);
    }

    /**
     * Handle Control Change messages (knobs, faders)
     */
    handleControlChange(channel, controller, value) {
        console.log(`CC: CH${channel} Controller:${controller} Value:${value}`);

        // Deck A controls (Channel 0)
        if (channel === this.mapping.deckA.channel) {
            if (controller === this.mapping.deckA.volume) {
                const volume = value / 127;
                this.audioEngine.setVolume('A', volume);
                this.updateSlider('volumeA', volume);
            } else if (controller === this.mapping.deckA.eqHigh) {
                const db = this.ccToDb(value);
                this.audioEngine.setEQ('A', 'high', db);
                this.updateKnob('eqHighA', db);
            } else if (controller === this.mapping.deckA.eqMid) {
                const db = this.ccToDb(value);
                this.audioEngine.setEQ('A', 'mid', db);
                this.updateKnob('eqMidA', db);
            } else if (controller === this.mapping.deckA.eqLow) {
                const db = this.ccToDb(value);
                this.audioEngine.setEQ('A', 'low', db);
                this.updateKnob('eqLowA', db);
            } else if (controller === this.mapping.crossfader.cc) {
                const cf = value / 127;
                this.audioEngine.setCrossfader(cf);
                this.updateSlider('crossfader', cf);
            }
        }
        // Deck B controls (Channel 1)
        else if (channel === this.mapping.deckB.channel) {
            if (controller === this.mapping.deckB.volume) {
                const volume = value / 127;
                this.audioEngine.setVolume('B', volume);
                this.updateSlider('volumeB', volume);
            } else if (controller === this.mapping.deckB.eqHigh) {
                const db = this.ccToDb(value);
                this.audioEngine.setEQ('B', 'high', db);
                this.updateKnob('eqHighB', db);
            } else if (controller === this.mapping.deckB.eqMid) {
                const db = this.ccToDb(value);
                this.audioEngine.setEQ('B', 'mid', db);
                this.updateKnob('eqMidB', db);
            } else if (controller === this.mapping.deckB.eqLow) {
                const db = this.ccToDb(value);
                this.audioEngine.setEQ('B', 'low', db);
                this.updateKnob('eqLowB', db);
            }
        }
    }

    /**
     * Handle Pitch Bend messages (tempo faders)
     */
    handlePitchBend(channel, value) {
        console.log(`Pitch Bend: CH${channel} Value:${value}`);

        // Behringer pitch bend range: 0-16368
        // Map to full tempo range: 0.50x - 1.50x
        // 0 = 0.50x (min), 8184 = 1.0x (center), 16368 = 1.50x (max)
        const normalizedValue = value / 16368;
        const tempo = 0.50 + (normalizedValue * 1.0); // Range: 0.50 - 1.50

        if (channel === this.mapping.deckA.channel) {
            this.audioEngine.setTempo('A', tempo);
            this.updateSlider('tempoA', tempo);
            this.updateTempoDisplay('A', tempo);
        } else if (channel === this.mapping.deckB.channel) {
            this.audioEngine.setTempo('B', tempo);
            this.updateSlider('tempoB', tempo);
            this.updateTempoDisplay('B', tempo);
        }
    }

    /**
     * Toggle play/pause for a deck
     */
    togglePlayPause(deckId) {
        const deck = this.audioEngine.decks[deckId];
        if (deck.isPlaying && !deck.isPaused) {
            this.audioEngine.pause(deckId);
        } else {
            this.audioEngine.play(deckId);
        }
    }

    /**
     * Convert CC value (0-127) to dB (-12 to +12)
     */
    ccToDb(value) {
        return ((value / 127) * 24) - 12;
    }

    /**
     * Update a slider in the UI
     */
    updateSlider(id, value) {
        const slider = document.getElementById(id);
        if (slider) {
            slider.value = value;
            // Trigger input event to update any listeners
            slider.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    /**
     * Update a knob in the UI
     */
    updateKnob(id, value) {
        const knob = document.getElementById(id);
        if (knob) {
            knob.dataset.value = value;
            // Update visual rotation
            const min = parseFloat(knob.dataset.min) || -12;
            const max = parseFloat(knob.dataset.max) || 12;
            const range = max - min;
            const normalized = (value - min) / range;
            const rotation = -135 + (normalized * 270);
            knob.style.setProperty('--rotation', `${rotation}deg`);

            // Update value display
            const valueDisplay = knob.parentElement?.querySelector('.knob-value');
            if (valueDisplay) {
                valueDisplay.textContent = Math.round(value);
            }
        }
    }

    /**
     * Update tempo display
     */
    updateTempoDisplay(deckId, tempo) {
        const display = document.getElementById(`tempoValue${deckId}`);
        if (display) {
            display.textContent = `${tempo.toFixed(2)}x`;
        }
    }

    /**
     * Send LED feedback to controller (optional)
     */
    sendLED(note, channel, state) {
        if (this.outputs.length === 0) return;

        const status = 0x90 | channel; // Note On
        const velocity = state ? 127 : 0;

        for (const output of this.outputs) {
            output.send([status, note, velocity]);
        }
    }

    /**
     * Get list of connected devices
     */
    getDevices() {
        return this.inputs.map(input => ({
            name: input.name,
            manufacturer: input.manufacturer,
            state: input.state
        }));
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MIDIController;
}
