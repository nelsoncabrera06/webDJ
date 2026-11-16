/**
 * DJ Mix Web - Analysis worker
 *
 * Detects the BPM / beat grid and builds the waveform off the main thread, so loading a
 * track never freezes the page while the other deck is playing. The existing analysis
 * classes are reused unchanged: they only need something AudioBuffer-like, which is
 * wrapped around the transferred mono samples.
 *
 * Protocol (see AudioEngine.analyzeTrack):
 *   in  { id, samples: Float32Array, sampleRate, duration }
 *   out { id, ok: true, bpmResult, waveformData }  |  { id, ok: false, error }
 */

importScripts('utils.js', 'bpmDetector.js', 'waveformGenerator.js');

self.onmessage = async (event) => {
    const { id, samples, sampleRate, duration } = event.data || {};

    try {
        const bufferLike = {
            length: samples.length,
            numberOfChannels: 1,
            sampleRate,
            duration,
            getChannelData: () => samples
        };

        const bpmResult = await new BPMDetector().detect(bufferLike);
        const waveformData = new WaveformGenerator().generate(bufferLike);

        self.postMessage(
            { id, ok: true, bpmResult, waveformData },
            [waveformData.buffer]
        );
    } catch (error) {
        self.postMessage({
            id,
            ok: false,
            error: String((error && error.message) || error)
        });
    }
};
