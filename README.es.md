# 🎧 WebDJ — Software de Mezcla DJ para Navegador

[![Vanilla JavaScript](https://img.shields.io/badge/Vanilla-JavaScript-F7DF1E?logo=javascript&logoColor=black&style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Web Audio API](https://img.shields.io/badge/Web_Audio-API-FF3E00?logo=html5&logoColor=white&style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![Web MIDI API](https://img.shields.io/badge/Web_MIDI-API-0055FF?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)
[![HTML5 Canvas](https://img.shields.io/badge/HTML5-Canvas-E34F26?logo=html5&logoColor=white&style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-success?style=for-the-badge)](https://github.com/nelsoncabrera06/webDJ)
[![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub_Pages-222222?logo=github&style=for-the-badge)](https://nelsoncabrera06.github.io/webDJ/)

> **Aplicación de mezcla DJ de 2 decks y alto rendimiento construida con JavaScript puro, Web Audio API y Web MIDI API — sin frameworks, sin pasos de compilación y con 0 dependencias externas.**

🔗 **Probar la Demo en Vivo:**  
https://nelsoncabrera06.github.io/webDJ/  
*(Se recomienda un navegador basado en Chromium: Chrome, Brave o Edge)*

📖 **Documentación Técnica Detallada:** [Detalles en Español](README-details.es.md) | [English Details](README-details.md)  
🌐 **Idioma:** [Español (Actual)] | [🇬🇧 English Version](README.md)

---

![WebDJ Interface](images/working.png)

---

## ⚡ ¿Qué es WebDJ?

**WebDJ** es una estación de trabajo de audio digital (DAW liviano) y mezclador de DJ que se ejecuta 100% en el cliente dentro del navegador web. Demuestra la capacidad de las APIs web de bajo nivel para aplicaciones de audio complejas y de latencia crítica sin recurrir a frameworks ni librerías pesadas.

### 💡 Puntos Destacados
- **0 Dependencias:** 100% Vanilla JavaScript (ES6+), HTML5 y CSS3 nativo.
- **Motor de Audio de Baja Latencia:** Grafo Web Audio DSP con ecualizador paramétrico de 3 bandas (filtros Biquad), medidores VU estéreo en tiempo real, rack de efectos (Filtro, Flanger, Eco) y curvas suaves de crossfader.
- **Arquitectura Híbrida de Reproducción:** Combina streaming con `<audio>` y keylock nativo (*time-stretching* con `preservesPitch`) junto a nodos Web Audio para procesamiento en tiempo real.
- **Sincronización Profesional por PLL:** Lazo de enganche de fase (**Phase-Locked Loop**) que modula suave y continuamente la velocidad para lograr alineación de golpes sin saltos de aguja, cortes de buffer ni chasquidos.
- **Detección Algorítmica de BPM y Beatgrid:** Autocorrelación de transitorios y filtro peine (*comb filter*) para detectar el tempo y el primer golpe (*downbeat*) desde los datos de audio en memoria.
- **Formas de Onda en Canvas a 60 FPS:** Mini-waveforms interactivas de pista completa y visualizador central dual ampliado y desplazable en tiempo real.
- **Soporte de Hardware Web MIDI:** Integración plug-and-play para consolas DJ, pre-mapeada para la **Behringer CMD Studio 4A** con retroalimentación bidireccional por LEDs.
- **File System Access API Local:** Navega carpetas locales de tu disco duro de forma segura y arrastra pistas hacia los decks y listas de reproducción.
- **Suite para DJs:** 8 Hot Cues por deck, creador de bucles (*loops* con /2 y x2), jog wheels para scratching/nudge y Auto-Mixer inteligente.

---

## 🚀 Puesta en Marcha Rápida (Local)

Por políticas de seguridad del navegador, se requiere un origen seguro (`http://localhost` o HTTPS) para usar la Web Audio API y la File System Access API:

```bash
# 1. Clonar el repositorio
git clone https://github.com/nelsoncabrera06/webDJ.git
cd webDJ

# 2. Iniciar un servidor local estático
python3 -m http.server 8000
# o con Node: npx serve .

# 3. Abrir en un navegador basado en Chromium
open http://localhost:8000
```

1. Haz clic en **"Click to start"** para inicializar el contexto de audio del navegador.
2. Pulsa en **"Load Track"** o arrastra pistas (`.mp3`, `.wav`, `.ogg`, `.flac`) a los Decks A y B.
3. Conecta tu controlador USB MIDI o mezcla usando el teclado.

---

## ⌨️ Atajos de Teclado Principales

| Control | Deck A | Deck B | Global |
|---|---|---|---|
| **Play / Pausa** | `Q` / `W` | `U` / `I` | `Barra Espaciadora` (deck activo) |
| **Stop / Cue** | `E` / `A` | `O` / `J` | - |
| **Beat Sync** | `S` | `K` | - |
| **Hot Cues (1 al 4)** | `1`, `2`, `3`, `4` | `7`, `8`, `9`, `0` | - |
| **Tempo / Pitch** | `Shift` + `↑` / `↓` | `Shift` + `→` / `←` | - |
| **Crossfader** | `Z` (Solo A) | `C` (Solo B) | `X` (Centro 50/50) |

---

## 🛠️ Stack Tecnológico

- **Núcleo:** Vanilla JavaScript (ES6+), HTML5, CSS3
- **Audio DSP:** Web Audio API (`AudioContext`, `BiquadFilterNode`, `GainNode`, `AnalyserNode`)
- **Hardware:** Web MIDI API
- **Archivos:** File System Access API y Drag and Drop API
- **Gráficos:** HTML5 Canvas API (Acelerado por hardware a 60 FPS)

---

## 📚 Arquitectura y Especificación Detallada

¿Quieres conocer el grafo de señal DSP, la matemática detrás del Phase-Locked Loop (PLL) o la tabla completa de mapeo MIDI?

👉 **[Leer la Documentación Técnica Completa (README-details.es.md)](README-details.es.md)**

---

## 👤 Autor

Desarrollado por **Nelson Cabrera**.

- **GitHub:** [@nelsoncabrera06](https://github.com/nelsoncabrera06)
- **Demo en Producción:** [https://nelsoncabrera06.github.io/webDJ/](https://nelsoncabrera06.github.io/webDJ/)
