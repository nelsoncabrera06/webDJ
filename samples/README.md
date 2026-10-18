# Samples de arranque

Los 8 one-shots que vienen con la app para probar el sampler (sección **SAMPLES** del panel
inferior y los 8 pads de cada deck).

Son **sintetizados** con un script de Node (sin dependencias, sin problemas de licencia): no
provienen de ningún pack. Cada uno es mono, 44.1 kHz, 16 bits:

| Archivo | Qué es |
| --- | --- |
| `kick.wav` | Bombo con barrido de tono |
| `snare.wav` | Caja (ruido + cuerpo) |
| `clap.wav` | Palmas (4 golpes + cola) |
| `hat.wav` | Charles corto |
| `subdrop.wav` | Subida/bajada de sub-graves |
| `riser.wav` | Riser de ruido con tono que sube |
| `laser.wav` | Barrido descendente corto |
| `stab.wav` | Acorde menor con séptima, tipo stab |

Se pueden **ampliar** arrastrando audio desde el Browser de la app al panel SAMPLES. Si el archivo
dura más de 30 segundos, se conserva sólo el comienzo hasta ese límite; después se puede arrastrar
el sample agregado a cualquiera de los pads. El formato debe ser compatible con la decodificación
de audio del navegador. Si querés regenerar los samples incluidos, el script está en
`$TMPDIR/opencode/make-samples.mjs` (script descartable, no versionado).
