# Continuación de la misión

## Seguridad: reproducción y corrección

Se reprodujeron con dos mandos WebRTC y PeerServer local, antes de cambiar cada motor, los siguientes fallos: una acción enviada antes de recargar el anfitrión podía coincidir con la primera ronda posterior y ocupar el turno de **Trivia**, **Ranking**, **Precio** o **Tabú**. En Personaje también se aceptaba una respuesta sin identificador de ronda. Los ensayos `*-recarga-antes.tap` y `personaje-ronda-antes.tap` conservan las aserciones fallidas. Se asignó a cada motor una generación inicial por carga y se exige identificador válido en Personaje; se volvieron a probar mensajes antiguos y envíos legítimos desde la interfaz (`*-despues.tap`). La generación de hora y azar reduce colisiones accidentales: no constituye autenticación criptográfica. Una recarga cancela estas rondas; no se afirma recuperación exacta.

En Dial se comprobó el inicio antiguo bajo el montaje de dos mandos de `tests/dial-ronda-recarga.cjs`; pasó sin cambiar Dial. No demuestra todos los tiempos de reconexión o recarga. Antes del ajuste de Tabú se interrumpió deliberadamente una suite en curso: `suite-interrumpida-por-tabu.tap` es parcial y no se computa como resultado final. `tabu-recarga-antes.tap` usa el HTML previo servido en puerto 8001 para reproducir; el test final usa el HTML actual en 8000.

## Recorridos de sala a resultado

Todos usan navegadores emulados, WebRTC y señalización local. El anfitrión crea la sala desde la interfaz, los jugadores entran desde mandos separados y se abre el juego en el catálogo. Los scripts inspeccionan el estado del servidor para comprobar resultados, además de interactuar con controles; no simulan dispositivos físicos ni red pública.

| Juego | 2 | 3 | 4 | Alcance comprobado |
|---|---|---|---|---|
| Historia | Una historia | Una historia | Una historia | Cada participante escribe una frase, se rechazan mensajes de otro asiento y turno anterior, resultado y marcador sin cambios. |
| Más probable | Una votación | Una votación | Una votación | Un voto por persona, duplicados rechazados, resultado sin puntos. |
| Precio | Una ronda | Una ronda | Una ronda | Estimaciones privadas por turno, intrusión rechazada y 5 puntos al único exacto. Puntos automáticos configurados por el test. |
| Ranking | Una ronda | Una ronda | Una ronda | Cada participante ordena cinco tarjetas, se rechaza interferencia y se comprueban puntos y resultado. |
| Personaje | Una ronda | Una ronda | Una ronda | Una respuesta del participante del turno, rechazo de otro mando, veredicto del anfitrión y puntos una sola vez. |
| Trivia | 10 preguntas | 10 preguntas | 10 preguntas | Un acierto por pregunta, ganador rotativo, puntuación y final; respuesta duplicada no suma. |
| Yo Nunca Nunca | Una acusación | Una acusación | Una acusación | Votos, rechazo de interferencia, decisión de negar y descuento único por votos. |
| Dial | Parcial | No aplicable con parejas completas | Parcial | Los ensayos existentes cubren parejas, ronda y reparto, con estados preparados y conexiones locales; no se certifica cobertura integral de todas las fases. |
| Tabú | Parcial | No ejecutado integral | Parcial | Reparto y propuestas, además del caso de recarga; no se certifica ciclo integral. |
| Impostor | No ejecutado integral | No ejecutado integral | No ejecutado integral | Falta comprobar reparto de roles, votación y privacidad de extremo a extremo. |
| Verdad o Reto | No ejecutado integral | No ejecutado integral | No ejecutado integral | Faltan recorridos completos por decisión y puntuación. |

Los resultados de una ronda no aprueban todos los turnos, modos, errores de red, desconexiones o recargas de cada juego. Las pruebas de seguridad no certifican aislamiento criptográfico ni identidad fuerte. La tabla anterior no reemplaza las pruebas parciales históricas documentadas en `AUDITORIA-SINTONIA.md`.

## Contenido

Se crearon 50 entradas adicionales General (`contenido/lote-general-03.json`), diez por banco confirmado. Frente al HTML previo, el importador detectó 50 nuevas, ninguna inválida, duplicada ni similar por su criterio (`lote-03-validacion-final.json`). El primer intento incluía BRÚJULA con otra categoría: el importador la consideró diferente, pero la integración de palabras deduplica por palabra y no la incorporó; la prueba de integración detectó 59/60. Se reemplazó por SISMÓGRAFO y se repitió: 60/60 entradas por banco de los tres lotes están integradas y consumibles, 2/2 pruebas en `lote-03-integracion-final.tap`. Esto señala una diferencia entre la clave del importador y la de integración base que debe tenerse en cuenta al añadir lotes. Las 50 entradas fueron revisadas durante su redacción, no por un revisor editorial independiente.

El inventario estructural actual es **4.583 sumadas por banco/mercado**, no deduplicadas globalmente y sin validación editorial integral. Faltan al menos **7.417** bajo esa convención para 12.000 válidas. Desde el inicio de esta misión se generaron e integraron 300 entradas General (60 por banco confirmado). Recuento estructural actual: Retos 540/1.000; Historia 100/1.000; Yo Nunca 125/1.000; Más probable 130/1.000; palabras de Impostor 100/1.000. El contenido heredado no se declara validado solo por cumplir esquema. Picante permanece retirado, no mezclado ni reactivado.

`bolsas-cierre-real.tap` cierra Chromium con un perfil persistente, lo vuelve a abrir y confirma que una extracción por API en cada uno de once bancos sigue marcada; también verifica que sus bancos Picante estén vacíos. Es una prueba del motor compartido y almacenamiento, no de consumir cada carta mediante la UI ni de todos los casos de disco dañado.

## Móvil

`evidencia/once-movil-antes/` y `evidencia/once-movil/` contienen capturas reales de las once vistas iniciales con sala local preparada, a 360×800 CSS px y factor 2. No son capturas de todos los estados, teclado virtual, orientación o de un Infinix físico. En móvil la barra local de turno tapaba controles: ahora se coloca en el flujo bajo la cabecera; en Dial el texto largo del botón se ajusta a varias líneas. `barra-movil.tap` comprueba a 320 px que la barra no intercepta el botón, su texto no se corta, el control de pasar funciona y la barra desaparece al salir. Dial aún requiere desplazamiento y hay aviso temporal/confeti en la captura: no se declara terminado el rediseño.

## Puerta de lanzamiento

Los objetivos de contenido, juegos restantes, recuperación de rondas, pruebas de red pública y revisión visual integral siguen pendientes. No se ha promovido este trabajo a producción. Las reglas de juego no se modificaron intencionadamente; los mensajes antiguos ahora se descartan.

## Estimación basada en entregables

Se recalibró el cálculo anterior para incluir explícitamente el objetivo de contenido: diez áreas de 10 puntos, con 10 completo, 5 parcial y 0 no demostrado. Inspección y respaldo 10; correcciones y permisos 5; sala y equipos 5; ciclos de juegos 5; contenido y calidad 5; persistencia y recuperación 5; diseño y accesibilidad 5; regresión y CI 5; informes y trazabilidad 10; puerta de lanzamiento 0. **55/100**. El cálculo anterior de 50/100 usaba una rúbrica distinta que calificaba inventario, pero no el cumplimiento del contenido; las cifras no son estrictamente comparables. Ningún área parcial equivale a aprobación completa.

## Regresión ampliada: primer resultado

`reportes/suite-mision-continuada-final.tap`: **93/94**, 909,6 s. El único fallo fue que el tutorial diferido interceptó el inicio de la formación en el ensayo de recarga de Dial; las aserciones de esa prueba no llegaron a ejecutarse. Se esperó su aparición y se cerró por la interfaz en la preparación de Dial y Tabú. `reportes/reintento-dial-tabu.tap`: **2/2**. No se sustituye ni se presenta como limpia la suite 93/94; se lanzó otra suite completa (`suite-mision-repetida.tap`).

La repetición completa posterior fue **91/94** (`suite-mision-repetida.tap`, 804,6 s): Dial pasó; los tres fallos ocurrieron al arrancar Chromium con señal SIGSEGV, antes de abrir la aplicación, en Historia con 3 mandos, Personaje con 4 y Yo Nunca con 4. `reintento-sigsegv-ampliado.tap` repitió exactamente esos tres casos y pasó **3/3**. Los 94 casos tienen una aprobación en la repetición o en sus reintentos, pero **no hay una ejecución completa limpia de 94/94**; los dos TAP completos y los reintentos se conservan sin ocultar la intermitencia del entorno.
