# Arquitectura

Umbral es una aplicación Next.js (App Router, runtime Node) con cuatro capas
independientes. Ninguna capa superior necesita que las demás funcionen: la
plataforma analiza texto con **cero claves externas**.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Interfaz (React 19, componentes cliente)                            │
│  editor · configuración de motores · progreso SSE · dashboard        │
└───────────────┬──────────────────────────────────────────────────────┘
                │ POST /api/analyze  ·  POST /api/analyze/stream (SSE)
┌───────────────▼──────────────────────────────────────────────────────┐
│  Orquestador (src/lib/orchestrator.ts)                               │
│  validación · contexto · concurrencia · timeouts · estados · dedupe   │
└───┬───────────────────────┬─────────────────────┬────────────────────┘
    │                       │                     │
┌───▼───────────────┐ ┌─────▼──────────────┐ ┌────▼─────────────────────┐
│ CAPA A            │ │ CAPA B             │ │ CAPA C                   │
│ Analizadores      │ │ Clasificador       │ │ Adaptadores comerciales  │
│ propios (15)      │ │ entrenado (1)      │ │ Sapling · GPTZero · mock │
│ estadística +     │ │ regresión          │ │ server-side, consentim.,  │
│ lingüística       │ │ logística sobre 22 │ │ cuotas y presupuesto      │
│                   │ │ características    │ │                          │
└───┬───────────────┘ └─────┬──────────────┘ └────┬─────────────────────┘
    └───────────────────────┴─────────────────────┘
                            │ EngineRun[] (estado independiente por motor)
┌───────────────────────────▼──────────────────────────────────────────┐
│  Agregador (src/lib/aggregator)                                      │
│  grupos de dependencia · un grupo = un voto · índice 0-100 heurístico│
│  evidencia · dispersión · desacuerdos · probabilidad: null por diseño │
└───────────────────────────┬──────────────────────────────────────────┘
                            │ AnalysisResponse
┌───────────────────────────▼──────────────────────────────────────────┐
│  Módulo editorial independiente (src/lib/editorial.ts)               │
└──────────────────────────────────────────────────────────────────────┘
```

## Capa A — Analizadores propios

Quince unidades que ejecutan cálculos deterministas en CPU sobre el texto, sin red:

| Familia | Motores |
| --- | --- |
| Información y previsibilidad | `entropy.lexical`, `predictability.perplexity`, `compression.complexity` |
| Repetición y estructura | `repetition.ngram`, `rhythm.burstiness`, `structure.regularity`, `redundancy.similarity` |
| Estilometría | `diversity.lexical`, `richness.yule`, `stylometry.functionwords`, `morphosyntax.profile` |
| Superficie lingüística | `discourse.connectors`, `syntax.complexity`, `orthography.punctuation`, `readability.indices` |

Cada motor implementa el contrato `Engine` (ver `src/lib/types.ts`):

```ts
interface Engine {
  meta: EngineMeta;   // id, naturaleza, familia, metodología, fórmulas, límites,
                      // idiomas, mínimo de palabras, validación, anclas, versión
  run(ctx: EngineContext): EngineOutput;  // métricas + señal + evidencia + notas
}
```

`EngineOutput.signal ∈ [0,1] | null` solo existe cuando el motor declara una
**dirección interpretativa documentada** (`directionality: "directional"`) y su
texto supera el mínimo. Doce de los quince no emiten señal y no votan: aportan
diagnóstico y calidad de evidencia.

`/api/engines` publica el catálogo completo con metodología, fórmulas y límites;
`docs/ENGINES.md` se genera automáticamente desde ese endpoint
(`scripts/gen-engine-docs.py`) para que la documentación no se desincronice.

## Capa B — Clasificador entrenado

- Vector compartido de 22 características (`src/lib/ml/features.ts` y `ml/features.py`).
- Tokenizador **portable y explícito** (regex Unicode), distinto del `Intl.Segmenter`
  de los analizadores, para que entrenamiento e inferencia coincidan bit a bit.
  `tests/feature-parity.test.ts` compara ambos lenguajes con tolerancia 1e-9.
- Artefacto JSON (`ml/artifacts/model.json`) con coeficientes, escalado y metadatos.
  Si no existe, el motor responde `unavailable` y el agregador lo ignora.
- El pipeline (`ml/train.py`) se niega a exportar con evidencia insuficiente.

## Capa C — Adaptadores comerciales

Interfaz única (`src/lib/adapters/types.ts`):

```ts
interface CommercialAdapter {
  id; endpoint; auth; envKey; apiAvailability; pricing; maxChars;
  languages; sentenceScores; tokenScores; supportsZeroRetention;
  isConfigured(): boolean;
  detect(text, options): Promise<NormalizedDetection>;
}
```

`NormalizedDetection` normaliza `score`, `aiFraction`, `verdict`, `sentences[]`,
`tokenProbs`, versión del detector, idioma detectado, `lowConfidence` y política
de retención. Los errores se clasifican (`unauthorized`, `rate_limited`, `timeout`,
`malformed_response`, `network`, `server`) y **nunca** interrumpen a los demás motores.

Cada petición externa exige, de forma acumulativa:

1. `UMBRAL_ENABLE_EXTERNAL=true` en el servidor;
2. clave presente en el entorno;
3. consentimiento explícito del usuario para *ese* proveedor;
4. presupuesto de caracteres disponible (`*_CHAR_BUDGET > 0`);
5. proveedor no detenido por cuota agotada.

## Capa D — Agregador

### Regla central: un grupo de dependencia = un voto

Los motores declaran su grupo en `meta.dependenceCluster`. Los que miden la misma
variable subyacente comparten un único voto: añadir tres variantes del mismo
cálculo no triplica su influencia. La relación entre grupos se documenta en
`meta.sharesVarianceWith` y se publica en `/api/engines`.

Ver la tabla completa de grupos en `docs/METHODS.md` §2. Resumen: información
(entropía, previsibilidad, compresión), riqueza léxica (diversidad, Yule),
repetición de secuencias (n-gramas, redundancia), ritmo oracional (burstiness,
estructura, sintaxis, legibilidad), perfil de funcionales (estilometría,
morfosintaxis), marcadores discursivos, ortografía, clasificador y un grupo por
proveedor comercial.

```
s_motor        = señal declarada por el motor (intensidad 0-1)
wᵢ            = peso_validación(metaᵢ) × peso_evidencia(runᵢ)
s_grupo       = Σ(wᵢ · sᵢ) / Σ(wᵢ)
W_grupo       = peso_tipo(mejor tipo) × peso_validación(mejor validación) × evidencia media
índice        = 100 · Σ(W_g · s_g) / Σ(W_g)      si hay ≥ 2 grupos y ≥ 80 palabras
```

| Tipo de método | Peso base | Motivo |
| --- | --- | --- |
| Comercial | 1,00 | Señal supervisada de un tercero, independiente de nuestros cálculos |
| Clasificador entrenado | 0,90 | Supervisado, pero solo si declara métricas fuera de muestra |
| Académico | 0,80 | Método publicado con evaluación externa |
| Estadístico | 0,70 | Medición directa de una propiedad del texto |
| Lingüístico | 0,35 | Dependiente de género textual y de listas cerradas |

Pesos de validación: externa 1,00 · interna 0,90 · declarada por proveedor 0,75 ·
sin evaluar 0,55 · heurística 0,30 · descriptiva 0,20.
Pesos de evidencia: alta 1,00 · media 0,80 · baja 0,50 · insuficiente 0,20.

Con la configuración por defecto todos los grupos que votan tienen el mismo peso,
así que el índice coincide con la media de las señales de grupo. La ponderación
solo discrimina cuando participa un motor mejor validado.

### Índice, dispersión y banda

- `índice ∈ [0,100]` es un **compuesto heurístico** (`indexKind:
  "heuristic-composite"`, `calibrated: false`). **No es probabilidad de autoría.**
- `signalIndex = null` y banda `no calculable` cuando hay menos de dos grupos con
  señal o el texto tiene menos de 80 palabras. No se sustituye por 0.
- `signalRange = [100·mín(s_g), 100·máx(s_g)]` (solo con ≥ 2 grupos): dispersión
  observada, **no** intervalo de confianza. Antes, con una sola familia, se
  inventaba un margen de ±20; ya no se hace.
- Bandas: < 35 baja · 35–64 media · ≥ 65 alta, publicadas en
  `aggregate.bandThresholds` como cortes de presentación sin base empírica.

### Acuerdo: no se calcula

`agreement.score` es `null` y `label` es `"no calculable"`. Ningún motor emite una
decisión binaria validada y no existe verdad de referencia, de modo que kappa o
alpha no están definidos. La versión anterior publicaba `1 − diferencia media`
como «acuerdo», una cifra alta por construcción que sugería consenso inexistente.

En su lugar se publica `dispersion` (desviación típica ponderada entre grupos),
descriptiva y explícitamente ajena al acierto.

### Desacuerdos

Se listan cuando dos grupos difieren ≥ 0,30 en intensidad, o cuando hay motores a
ambos lados de 0,65 / 0,35. Nunca se ocultan para «mejorar» el resultado, y no se
resuelven por mayoría: miden fenómenos distintos.

### Probabilidad: deshabilitada por diseño

`aggregate.probability` es siempre `null` y el mensaje explica por qué:

> No existe una probabilidad conjunta calibrada para estas condiciones.

Habilitarla exigiría un agregador entrenado con datos etiquetados, separación por
autor/idioma/género, calibración verificada y evaluación fuera de muestra. No se
ofrece una alternativa inventada. Ver `docs/METHODS.md` para la ruta de calibración.

### Nivel de evidencia

`evidence.level` describe **cobertura metodológica**, no acierto
(`evidence.definition` va en la respuesta). Se degrada por: menos de 3 grupos,
texto corto (< 80 palabras → máximo «baja»; < 200 → máximo «media»), idioma no
identificado y ausencia de grupos con validación declarada. Como ningún motor
propio tiene calibración publicada, en la práctica siempre se aplica el último
límite y la evidencia se muestra como «baja».

## Orquestador

- `Promise` + pool de concurrencia (`UMBRAL_CONCURRENCY`, por defecto 4).
- Timeout individual por motor (`UMBRAL_ENGINE_TIMEOUT_MS`, 8 s) y por proveedor (12 s).
- Estados independientes: `ok`, `error`, `timeout`, `unavailable`, `skipped`.
- Deduplicación de peticiones idénticas simultáneas por hash SHA-256 **interno**.
  La respuesta ya no expone ese hash: el identificador es un UUID aleatorio.
- Compatibilidad de idioma verificada antes de ejecutar cada motor.
- Eventos SSE por motor para que la interfaz muestre **progreso real**, no simulado.

## Conectividad: tres modos

| Modo | Qué funciona | Qué se muestra |
| --- | --- | --- |
| **Preview local (por defecto)** | Capa A completa, agregador, editorial | Proveedores como «no configurados», ML como «dataset-required» |
| **Producción** | Todo lo anterior + adaptadores server-side | Claves solo en variables de entorno; consentimiento por proveedor |
| **Simulación** (`UMBRAL_ALLOW_MOCK=true`) | Interfaz y estados | Resultados con `simulated: true`, badge visible, excluidos del agregador |

## Seguridad y privacidad

- Sin base de datos: el texto se procesa en memoria y no se persiste.
- Rate limiting en memoria por IP y por instancia (`UMBRAL_RATE_LIMIT_PER_MIN`).
- Validación de entrada con Zod y límite `UMBRAL_MAX_INPUT_CHARS`.
- Cabeceras: CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `Cross-Origin-Opener-Policy`.
- Las claves nunca llegan al cliente: `/api/providers` publica estado, nunca valores.
- `create_report` de Sapling nunca se envía (guardaría el texto en el proveedor).
- Un proveedor que devuelve 429 queda detenido en memoria hasta reinicio.

## Limitaciones conocidas

1. El rate limiting y la contabilidad de cuotas son **por instancia**: en Vercel
   cada lambda tiene memoria propia. Para producción real hace falta un almacén
   distribuido.
2. No hay pruebas en navegador real en el sandbox (sin Chromium): los E2E están
   preparados en `e2e/` con su workflow de GitHub Actions.
3. El etiquetado morfosintáctico es heurístico.
4. Los detectores comerciales no se han podido invocar de verdad: solo se prueban
   con mocks y contratos documentados.
5. La calibración de las anclas de señal es inicial y no validada.

## Añadir un motor nuevo

1. Crear `src/lib/engines/<id>.ts` exportando `Engine` con `meta` completo
   (metodología, variables, fórmulas, límites, idiomas, mínimo, validación).
2. Registrarlo en `src/lib/engines/registry.ts`.
3. Añadir pruebas en `tests/engines.test.ts` (métricas finitas, señal en rango,
   comportamiento con texto corto).
4. Regenerar `docs/ENGINES.md` con `python3 scripts/gen-engine-docs.py`.
5. Si emite señal, justificar la dirección y las anclas con su procedencia.

## Añadir un proveedor comercial

1. Implementar `CommercialAdapter` en `src/lib/adapters/<id>.ts` con `parse*`
   exportado para pruebas de contrato.
2. Añadirlo a `src/lib/adapters/index.ts` y a `COST_PER_1K_CHARS` en `quota.ts`.
3. Añadir pruebas de contrato y de error (401, 429, timeout, JSON roto).
4. Documentarlo en `RESEARCH.md` con la marca de procedencia correspondiente.
5. No activarlo por defecto; sin presupuesto (`*_CHAR_BUDGET=0`) no envía nada.
