# 🎧 WebDJ — Browser-Based DJ Mixing Software

[![Vanilla JavaScript](https://img.shields.io/badge/Vanilla-JavaScript-F7DF1E?logo=javascript&logoColor=black&style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Web Audio API](https://img.shields.io/badge/Web_Audio-API-FF3E00?logo=html5&logoColor=white&style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![Web MIDI API](https://img.shields.io/badge/Web_MIDI-API-0055FF?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)
[![HTML5 Canvas](https://img.shields.io/badge/HTML5-Canvas-E34F26?logo=html5&logoColor=white&style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-success?style=for-the-badge)](https://github.com/nelsoncabrera06/webDJ)
[![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub_Pages-222222?logo=github&style=for-the-badge)](https://nelsoncabrera06.github.io/webDJ/)

> **A high-performance, 2-deck DJ mixing application built with vanilla JavaScript, the Web Audio API, and the Web MIDI API — no frameworks, no build step, and zero external dependencies.**

🔗 **Live Demo:**  
https://nelsoncabrera06.github.io/webDJ/  
*(Chromium-based browser recommended: Chrome, Brave, Edge)*

📖 **Full Technical Documentation:** [English Details](README-details.md) | [Detalles en Español](README-details.es.md)  
🌐 **Language:** [English (Current)] | [🇪🇸 Versión en Español](README.es.md)

---

![WebDJ Interface](images/working.png)

---

## ⚡ What is WebDJ?

**WebDJ** is a digital audio workstation and DJ mixer running entirely client-side in the browser. It proves what modern low-level web APIs can achieve without third-party audio libraries or frontend frameworks.

### 💡 Key Highlights
- **0 Dependencies:** 100% native Vanilla JavaScript (ES6+), HTML5, and CSS3.
- **Low-Latency Audio Engine:** Dual-channel Web Audio DSP graph with 3-band parametric EQ (Biquad filters), real-time stereo VU meters, FX rack (Filter, Flanger, Echo), and smooth crossfader curves.
- **Hybrid Playback Architecture:** Pairs `<audio>` streaming with native time-stretching keylock (`preservesPitch`) and Web Audio nodes downstream for real-time DSP.
- **Professional PLL Beat Sync:** Closed-loop **Phase-Locked Loop** continuously nudges playback rate to achieve sub-millisecond phase alignment without playhead skips, clicks, or buffer dropouts.
- **Algorithmic BPM & Beatgrid Detection:** Offline autocorrelation and comb filter cross-correlation detect tempo and downbeats directly from raw audio buffers.
- **60 FPS Canvas Waveforms:** Full-track interactive mini-waveforms and dynamic dual synchronized scrolling waveforms.
- **Web MIDI Hardware Support:** Plug-and-play controller integration pre-mapped for the **Behringer CMD Studio 4A** with bidirectional LED feedback.
- **Local File System Access API:** Directly browse and stream local folders and drag-and-drop tracks into decks and playlists.
- **Performance DJ Suite:** 8 Hot Cues per deck, dynamic beat looper (/2, x2), vinyl scratch/nudge platters, and smart Auto-Mixer.

---

## 🚀 Quick Start (Local Setup)

The application requires a secure context (`http://localhost` or HTTPS) to access the Web Audio API and File System Access API:

```bash
# 1. Clone the repository
git clone https://github.com/nelsoncabrera06/webDJ.git
cd webDJ

# 2. Start any local static server
python3 -m http.server 8000
# or: npx serve .

# 3. Open in a Chromium browser
open http://localhost:8000
```

1. Click **"Click to start"** on the initial overlay to unlock browser audio.
2. Click **"Load Track"** or drag audio files (`.mp3`, `.wav`, `.ogg`, `.flac`) to Deck A and Deck B.
3. Plug in a USB MIDI controller or mix using keyboard shortcuts!

---

## ⌨️ Essential Keyboard Shortcuts

| Control | Deck A | Deck B | Global |
|---|---|---|---|
| **Play / Pause** | `Q` / `W` | `U` / `I` | `Space` (active deck) |
| **Stop / Cue** | `E` / `A` | `O` / `J` | - |
| **Beat Sync** | `S` | `K` | - |
| **Hot Cues (1–4)** | `1`, `2`, `3`, `4` | `7`, `8`, `9`, `0` | - |
| **Pitch / Tempo** | `Shift` + `↑` / `↓` | `Shift` + `→` / `←` | - |
| **Crossfader** | `Z` (Deck A) | `C` (Deck B) | `X` (Center 50/50) |

---

## 🛠️ Tech Stack

- **Core:** Vanilla JavaScript (ES6+), HTML5, CSS3
- **Audio DSP:** Web Audio API (`AudioContext`, `BiquadFilterNode`, `GainNode`, `AnalyserNode`)
- **Hardware:** Web MIDI API
- **File I/O:** File System Access API & Drag and Drop API
- **Graphics:** HTML5 Canvas API (Hardware-Accelerated 60 FPS)

---

## 📚 Deep Dive & Architecture

Want to understand the DSP signal graph, the mathematics behind the Phase-Locked Loop (PLL), or the MIDI controller mapping?

👉 **[Read the Full Technical Documentation (README-details.md)](README-details.md)**

---

## 👤 Author

Developed by **Nelson Cabrera**.

- **GitHub:** [@nelsoncabrera06](https://github.com/nelsoncabrera06)
- **Live Demo:** [https://nelsoncabrera06.github.io/webDJ/](https://nelsoncabrera06.github.io/webDJ/)
