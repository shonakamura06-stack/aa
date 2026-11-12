# Corpus REAL de visión

Aquí van las **capturas del juego**, con etiqueta hecha a mano. Mientras esta
carpeta no tenga pares `*.png` + `*.json`, todo informe de visión debe decir
`reales: 0`.

## Formato

Por cada captura, dos ficheros con el mismo nombre base:

```
corpus/real/nivel-12.png    ← la captura (PNG, 8 bits, RGB o RGBA, sin entrelazar)
corpus/real/nivel-12.json   ← la etiqueta humana del tablero
```

```json
{
  "id": "nivel-12",
  "origen": "humano",
  "tema": "mina",
  "resolucion": { "width": 1280, "height": 720 },
  "notas": "zoom 100 %, HUD recortado",
  "etiqueta": [
    [{ "type": "empty" }, { "type": "gem" },   { "type": "wall" }],
    [{ "type": "chest_wood" }, { "type": "portal", "color": "blue" }, { "type": "empty" }]
  ]
}
```

- `etiqueta` va **fila a fila**, de arriba abajo, con una entrada por casilla.
- Si una casilla es dudosa incluso para ti, márcala ambigua:
  `{ "type": "crystal", "ambiguous": true, "alternativas": ["gem"] }`.
  Cuenta como acierto cualquiera de las dos y no infla los errores.
- `type` usa los identificadores del catálogo (`src/core/catalog.js`):
  `empty`, `wall`, `gem`, `crystal`, `chest_wood`, `chest_iron`, `portal`,
  `mirror_slash`, `mirror_backslash`, `geyser`, `dynamite`, `detonator`,
  `switch`, `magma_rock`, `rock_soft`, `rock_hard`, `cat`, `enemy_1`…`enemy_4`.
- Los portales llevan `color: "blue" | "purple"` (se evalúa aparte del tipo).

## Cómo se usa

```bash
node scripts/cli.mjs vision --real=./corpus/real
node scripts/cli.mjs vision --real=./corpus/real --json
```

El informe separa **corpus real** (el único que dice algo del juego) y
**corpus sintético** (regresión de la tubería). Si un fichero está roto o le
falta la etiqueta, sale listado como «caso ignorado» con el motivo: nunca se
evalúa a ciegas.

## Límites conocidos del lector

`src/vision/png.js` acepta PNG de 8 bits, color type 0/2/6 y sin entrelazado.
Cualquier otra variante (16 bits, paleta, Adam7) se rechaza con un mensaje que
dice qué hacer. Si tu captura es un JPEG, conviértela a PNG primero
(`ffmpeg -i captura.jpg captura.png`).
