# Validación real de la visión — Fase 2.1

Estado: **la visión funciona sobre capturas reales, con abstención declarada**.
Este informe sustituye a la fila «El detector reconoce capturas reales: **no**»
del informe de Fase 2. La fila nueva es más incómoda y más útil:

> Reconoce el 54 % de los objetos de un corpus de 13 capturas, se abstiene en el
> 39 %, y de lo que afirma acierta el 91 %. Donde no hay objeto, sólo inventa
> uno en 2 de 440 casillas.

Y lo que **no** dice: que reconozca el juego en general. El corpus son 13
capturas de un tutorial, con un solo estilo de arte.

---

## 1. El problema que había que resolver

El clasificador de la Fase 1 (`cellFeatures` + `FEATURE_PROFILES` en
`src/vision/detector.js`) se construyó sobre imágenes sintéticas: una casilla es
un color plano con un emblema. Sus rasgos principales son las **medianas de la
casilla entera**. Sobre arte real, la mediana de una casilla es el **suelo**.

Ejemplo medido, casilla de cristal sobre fondo verde (p11):

```
hue 89.7   sat 0.48   val 0.83      -> classifyCell = empty / needs_review 0.55
```

El cristal rosa es minoría de píxeles; la mediana lo ignora. Resultado: **100 %
de abstención en las 87 casillas etiquetadas**. No era prudencia, era mirar la
señal equivocada.

La conclusión no fue «bajar el umbral» (eso habría producido aciertos con
suerte), sino **cambiar de señal**: medir el objeto, no la casilla.

---

## 2. Qué mide ahora

`src/vision/realClassifier.js`, en este orden:

| Paso | Qué hace | Por qué así |
|---|---|---|
| 1. Suelo | mediana del **anillo perimetral** de la casilla | el suelo de una casilla es uniforme; el objeto no toca los bordes |
| 2. Máscara | píxeles que distan > 34 del suelo | no depende del tono del tema ni del suelo |
| 3. Componente | se queda la **componente conexa** más plausible, no todos los píxeles | el arte del vecino se cuela por el borde si el recorte está desplazado |
| 4. Rasgos | área, caja, relleno, simetría, diagonal, textura, reparto de color | 22 números por casilla |
| 5. Clase | prototipo más cercano en el espacio normalizado | entrenado SÓLO con capturas de desarrollo |

### Reglas de abstención (las tres son deliberadas)

1. **Sin parecido** — distancia al prototipo más cercano > 3,4 → `unknown`.
2. **Duda entre hermanas** — `chest_wood` vs `chest_iron` a menos de 1,6 → `needs_review`, con las dos alternativas.
3. **Suelo no fiable** — menos del 55 % del anillo es suelo → `needs_review` con el aviso «el recorte no cuadra».

Y una cuarta que no es abstención sino sentido común: si la «máscara» **llena la
casilla y toca los cuatro bordes**, no es un objeto, es un parche de terreno
(fuera del tablero). Se declara `empty`.

---

## 3. Cómo se mide

### El corpus

13 capturas (`corpus/real/*.json` + `captures/*.png`), extraídas del PDF del
tutorial con `scripts/pdf-extract.mjs` (sin dependencias: el PDF se lee a mano).

- **120 objetos etiquetados a mano**, casilla por casilla, mirando el overlay con
  la cuadrícula dibujada. Las casillas vacías no se etiquetan una a una: se
  declaran vacías por omisión, y el evaluador las cuenta aparte.
- **4 objetos de clase desconocida** (`*`): arte que no está en el catálogo. No
  se puntúan, ni como acierto ni como fallo.
- 11 niveles distintos (p03 y p04 son dos estados del mismo nivel).

### Tres auditorías que encontraron errores en mis propias etiquetas

El corpus lo etiqueté yo, así que lo trato como sospechoso. Tres comprobaciones
independientes del clasificador:

| Auditoría | Qué buscaba | Qué encontró |
|---|---|---|
| varianza interior | casillas etiquetadas que en el ráster están vacías | 2 etiquetas sobre casillas vacías (p04, p09) → retiradas |
| blobs de arte | objetos visibles sin etiqueta | 4 etiquetas olvidadas (3 cristales en p06, 1 cristal en p03, 1 enemigo en p10, 1 géiser en p09) → añadidas |
| localización de recorte | ¿la captura está donde dice la etiqueta? | 13/13 correctas (correlación con la página, error < 1 px) |

Las dos primeras cambiaron el corpus. Sin ellas, el informe habría tenido 6
«falsos positivos» del detector que en realidad eran fallos míos de etiquetado.

### El reparto: validación cruzada dejando un nivel fuera

Con 13 capturas no hay conjunto de test grande, así que no se reserva un 40 %:
se hace **leave-one-level-out**. Para cada nivel, se entrena con las capturas de
todos los demás y se evalúa en el que queda fuera. Las 13 capturas acaban
evaluadas con un modelo que no las ha visto.

Dos capturas del mismo nivel (p03/p04) van siempre al mismo pliegue: son casi la
misma imagen y separarlas sería hacer trampa.

`lado` (tamaño de casilla) y `fase_casilla` (desplazamiento de la rejilla dentro
de la captura) son **geometría dada**, no detectada. Esto es deliberado: aísla
el reconocimiento de objetos. La estimación automática de rejilla es otro
problema y sigue sin resolverse (§6).

---

## 4. Resultado

### Objetos

| | |
|---|---|
| objetos evaluables | **116** (4 de clase desconocida, no puntuados) |
| aciertos | **63** — 54,3 % del total |
| clase equivocada | **4** |
| falsos positivos | **2** |
| omitidos | **4** |
| **abstenciones** | **45 — 38,8 % del total** |
| **precisión sobre lo afirmado** | **91,3 %** (63 de 69) |

La abstención va en negrita al mismo nivel que el acierto porque es la cifra que
hace utilizable la precisión: un 91 % afirmando 69 de 116 objetos es un detector
prudente; un 91 % afirmando 116 sería otra cosa.

### Casillas vacías (la otra mitad de la verdad)

| | |
|---|---|
| casillas etiquetadas como vacías | **440** |
| reconocidas como vacías | **299** (68,0 %) |
| abstenidas | 139 |
| **inventadas** (objeto donde no hay) | **2 — 0,5 %** |

Un detector que acierta todo lo que hay pero inventa objetos donde no hay nada
no sirve para jugar. Por eso esta tabla existe y no se resume en «precisión».

### Por clase

| clase | etiquetados | aciertos | equiv | absten | precisión | exhaustividad |
|---|---|---|---|---|---|---|
| crystal | 27 | 20 | 0 | 6 | 90,9 % | 74,1 % |
| chest_wood | 26 | 0 | 0 | 24 | — | 0 % |
| portal | 12 | 11 | 0 | 1 | 100 % | 91,7 % |
| enemy_1 | 9 | 4 | 0 | 5 | 100 % | 44,4 % |
| magma_rock | 9 | 9 | 0 | 0 | 100 % | 100 % |
| geyser | 7 | 6 | 0 | 1 | 100 % | 85,7 % |
| switch | 6 | 6 | 0 | 0 | 100 % | 100 % |
| enemy_2 | 5 | 3 | 0 | 2 | 100 % | 60,0 % |
| chest_iron | 4 | 0 | 4 | 0 | 0 % | 0 % |
| dynamite | 4 | 0 | 0 | 4 | — | 0 % |
| gem | 4 | 4 | 0 | 0 | 100 % | 100 % |
| detonator | 2 | 0 | 1 | 1 | — | 0 % |
| mirror_backslash | 1 | 0 | 0 | 1 | — | 0 % |

Leído sin adornos: **seis clases por encima del 85 % de exhaustividad**
(magma_rock, switch, gem, portal, geyser, crystal), y cuatro clases que el
sistema prácticamente no sabe leer: cofres, dinamita, detonador y espejos.

### Confusiones

```
chest_iron > chest_wood    4
(nada)     > crystal       2
```

Las 4 confusiones de cofre **no son un fallo del clasificador**: son la prueba
de que el arte no separa `chest_iron` de `chest_wood`. Ver §5.

---

## 5. Clases que el arte no separa

`chest_wood` y `chest_iron` salen del juego con el **mismo dibujo**: caja
castaña, cerradura dorada, mismas proporciones, mismo tamaño.

Medido sobre las 30 muestras del corpus:

| | chest_wood (26) | chest_iron (4) |
|---|---|---|
| tono mediano | 28–31 | 29–31 |
| dorado | 0,05–0,21 | 0,18–0,19 |
| gris (refuerzos) | 0,00 | 0,00 |
| área | 0,20–0,65 | 0,20–0,35 |

No hay ningún rasgo que los separe. **Esto no se arregla con más datos**: o el
juego dibuja el cofre de hierro distinto y no está en estas 13 capturas, o no se
distingue a esta resolución.

Decisión: `CLASSES_UNSEPARABLE` declara el par, y cuando el modelo duda sólo
entre ellos devuelve `needs_review` con las dos alternativas. Un `chest_wood`
afirmado con seguridad sería una moneda al aire presentada como dato.

**Es una decisión reversible**: si aparece una captura donde se distingan, se
quita el par de la lista y el modelo los separa solo.

El resto de clases sin aciertos (dynamite, detonator, mirror) no son confusas:
son **poco representadas** (1–4 muestras) y el modelo prefiere callarse.

---

## 6. Lo que este informe NO dice

- **No dice que el detector lea capturas del juego en general.** Son 13 capturas
  de un tutorial, un solo estilo de arte, una sola resolución. Un tema nuevo
  (otro color de suelo, otro dibujo de cofre) no está representado.
- **No mide la rejilla.** `estimateRealGrid` sigue sin ser fiable: acierta el
  paso pero cuenta mal (p01 7×6 en vez de 7×7, p09 y p13 devuelven `null`). En
  este informe la rejilla se da hecha a propósito, para que un fallo de rejilla
  no se disfrace de fallo de clasificación.
- **No mide bandeja, temporizadores ni cables.** El módulo devuelve `null` en
  esos campos en vez de inventar. La bandeja de bombas de las capturas se leyó a
  mano (está en los JSON) pero no hay lector automático.
- **La abstención no es un fallo.** Es el sistema diciendo que no lo sabe. Se
  cuenta aparte y nunca se suma a los aciertos. Un cambio que suba el acierto
  bajando la abstención sin subir la precisión es un empeoramiento.

---

## 7. Cómo reproducirlo

```bash
cd boomsolver

# Panel en la interfaz: botón «Calcular validación» en la sección
# «Validación real de la visión» (necesita `node scripts/serve.mjs`).
node scripts/serve.mjs   # http://localhost:5173

# Informe completo (texto)
node scripts/cli.mjs vision --real=./corpus/real

# Lo mismo en JSON, para trazabilidad
node scripts/cli.mjs vision --real=./corpus/real --json > vision.json

# Pruebas del módulo real (20) + suite completa (233)
node --test tests/vision.real.test.mjs
node --test "tests/*.test.mjs"
```

El informe imprime, además del agregado, **la tabla por pliegue** con qué
capturas entrenaron qué modelo. Cualquiera puede comprobar que ninguna captura
se evalúa con un modelo que la haya visto.

---

## 8. Qué haría falta para subir estas cifras

Por orden de impacto medido, no de facilidad:

1. **Más capturas de las clases flojas** (dynamite, detonator, mirror, enemy_2).
   Con 1–4 muestras el modelo no tiene con qué construir un prototipo estable;
   la abstención es la respuesta correcta.
2. **Capturas de otro tema visual** para saber si el método generaliza o si está
   ajustado al verde/beige de este tutorial. Es la pregunta abierta más
   importante y la que este corpus NO puede contestar.
3. **Un lector de bandeja** (franja inferior con los slots de bombas). Es un
   problema más fácil que el tablero —cuatro ranuras fijas— y hoy no existe.
4. **Resolver la rejilla**: con la fase de casilla calibrada por página, el paso
   ya se mide bien. Lo que falla es el recuento de filas y columnas.
5. **Cofres**: sólo si aparece arte que los distinga. Más datos de los mismos
   cofres no cambiará nada.
