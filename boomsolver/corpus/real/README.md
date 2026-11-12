# Corpus REAL de visión

Aquí van las **capturas del juego**, con etiqueta hecha a mano. Hoy tiene 13
capturas y el informe completo está en `VISION_REAL_INFORME.md`.

## De dónde salen

Las 13 capturas salen del PDF del tutorial del juego:

```bash
node scripts/pdf-extract.mjs tutorial.pdf --out=corpus/real/pages
```

Ese script escribe un JPEG por página en `pages/` (`img-01.jpg` … `img-14.jpg`).
De cada página se recorta el tablero a `captures/<id>.png`, **sin reescalar**:
el recorte es 1:1 con la página, y la posición del recorte dentro de la página
está medida y guardada en el JSON.

## Formato

Por cada captura, un JSON y un PNG:

```
corpus/real/p06-n66-magma-cristal.json   ← etiqueta humana
corpus/real/captures/p06-n66-magma-cristal.png
```

```json
{
  "id": "p06-n66-magma-cristal",
  "captura": "captures/p06-n66-magma-cristal.png",
  "pagina_pdf": 6,
  "nivel": 66,
  "resolucion": { "width": 600, "height": 375 },
  "cuadricula": { "cols": 8, "rows": 5 },
  "geometria": {
    "lado": 75,
    "origen_recorte": { "x": 96, "y": 511 },
    "fase_casilla": { "x": 1, "y": 41 }
  },
  "objetos": [
    { "x": 0, "y": 0, "type": "chest_wood" },
    { "x": 2, "y": 0, "type": "crystal" }
  ],
  "bandeja": [],
  "temporizadores": [],
  "enlaces": [],
  "recuento": { "chest_wood": 2, "crystal": 7, "magma_rock": 3 }
}
```

### Las dos geometrías, que no son lo mismo

Es el error que costó media fase, así que va explícito:

| Campo | Qué es |
|---|---|
| `origen_recorte` | dónde se recortó la captura **dentro de la página** (medido por correlación, exacto) |
| `fase_casilla` | desplazamiento de la rejilla de casillas **dentro de la captura** |
| `lado` | tamaño de casilla en píxeles (idéntico en los dos ejes: el tablero es cuadrado) |

La casilla `(c, r)` ocupa
`x ∈ [origen_recorte.x + fase_casilla.x + c·lado, +lado)` y lo mismo en `y`.

**Por qué hay fase**: las capturas se recortaron a ojo al principio y no todas
empiezan en una frontera de casilla. La fase se calibró maximizando la
coincidencia entre el centro de cada casilla etiquetada y el centro del arte
dibujado. Está guardada con su puntuación para que se pueda revisar.

`cuadricula` es el número de filas y columnas **del tablero**, no las que caben
en la captura: algunas capturas incluyen una franja del marco y algunas cortan
la última fila por abajo.

### Etiquetas

- `objetos` va casilla a casilla, `x` = columna, `y` = fila, índice 0.
- **Las casillas vacías NO se etiquetan.** El evaluador las deduce por omisión y
  las cuenta aparte (ver «casillas inventadas» en el informe). Etiquetarlas a
  mano metería errores humanos en una cifra que no aporta nada sobre reconocer
  objetos.
- `type` usa los identificadores de `src/core/catalog.js`: `gem`, `crystal`,
  `chest_wood`, `chest_iron`, `portal`, `mirror_slash`, `mirror_backslash`,
  `geyser`, `dynamite`, `detonator`, `switch`, `magma_rock`, `rock_soft`,
  `rock_hard`, `cat`, `enemy_1`…`enemy_4`.
- `*` = **objeto real que no está en el catálogo**. No se puntúa ni como acierto
  ni como fallo: se cuenta aparte. Hoy son 4 (probablemente `rock_hard`).
- Las **rayas diagonales rojas** del marco significan «fuera del tablero»: esas
  casillas no existen y no se etiquetan.

## Cómo se usa

```bash
node scripts/cli.mjs vision --real=./corpus/real
node scripts/cli.mjs vision --real=./corpus/real --json
```

El informe hace **validación cruzada dejando un nivel fuera**: entrena con las
capturas de todos los niveles menos uno y evalúa en el que queda fuera. Ninguna
captura se mide con un modelo que la haya visto.

## Reglas para ampliar el corpus

1. **Una captura = una imagen recortada al tablero, sin reescalar.** Reescalar
   cambia el arte y hace que los rasgos no sean comparables.
2. **Etiquetar mirando la casilla ampliada**, no de memoria ni de una hoja de
   contactos. El método que funcionó: dibujar la cuadrícula encima (con la fase
   aplicada) y revisar casilla a casilla.
3. **Auditar las propias etiquetas** antes de creerse un resultado: buscar
   casillas etiquetadas que en el ráster estén vacías (varianza interior baja) y
   objetos visibles sin etiqueta (blobs de arte saturado). Las dos auditorías
   encontraron 6 errores míos en este corpus.
4. **Un nivel nuevo no es una captura nueva.** Dos capturas del mismo nivel son
   casi la misma imagen: van siempre al mismo lado del reparto.

## Límites conocidos del lector

`src/vision/png.js` acepta PNG de 8 bits, color type 0/2/6 y sin entrelazado.
Cualquier otra variante (16 bits, paleta, Adam7) se rechaza con un mensaje que
dice qué hacer. Si la captura es un JPEG, conviértela a PNG primero.
