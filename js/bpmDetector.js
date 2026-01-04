/**
 * DJ Mix Web - BPM Detector
 * Autocorrelation-based tempo detection algorithm
 */

class BPMDetector {
    constructor() {
        this.minBPM = 60;
        this.maxBPM = 180;
        this.targetMinBPM = 90;
        this.targetMaxBPM = 140;
    }

    /**
     * Detect BPM from audio buffer
     * @param {AudioBuffer} audioBuffer
     * @returns {Promise<number>} Detected BPM
     */
    async detect(audioBuffer) {
        return new Promise((resolve) => {
            // Get mono channel data
            const channelData = this.getMixedChannelData(audioBuffer);

            // Calculate onset envelope
            const envelope = this.calculateOnsetEnvelope(channelData, audioBuffer.sampleRate);

            // Detect BPM using autocorrelation
            const bpm = this.autocorrelationBPM(envelope, audioBuffer.sampleRate);

            resolve(bpm);
        });
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

    /**
     * Calculate onset envelope using energy-based detection
     */
    calculateOnsetEnvelope(samples, sampleRate) {
        // Downsample for efficiency (analyze at 200Hz)
        const hopSize = Math.floor(sampleRate / 200);
        const frameSize = hopSize * 2;
        const numFrames = Math.floor((samples.length - frameSize) / hopSize);
        const envelope = new Float32Array(numFrames);

        // Apply bandpass filter for better beat detection (100Hz - 4000Hz)
        const filteredSamples = this.bandpassFilter(samples, sampleRate, 100, 4000);

        // Calculate energy for each frame
        for (let i = 0; i < numFrames; i++) {
            const start = i * hopSize;
            let energy = 0;

            for (let j = 0; j < frameSize; j++) {
                const sample = filteredSamples[start + j] || 0;
                energy += sample * sample;
            }

            envelope[i] = Math.sqrt(energy / frameSize);
        }

        // Calculate onset detection function (spectral flux approximation)
        const onset = new Float32Array(numFrames);
        for (let i = 1; i < numFrames; i++) {
            const diff = envelope[i] - envelope[i - 1];
            onset[i] = diff > 0 ? diff : 0;
        }

        // Normalize
        const maxOnset = Math.max(...onset);
        if (maxOnset > 0) {
            for (let i = 0; i < onset.length; i++) {
                onset[i] /= maxOnset;
            }
        }

        return onset;
    }

    /**
     * Simple bandpass filter using biquad approximation
     */
    bandpassFilter(samples, sampleRate, lowFreq, highFreq) {
        const filtered = new Float32Array(samples.length);

        // High-pass filter coefficient
        const rcHigh = 1 / (2 * Math.PI * lowFreq);
        const dtHigh = 1 / sampleRate;
        const alphaHigh = rcHigh / (rcHigh + dtHigh);

        // Low-pass filter coefficient
        const rcLow = 1 / (2 * Math.PI * highFreq);
        const dtLow = 1 / sampleRate;
        const alphaLow = dtLow / (rcLow + dtLow);

        // Apply high-pass
        let prevHigh = 0;
        let prevSample = 0;
        for (let i = 0; i < samples.length; i++) {
            prevHigh = alphaHigh * (prevHigh + samples[i] - prevSample);
            prevSample = samples[i];
            filtered[i] = prevHigh;
        }

        // Apply low-pass
        let prevLow = 0;
        for (let i = 0; i < filtered.length; i++) {
            prevLow = prevLow + alphaLow * (filtered[i] - prevLow);
            filtered[i] = prevLow;
        }

        return filtered;
    }

    /**
     * Detect BPM using autocorrelation
     */
    autocorrelationBPM(envelope, originalSampleRate) {
        const analysisRate = 200; // Our envelope is at 200Hz
        const minLag = Math.floor(60 / this.maxBPM * analysisRate);
        const maxLag = Math.floor(60 / this.minBPM * analysisRate);

        // Calculate autocorrelation for BPM range
        const correlations = [];

        for (let lag = minLag; lag <= maxLag; lag++) {
            let correlation = 0;
            let count = 0;

            for (let i = 0; i < envelope.length - lag; i++) {
                correlation += envelope[i] * envelope[i + lag];
                count++;
            }

            if (count > 0) {
                correlation /= count;
            }

            const bpm = 60 / (lag / analysisRate);

            // Apply target range bonus (90-140 BPM preferred for dance music)
            let bonus = 1;
            if (bpm >= this.targetMinBPM && bpm <= this.targetMaxBPM) {
                bonus = 1.2;
            }

            correlations.push({
                lag,
                bpm,
                correlation: correlation * bonus
            });
        }

        // Find peak correlation
        let bestResult = correlations[0];
        for (const result of correlations) {
            if (result.correlation > bestResult.correlation) {
                bestResult = result;
            }
        }

        // Refine with harmonic analysis (check 0.5x, 2x multiples)
        const refinedBPM = this.refineWithHarmonics(bestResult.bpm, correlations);

        return Math.round(refinedBPM * 10) / 10;
    }

    /**
     * Refine BPM by checking harmonic multiples
     */
    refineWithHarmonics(bpm, correlations) {
        const harmonics = [0.5, 1, 2];
        let bestBPM = bpm;
        let bestScore = 0;

        for (const harmonic of harmonics) {
            const testBPM = bpm * harmonic;

            // Skip if outside valid range
            if (testBPM < this.minBPM || testBPM > this.maxBPM) continue;

            // Find correlation score for this BPM
            let score = 0;
            for (const result of correlations) {
                if (Math.abs(result.bpm - testBPM) < 2) {
                    score = result.correlation;
                    break;
                }
            }

            // Bonus for target range
            if (testBPM >= this.targetMinBPM && testBPM <= this.targetMaxBPM) {
                score *= 1.3;
            }

            if (score > bestScore) {
                bestScore = score;
                bestBPM = testBPM;
            }
        }

        return bestBPM;
    }

    /**
     * Quick BPM estimation from peaks
     * Faster but less accurate alternative
     */
    quickEstimate(audioBuffer) {
        const channelData = this.getMixedChannelData(audioBuffer);
        const sampleRate = audioBuffer.sampleRate;

        // Find peaks
        const peaks = [];
        const threshold = 0.5;
        const minPeakDistance = Math.floor(sampleRate * 0.3); // 300ms minimum between peaks

        let lastPeakIndex = -minPeakDistance;

        for (let i = 1; i < channelData.length - 1; i++) {
            const sample = Math.abs(channelData[i]);
            if (sample > threshold &&
                sample > Math.abs(channelData[i - 1]) &&
                sample > Math.abs(channelData[i + 1]) &&
                i - lastPeakIndex >= minPeakDistance) {
                peaks.push(i);
                lastPeakIndex = i;
            }
        }

        if (peaks.length < 2) return 120; // Default BPM

        // Calculate average interval between peaks
        let totalInterval = 0;
        for (let i = 1; i < peaks.length; i++) {
            totalInterval += peaks[i] - peaks[i - 1];
        }
        const avgInterval = totalInterval / (peaks.length - 1);

        // Convert to BPM
        const bpm = 60 * sampleRate / avgInterval;

        // Constrain to valid range
        return Utils.clamp(Math.round(bpm), this.minBPM, this.maxBPM);
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BPMDetector;
}
