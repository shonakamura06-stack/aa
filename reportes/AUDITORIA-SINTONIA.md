# Auditoría y seguimiento de Sintonía

## Punto de partida (29 de octubre de 2026)

- Repositorio público `shonakamura06-stack/aa`, rama fija `arena/c6513f6f-aa`. El checkout inicial estaba en `21aa112` con README modificado y HTML/pruebas sin seguimiento; se compararon los 21 archivos de la rama remota con el espacio de trabajo y coincidían byte a byte. Se adelantó el índice y HEAD sin cambiar los archivos al commit remoto `95757b343d4931385da8a729e25b5ab5964feb19`.
- PR #2 abierto, base `main`, combinación indicada por GitHub como CLEAN/MERGEABLE; rama remota divergente de `main`, no se ha fusionado. Los checks que devolvió GitHub son de Vercel, no una suite de juego independiente.
- Producción Vercel `sintonia`, `dpl_4svg2QxV7tpYT3GD5ZwWS7uwvUr5`, READY/PROMOTED, SHA de Git `95757b343d4931385da8a729e25b5ab5964feb19`; URL `https://sintonia-beta.vercel.app`. La versión preview anterior tiene protección SSO. Estos estados no demuestran recorridos interactivos públicos.
- SHA-256 de HTML inicial `3373f2c718c5aa0e12bfb2f2038d9c1a6a466bad16bc23d83f03813c0893939b`. Copias anteriores ya existen en `recuperacion/`.
- No se encontró `AGENTS.md`, manifiesto de dependencias, `reportes/PENDIENTES.md` ni configuración Vercel en el checkout de la rama. El `main` remoto contiene `ponytail/AGENTS.md` y Skills; se leyeron las guías `ponytail`, `ponytail-review` y `ponytail-audit` manualmente. No se ejecutó un plugin.
- Aplicación principal: `index.html` monolítico; PeerJS incluido, almacenamiento local y múltiples adaptadores históricos. No se ha identificado Supabase en la aplicación. No se incorporará un servicio nuevo sin necesidad.
- README registra 58/58 sobre el HTML inicial; no hay un registro independiente persistente de esa ejecución. En esta intervención se ejecutaron 11/11 pruebas estáticas de `tests/regresion.test.cjs`; se preparan las dependencias efímeras y el servidor para repetir las demás. No se interpreta el número como cobertura integral.
- La aplicación documenta Más probable como único juego con recuperación activa de ronda; los demás cancelan la ronda activa. Identidades de navegador no son autenticación fuerte y el guardado no es cifrado. Modo picante figura retirado en el código; su eventual reintroducción requiere decisión de producto, no se asumirá.

## Lista priorizada y criterios

| ID | Prioridad | Evidencia / problema | Hipótesis o causa | Aceptación | Verificación |
|---|---|---|---|---|---|
| REC-01 | P1 | README documenta cancelación de rondas al recargar para diez juegos | Estado de ronda volátil; faltan transacciones por fase | Restaurar solo estados validados, sin duplicar ni divulgar; o conservar cancelación segura y aviso explícito | Recarga durante fases, doble recarga y mensajes antiguos; por juego |
| RED-01 | P1 | Inicio, preparación y conteo distribuidos en adaptadores de sala | Validación y representación pueden divergir | Anfitrión no cuenta; cada mando controla su listo; juego no inicia con datos insuficientes | Sala real emulada con 2, 3 y 4 mandos y pruebas negativas |
| SEG-01 | P1 | Identidad persistente de mando no es autenticación fuerte; secretos y acciones dependen de protocolo | Confiar en identificación del navegador sin garantías criptográficas | Verificar rutas de autorización y contenido filtrado; documentar límites de amenaza | Revisar y probar mensajes ajenos, repetidos y secretos |
| DATA-01 | P1 | Almacenamiento base usa `try/catch` que puede ocultar fallos | Interfaz podría afirmar persistencia sin escritura durable | Detectar error sin destruir datos y avisar cuando corresponda | Inyectar error de Storage y comprobar respuesta |
| HOLD-01 | P2 | Coexisten gestos de pulsación y toque en capas históricas | Eventos duplicados o temporizadores interfieren | Mantener gesto vigente sin liberar prematuramente ni quedar atascado | Entrada real ratón y táctil, cancelación, pérdida de foco |
| UI-01 | P2 | Necesaria inspección visual por cada vista; resultados anteriores no cubren todas | Desbordes o jerarquía inconsistente | Sin contenido crítico cortado; controles visibles con texto largo | Capturas y mediciones de desktop y móvil |
| BAN-01 | P2 | No existe inventario `reportes/PENDIENTES.md` en esta rama | Objetivos confirmados por el usuario: 12.000 global y 1.000 para cinco bancos identificados | Recontar datos y bolsas activas sin inventar objetivos ni añadir contenido de relleno | Inventario reproducible y pruebas de consumo |
| TEST-01 | P2 | 58 casos previos no equivalen a ciclos completos de 11 juegos × 2/3/4 | Cobertura parcial | Identificar explícitamente aprobados, fallos, bloqueos y no ejecutados | Repetir suite y ampliar pruebas críticas |
| DEP-01 | P1 | Navegador anterior no alcanzaba Vercel desde sandbox; producción es pública | Restricción de red de ejecución | No publicar cambios a producción si no se pueden superar las puertas exigidas | Estado Vercel, URL y humo real cuando sea posible |

## Matriz inicial

Estado inicial pendiente de ejecución en esta intervención: los once juegos —Dial, Impostor, Ranking, Precio, Tabú, Personaje, Trivia, Verdad o Reto, Yo Nunca Nunca, Más probable e Historia en cadena— no se consideran aprobados integralmente por el registro anterior. Los ensayos disponibles incluyen flujos parciales con dos y cuatro mandos, pruebas unitarias, importación, recuperación y responsive; no se ha corroborado aquí un recorrido completo con tres mandos.

## Límites y decisiones

- Dial, Tabú, Más probable e Impostor en modo solo permanecen con tarjeta gris pulsable y aviso; no se crean jugadores ficticios.
- El requerimiento de IA para Tabú/Personaje no demuestra que exista un proveedor o una regla; no se conectará un servicio de pago ni se inventará una evaluación/votación.
- El usuario solicita publicación solo tras la puerta estricta de lanzamiento; una publicación anterior no autoriza afirmar que esta intervención cumplió sus criterios.

## Cambios y evidencia de esta intervención

- **DATA-01 corregido y probado focalmente:** un `Storage.setItem/removeItem` fallido ya no confirma guardado; la operación pendiente prevalece sobre el dato antiguo en memoria, se muestra aviso accesible persistente y se puede reintentar. `tests/almacenamiento-seguro.cjs` prueba error de cuota, lectura, reintento con el botón y eliminación fallida. Limitación: la memoria no sobrevive al cierre si persiste el error; no es garantía de durabilidad ni prueba de las otras capas de almacenamiento.
- **RED-02 corregido y probado focalmente:** con PeerServer local y tres navegadores emulados, enviar `seat:999` cambiaba el registro de un jugador a 999. El servidor ahora rechaza asientos no enteros o fuera de la lista; se probaron 999, -1, 1.5 y cadena, sin cambiar el asiento. Tres jugadores se identifican sin añadir al anfitrión, y Dial no arranca sin parejas completas. Esto no demuestra resistencia a ataques por identidad suplantada ni partida completa. El primer ensayo de tres mandos agotó el tiempo porque la prueba pulsaba antes de recibir el asiento; se corrigió la espera de la prueba y después se reprodujo el defecto de rango.
- **UI-02 corregido y probado focalmente:** un marcador de equipo heredado estaba fuera de toda vista y aparecía por encima de la cabecera, desplazando el juego incluso 255 px en móvil. Se conservó su copia en un `template` inerte y se retiraron cierres HTML huérfanos; no se ocultaron los marcadores activos. `tests/marcador-huerfano.cjs` verifica que no existe marcador directo en el body y que el de Precio permanece. Capturas móviles precedentes en `evidencia/*-movil.png` muestran ese estado anterior, no certifican después ni vistas completas.
- **Suite inicial:** `suite-inicial.tap`: 57/58, única caída al iniciar Chromium en CSV con SIGSEGV; no llegó a una aserción funcional. El 58/58 histórico no sustituye esta observación. Los ensayos en Chromium monoproceso, PeerServer y señalización locales no equivalen a red pública o dispositivos físicos.
- La corrección de rangos no reemplaza autenticación. La persistencia segura de las rondas restantes, las acciones antiguas, la privacidad y sincronización integral de todos los juegos siguen sin demostrar; por eso la puerta de producción permanece cerrada.

## Inventario y método

Los bancos activos estructuralmente válidos se contabilizan usando `reportes/inventario-bancos.cjs`, en un perfil de navegador limpio con la API `V14.__v67.destino`, su validador y clave de deduplicación. No equivale a examen humano de exactitud, seguridad o calidad, y no incluye importaciones de otros perfiles. El archivo generado `inventario-bancos.json` se puede reproducir con las variables de Chromium/Playwright documentadas abajo. Ranking cuenta conjuntos objetivos aceptados por el validador, no tarjetas históricas rechazadas; Precio son datos históricos aproximados y no se añadieron datos nuevos. Hay dos duplicados de Dial y uno de Trivia según clave actual; el motor elimina duplicados al preparar la bolsa.

El usuario confirmó 12.000 elementos globales y 1.000 para los cinco bancos detallados abajo. El documento de misión encontrado en Drive habla de aproximadamente mil cuando corresponda y de doce mil globales, pero no enumera una meta específica para Personaje; `reportes/PENDIENTES.md` sigue sin encontrarse. No se afirma cumplimiento ni se cuentan como validadas manualmente todas las entradas heredadas.

## Matriz honesta de partidas completas

| Juego | 2 mandos | 3 mandos | 4 mandos | Evidencia parcial y límites |
|---|---|---|---|---|
| Dial | No ejecutado integral | No ejecutado integral | No ejecutado integral | parejas explícitas y bloqueo con tres; `dial-multijugador.cjs` cubre casos parciales |
| Impostor | No ejecutado integral | No ejecutado integral | No ejecutado integral | no se certifica privacidad completa de rol |
| Ranking | No ejecutado integral | No ejecutado integral | No ejecutado integral | banco objetivo y casos de regresión, no partida completa por cantidad |
| Precio | No ejecutado integral | No ejecutado integral | No ejecutado integral | aritmética/empate y prueba parcial; falta ciclo completo por cantidad |
| Tabú | No ejecutado integral | No ejecutado integral | No ejecutado integral | equipos/reparto/undo locales, no partida completa remota |
| Personaje | No ejecutado integral | No ejecutado integral | No ejecutado integral | pistas y privacidad parcialmente comprobadas |
| Trivia | No ejecutado integral | No ejecutado integral | No ejecutado integral | importación y vistas, no sincronización integral |
| Verdad o Reto | No ejecutado integral | No ejecutado integral | No ejecutado integral | importación y regresiones parciales |
| Yo Nunca Nunca | Parcial | No ejecutado integral | No ejecutado integral | apertura/votos/confesión con dos mandos; fase inicial preparada por API; autorización negativa y pago probado, no partida integral |
| Más probable | Parcial | No ejecutado integral | No ejecutado integral | recuperación y doble recarga con dos mandos locales emulados; no equivale a ciclo completo certificado |
| Historia en cadena | No ejecutado integral | No ejecutado integral | No ejecutado integral | importación y vistas parciales |

**No ejecutado integral** no significa fallo ni aprobación. Esta tabla no intenta sustituir el detalle de `tests/`. También faltan etapas completas por modalidad local, solo y servidor, gestos táctiles/cancelación, orientaciones, teclado virtual y accesibilidad; los mínimos de jugadores pueden hacer algunos casos no aplicables, pero no se han clasificado todos sin verificar reglas.

## Reproducción de pruebas en este entorno

Servir el repositorio por HTTP en puerto 8000. Con Playwright Core, Chromium, Peer y Express instalados fuera del repositorio, el comando utilizado es:

```sh
LD_LIBRARY_PATH=/tmp/amazonlibs/lib PLAYWRIGHT_CORE=/home/user/.cache/sintonia-test/node_modules/playwright-core CHROMIUM_PATH=/tmp/chromium PEER_MODULE=/home/user/.cache/sintonia-test/node_modules/peer EXPRESS_MODULE=/home/user/.cache/sintonia-test/node_modules/express node --test --test-concurrency=1 tests/*.cjs
```

Estas rutas son efímeras de este sandbox, no dependencias garantizadas para terceros. El servidor local no prueba la señalización remota.

## Resultados posteriores y evidencia visual

- Suite completa posterior a cambios de aplicación: **60/62**, 343 s, `suite-final.tap`. Los dos casos fallaron al lanzar Chromium con SIGSEGV, antes de ejecutar sus aserciones: CSV multibanco y recarga del anfitrión. Reejecución de ambos archivos: **4/4** en `reintento-chromium.tap`, incluidos los dos casos afectados. No se transforma retrospectivamente el 60/62 en una suite limpia; el entorno sigue mostrando inestabilidad de Chromium monoproceso. Tras reformatear el test de tres mandos, este pasó de nuevo 1/1; el único cambio posterior a la suite fue formato/nombre de ese test, no la aplicación.
- Capturas anteriores `evidencia/precio-movil.png`, `sala-movil.png`, `catalogo-movil.png` (390×844); capturas posteriores `*-movil-despues.png` y `precio-escritorio-despues.png` (1280×800). En Precio se comprobó anchura documental igual al viewport y cabecera en y=0 en ambos tamaños. Son estados representativos, no todas las pantallas; el HUD flotante puede solaparse visualmente con contenido móvil y necesita revisión adicional. Primer intento de capturas posteriores quedó bloqueado por tutorial y se repitió cerrándolo por la interfaz.
- Verificación humana de contenido, interoperabilidad de red pública y teléfonos reales, presión prolongada/cancelación, navegación con lector de pantalla y privacidad bajo ataques reales siguen pendientes. Los fallos de pruebas y las pruebas críticas no realizadas impiden aplicar la puerta de lanzamiento.

## Estimación de avance

Estimación de esta misión, no porcentaje de calidad del producto ni resultado automático: diez entregables de igual peso (10 puntos cada uno), puntuados 10 completado en el alcance indicado, 5 parcial, 0 no demostrado. Inspección/resguardo 10; tres correcciones focales 10; inventario reproducible 10; regresión general 5; pruebas de sala/multimando 5; revisión visual 5; informe y matriz 5; ciclos completos de once juegos por cantidad/modo 0; seguridad y recuperación integral 0; puerta de producción 0. **Total 50/100**. Las pruebas focales no dan por cerradas áreas más amplias; el avance cambiará al completar y verificar lo pendiente. Los objetivos de contenido pendientes pueden alterar el alcance.

## Continuación: objetivos confirmados y contenido integrado

El usuario confirmó el objetivo de **12.000 elementos válidos globales** y de **1.000** para Retos General, Historia en cadena, Yo Nunca Nunca, Más probable y palabras de Impostor. No se asume que esa cifra aplique automáticamente a otros bancos. Tras obtener el historial completo disponible (259 commits), no apareció `reportes/PENDIENTES.md`; los commits que contienen `index.html` son los de la rama de Sintonía. En Google Drive, la búsqueda de texto completo encontró el [documento de la misión](https://docs.google.com/document/d/1FgRiWPLV6e4sXz6DzfLecplk-7TNsYrhRkctasJOvVs/edit), que confirma el objetivo general y la ampliación aproximada por banco pero no fija un número para Personaje; las búsquedas de título en Notion no devolvieron páginas para Sintonía o PENDIENTES. Esto no demuestra que no existan otros documentos fuera de esas búsquedas y permisos.

| Banco activo General | Antes: únicas por esquema | Incorporadas | Ahora: únicas por esquema | Meta confirmada | Diferencia estructural mínima |
|---|---:|---:|---:|---:|---:|
| Retos | 480 | 50 | 530 | 1.000 | 470 |
| Historia | 40 | 50 | 90 | 1.000 | 910 |
| Yo Nunca Nunca | 65 | 50 | 115 | 1.000 | 885 |
| Más probable | 70 | 50 | 120 | 1.000 | 880 |
| Impostor: palabras | 40 | 50 | 90 | 1.000 | 910 |
| Personaje | 34 | 0 | 34 | No confirmada | No calculada |

Los dos lotes `contenido/lote-general-01.json` y `contenido/lote-general-02.json` contienen **250 entradas nuevas**, redactadas y revisadas durante la intervención, no generadas mediante combinaciones automáticas. Para cada lote, `V14.__v67.analizarImportacion` notificó 125 nuevas, cero inválidas, cero duplicadas y cero similares por su heurística antes de integrarlo; la heurística no sustituye la revisión editorial independiente. Están embebidas en `index.html`, añadidas al origen General en el módulo existente v43 y alcanzan las bolsas reales; no se añadió contenido a Precio. `tests/contenido-lote-general.cjs` comprueba presencia, validación, sincronización idempotente, agotamiento y persistencia después de recargar, para las 50 entradas de cada banco. No borra los duplicados originales; la selección los filtra.

El inventario reproducible actualizado suma **4.533 entradas estructuralmente válidas y únicas dentro de sus respectivos bancos**. Si cada conjunto de Ranking y cada mercado de Precio se contaran como elementos independientes, faltarían **al menos 7.467** para 12.000 bajo esa convención; no equivale al número final de contenido de calidad validada, ya que falta revisión humana de los bancos heredados y puede haber coincidencias entre bancos y mercados. No se cuentan importaciones de otros perfiles. Personaje conserva 34 objetos con `who` y un arreglo de pistas; no hay evidencia suficiente para asignarle una meta numérica específica.

El código actualmente retira Picante (`__v43api.banco(...,'spicy')` devuelve vacío y el importador solo acepta General); se mantuvo ese comportamiento, sin mezclar contenido ni activar un modo retirado unilateralmente. Esto **no** demuestra una separación funcional de bolsas de dos modalidades activas: si se decide recuperar Picante, exige revisar la fuente histórica, reglas, privacidad, edad y persistencia por separado.

## Seguridad: decisión de Yo Nunca Nunca

Se reprodujo con dos mandos WebRTC emulados un fallo P1: un segundo mando envió `yn:nego` y decidió por el acusado, provocando un descuento en el marcador. Se corrigió el control de conexión, asiento, fase y número de ronda en el servidor; solamente el acusado puede confesar, negar o enviar su contexto. Los mensajes de otra ronda y sin identificador de ronda se rechazan; los botones de mando llevan el identificador. `tests/yonunca-autorizacion.cjs` prueba la votación desde ambos mandos, el intento ajeno, el rechazo de mensajes viejos y la decisión y envío legítimos desde la interfaz. La fase inicial se prepara por API y la prueba no equivale a partida completa ni autenticación fuerte. La mecánica y puntuación no se modificaron. Los mandos con código anterior necesitan recargar para recibir el protocolo nuevo.

### Regresión posterior a esta continuación

- Suite completa con el HTML que incluye ambos lotes y la autorización: **63/64** en 378,5 s, `suite-contenido-y-autorizacion.tap`. El único fallo fue SIGSEGV al lanzar Chromium antes de `Trivia en solitario permite responder en pantalla y resuelve una vez`; el reintento aislado pasó **1/1**, `reintento-trivia.tap`. No se considera que la suite completa haya pasado limpiamente. Las pruebas de contenido y autorización aprobaron dentro de la suite.
- No se ha modernizado integralmente la interfaz ni recorrido todas sus variantes en esta continuación. El hallazgo del HUD que puede tapar contenido permanece pendiente. Faltan pruebas críticas de once juegos por modalidad, red pública y recuperación íntegra; no publicar a producción.

## Seguridad: mensajes atrasados de Historia

Con dos mandos WebRTC emulados se reprodujo que, tras guardar y recargar el anfitrión, una nueva historia podía reutilizar el número de ronda y de turno de la anterior. Al reenviar una frase vieja con esos datos, la historia nueva la aceptaba. El identificador de la ronda ahora se inicia con una generación nueva al cargar la página y sigue incrementándose por partida. `tests/cadena-ronda-recarga.cjs` comprobó que la frase anterior se rechaza y una nueva frase legítima se acepta; se prueba la cancelación segura de la historia anterior, no recuperación exacta de su estado. La prueba usa PeerServer local y preparación por API.

También se buscaron los términos «Sintonía», «Sintonia» y «PENDIENTES» en Dropbox sin resultados. Las búsquedas documentadas de fuentes conectadas se limitan al acceso concedido y no prueban que no exista otro documento.

### Suite repetida tras ajustar la prueba de tutorial

La primera ejecución posterior a la corrección de Historia terminó **64/65**: `tests/multijugador.cjs` no pudo pulsar Precio porque el tutorial diferido interceptaba el clic, no por una aserción de juego. Se ajustó únicamente la prueba para esperar el tutorial y cerrarlo por la interfaz; el archivo afectado pasó **1/1** en `reintento-multijugador.tap`. La siguiente suite completa terminó **65/65**, 398,7 s, `suite-ultima.tap`. Los ensayos siguen siendo Chromium y PeerServer locales, y los dos resultados anteriores y sus fallos permanecen registrados; esta suite no prueba todos los ciclos ni satisface por sí sola la puerta de producción.

## Continuación posterior

Para la continuación, los ensayos de sala a resultado, la ampliación de contenido, las reproducciones de acciones anteriores a la recarga y las capturas móviles, ver `CONTINUACION-MISION.md`. La tabla histórica anterior no refleja la cobertura añadida allí.
