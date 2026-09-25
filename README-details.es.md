# 🎧 WebDJ — Documentación Técnica Detallada

[English (Full Details)](README-details.md) | [English (Summary)](README.md) | [Español (Resumen)](README.es.md)

[![Vanilla JavaScript](https://img.shields.io/badge/Vanilla-JavaScript-F7DF1E?logo=javascript&logoColor=black&style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Web Audio API](https://img.shields.io/badge/Web_Audio-API-FF3E00?logo=html5&logoColor=white&style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
[![Web MIDI API](https://img.shields.io/badge/Web_MIDI-API-0055FF?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)
[![HTML5 Canvas](https://img.shields.io/badge/HTML5-Canvas-E34F26?logo=html5&logoColor=white&style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
[![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-success?style=for-the-badge)](https://github.com/nelsoncabrera06/webDJ)
[![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub_Pages-222222?logo=github&style=for-the-badge)](https://nelsoncabrera06.github.io/webDJ/)

> **Especificación técnica en profundidad, arquitectura de audio DSP, algoritmos de sincronización (PLL), detección de BPM y mapeo de hardware para WebDJ.**

🔗 **Probar la Demo en Vivo:**
https://nelsoncabrera06.github.io/webDJ/

![WebDJ Interface](images/working.png)

---

## 📑 Tabla de Contenidos
1. [Visión General del Sistema](#-visión-general-del-sistema)
2. [Arquitectura de Audio y Flujo de Señal (DSP)](#-arquitectura-de-audio-y-flujo-de-señal-dsp)
3. [Algoritmo de Sincronización Profesional (PLL)](#-algoritmo-de-sincronización-profesional-pll)
4. [Detección Algorítmica de BPM y Beatgrid](#-detección-algorítmica-de-bpm-y-beatgrid)
5. [Visualizadores Canvas a 60 FPS](#-visualizadores-canvas-a-60-fps)
6. [Emulación Física de Jog Wheels (Platters)](#-emulación-física-de-jog-wheels-platters)
7. [Integración de Hardware Web MIDI API](#-integración-de-hardware-web-midi-api)
8. [Matriz de Atajos de Teclado](#-matriz-de-atajos-de-teclado)
9. [Estructura del Proyecto y Modularidad](#-estructura-del-proyecto-y-modularidad)
10. [Instalación y Despliegue Local](#-instalación-y-despliegue-local)

---

## 🌟 Visión General del Sistema

**WebDJ** es una estación de mezcla para DJs (DJ Software / Digital Audio Workstation ligero) de 2 canales desarrollada íntegramente con tecnologías web estándar. Corre de forma nativa en el navegador cliente sin necesidad de servidores de procesamiento de audio ni transpiladores.

### Principios de Diseño
- **Zero-Dependency & Buildless:** 100% Vanilla JavaScript (ES6+), HTML5 y CSS3 sin librerías externas ni empaquetadores (Webpack, Vite, npm).
- **Latencia Crítica:** Procesamiento de audio en hilos de hardware nativos mediante Web Audio API.
- **Acceso Local Seguro:** Manejo de archivos de audio mediante la File System Access API para lectura directa sin consumo de ancho de banda.
- **Interacción Física:** Comunicación serial bidireccional por Web MIDI API para control mediante consolas físicas.

---

## 🎛️ Arquitectura de Audio y Flujo de Señal (DSP)

La clase central `AudioEngine` gestiona el grafo de nodos Web Audio y actúa como única fuente de verdad para el estado sonoro de la aplicación.

```
[ Archivo de Audio Local ]
        │
        ├──► Decodificación PCM Offline ──► [ BPMDetector ] ──► BPM + Beatgrid Offset
        │                                 └──► [ WaveformGenerator ] ──► Canvas Data
        ▼
   <audio> Element (Deck A / B)  [Control de playbackRate y preservesPitch]
        │
        ▼
 MediaElementAudioSourceNode
        │
        ▼
   BiquadFilterNode (Low Shelf @ 250 Hz, -12 dB a +12 dB)
        │
        ▼
   BiquadFilterNode (Peaking Mid @ 1000 Hz, Q=1, -12 dB a +12 dB)
        │
        ▼
   BiquadFilterNode (High Shelf @ 4000 Hz, -12 dB a +12 dB)
        │
        ▼
   GainNode (Fader de Volumen de Canal A / B)
        │
        ├──► AnalyserNode (FFT / RMS en tiempo real para VU Meters)
        │
        ▼
   GainNode (Curva de Crossfader)
        │
        ▼
   GainNode (Master Volume)
        │
        ▼
   audioContext.destination (Salida de Hardware)
```

### Arquitectura Híbrida: `<audio>` + Web Audio Graph

Una decisión clave de ingeniería en WebDJ es el uso deliberado de elementos HTML5 `<audio>` canalizados hacia el grafo de Web Audio mediante `createMediaElementSource`:

1. **Eficiencia en memoria:** Decodificar temas completos en memoria RAM como `AudioBuffer` sin comprimir demanda más de 50 MB por canción de 4 minutos. El elemento `<audio>` realiza streaming y bufferizado dinámico de bajo consumo.
2. **Keylock Nativo (`preservesPitch`):** Los navegadores modernos implementan internamente algoritmos de *time-stretching* optimizados por C++ en el elemento `<audio>`. Al activar `preservesPitch = true`, alterar el `playbackRate` modifica el tempo de la canción manteniendo su tono musical intacto (*Linked Mode*). Al desactivarlo (`preservesPitch = false`), se obtiene el comportamiento analógico del vinilo (*Independent Mode*).
3. **Decodificación selectiva:** Los `AudioBuffer` se generan en un worker/promesa offline únicamente durante la carga inicial para extraer los picos de amplitud y calcular el BPM, descartándose de la reproducción directa.

---

## 🧮 Algoritmo de Sincronización Profesional (PLL)

Sincronizar dos temas musicales en tiempo real requiere resolver dos retos:
1. **Tempo Matching:** Igualar la velocidad de ambos temas (`playbackRate = BPM_master / BPM_slave`).
2. **Phase Matching:** Alinear los pulsos (bombos / transitorios) para que impacten en el mismo milisegundo.

La solución ingenua de saltar la posición (`currentTime = targetTime`) produce clics audibles, cortes de buffer y sensación amateur. WebDJ implementa un **Phase-Locked Loop (PLL)** continuo de control proporcional:

```
                      ┌──────────────────────────────────────┐
                      │ 1. Medición del Error de Fase        │
                      │    error = fase_master - fase_slave  │
                      └──────────────────┬───────────────────┘
                                         │
                                         ▼
                      ┌──────────────────────────────────────┐
                      │ 2. Filtro Pasa-Bajos EMA             │
                      │    (Suaviza microvariaciones/ruido)  │
                      └──────────────────┬───────────────────┘
                                         │
                                         ▼
                      ┌──────────────────────────────────────┐
                      │ 3. Cálculo de Corrección             │
                      │    corr = error * PLL_KP             │
                      │    (clamp estricto a ±4%)            │
                      └──────────────────┬───────────────────┘
                                         │
                                         ▼
                      ┌──────────────────────────────────────┐
                      │ 4. Modulación de playbackRate        │
                      │    Deslizamiento suave sin clics     │
                      └──────────────────────────────────────┘
```

### Parámetros del PLL en `AudioEngine`:
- `PLL_KP = 0.15`: Ganancia proporcional (constante de tiempo $\tau \approx 3$ segundos).
- `PLL_MAX_CORRECTION = 0.04`: Límite máximo de corrección ($\pm 4\%$) durante el enganche para evitar cambios perceptibles en la tonalidad.
- `PLL_DEADBAND = 0.002`: Ventana muerta en pulsos; variaciones menores al 0.2% de un beat no disparan corrección, evitando el efecto de oscilación (*hunting*).
- `PLL_SLEW_CLAMP = 0.08` & `PLL_SLEW_MS = 3000`: Ventana de captura inicial más agresiva ($\pm 8\%$) durante los primeros 3 segundos tras pulsar SYNC para acelerar el enganche.
- `PHASE_EMA_ALPHA = 0.3`: Coeficiente del filtro de media móvil exponencial (EMA) para estabilizar la señal de error.
- **Resolución de Octavas (Half/Double Time):** Si la relación de BPM excede el rango confortable (0.7 a 1.4), el motor multiplica o divide por 2 automáticamente, permitiendo emparejar ritmos a 70 BPM con bases a 140 BPM.
- **Suspensión de PLL en Gestos:** Durante acciones manuales en los platters (scratch o nudge), el PLL se suspende para no interferir con el control del DJ.

---

## 🔍 Detección Algorítmica de BPM y Beatgrid

Implementado en `bpmDetector.js` sin librerías externas de procesamiento digital de señales:

1. **Mezcla a Canal Mono:** Convierte la señal estéreo a un `Float32Array` único promediando los canales.
2. **Cálculo de Envoltura de Onsets (Onset Detection):** Mide el flujo espectral (*spectral flux*) y variaciones de energía instantánea a una tasa de análisis de 200 Hz.
3. **Autocorrelación de Tempo:** Compara la señal consigo misma desplazada en un rango de retardos correspondiente a 60–180 BPM para identificar la periodicidad predominante.
4. **Filtro Peine (Comb Filter) para Detección de Downbeat:** Con el BPM calculado, se aplica un filtro peine cruzado contra el tren de pulsos candidatos a lo largo de la pista para identificar el desfase exacto del primer golpe (*firstBeatTime* / *downbeat*), asignando un puntaje de confianza (*confidence*).

---

## 📊 Visualizadores Canvas a 60 FPS

La clase `waveformGenerator.js` implementa dos renderizadores en HTML5 Canvas con aceleración gráfica:

### 1. Mini-Waveform (Resumen Completo)
- Submuestreo de la señal RMS a una resolución fija (50 muestras por segundo de audio).
- Normalización de picos en escala 0.0 a 1.0.
- Superposición interactiva con indicador de posición actual, marcadores de beatgrid cada 4 pulsos (downbeats destacados) y banderas de colores para los Hot Cues 1–8.
- Soporte para saltar a cualquier punto de la pista mediante clic o arrastre directo.

### 2. Zoomed Waveform (Visualizador Central Sincronizado)
- Ventana temporal dinámica que muestra los 4 a 8 segundos inmediatos alrededor de la aguja de reproducción.
- Renderizado simétrico en espejo (*mirror mode*) con gradiente de color personalizado por deck.
- Escalado temporal dinámico según el `playbackRate` para mantener la velocidad visual de desplazamiento constante.
- Playhead fijo central alineado con marcas de beatgrid verticales de alta precisión para facilitar el beatmatching visual.

---

## 💿 Emulación Física de Jog Wheels (Platters)

La clase `platter.js` gestiona la interacción física sobre los vinilos virtuales:
- **Cálculo de Ángulo Absoluto:** Utiliza trigonometría inversa `Math.atan2(deltaY, deltaX)` para seguir la rotación exacta del cursor o del toque en pantallas capacitivas.
- **Scratching:** Al hacer clic o mantener presionado sobre el vinilo, la reproducción pasa a modo manual, desplazando el audio proporcionalmente a la velocidad angular del usuario.
- **Pitch Nudge:** El arrastre ligero altera temporalmente el `playbackRate` aplicando una fuerza suave ($\pm 15\%$) para emparejar manualmente los compases como en una bandeja tradicional.

---

## 🎹 Integración de Hardware Web MIDI API

WebDJ incluye un controlador MIDI bidireccional en `midi.js` diseñado para la consola profesional **Behringer CMD Studio 4A**:

| Elemento Hardware | Mensaje MIDI | Canal / ID | Función Mapeada |
|---|---|---|---|
| **Play / Pause** | Note On/Off | Ch 0: Nota 44 / Ch 1: Nota 76 | Reproducción / Pausa |
| **Cue** | Note On/Off | Ch 0: Nota 43 / Ch 1: Nota 75 | Retorno a Cue / Fijar Cue |
| **Sync** | Note On/Off | Ch 0: Nota 45 / Ch 1: Nota 77 | Activar/Desactivar PLL Sync |
| **Jog Wheel** | CC Relativo (Centro 64) | Ch 0: CC 26 / Ch 1: CC 58 | Scratch y Nudge de aguja |
| **Fader Volumen** | CC Absoluto (0–127) | Ch 0: CC 112 / Ch 1: CC 113 | Ganancia de canal Deck A / B |
| **Crossfader** | CC Absoluto (0–127) | Ch 0: CC 114 | Mezclador central A/B |
| **EQ High** | CC (0–127) | CC 96 (Deck A) / CC 99 (Deck B) | Filtro High Shelf (-12 a +12 dB) |
| **EQ Mid** | CC (0–127) | CC 97 (Deck A) / CC 100 (Deck B) | Filtro Peaking (-12 a +12 dB) |
| **EQ Low** | CC (0–127) | CC 98 (Deck A) / CC 101 (Deck B) | Filtro Low Shelf (-12 a +12 dB) |
| **Pitch Slider** | Pitch Bend (14-bit) | Canales 0 y 1 | Ajuste continuo de tempo (0.50x – 1.50x) |
| **Hot Cues 1–8** | Note On/Off | Ch 0: Notas 34–41 / Ch 1: Notas 66–73 | Disparo o grabado de marcas |
| **Delete Cue** | Note On/Off | Ch 0: Nota 42 / Ch 1: Nota 74 | Activar modo de borrado de cues |
| **Loop (/2, x2, ON)** | Note On/Off | Ch 0: Notas 23–25 / Ch 1: Notas 55–57 | Manejo de bucles de compás |
| **LED Feedback** | Note On Out (Vel 127/0) | Salida hacia la consola | Iluminación de botones en hardware |

---

## ⌨️ Matriz de Atajos de Teclado

| Acción | Deck A | Deck B | Global |
|---|---|---|---|
| **Play** | `Q` | `U` | - |
| **Pause** | `W` | `I` | - |
| **Stop** | `E` | `O` | - |
| **Cue** | `A` | `J` | - |
| **Sync** | `S` | `K` | - |
| **Play/Pause Activo** | - | - | `Barra Espaciadora` |
| **Hot Cues (1 al 4)** | `1`, `2`, `3`, `4` | `7`, `8`, `9`, `0` | - |
| **Pitch / Tempo (+/-)** | `Shift` + `↑` / `↓` | `Shift` + `→` / `←` | - |
| **Crossfader** | `Z` (Solo A) | `C` (Solo B) | `X` (Centro) |

---

## 📂 Estructura del Proyecto y Modularidad

```
DJmix_web/
├── css/                      # Hojas de estilo modulares
│   ├── browser.css           # File browser y lista de reproducción
│   ├── deck.css              # Controles de transporte, cues, loops y pads
│   ├── mixer.css             # Canales, faders, knobs y medidores VU
│   ├── platter.css           # Representación visual del vinilo
│   ├── styles.css            # Layout global, variables y encabezado
│   └── waveform.css          # Contenedores de canvas y playhead
├── images/
│   └── working.png           # Captura de pantalla de la interfaz
├── investigaciones/
│   ├── README.md             # Documentación de investigaciones
│   └── sync.md               # Estudio teórico y matemático del PLL
├── js/                       # Módulos JavaScript (Vanilla ES6+)
│   ├── app.js                # Raíz de composición (DJMixApp) y shortcuts
│   ├── audioEngine.js        # Grafo Web Audio, filtros DSP, PLL y EventEmitter
│   ├── autoMixer.js          # Automatización de transiciones y crossfade
│   ├── bpmDetector.js        # Algoritmo de autocorrelación y comb filter
│   ├── browser.js            # File System Access API y gestión de playlists
│   ├── deck.js               # Controlador de interfaz individual por deck
│   ├── knob.js               # Componente rotary drag-to-rotate
│   ├── midi.js               # Web MIDI API y mapeo Behringer CMD Studio 4A
│   ├── mixer.js              # Controlador visual de la consola central
│   ├── platter.js            # Físicas de rotación, scratch y nudge
│   ├── utils.js              # Helpers matemáticos y EventEmitter desacoplado
│   └── waveformGenerator.js  # Renderizado Canvas para waveforms mini y zoom
├── index.html                # Interfaz semántica de la aplicación
├── README.md                 # Resumen para portfolio en inglés
├── README.es.md              # Resumen para portfolio en español
├── README-details.md         # Documentación técnica completa en inglés
└── README-details.es.md      # Este documento (Detalles técnicos en español)
```

---

## 🚀 Instalación y Despliegue Local

Debido a que el navegador restringe el uso de `AudioContext` y la `File System Access API` por motivos de seguridad en contextos no seguros (`file://`), debe ejecutarse bajo `http://localhost` o HTTPS.

```bash
# 1. Clonar el repositorio
git clone https://github.com/nelsoncabrera06/webDJ.git
cd webDJ

# 2. Iniciar un servidor HTTP local (Python)
python3 -m http.server 8000

# O usando Node.js
npx serve .
```

Abre `http://localhost:8000` en **Google Chrome**, **Brave** o cualquier navegador basado en Chromium. Haz clic en **"Click to start"** para inicializar el contexto de audio y comienza a mezclar.
