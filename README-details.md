# 🎧 WebDJ — Detailed Technical Documentation

[Español (Detalles)](README-details.es.md) | [English (Summary)](README.md) | [Español (Resumen)](README.es.md)

[![Vanilla JavaScript](https://img.shields.io/badge/Vanilla-JavaScript-F7DF1E?logo=javascript&logoColor=black&style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Web Audio API](https://img.shields.io/badge/Web_Audio-API-FF3E00?logo=html5&logoColor=white&style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![Web MIDI API](https://img.shields.io/badge/Web_MIDI-API-0055FF?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)
[![HTML5 Canvas](https://img.shields.io/badge/HTML5-Canvas-E34F26?logo=html5&logoColor=white&style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-success?style=for-the-badge)](https://github.com/nelsoncabrera06/webDJ)
[![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub_Pages-222222?logo=github&style=for-the-badge)](https://nelsoncabrera06.github.io/webDJ/)

> **In-depth technical specification, audio DSP architecture, Phase-Locked Loop (PLL) synchronization, BPM detection algorithms, and hardware integration for WebDJ.**

🔗 **Live Demo:**
https://nelsoncabrera06.github.io/webDJ/

![WebDJ Interface](images/working.png)

---

## 📑 Table of Contents
1. [System Overview](#-system-overview)
2. [Audio DSP Architecture & Signal Flow](#-audio-dsp-architecture--signal-flow)
3. [Beatmatching Synchronization Engine (PLL)](#-beatmatching-synchronization-engine-pll)
4. [Algorithmic BPM & Beatgrid Detection](#-algorithmic-bpm--beatgrid-detection)
5. [60 FPS Hardware-Accelerated Canvas Visualizers](#-60-fps-hardware-accelerated-canvas-visualizers)
6. [Physical Jog Wheel & Platter Emulation](#-physical-jog-wheel--platter-emulation)
7. [Web MIDI API & Hardware Integration](#-web-midi-api--hardware-integration)
8. [Keyboard Shortcuts Matrix](#-keyboard-shortcuts-matrix)
9. [Codebase Architecture & Modularity](#-codebase-architecture--modularity)
10. [Local Development & Deployment](#-local-development--deployment)

---

## 🌟 System Overview

**WebDJ** is a full-featured, dual-deck browser-based digital audio mixing workstation (DJ Software / lightweight DAW) developed exclusively with standard web platform APIs. It runs entirely client-side without any server-side audio processing, external libraries, or transpilation steps.

### Engineering Core Principles
- **Zero-Dependency & Buildless:** 100% Vanilla JavaScript (ES6+), HTML5, and CSS3. Zero npm packages, zero external bundles.
- **Low-Latency Real-Time Audio:** Audio graph processing executed on native hardware threads using the Web Audio API.
- **Secure Local Storage Access:** Native client disk folder streaming via the modern File System Access API.
- **Tactile Hardware Control:** Low-latency bidirectional MIDI communication via the Web MIDI API.

---

## 🎛️ Audio DSP Architecture & Signal Flow

The core `AudioEngine` class manages the Web Audio graph and acts as the single source of truth for audio states.

```
[ Local Audio File ]
        │
        ├──► Offline PCM Decode ──► [ BPMDetector ] ──► BPM + Beatgrid Phase
        │                        └──► [ WaveformGenerator ] ──► Canvas Data
        ▼
   <audio> Element (Deck A / B)  [playbackRate & preservesPitch keylock control]
        │
        ▼
 MediaElementAudioSourceNode
        │
        ▼
   BiquadFilterNode (Low Shelf @ 250 Hz, -12 dB to +12 dB)
        │
        ▼
   BiquadFilterNode (Peaking Mid @ 1000 Hz, Q=1, -12 dB to +12 dB)
        │
        ▼
   BiquadFilterNode (High Shelf @ 4000 Hz, -12 dB to +12 dB)
        │
        ▼
   GainNode (Channel Volume Fader Deck A / B)
        │
        ├──► AnalyserNode (Real-time RMS/FFT for Dual Stereo VU Meters)
        │
        ▼
   GainNode (Crossfader Equal-Power Curve)
        │
        ▼
   GainNode (Master Volume Output)
        │
        ▼
   audioContext.destination (Hardware Audio Device Output)
```

### Hybrid Audio Architecture: `<audio>` + Web Audio Graph

A key engineering decision in WebDJ is the deliberate use of HTML5 `<audio>` elements piped downstream into the Web Audio graph via `createMediaElementSource`:

1. **Memory Footprint Optimization:** Storing multiple full-length uncompressed songs in memory as `AudioBuffer` allocations requires >50 MB of RAM per 4-minute track. HTML5 `<audio>` streams and manages memory buffers dynamically.
2. **Native Keylock (`preservesPitch`):** Modern Chromium engines implement low-level C++ time-stretching routines inside `<audio>`. By enabling `preservesPitch = true`, modifying `playbackRate` shifts song tempo while retaining its musical key (*Linked Mode*). When toggled to `false`, it emulates vinyl physical pitch changes (*Independent Mode*).
3. **Decoupled Offline Processing:** AudioBuffers are decoded asynchronously in memory solely during initial track load to extract RMS amplitude envelopes and run autocorrelation algorithms, then discarded from playback buffers.

---

## 🧮 Beatmatching Synchronization Engine (PLL)

Aligning two asynchronous musical tracks in real time requires resolving two fundamental challenges:
1. **Tempo Matching:** Equalizing play speed (`playbackRate = BPM_master / BPM_slave`).
2. **Phase Matching:** Aligning downbeats and transients so kick drums land simultaneously.

Naive implementations jump the playhead (`currentTime = targetTime`), causing buffer dropouts, audible clicks, and jitter. WebDJ uses a closed-loop **Phase-Locked Loop (PLL)** proportional controller:

```
                      ┌──────────────────────────────────────┐
                      │ 1. Phase Error Calculation           │
                      │    error = phase_master - phase_slave│
                      └──────────────────┬───────────────────┘
                                         │
                                         ▼
                      ┌──────────────────────────────────────┐
                      │ 2. Exponential Moving Average (EMA)  │
                      │    (Filters high-frequency jitter)   │
                      └──────────────────┬───────────────────┘
                                         │
                                         ▼
                      ┌──────────────────────────────────────┐
                      │ 3. Proportional Rate Modulation      │
                      │    corr = error * PLL_KP             │
                      │    (clamped smoothly to ±4%)         │
                      └──────────────────┬───────────────────┘
                                         │
                                         ▼
                      ┌──────────────────────────────────────┐
                      │ 4. Smooth Rate Adjustment            │
                      │    Slave nudges continuously without │
                      │    clicks until phase-locked         │
                      └──────────────────────────────────────┘
```

### PLL Parameters in `AudioEngine`:
- `PLL_KP = 0.15`: Proportional feedback gain (effective time constant $\tau \approx 3$ seconds).
- `PLL_MAX_CORRECTION = 0.04`: Rate correction clamped to $\pm 4\%$ during steady-state tracking to preserve acoustic transparency.
- `PLL_DEADBAND = 0.002`: Beat deadband window; errors under 0.2% of a beat trigger zero correction, eliminating hunting/oscillation.
- `PLL_SLEW_CLAMP = 0.08` & `PLL_SLEW_MS = 3000`: Faster capture window ($\pm 8\%$) during the first 3 seconds after pressing SYNC for rapid lock.
- `PHASE_EMA_ALPHA = 0.3`: Low-pass EMA filter coefficient for smoothing transient phase noise.
- **Octave Resolution (Half/Double Time):** If the tempo ratio falls outside 0.7–1.4, the algorithm automatically halves or doubles the target tempo, allowing natural sync between 70 BPM and 140 BPM tracks.
- **Automatic Suspension on User Gesture:** When physical scratching or nudging is detected on the jog wheel, the PLL temporarily pauses to avoid fighting human input.

---

## 🔍 Algorithmic BPM & Beatgrid Detection

Implemented in `bpmDetector.js` without external DSP dependencies:

1. **Mono Downmix:** Merges stereo audio channels into a unified `Float32Array`.
2. **Onset Detection Function:** Computes spectral flux and energy differences across consecutive time frames sampled at 200 Hz.
3. **Autocorrelation Tempo Analysis:** Evaluates lag-based self-similarity within 60–180 BPM to determine dominant periodicity.
4. **Comb Filter Beatgrid Alignment:** Cross-correlates an impulse train at the detected tempo period against the onset envelope to locate the exact downbeat (*firstBeatTime*) with an associated confidence score.

---

## 📊 60 FPS Hardware-Accelerated Canvas Visualizers

Implemented in `waveformGenerator.js`:

### 1. Mini-Waveform (Full Track Overview)
- Root-Mean-Square (RMS) amplitude downsampling (50 samples per second of audio).
- Peak normalization scaled from 0.0 to 1.0.
- Interactive playhead overlay, beatgrid lines every 4 beats (downbeats highlighted), and colored Hot Cue markers (1–8).
- Click-to-seek and drag-scrubbing.

### 2. Zoomed Waveform (Dual Synchronized Canvas)
- Dynamic time window tracking 4–8 seconds around the playhead.
- Mirrored amplitude rendering with customized deck color gradients.
- Dynamic time-stretching scaling: window width adapts to current `playbackRate` to ensure uniform visual beat velocity across varying tempos.
- Fixed center playhead with high-precision beat markers.

---

## 💿 Physical Jog Wheel & Platter Emulation

Implemented in `platter.js`:
- **Absolute Angle Tracking:** Calculates user touch/mouse angles using `Math.atan2(deltaY, deltaX)`.
- **Scratching Mode:** Real-time audio scrub tracking angular hand velocity and inertia.
- **Pitch Nudge:** Gentle drag modifies playback speed ($\pm 15\%$) for manual beatmatching.

---

## 🎹 Web MIDI API & Hardware Integration

Native integration configured out-of-the-box for the **Behringer CMD Studio 4A** controller via `midi.js`:

| Hardware Control | MIDI Message | Channel / Note / CC | WebDJ Action |
|---|---|---|---|
| **Play / Pause** | Note On/Off | Ch 0: Note 44 / Ch 1: Note 76 | Toggle Play/Pause Deck A / B |
| **Cue** | Note On/Off | Ch 0: Note 43 / Ch 1: Note 75 | Return to Cue / Set Cue |
| **Sync** | Note On/Off | Ch 0: Note 45 / Ch 1: Note 77 | Enable/Disable PLL Sync |
| **Jog Wheel** | Relative CC (Center 64) | Ch 0: CC 26 / Ch 1: CC 58 | Platter Scratch & Nudge |
| **Volume Fader** | Absolute CC (0–127) | Ch 0: CC 112 / Ch 1: CC 113 | Channel Volume Deck A / B |
| **Crossfader** | Absolute CC (0–127) | Ch 0: CC 114 | Master A/B Crossfade |
| **EQ High** | CC (0–127) | CC 96 (Deck A) / CC 99 (Deck B) | High Shelf Filter (-12 to +12 dB) |
| **EQ Mid** | CC (0–127) | CC 97 (Deck A) / CC 100 (Deck B) | Peaking Filter (-12 to +12 dB) |
| **EQ Low** | CC (0–127) | CC 98 (Deck A) / CC 101 (Deck B) | Low Shelf Filter (-12 to +12 dB) |
| **Pitch Slider** | Pitch Bend (14-bit) | Channels 0 & 1 | High-res Tempo Fader (0.50x – 1.50x) |
| **Hot Cues 1–8** | Note On/Off | Ch 0: Notes 34–41 / Ch 1: Notes 66–73 | Trigger or Store Cue Point |
| **Delete Cue** | Note On/Off | Ch 0: Note 42 / Ch 1: Note 74 | Toggle Cue Deletion Mode |
| **Loop (/2, x2, ON)** | Note On/Off | Ch 0: Notes 23–25 / Ch 1: Notes 55–57 | Halve, Double, or Toggle Beat Loop |
| **LED Feedback** | Note On Out (Vel 127/0) | Output to physical device | Illuminates controller buttons |

---

## ⌨️ Keyboard Shortcuts Matrix

| Action | Deck A | Deck B | Global |
|---|---|---|---|
| **Play** | `Q` | `U` | - |
| **Pause** | `W` | `I` | - |
| **Stop** | `E` | `O` | - |
| **Cue** | `A` | `J` | - |
| **Sync** | `S` | `K` | - |
| **Active Deck Play/Pause** | - | - | `Spacebar` |
| **Hot Cues (1–4)** | `1`, `2`, `3`, `4` | `7`, `8`, `9`, `0` | - |
| **Tempo Adjust (+/-)** | `Shift` + `↑` / `↓` | `Shift` + `→` / `←` | - |
| **Crossfader** | `Z` (Full A) | `C` (Full B) | `X` (Center 50/50) |

---

## 📂 Codebase Architecture & Modularity

```
DJmix_web/
├── css/                      # Modular stylesheets
│   ├── browser.css           # Local file browser & playlist layout
│   ├── deck.css              # Transport buttons, pads, cues, sliders
│   ├── mixer.css             # Mixer channels, EQ knobs, VU meters
│   ├── platter.css           # Vinyl turntable simulation styling
│   ├── styles.css            # Global layout, CSS variables & typography
│   └── waveform.css          # Waveform canvas containers & playhead
├── images/
│   └── working.png           # Application screenshot
├── investigaciones/
│   ├── README.md             # Research documentation
│   └── sync.md               # Detailed PLL math and theory notes
├── js/                       # Vanilla ES6+ modules
│   ├── app.js                # Application root (DJMixApp) & shortcuts
│   ├── audioEngine.js        # Web Audio graph, DSP filters, PLL sync & events
│   ├── autoMixer.js          # Automated end-of-track crossfading
│   ├── bpmDetector.js        # Autocorrelation & comb filter tempo detection
│   ├── browser.js            # File System Access API & playlist manager
│   ├── deck.js               # Deck UI controller (DeckController)
│   ├── knob.js               # Reusable rotary knob control
│   ├── midi.js               # Web MIDI API & Behringer CMD Studio 4A mapping
│   ├── mixer.js              # Central mixer UI controller (MixerController)
│   ├── platter.js            # Turntable mechanics, inertia, scratch & nudge
│   ├── utils.js              # Math helpers & decoupled EventEmitter
│   └── waveformGenerator.js  # HTML5 Canvas mini & zoomed waveform visualizers
├── index.html                # Semantic application markup
├── README.md                 # Portfolio summary (English)
├── README.es.md              # Portfolio summary (Spanish)
├── README-details.md         # Full technical documentation (English)
└── README-details.es.md      # Full technical documentation (Spanish)
```

---

## 🚀 Local Development & Deployment

Modern browser security policies require a secure origin (`http://localhost` or HTTPS) to access the `AudioContext`, `Web MIDI API`, and `File System Access API`.

```bash
# 1. Clone the repository
git clone https://github.com/nelsoncabrera06/webDJ.git
cd webDJ

# 2. Start a local static server
python3 -m http.server 8000
# or: npx serve .

# 3. Open in a Chromium browser (Chrome, Brave, Edge)
open http://localhost:8000
```
Click **"Click to start"** on the introductory overlay to unlock the Web Audio context. Connect your MIDI controller via USB or drag-and-drop local audio files to start mixing!
