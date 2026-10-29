# PRUEBAS · ELIGE TU PROBLEMA

Registro de lo que se ha probado, cómo y con qué resultado. Se distingue entre **probado automáticamente**, **revisado estáticamente** y **no verificado**.

- **Fecha de ejecución:** 29 de octubre de 2026
- **Entorno:** Node.js 22.22.3 + jsdom 30.1.3 (DOM simulado). Sin navegador gráfico disponible: la descarga de Chromium quedó bloqueada por la red del entorno.
- **Archivo probado:** `index.html` (181 KB, 3.427 líneas, sin dependencias de ejecución).
- **Comando:** `cd tests && npm install && npm test`
- **Resultado global:** ✅ **7 de 7 suites superadas** (≈54 s).

---

## 1. Suites automatizadas

| Suite | Qué se comprobó | Resultado |
|---|---|---|
| `content.test.cjs` | 66 dilemas, ids únicos `dNN`, 10 categorías (6–7 dilemas cada una), tres niveles de absurdo (12/32/22), 132 opciones y 132 consecuencias con textos diferentes, deltas numéricos válidos de −20 a 20 en atributos existentes, 10 finales distintos con 3 frases cada uno, sin vocabulario problemático, cero scripts/recursos remotos, `lang="es"`, viewport y un único `h1`. | ✅ |
| `flow.test.cjs` | Inicio (3 modalidades), partida normal de 10 dilemas sin repeticiones, render de dos opciones y seis atributos, elección A con consecuencia correcta y atributos recalculados, avance a otro dilema, **protección de triple clic** (una sola decisión, un solo avance), final de partida con resultado válido, colección (10 tarjetas, 1 desbloqueada), segunda partida que conserva estadísticas, partida larga de 20 dilemas, salir/continuar, teclado A/B/1/2 y atajo Enter para continuar. Consola sin errores. | ✅ |
| `endings.test.cjs` | Mismo conjunto de decisiones → mismo final (determinismo). Cambiar una decisión altera el final en 45 de 200 muestras. 2.000 simulaciones de partidas de 5/10/20 dilemas: **los 10 finales son alcanzables** (mínimo 70, máximo 391; ratio 5,6). Elección sistemática A frente a B produce finales distintos. | ✅ |
| `daily.test.cjs` | La secuencia del reto del día no depende del historial (dos perfiles distintos, misma fecha → misma secuencia de 10 dilemas). Fecha distinta → secuencia distinta. Al completarlo se guarda `daily.lastKey` con fecha local, sube el contador de retos y el inicio muestra «Completado hoy». Se puede repetir el mismo día. | ✅ |
| `robustness.test.cjs` | `localStorage` bloqueado: se puede jugar y terminar, aviso honesto visible, estadísticas en memoria. JSON corrupto: se descarta sin romper. Estado con tipos inválidos, finales inventados, fechas imposibles y partida irrecuperable: saneado. Estado parcialmente válido: conserva lo bueno y descarta la partida rota. Guardar a mitad y retomar en una recarga: conserva decisiones, restaura la consecuencia pendiente y no duplica respuestas. Resultado persistente sin volver a contar la partida. Reinicio con confirmación (cancelar no borra; confirmar vacía todo). Compartir/copiar/descargar sin soporte: mensajes honestos, sin excepciones. Navegación por las cinco páginas, hash, `aria-current`, hash desconocido y `#resultado` sin resultado. Descartar partida no infla las estadísticas. | ✅ |
| `audit.test.cjs` | Ids HTML únicos; todas las `data-action` y `data-go` apuntan a acciones reales; todos los botones tienen nombre accesible; enlaces internos válidos y externos en HTTPS; **cero formularios y campos de entrada**; ningún script publicitario cargado, ningún `ins.adsbygoogle`, tres espacios publicitarios identificados y declarados inactivos, `ads.enabled = false` y `client` vacío; el pie y la política declaran que no hay anuncios; la privacidad explica `localStorage` y la clave `etp:v1`; el contacto no contiene correos inventados; adaptación móvil (720 px) y tablet (1180 px), `prefers-reduced-motion`, áreas táctiles de 52 px, foco visible, enlace de salto y `aria-live`; sin CDN, fuentes externas ni frameworks; 181 KB. | ✅ |
| `sharecard.test.cjs` | La tarjeta PNG se dibuja con 50 operaciones de contexto 2D simulado (marca, resultado, frase, estadísticas, atributos y dirección). Descarga confirmada solo cuando el blob se genera. Compartir con archivo PNG, compartir solo texto, y copia al portapapeles verificadas con mensajes de éxito únicamente al resolverse la operación. | ✅ |

### Salida resumida de las suites

```
▶ content   ✅ 66 dilemas · 10 finales · 10 categorías · sin incidencias
▶ flow      ✅ flujo completo, doble clic y teclado
▶ endings   ✅ 10/10 finales alcanzables · ratio 5,6
▶ daily     ✅ secuencia determinista e independiente del historial
▶ robustness ✅ almacenamiento roto, datos corruptos, reinicio y compartir
▶ audit     ✅ accesibilidad, publicidad inactiva y sin dependencias
▶ sharecard ✅ tarjeta y compartición honesta
✓ Todas las suites pasaron (7)
```

---

## 2. Revisiones estáticas adicionales

- `node --check` sobre el bloque `<script>` extraído: **sintaxis válida**.
- `html-validate` 11.17 sobre el documento: sin errores estructurales ni atributos duplicados. Solo queda una recomendación estilística deliberada: la barra de progreso usa `role="progressbar"` en lugar del elemento nativo `<progress>`, para poder estilizarla igual en todos los navegadores.
- `validateContent()` en el arranque: **0 problemas** (ids, categorías, absurdo, consecuencias, atributos, finales, categorías sin contenido).
- 396 textos (opciones, titulares y consecuencias) revisados: sin repeticiones, sin dobles espacios, sin comillas desbalanceadas, con puntuación final.
- Sin desplazamiento horizontal declarado (`overflow-x: hidden`) ni elementos con posición fija que tapen el contenido.
- Los espacios publicitarios son bloques del flujo normal (nunca `position: fixed`), separados de las tarjetas de elección.
- Sin secretos, tokens, correos inventados ni identificadores de editor ficticios.

---

## 3. Errores encontrados y corregidos durante el desarrollo

| # | Error | Corrección |
|---|---|---|
| 1 | Cuatro opciones usaban claves de atributo inexistentes (`irony`, `strength`, `chance`, `harm`) que se habrían ignorado en silencio. | Eliminadas y detectadas por el validador de contenido. |
| 2 | Erratas de texto («Llegasz», «Tando», precios ambiguos «1», «5 euros», «céntimos»). | Reescritas con moneda neutra y ortografía corregida. |
| 3 | Reparto de finales desequilibrado: con el primer modelo, «Genio de las malas decisiones» acaparaba el 40 % de las partidas; al centrar por la media de la partida, «Víctima de la burocracia cósmica» pasó al 62 %. | Cálculo por **desviación respecto a la línea base de cada dilema** + similitud de coseno + bonus relativo de categorías. Resultado: 10/10 finales alcanzables y ratio 5,6. |
| 4 | El contexto 2D del canvas podía lanzar una excepción en navegadores sin soporte. | `getContext` protegido y salida con mensaje honesto. |
| 5 | Un estado guardado con `idx` incoherente podía dejar la partida bloqueada. | Saneado: `idx` limitado a las respuestas y partida completada solo si hay todas las respuestas y un final válido. |
| 6 | Riesgo de perder la partida al cambiar de pantalla o recargar. | Guardado en cada decisión + restauración de la consecuencia pendiente al retomar. |
| 7 | Comillas desbalanceadas en una consecuencia del dilema `d30`. | Texto reescrito. |
| 8 | La navegación móvil usaba desplazamiento horizontal interno (elementos ocultos). | Ahora los enlaces se ajustan en varias filas dentro del ancho de pantalla. |
| 9 | Un aviso de «fecha de compilación» cambiaba en cada visita. | Fecha de política configurable (`CONFIG.policyUpdated`). |

---

## 4. Pruebas manuales realizadas

| Comprobación | Estado |
|---|---|
| Abrir `index.html` directamente (sin servidor) y jugar | ✅ Verificado en DOM simulado; apertura directa con `file://` no se pudo probar en un navegador real |
| Jugar las tres modalidades completas y llegar al resultado | ✅ Automatizado |
| Recargar a mitad de partida y retomarla | ✅ Automatizado (nueva carga del documento con los datos guardados) |
| Compartir, copiar y descargar la tarjeta | ⚠️ Lógica verificada; imagen PNG real **no verificada visualmente** |
| Revisar consola sin errores | ✅ En las 7 suites |
| Sin botones sin funcionalidad | ✅ Auditoría de acciones |
| Espacios publicitarios sin anuncios ni solapamientos de posición fija | ✅ Auditoría estática |
| Diseño en móvil y escritorio (aspecto visual real) | ⚠️ **No verificado**: no hay navegador gráfico en el entorno |
| Ausencia de desplazamiento horizontal real | ⚠️ Reglas CSS revisadas; no medido con motor de maquetación |
| Publicación en Netlify | ❌ **No realizada**: no hay credenciales/sesión de Netlify en el entorno |

---

## 5. Pendiente de verificar antes de lanzar

1. **Aspecto visual** en Chrome, Firefox y Safari reales, a 360 px, 768 px, 1280 px y 1920 px.
2. **Tarjeta PNG**: comprobar que el texto no se corta con finales largos y que los emojis se dibujan correctamente.
3. **Compartición nativa** en iOS Safari, Android Chrome y escritorio.
4. **Rendimiento** en un móvil de gama baja (el archivo es de 184 KB; no hay recursos externos).
5. **Despliegue en Netlify** y comprobación de la URL pública, rutas y cabeceras.
6. **Revisión de AdSense** cuando exista cuenta y dominio; antes, completar datos legales y consentimiento si corresponde.
