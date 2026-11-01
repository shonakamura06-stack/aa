# Umbral · Análisis multimodelo de texto

Plataforma web que estudia **características del texto** con metodologías
independientes y las agrega por familias. Prioridad al español, presupuesto 0 y
arquitectura híbrida: funciona al 100 % sin ninguna API comercial.

> **Principio científico.** Una puntuación alta de previsibilidad no demuestra
> autoría por inteligencia artificial; una baja tampoco demuestra autoría humana.
> Umbral describe señales del texto y no conoce con certeza quién lo escribió.

---

## Estado real de esta versión (comprobado, no prometido)

| Elemento | Estado | Verificación |
| --- | --- | --- |
| 15 analizadores propios (estadística + lingüística) | ✅ Funcionando | 15/15 en estado `ok` en cada análisis; 185 pruebas automatizadas |
| Orquestador con concurrencia, timeouts y estados por motor | ✅ Funcionando | prueba de timeout real de 900 ms |
| Agregador por grupos de dependencia (un grupo = un voto) | ✅ Funcionando | 12 pruebas de no duplicación de peso, exclusión de simulados y null explícito |
| Análisis por oración (solo de motores que lo aportan) | ✅ Funcionando | percentil de previsibilidad por oración |
| Módulo editorial independiente | ✅ Funcionando | 9 reglas en 7 categorías, sin prometer evasión |
| Interfaz con progreso real por SSE | ✅ Funcionando | eventos `engine` y `complete` probados |
| Clasificador ML | ⚠️ **Deshabilitado** | sin dataset licenciado; motor en `dataset-required` |
| Adaptador Sapling | ⚠️ **Sin ejecutar contra la API real** | contrato y errores probados con mocks (21 pruebas) |
| Adaptador GPTZero | ⚠️ **Sin ejecutar contra la API real** | idem |
| Proveedores externos activos | ❌ Ninguno | `UMBRAL_ENABLE_EXTERNAL=false` por defecto |
| Probabilidad conjunta calibrada | ❌ No existe | se declara explícitamente en la interfaz |
| Pruebas E2E en navegador | ⚠️ Preparadas, no ejecutadas | sin Chromium en el sandbox; workflow incluido |

Nada de lo anterior se presenta como funcionando sin haberlo ejecutado. Lo que no
se pudo probar en este entorno está marcado y explicado.

---

## Arranque

```bash
cd umbral
npm ci            # o npm install
npm run dev       # http://0.0.0.0:3000
```

Producción local:

```bash
npm run build
npm start
```

No requiere variables de entorno para funcionar. Copia `.env.example` a `.env`
solo si vas a configurar proveedores externos.

## Verificación

```bash
npm run typecheck                 # TypeScript estricto
npm test                          # 185 pruebas (matemáticas, motor, agregador, contrato, integración, render, seguridad)
npm run build                     # build de producción
bash scripts/verify.sh            # las tres anteriores en orden
python3 scripts/gen-engine-docs.py  # regenera docs/ENGINES.md desde /api/engines (servidor vivo)
node scripts/evaluate-aggregator.mjs --data etiquetados.jsonl --base http://127.0.0.1:3000
node scripts/make-smoke-corpus.mjs --out /tmp/smoke.jsonl   # corpus SINTÉTICO, solo para probar el pipeline
```

La paridad del vector de características entre TypeScript y Python se comprueba en
cada ejecución de `npm test` con tolerancia `1e-9`.

---

## Cómo funciona

Cuatro capas independientes:

1. **Analizadores propios** — 15 módulos deterministas: entropía, diversidad
   (TTR/MATTR/MTLD/hapax), riqueza estilométrica, repetición de n-gramas,
   burstiness, regularidad estructural, previsibilidad por bigramas
   leave-one-out, complejidad por compresión, redundancia léxica, palabras
   funcionales, conectores, complejidad sintáctica superficial, perfil
   morfosintáctico experimental, puntuación y legibilidad.
2. **Clasificador entrenado** — regresión logística sobre 22 características,
   con pipeline de entrenamiento completo. Apagado hasta tener datos.
3. **Detectores comerciales** — adaptadores server-side (Sapling, GPTZero) con
   consentimiento, presupuesto y cuotas. Simulación aislada para pruebas.
4. **Agregador** — agrupa por dependencia declarada, descuenta duplicados,
   calcula índice heurístico, dispersión, evidencia y desacuerdos.
   **Sin probabilidad inventada y sin «acuerdo» ficticio:** con señales que no
   son decisiones binarias, el acuerdo se publica como `no calculable`.

Detalle completo en [`ARCHITECTURE.md`](./ARCHITECTURE.md); metodología de
agregación en [`docs/METHODS.md`](./docs/METHODS.md); fichas por motor en
[`docs/ENGINES.md`](./docs/ENGINES.md).

## Catálogo (19 unidades de análisis)

| # | Motor | Naturaleza | Vota |
| --- | --- | --- | --- |
| 1 | `entropy.lexical` | Estadístico | sí |
| 2 | `diversity.lexical` | Estadístico | no |
| 3 | `richness.yule` | Estadístico | no |
| 4 | `repetition.ngram` | Estadístico | sí |
| 5 | `rhythm.burstiness` | Estadístico | sí |
| 6 | `structure.regularity` | Estadístico | sí |
| 7 | `predictability.perplexity` | Estadístico | sí |
| 8 | `compression.complexity` | Estadístico | no |
| 9 | `redundancy.similarity` | Estadístico | sí |
| 10 | `stylometry.functionwords` | Estadístico | no |
| 11 | `discourse.connectors` | Lingüístico | no |
| 12 | `syntax.complexity` | Lingüístico (heurístico) | no |
| 13 | `morphosyntax.profile` | Lingüístico (experimental) | no |
| 14 | `orthography.punctuation` | Lingüístico | no |
| 15 | `readability.indices` | Lingüístico (fórmulas publicadas) | no |
| 16 | `ml.stylometric-classifier` | Clasificador entrenado | sí, si hay modelo |
| 17 | `commercial.sapling` | Detector comercial | sí, si se autoriza |
| 18 | `commercial.gptzero` | Detector comercial | sí, si se autoriza |
| 19 | `commercial.mock` | Simulación | nunca |

Los motores no direccionales **no emiten señal**: se usan como diagnóstico y para
calcular la calidad de la evidencia.

## API

| Ruta | Método | Descripción |
| --- | --- | --- |
| `/api/analyze` | POST | Análisis completo (JSON) |
| `/api/analyze/stream` | POST | Progreso real por Server-Sent Events |
| `/api/engines` | GET | Catálogo con metodología, fórmulas, límites y disponibilidad |
| `/api/providers` | GET | Estado de proveedores y contabilidad de cuotas (sin claves) |
| `/api/editorial` | POST | Solo sugerencias editoriales |
| `/api/health` | GET | Estado del entorno (motores, modelo, segmentación) |

Ejemplo:

```bash
curl -s http://127.0.0.1:3000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"text":"Tu texto aquí…","language":"auto"}' | jq '.aggregate'
```

Campos que conviene leer primero:

```json
{
  "signalIndex": 54,
  "indexKind": "heuristic-composite",
  "calibrated": false,
  "authorshipConclusion": null,
  "probability": null,
  "agreement": { "score": null, "label": "no calculable" },
  "dispersion": { "sd": 0.1716, "groups": 3 }
}
```

`signalIndex` es un compuesto heurístico; `null` cuando hay menos de dos grupos
independientes o menos de 80 palabras. `agreement` es siempre `null`: sin
decisiones binarias validadas no existe medida de acuerdo.

Cuerpo aceptado:

```json
{
  "text": "…",
  "language": "auto | es | en",
  "engines": ["entropy.lexical", "repetition.ngram"],
  "allowExternal": false,
  "externalConsent": { "sapling": false },
  "includeEditorial": true
}
```

Los identificadores de `engines` deben existir en `/api/engines`: uno desconocido
devuelve `400 unknown_engines` con la lista, en lugar de un informe vacío que
parecería un análisis correcto.

Códigos de error:

| Código | HTTP | Cuándo |
| --- | --- | --- |
| `payload_too_large` | 413 | el cuerpo supera `UMBRAL_MAX_BODY_BYTES` (se corta la lectura, no se carga entero) |
| `invalid_json` | 400 | el cuerpo no es JSON |
| `invalid_request` | 400 | Zod rechaza el esquema; `issues` detalla cada campo |
| `unknown_engines` | 400 | algún identificador de motor no existe |
| `empty_text` | 400 | el texto queda vacío tras normalizar |
| `rate_limited` | 429 | se supera `UMBRAL_RATE_LIMIT_PER_MIN`; incluye `Retry-After` |
| `internal_error` | 500 | fallo inesperado; el mensaje no incluye el texto |

## Proveedores externos

Desactivados por defecto y en cinco capas: `UMBRAL_ENABLE_EXTERNAL`, clave en el
servidor, consentimiento por proveedor, presupuesto de caracteres y estado de cuota.

```bash
UMBRAL_ENABLE_EXTERNAL=true
SAPLING_API_KEY=…            # 32 caracteres
SAPLING_ZERO_RETENTION=true
SAPLING_CHAR_BUDGET=20000    # 0 = no enviar nada
```

Nunca se envía `create_report` a Sapling (guardaría el texto en el proveedor). El
consumo se registra en memoria y el proveedor se detiene al recibir un 429. La
contabilidad por instancia **no** sustituye al panel del proveedor.

## Privacidad y límites de protección

Sin base de datos, sin historial, sin telemetría. El texto se procesa en memoria y
no se persiste. La respuesta no incluye el texto, ni una huella derivada de él, ni
el payload crudo de los proveedores. Detalle en [`docs/PRIVACY.md`](./docs/PRIVACY.md).

El *rate limiting* vive en memoria del proceso: en serverless con varias
instancias **no es una protección global**, es una salvaguarda por instancia.
Para uso público hace falta un almacén distribuido.

## Despliegue en Vercel

La aplicación está preparada (route handlers Node, sin base de datos, sin estado
obligatorio), pero **no se ha desplegado** en esta sesión:

1. Importar el repositorio y seleccionar el subdirectorio `umbral` como raíz.
2. Configurar variables de entorno (ninguna obligatoria).
3. Tener en cuenta: `/api/analyze` usa `node:zlib` y `node:fs`, por lo que debe
   ejecutarse en runtime Node (ya declarado en cada route handler).
4. Antes de abrir al público: almacén distribuido para rate limiting y cuotas.

## Estructura

```
umbral/
├── src/
│   ├── app/                 # páginas y route handlers (App Router)
│   ├── components/          # UI cliente (editor, progreso, dashboard)
│   └── lib/
│       ├── engines/         # 15 analizadores + ML + comercial
│       ├── adapters/        # Sapling, GPTZero, simulación, cuotas
│       ├── aggregator/      # agregación por familias
│       ├── ml/              # features + carga de artefacto
│       ├── text/            # segmentación, léxicos, estadística
│       ├── orchestrator.ts  # ejecución, timeouts, estados
│       └── editorial.ts     # módulo editorial independiente
├── ml/                      # pipeline Python + léxico compartido
├── tests/                   # 185 pruebas
├── e2e/                     # Playwright (no ejecutado aquí)
├── docs/                    # ENGINES, METHODS, PRIVACY
├── scripts/                 # verificación, generación de docs, evaluación
├── ARCHITECTURE.md · RESEARCH.md · README.md · .env.example
```

## Auditoría

La revisión independiente del código, la metodología estadística y el sistema
multimodelo está en [`AUDIT_REPORT.md`](./AUDIT_REPORT.md): incluye los defectos
encontrados (fórmulas, sesgos, privacidad), las correcciones aplicadas con su
prueba de regresión y lo que sigue pendiente.

## Qué queda pendiente

1. **Calibración real** del agregador con corpus etiquetado y evaluación
   TPR@FPR (ver `docs/METHODS.md` §7).
2. **Clasificador ML**: requiere dataset licenciado con separación por autor.
3. **Pruebas reales de proveedores**: bloqueadas por la red del sandbox; los
   adaptadores están listos y probados con mocks.
4. **Rate limiting distribuido** antes de uso público.
5. **Etiquetado morfosintáctico real** (spaCy `es_core_news_sm`) como módulo
   opcional, sustituyendo la heurística experimental.
6. **Métodos académicos pesados** (Fast-DetectGPT, Binoculars): requieren GPU;
   fichas y clasificación en `RESEARCH.md`.

## Licencia

Pendiente de definir por el titular del proyecto antes de publicarlo. Las
dependencias conservan sus propias licencias; los modelos y servicios externos
mantienen las suyas.
