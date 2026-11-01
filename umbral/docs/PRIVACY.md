# Privacidad y seguridad

## Flujo de datos

| Etapa | Dónde ocurre | Persistencia |
| --- | --- | --- |
| Escritura del texto | Navegador (estado React) | Solo en memoria de la pestaña |
| Envío al servidor | `POST /api/analyze` o `/api/analyze/stream` (mismo origen) | No |
| Analizadores propios | Proceso Node del servidor | No |
| Agregador y editorial | Proceso Node del servidor | No |
| Proveedores externos | Solo con consentimiento explícito por proveedor | Según política del proveedor |
| Resultado | Devolución al navegador | Descarga manual en JSON si el usuario la pide |

**No hay base de datos, ni historial, ni cookies de análisis, ni telemetría propia.**
Los contadores de cuota viven en memoria del proceso y se pierden al reiniciar.

## Consentimiento para proveedores externos

Antes de que un texto salga del servidor deben cumplirse **cinco** condiciones:

1. `UMBRAL_ENABLE_EXTERNAL=true` (decisión del operador);
2. clave del proveedor presente en el entorno del servidor;
3. el usuario marcó «Autorizar el envío del texto a *proveedor*»;
4. `*_CHAR_BUDGET` > 0 y presupuesto restante suficiente;
5. proveedor no detenido por cuota agotada.

La interfaz nunca muestra ni recibe la clave. `/api/providers` devuelve `configured`
como booleano, jamás el valor.

## Retención

| Proveedor | Retención solicitada |
| --- | --- |
| Sapling | `zero_retention: true` por defecto (configurable con `SAPLING_ZERO_RETENTION=false`) |
| GPTZero | No se documenta retención cero: se declara «política del proveedor» |
| Simulación | No sale del servidor |

El campo `privacy.externalProvidersContacted` de cada informe indica qué proveedores
recibieron el texto en esa petición concreta.

## Lo que nunca se envía

- `create_report=true` de Sapling (guardaría el texto para generar un informe
  compartible). El adaptador no incluye ese parámetro bajo ninguna configuración.
- Claves en el cliente, en logs, en el informe exportado o en la documentación.
- Texto a proveedores sin consentimiento, aunque la clave esté configurada.

## Controles técnicos

- Validación de entrada con Zod y límite de caracteres (`UMBRAL_MAX_INPUT_CHARS`).
- **Límite de tamaño del cuerpo** (`UMBRAL_MAX_BODY_BYTES`, 1,5 MB por defecto):
  se comprueba `Content-Length` y se corta la lectura por trozos, de modo que un
  cuerpo gigante no se carga en memoria antes de que Zod lo rechace (413).
- Rate limiting por cliente (`UMBRAL_RATE_LIMIT_PER_MIN`) y deduplicación de
  peticiones idénticas simultáneas.
- Timeouts por motor y por proveedor; un fallo externo no cancela el análisis local.
- Cabeceras de seguridad en todas las rutas: CSP, `nosniff`, `SAMEORIGIN`,
  `Referrer-Policy`, `Permissions-Policy`, `COOP`.
- Errores del servidor registrados en consola **sin incluir el texto** analizado.
- El cuerpo de error de un proveedor se depura antes de publicarse: si la clave
  aparece en el texto devuelto, se sustituye por `[clave-oculta]`.
- La respuesta de un proveedor **no** se devuelve en crudo al navegador: solo se
  publican los campos normalizados (puntuación, veredicto, número de oraciones
  puntuadas). Antes se incluía el payload completo, que podía contener el texto,
  las oraciones y miles de probabilidades por token.
- La respuesta no incluye ninguna huella derivada del texto. Antes se publicaba un
  prefijo del SHA-256 del documento (`text.hash`), que permitía comprobar si dos
  envíos contenían el mismo texto; ahora el identificador de la petición es un
  UUID aleatorio.

## Limitaciones que el operador debe conocer

**Rate limiting en memoria.** Los cubos viven en el proceso. En un despliegue
serverless con varias instancias (o en Vercel con varias funciones), cada
instancia lleva su propia cuenta: el límite real es `n_instancias × límite` y se
reinicia en cada arranque en frío. **No es una protección global garantizada.**
Para producción con tráfico real hace falta un almacén distribuido (p. ej. Vercel
KV o Upstash) o el rate limiting del propio CDN.

**Identificación del cliente.** El cubo se elige por `x-real-ip` y, si no existe,
por la **última** entrada de `x-forwarded-for` (la que añade el proxy más cercano).
La versión anterior usaba la primera entrada, que la escribe el cliente: bastaba
enviar un valor distinto en cada petición para saltarse el límite. Aun así, esto
solo es fiable detrás de un proxy que reescriba esas cabeceras; sin proxy, todos
los clientes comparten el cubo «local».

**Caché de peticiones.** El orquestador reutiliza durante 15 segundos el resultado
de una petición idéntica en curso (mismo texto, idioma, motores y consentimiento).
Es deduplicación en memoria para evitar trabajo repetido; no crea historial ni
registro persistente.

**Simulación.** El proveedor `commercial.mock` se activa solo con
`UMBRAL_ALLOW_MOCK=true`, exige consentimiento explícito por petición, marca todos
sus resultados con `simulated: true` y el agregador los descarta. Nunca participa
en un resultado real.

## Buenas prácticas de despliegue

1. Definir claves únicamente en el panel de variables de entorno del proveedor de
   hosting (Vercel), nunca en el repositorio.
2. Rotar cualquier clave que haya aparecido en un log o captura.
3. Mantener `UMBRAL_ENABLE_EXTERNAL=false` hasta tener presupuesto y consentimiento
   revisados.
4. Añadir almacenamiento distribuido para cuotas y rate limiting antes de abrir el
   servicio al público: la memoria por instancia no es una garantía global.
5. Configurar retención de logs del hosting acorde con la política declarada.

## Derechos y eliminación

Como no se almacena texto, no hay datos que eliminar en el servidor. El usuario
puede borrar el contenido del editor en cualquier momento y descargar el informe
solo si lo solicita explícitamente.

Los proveedores externos aplican sus propias políticas; consúltalas antes de
autorizar un envío:

- Sapling: https://sapling.ai/docs/api/detector/#data-retention
- GPTZero: https://gptzero.me/terms-of-use.html
