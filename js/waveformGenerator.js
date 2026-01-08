/**
 * DJ Mix Web - Waveform Generator & Visualizer
 */

class WaveformGenerator {
    constructor() {
        this.samplesPerSecond = 50; // Resolution for waveform data
    }

    /**
     * Generate waveform data from audio buffer
     * @param {AudioBuffer} audioBuffer
     * @returns {Float32Array} Normalized amplitude data (0-1)
     */
    generate(audioBuffer) {
        const sampleRate = audioBuffer.sampleRate;
        const duration = audioBuffer.duration;
        const numSamples = Math.ceil(duration * this.samplesPerSecond);
        const samplesPerChunk = Math.floor(audioBuffer.length / numSamples);

        const waveformData = new Float32Array(numSamples);

        // Get mixed channel data
        const mixedData = this.getMixedChannelData(audioBuffer);

        // Calculate RMS for each chunk
        for (let i = 0; i < numSamples; i++) {
            const start = i * samplesPerChunk;
            const end = Math.min(start + samplesPerChunk, mixedData.length);

            let sum = 0;
            for (let j = start; j < end; j++) {
                sum += mixedData[j] * mixedData[j];
            }

            const rms = Math.sqrt(sum / (end - start));
            waveformData[i] = rms;
        }

        // Normalize to 0-1 range
        const maxValue = Math.max(...waveformData);
        if (maxValue > 0) {
            for (let i = 0; i < waveformData.length; i++) {
                waveformData[i] /= maxValue;
            }
        }

        return waveformData;
    }

    /**
     * Mix all channels to mono
     */
    getMixedChannelData(audioBuffer) {
        const length = audioBuffer.length;
        const mixedData = new Float32Array(length);
        const numChannels = audioBuffer.numberOfChannels;

        for (let channel = 0; channel < numChannels; channel++) {
            const channelData = audioBuffer.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                mixedData[i] += channelData[i] / numChannels;
            }
        }

        return mixedData;
    }
}

/**
 * Waveform Visualizer - Renders waveform to canvas
 */
class WaveformVisualizer {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.waveformData = null;
        this.position = 0; // 0-1 normalized position
        this.duration = 0;
        this.bpm = 0; // BPM for beat markers
        this.hotCues = [null, null, null, null, null, null, null, null]; // Hot cue positions in seconds

        // Hot cue colors (8 colors for hot cues 1-8)
        this.hotCueColors = [
            '#FF0000', // 1 - Rojo
            '#00FF00', // 2 - Verde
            '#0088FF', // 3 - Azul
            '#FFFF00', // 4 - Amarillo
            '#FF00FF', // 5 - Magenta
            '#00FFFF', // 6 - Cyan
            '#FF8800', // 7 - Naranja
            '#88FF00'  // 8 - Lima
        ];

        // Options
        this.options = {
            colorTop: options.colorTop || 'rgba(0, 212, 255, 0.8)',
            colorBottom: options.colorBottom || 'rgba(0, 150, 200, 0.6)',
            backgroundColor: options.backgroundColor || 'transparent',
            positionColor: options.positionColor || '#ffffff',
            playedColor: options.playedColor || null, // If set, shows played portion differently
            mirror: options.mirror !== false, // Default true - show mirrored waveform
            barWidth: options.barWidth || 2,
            barGap: options.barGap || 1,
            ...options
        };

        // Setup resize observer
        this.setupResizeObserver();
    }

    /**
     * Setup canvas resize observer
     */
    setupResizeObserver() {
        const resizeObserver = new ResizeObserver(() => {
            this.resize();
            this.render();
        });
        resizeObserver.observe(this.canvas.parentElement);
    }

    /**
     * Resize canvas to match container
     */
    resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;

        this.ctx.scale(dpr, dpr);

        this.width = rect.width;
        this.height = rect.height;
    }

    /**
     * Set waveform data
     * @param {Float32Array} data
     * @param {number} duration - Duration in seconds
     */
    setData(data, duration) {
        this.waveformData = data;
        this.duration = duration;
        this.render();
    }

    /**
     * Set playback position
     * @param {number} position - Normalized position (0-1)
     */
    setPosition(position) {
        this.position = Utils.clamp(position, 0, 1);
        this.render();
    }

    /**
     * Set hot cue positions
     * @param {Array} hotCues - Array of positions in seconds (null if not set)
     */
    setHotCues(hotCues) {
        this.hotCues = hotCues;
        this.render();
    }

    /**
     * Set BPM for beat markers
     * @param {number} bpm - Beats per minute
     */
    setBPM(bpm) {
        this.bpm = bpm;
        this.render();
    }

    /**
     * Draw beat markers on the waveform
     */
    drawBeatMarkers() {
        if (!this.bpm || this.bpm <= 0 || !this.duration) return;

        const { ctx, width, height, duration, bpm } = this;
        const secondsPerBeat = 60 / bpm;
        const totalBeats = Math.floor(duration / secondsPerBeat);

        for (let beat = 0; beat <= totalBeats; beat++) {
            const beatTime = beat * secondsPerBeat;
            const x = (beatTime / duration) * width;

            // Downbeat (cada 4) más visible
            if (beat % 4 === 0) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.lineWidth = 1.5;
            } else {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.lineWidth = 1;
            }

            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
    }

    /**
     * Draw hot cue markers on the waveform
     */
    drawHotCueMarkers() {
        if (!this.duration || this.duration === 0) return;

        const { ctx, width, height } = this;

        this.hotCues.forEach((position, index) => {
            if (position !== null && position !== undefined) {
                const x = (position / this.duration) * width;

                ctx.strokeStyle = this.hotCueColors[index];
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
        });
    }

    /**
     * Render the waveform
     */
    render() {
        if (!this.ctx || !this.width) return;

        const { ctx, width, height, waveformData, options } = this;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        if (options.backgroundColor !== 'transparent') {
            ctx.fillStyle = options.backgroundColor;
            ctx.fillRect(0, 0, width, height);
        }

        if (!waveformData || waveformData.length === 0) return;

        // Calculate bar positions
        const totalBars = Math.floor(width / (options.barWidth + options.barGap));
        const samplesPerBar = waveformData.length / totalBars;
        const positionBar = Math.floor(this.position * totalBars);

        // Create gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, options.colorTop);
        gradient.addColorStop(0.5, options.colorBottom);
        gradient.addColorStop(1, options.colorTop);

        // Draw bars
        for (let i = 0; i < totalBars; i++) {
            const sampleIndex = Math.floor(i * samplesPerBar);
            const amplitude = waveformData[sampleIndex] || 0;

            const x = i * (options.barWidth + options.barGap);
            const barHeight = amplitude * (height * 0.9);

            // Choose color based on position
            if (options.playedColor && i < positionBar) {
                ctx.fillStyle = options.playedColor;
            } else {
                ctx.fillStyle = gradient;
            }

            if (options.mirror) {
                // Draw mirrored bars (from center)
                const y = (height - barHeight) / 2;
                ctx.fillRect(x, y, options.barWidth, barHeight);
            } else {
                // Draw from bottom
                ctx.fillRect(x, height - barHeight, options.barWidth, barHeight);
            }
        }

        // Draw hot cue markers on top
        this.drawHotCueMarkers();
    }

    /**
     * Clear the waveform
     */
    clear() {
        this.waveformData = null;
        this.position = 0;
        if (this.ctx && this.width) {
            this.ctx.clearRect(0, 0, this.width, this.height);
        }
    }
}

/**
 * Zoomed Waveform Visualizer - Shows a scrolling window around the playhead
 */
class ZoomedWaveformVisualizer extends WaveformVisualizer {
    constructor(canvas, options = {}) {
        super(canvas, {
            ...options,
            mirror: true
        });

        // Zoom options
        this.baseWindowSeconds = options.windowSeconds || 8; // Base window in seconds
        this.bpm = options.bpm || 120;
        this.tempo = 1; // Tempo multiplier (1 = original speed)
    }

    /**
     * Get effective window seconds based on tempo
     * When tempo changes, the window expands/compresses so beats move at constant visual speed
     */
    get effectiveWindowSeconds() {
        return this.baseWindowSeconds * this.tempo;
    }

    /**
     * Set BPM for beat grid
     */
    setBPM(bpm) {
        this.bpm = bpm;
        this.render();
    }

    /**
     * Set tempo multiplier for beat grid
     * @param {number} tempo - Tempo multiplier (1 = original, 0.5 = half speed, 2 = double speed)
     */
    setTempo(tempo) {
        this.tempo = tempo;
        this.render();
    }

    /**
     * Render zoomed waveform centered on playhead
     */
    render() {
        if (!this.ctx || !this.width) return;

        const { ctx, width, height, waveformData, options, duration, position, bpm } = this;
        const windowSeconds = this.effectiveWindowSeconds; // Use effective window based on tempo

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        if (options.backgroundColor !== 'transparent') {
            ctx.fillStyle = options.backgroundColor;
            ctx.fillRect(0, 0, width, height);
        }

        if (!waveformData || waveformData.length === 0 || duration === 0) return;

        // Calculate visible window
        const currentTime = position * duration;
        const halfWindow = windowSeconds / 2;
        const startTime = currentTime - halfWindow;
        const endTime = currentTime + halfWindow;

        // Draw beat grid
        this.drawBeatGrid(ctx, width, height, startTime, endTime);

        // Calculate sample range
        const samplesPerSecond = waveformData.length / duration;
        const startSample = Math.floor(Math.max(0, startTime) * samplesPerSecond);
        const endSample = Math.ceil(Math.min(duration, endTime) * samplesPerSecond);

        // Create gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, options.colorTop);
        gradient.addColorStop(0.5, options.colorBottom);
        gradient.addColorStop(1, options.colorTop);

        ctx.fillStyle = gradient;

        // Draw waveform
        const pixelsPerSecond = width / windowSeconds;
        const barWidth = Math.max(1, Math.floor(pixelsPerSecond / samplesPerSecond));

        for (let i = startSample; i < endSample && i < waveformData.length; i++) {
            const sampleTime = i / samplesPerSecond;
            const x = (sampleTime - startTime) * pixelsPerSecond;

            if (x < 0 || x > width) continue;

            const amplitude = waveformData[i] || 0;
            const barHeight = amplitude * (height * 0.85);
            const y = (height - barHeight) / 2;

            ctx.fillRect(x, y, Math.max(barWidth, 1), barHeight);
        }

        // Draw hot cue markers with labels
        this.drawHotCueMarkersZoomed(ctx, width, height, startTime, endTime);
    }

    /**
     * Draw hot cue markers with labels for zoomed waveform
     */
    drawHotCueMarkersZoomed(ctx, width, height, startTime, endTime) {
        const pixelsPerSecond = width / this.effectiveWindowSeconds;

        this.hotCues.forEach((position, index) => {
            if (position !== null && position !== undefined) {
                // Check if hot cue is in visible window
                if (position >= startTime && position <= endTime) {
                    const x = (position - startTime) * pixelsPerSecond;

                    // Draw line
                    ctx.strokeStyle = this.hotCueColors[index];
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, height);
                    ctx.stroke();

                    // Draw label background
                    const label = `Cue ${index + 1}`;
                    ctx.font = 'bold 10px sans-serif';
                    const textWidth = ctx.measureText(label).width;

                    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                    ctx.fillRect(x + 2, 2, textWidth + 6, 14);

                    // Draw label text
                    ctx.fillStyle = this.hotCueColors[index];
                    ctx.fillText(label, x + 5, 12);
                }
            }
        });
    }

    /**
     * Draw beat grid lines
     */
    drawBeatGrid(ctx, width, height, startTime, endTime) {
        // Use effective BPM (original BPM * tempo)
        const effectiveBpm = this.bpm * this.tempo;
        const beatsPerSecond = effectiveBpm / 60;
        const secondsPerBeat = 60 / effectiveBpm;
        const pixelsPerSecond = width / this.effectiveWindowSeconds;

        // Find first beat in visible window
        const firstBeat = Math.ceil(startTime * beatsPerSecond);
        const lastBeat = Math.floor(endTime * beatsPerSecond);

        for (let beat = firstBeat; beat <= lastBeat; beat++) {
            const beatTime = beat * secondsPerBeat;
            const x = (beatTime - startTime) * pixelsPerSecond;

            // Downbeat (every 4 beats) - más visible
            if (beat % 4 === 0) {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = 2;
            } else {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
                ctx.lineWidth = 1;
            }

            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WaveformGenerator, WaveformVisualizer, ZoomedWaveformVisualizer };
}
