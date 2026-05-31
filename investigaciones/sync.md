# Cómo funciona el SYNC entre dos canciones

> Una explicación de cómo se sincronizan automáticamente dos temas (como en
> VirtualDJ, Serato o Pioneer), pensada para entender la idea sin ser
> ingeniero de audio. Mezcla un poco de **teoría musical** con un poco de
> **procesamiento de señales**, pero contado tranquilo.

---

## 1. El problema

Cuando un DJ mezcla dos canciones, quiere que **suenen como una sola**: que los
golpes (los "bombos", el *pum pum pum*) de las dos caigan exactamente en el mismo
momento. Si no, se escucha eso de *"pum-pum ... pumpum-pum"* todo arrastrado y
desprolijo.

Para lograrlo hay que resolver **dos cosas distintas**:

1. **Igualar la velocidad** (que las dos vayan al mismo ritmo). → *Tempo matching*
2. **Alinear los golpes** (que arranquen pisados en el mismo instante). → *Phase matching*

Si solo hacés la 1 y no la 2, van a la misma velocidad pero corridas (como dos
relojes que andan igual de rápido pero marcan horas distintas). Si hacés la 2 pero
no la 1, arrancan juntas y se separan enseguida. **Hay que hacer las dos.**

---

## 2. Vocabulario mínimo de teoría musical

Antes de seguir, cuatro palabras que vamos a usar todo el tiempo:

| Término | Qué es | Ejemplo |
|---|---|---|
| **Beat** (pulso) | El golpe regular que marcás con el pie | 👣 👣 👣 👣 |
| **BPM** | *Beats per minute* — cuántos pulsos entran en un minuto | 120 BPM = 2 pulsos por segundo |
| **Compás** (*bar*) | Grupo de pulsos, casi siempre **4** en música electrónica | `[1 2 3 4]` |
| **Downbeat** | El primer pulso del compás, el "1", el más fuerte | el `1` de `[**1** 2 3 4]` |

Un dato clave que sale de acá:

```
              60
tiempo entre pulsos (segundos) = ─────
                                 BPM
```

Ejemplo: a **120 BPM**, entre golpe y golpe pasan `60 / 120 = 0.5 segundos`.
A **128 BPM**, `60 / 128 = 0.469 segundos`. Más rápido el tema, menos tiempo entre golpes.

### El "beatgrid"

Si marcás dónde cae **cada** pulso a lo largo de toda la canción, te queda una
grilla de líneas. Eso es el **beatgrid**:

```
Forma de onda de la canción (lo que ves como "montañitas"):
   ▁▂▆█▆▂▁▁▂▆█▆▂▁▁▂▆█▆▂▁▁▂▆█▆▂▁▁▂▆█▆▂▁
   │     │     │     │     │     │
   1     2     3     4     1     2      ← beatgrid (un palito por pulso)
   ↑
   downbeat (primer golpe real del tema, casi nunca es el segundo 0)
```

Detectar **bien** dónde empieza ese primer palito (el *downbeat*) es media batalla
del sync. Si la grilla está corrida, todo lo demás queda corrido.

---

## 3. Parte A — Igualar la velocidad (tempo matching)

Las canciones casi nunca tienen el mismo BPM. Una tiene 124, la otra 128. Para que
vayan iguales, a una la tenés que acelerar o frenar.

En una compu, una canción es un archivo que se reproduce a cierta **velocidad de
reproducción** (`playbackRate`):

- `playbackRate = 1.0` → velocidad normal
- `playbackRate = 1.1` → 10% más rápido
- `playbackRate = 0.9` → 10% más lento

Para que la canción **lenta** (slave) alcance a la **rápida** (master), calculás:

```
                 BPM del master
playbackRate = ───────────────────
                 BPM del slave

Ejemplo:  128 / 124 = 1.032   →  el slave se reproduce 3.2% más rápido
```

Y listo: ahora las dos marcan **128 BPM efectivos**.

### El detalle feo: la velocidad cambia el tono 🎵

Acá aparece algo de física. Si acelerás un disco de vinilo, además de ir más rápido
**suena más agudo** (como las voces de pitufo). Lo mismo pasa con el `playbackRate`.

```
   velocidad ↑   →   tono ↑   (pitufos)
   velocidad ↓   →   tono ↓   (cámara lenta tenebrosa)
```

Los reproductores modernos tienen una opción llamada **keylock** (o
`preservesPitch` en código) que hace magia: cambia la velocidad **sin tocar el
tono**. Usa un algoritmo de *time-stretching* que estira o encoge el tiempo
manteniendo las frecuencias. Con keylock activado, podés acelerar el tema un 3% y
nadie nota que cambió el tono.

### Half-time / double-time (el "truco" del ×2)

A veces el master va a 140 BPM y el slave a 70. Acelerar el de 70 al doble (×2)
sería ridículo. Pero musicalmente, **70 y 140 son el mismo ritmo**: 140 es
simplemente "contar el doble de rápido". Entonces, en vez de duplicar, los dejás
como están y el sistema entiende que un golpe del lento equivale a dos del rápido.

```
Master 140 BPM:  | . | . | . | . | . | . |    (golpe cada 0.43s)
Slave   70 BPM:  |   .   |   .   |   .   |     (golpe cada 0.86s)
                 ↑       ↑       ↑
                 caen juntos igual → ya están sincronizados
```

La regla práctica: si el ratio da muy grande o muy chico, lo multiplicás o dividís
por 2 hasta que quede cerca de 1. (En este proyecto, entre 0.7 y 1.4.)

---

## 4. Parte B — Alinear los golpes (fase)

Ya van a la misma velocidad. Pero pueden estar **corridas**:

```
Master:  █───────█───────█───────█───────   (sus golpes)
Slave:   ──█───────█───────█───────█─────    (los del slave, corridos)
           ↑
           desfase: el slave llega tarde
```

Necesitamos un número que diga "qué tan corrido está". Ese número se llama **fase**.

### La fase de un beat

Imaginá que el espacio entre dos golpes es un círculo de reloj que va de `0` a `1`:

```
        0 / 1  ← acá está el golpe
          ╱╲
       0.75   0.25
          ╲╱
         0.5   ← acá está justo en el medio entre dos golpes
```

- Fase `0`   → estás **justo en el golpe**
- Fase `0.5` → estás **en el medio** entre dó golpes
- Fase `0.9` → estás **a punto de** llegar al próximo golpe

Se calcula así (en palabras):

```
fase = (posición_actual − dónde_empezó_el_primer_golpe) / tiempo_entre_golpes
       ...y te quedás solo con la parte decimal (el resto de dividir por 1)
```

> 💡 **Truco mental importante**: la fase es una *fracción* (0 a 1), no segundos.
> Por eso no importa a qué velocidad esté yendo la canción: la fase de "estoy en el
> golpe" siempre es 0. Esto hace que comparar las dos canciones sea simple aunque
> vayan a velocidades distintas.

### El error de fase

Restás la fase del master menos la del slave y obtenés el **error de fase**:

```
error = fase_master − fase_slave

Si da +0.2  →  el slave está atrasado, hay que apurarlo un toque
Si da −0.2  →  el slave está adelantado, hay que frenarlo un toque
Si da  0    →  ¡perfectamente alineados! 🎯
```

(Se "envuelve" entre −0.5 y +0.5, porque estar 0.9 adelante es lo mismo que estar
0.1 atrás — siempre conviene corregir por el camino más corto.)

---

## 5. El error del principiante: alinear con un "salto"

La forma **ingenua** de alinear es: calculo el error y *salto* la aguja del slave
al lugar correcto, como cuando arrastrás la barrita de un video.

```
Antes:   slave ────────►●               (está acá)
Salto:   slave ──────────────►●         (lo teletransporto acá de golpe)
```

¿El problema? En audio digital, **saltar la posición mientras suena produce un
hueco / un "clic" / un tartamudeo**. Se escucha feo. Es exactamente eso que hace
que un sync casero suene "amateur".

Los programas profesionales **nunca saltan** mientras suena. Hacen algo más
elegante.

---

## 6. La solución profesional: deslizar la velocidad (PLL)

En vez de saltar, **acelerás o frenás un poquitito** el slave durante uno o dos
segundos, hasta que se desliza solo a su lugar. Como cuando dos personas caminan
agarradas del brazo y una apura medio paso para emparejarse con la otra: nadie
pega un salto, simplemente ajusta el ritmo un instante.

```
Master:  █───────█───────█───────█───────
Slave:   ──█───────█──────█─────█─────█──   (acelera un toque...)
Slave:   █───────█───────█───────█───────   (...y queda pegado, sin saltos)
              ↑ se deslizó suave hacia su lugar
```

Esto, hecho de forma **continua y automática**, tiene un nombre técnico:
**PLL — Phase-Locked Loop** (lazo de enganche de fase). Es el mismo concepto que
usan las radios y los relojes electrónicos para "engancharse" a una señal.

### Cómo piensa el PLL (en criollo)

Muchas veces por segundo (en este proyecto, 30 veces), el sistema hace esto:

```
   ┌─────────────────────────────────────────────┐
   │  1. ¿Cuánto está corrido el slave?           │
   │     error = fase_master − fase_slave         │
   │                                              │
   │  2. Corrijo PROPORCIONAL al error:           │
   │     - muy corrido  → corrijo más fuerte      │
   │     - casi alineado → corrijo apenas         │
   │     corrección = error × ganancia            │
   │                                              │
   │  3. Aplico esa corrección a la velocidad:    │
   │     velocidad = velocidad_base + corrección  │
   │     (limitada a ±4%, así no se nota el tono) │
   └──────────────────────┬───────────────────────┘
                          │
                          ▼
              vuelve a empezar 30 veces/seg
              → el error se hace cada vez más chico
              → hasta quedar enganchado para siempre
```

La palabra clave es **proporcional**: cuanto más lejos está, más fuerte corrige;
cuando está casi alineado, corrige apenas. Así llega suave, sin pasarse de largo y
sin oscilar (como frenar un auto: fuerte al principio, suave al final).

### ¿Por qué "para siempre"?

Acá está la otra mitad de la magia. Aunque iguales el BPM perfecto, las dos
canciones **se desincronizan solas con el tiempo** (*drift*), porque:

- el BPM detectado está redondeado (124.0 cuando en realidad es 124.03...),
- el reloj de reproducción de la compu no es perfecto al milésimo.

Un sync de "un solo tiro" se va de fase a los pocos segundos. El PLL, al estar
corrigiendo **todo el tiempo**, nunca deja que el error crezca. Es la diferencia
entre alinear una vez y rezar, versus tener un piloto automático que mantiene el
rumbo.

```
Sync de un solo tiro:        Sync con PLL (piloto automático):
error
 │      ___                   │
 │   __/                      │
 │__/      ← se va de fase    │________________ ← se mantiene en ~0
 └────────────── tiempo       └────────────────── tiempo
```

---

## 7. ¿Y cómo sabe la compu el BPM y dónde está el "1"?

Todo lo anterior asume que ya conocemos el BPM y el beatgrid de cada tema. Pero el
MP3 no te lo dice. Hay que **analizarlo**. A grandes rasgos, tres pasos:

### Paso 1 — Encontrar los "golpes" (onsets)

Se recorre el audio midiendo la **energía** (qué tan fuerte suena) en ventanitas
chiquitas. Cuando la energía **sube de golpe**, ahí hay un golpe (un bombo, un
redoblante). Eso genera una lista de "picos":

```
Energía:  ▁▁█▁▁▁▁█▁▁▁▁█▁▁▁▁█▁▁▁▁█▁▁
            ↑     ↑     ↑     ↑     ↑
            golpe golpe golpe golpe golpe
```

### Paso 2 — Encontrar el BPM (autocorrelación)

Ahora hay que medir **cada cuánto** se repiten esos picos. Se usa una técnica
llamada **autocorrelación**: básicamente, se copia la lista de picos, se la corre
un poquito, y se pregunta "¿coinciden?". Se prueba con muchos corrimientos y el
que mejor coincide te dice el período → de ahí sale el BPM.

```
Original:  █───█───█───█───█
Corrida:       █───█───█───█───█
               ↑ cuando esta copia "calza" perfecto con la original,
                 el tamaño del corrimiento = tiempo entre golpes = BPM
```

### Paso 3 — Encontrar el primer golpe (comb filter)

Ya sabemos el BPM, pero falta saber **en qué momento exacto** cae el "1". Se prueba
poner una grilla imaginaria de palitos (separados según el BPM) en distintas
posiciones de arranque, y se ve **en cuál posición los palitos pegan más fuerte
sobre los golpes reales**. Esa es la posición ganadora.

```
Golpes reales:   ──█────█────█────█──
Grilla prueba 1: ─┊────┊────┊────┊───   ✗ no pega
Grilla prueba 2: ──┊────┊────┊────┊──   ✓ ¡pega justo! → este es el arranque
```

A esta técnica se le dice **comb filter** (filtro peine), porque la grilla de
palitos parece... un peine. 🪮

---

## 8. Resumen en una imagen

```
   ┌──────────────┐        ┌──────────────┐
   │  Canción A   │        │  Canción B   │
   │  (MASTER)    │        │  (SLAVE)     │
   └──────┬───────┘        └──────┬───────┘
          │                       │
          │   analizar cada una:  │
          │   • BPM               │
          │   • beatgrid (el "1") │
          ▼                       ▼
   ┌─────────────────────────────────────┐
   │  PARTE A: igualar velocidad          │
   │  playbackRate = BPM_A / BPM_B        │
   │  (+ keylock para no cambiar el tono) │
   └─────────────────┬───────────────────┘
                     ▼
   ┌─────────────────────────────────────┐
   │  PARTE B: alinear la fase            │
   │  • medir error de fase               │
   │  • NO saltar (suena feo)             │
   │  • deslizar la velocidad: PLL        │
   │  • corregir 30 veces/seg, por siempre│
   └─────────────────┬───────────────────┘
                     ▼
              🎧 las dos suenan
                 como una sola
```

---

## 9. Glosario rápido

- **BPM**: pulsos por minuto. Mide qué tan rápida es la canción.
- **Beat / pulso**: cada golpe del ritmo.
- **Compás (bar)**: grupo de pulsos (normalmente 4).
- **Downbeat**: el primer pulso del compás (el "1").
- **Beatgrid**: la grilla con la posición de todos los pulsos del tema.
- **Tempo matching**: igualar la velocidad de las dos canciones.
- **Phase / fase**: en qué punto del "entre-golpe" estás (de 0 a 1).
- **Phase matching**: alinear los golpes de las dos canciones.
- **playbackRate**: multiplicador de velocidad de reproducción.
- **Keylock / preservesPitch**: cambiar velocidad sin cambiar el tono.
- **Drift**: cuando dos canciones sincronizadas se separan solas con el tiempo.
- **PLL (Phase-Locked Loop)**: el piloto automático que corrige la fase
  continuamente, deslizando la velocidad en vez de saltar.
- **Master / Slave**: la canción que manda (master) y la que se adapta (slave).
- **Onset**: el instante donde aparece un golpe (sube la energía).
- **Autocorrelación**: técnica para medir cada cuánto se repite algo (→ BPM).
- **Comb filter**: técnica para encontrar dónde cae el "1" (→ beatgrid).

---

### Para seguir leyendo

Si querés ver **esto mismo pero en código**, en este proyecto vive en
`js/audioEngine.js` (el motor de sync y el PLL) y `js/bpmDetector.js` (el análisis
de BPM y beatgrid). Pero con entender la idea de este documento ya podés conversar
de igual a igual sobre cómo debería comportarse el sync. 😎
