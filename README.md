# aa

## Sintonía (trabajo en curso)

**Auditoría más reciente:** la suite completa del HTML actual pasó 65/65 en Chromium y señalización local. Una ejecución previa terminó 64/65 al interceptar un tutorial un clic; se corrigió la espera de la prueba y se repitió. Hay 250 entradas General nuevas y correcciones de autorización y de mensajes atrasados. Los ensayos no certifican todos los juegos ni la puerta de producción; ver `reportes/AUDITORIA-SINTONIA.md` para matriz y límites.

El repositorio no contenía la aplicación de Sintonía; `index.html` parte del
`actual.html` proporcionado por el usuario. La copia intacta se encuentra en
`recuperacion/actual-original.html` (SHA-256
`ff34116dee48bc88f72c6025be34ecffa52f98ef87db7684b9650cef0decd2bd`).
**Versión de trabajo:** el inicio permite crear sala, jugar en este dispositivo, jugar solo
o entrar como mando. No se han validado teléfonos físicos ni la señalización
pública; la recuperación exacta de las rondas de la mayoría de juegos no está
implementada. La versión pública puede ser anterior a este archivo.

Para servir la versión de trabajo:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```


### Cómo probar en PC y celulares

1. Guarda `index.html` en una carpeta. En esa carpeta ejecuta
   `python3 -m http.server 8000 --bind 0.0.0.0` (en Windows también puede ser
   `py -m http.server 8000 --bind 0.0.0.0`). El archivo contiene los recursos
   de la interfaz; no necesita otros archivos del proyecto para mostrarse.
2. Conecta PC y celulares a la misma red y busca la IP local de la PC (`ipconfig`
   en Windows o `hostname -I` en Linux). Abre en la PC
   `http://IP_DE_LA_PC:8000/`, no `localhost`, para que el QR use una dirección
   accesible a los teléfonos. Permite el puerto 8000 en el firewall si hace falta.
3. En la entrada selecciona «Crear sala anfitriona»; abre el QR en cada celular o visita
   `http://IP_DE_LA_PC:8000/?mando&sala=CODIGO`, sustituyendo la IP y el código.
   Introduce nombres, confirma la entrada y elige equipos solo cuando el juego
   lo pida. La PC es anfitriona, no participa como jugadora. En «Jugar en este
   dispositivo» agrega al menos dos personas; para Dial elige explícitamente sus
   parejas en la sala. Este modo no requiere señalización de red.
4. En Más probable vota con un celular y recarga la **misma pestaña** de la PC
   con el autoguardado activado. Espera la reconexión del código y los mandos:
   la frase y el voto deben permanecer; el mismo jugador no puede votar otra vez.
   Repite la recarga, completa la votación y cuenta los votos. En modo local Más probable también recupera la votación y el resultado; en Dial
   y los demás juegos la ronda se cancela al recargar, conservando el marcador guardado.
5. Si falla, registra navegador y versión, URL sin datos personales, red, juego,
   fase, acción, mensaje, momento de recarga y resultado observado; no compartas
   secretos, identificadores de sesión ni datos privados innecesarios.

La sala usa WebRTC y un servicio público de señalización: requiere internet,
además del acceso de los celulares al servidor HTTP de la PC. Redes aisladas,
firewalls, NAT o la disponibilidad del servicio pueden impedir la conexión. No
se han validado celulares físicos ni el servicio público en esta sesión.

### Pruebas

Con Node.js, las pruebas aisladas no necesitan dependencias adicionales:

```sh
node --test tests/regresion.test.cjs
```

Las pruebas de navegador requieren `playwright-core`, un ejecutable Chromium y
el servidor HTTP anterior. Para el ensayo WebRTC también se necesitan `peer`
y `express`. Por ejemplo, instalados fuera del repositorio:

```sh
npm install --prefix /ruta/a/dependencias --no-save playwright-core peer express
export PLAYWRIGHT_CORE=/ruta/a/dependencias/node_modules/playwright-core
export PEER_MODULE=/ruta/a/dependencias/node_modules/peer
export EXPRESS_MODULE=/ruta/a/dependencias/node_modules/express
export CHROMIUM_PATH=/ruta/a/chromium
node --test tests/navegador.cjs
node --test tests/multijugador.cjs
node --test tests/dial-multijugador.cjs
node --test tests/reinicio-host.cjs
node --test tests/recuperacion-probable.cjs
node --test tests/recuperacion-local.cjs
node --test tests/importacion-similares.cjs
# O todos, secuencialmente:
node --test --test-concurrency=1 tests/*.cjs
```

`tests/multijugador.cjs` crea un servidor PeerJS local efímero y modifica la
configuración de señalización únicamente en las páginas de prueba. Conecta un
anfitrión y dos mandos de Chromium, corta y reconecta un canal, y comprueba el
flujo de Historia en cadena (incluidos mensajes fuera de turno y atrasados),
la elección de equipos y propuestas de Tabú, su aislamiento al cambiar a
Verdad o Reto, un empate y desempate sin puntos en Más probable, reconexión tras votar
y tras responder en Trivia, estimaciones en Precio Justo y su protección ante turnos viejos, y una ronda de Ranking
Imposible, con reconexión durante el turno y participante en espera.
Utiliza orígenes locales distintos para evitar el almacenamiento compartido
de Chromium en modo monoproceso.
`tests/dial-multijugador.cjs` conecta cuatro mandos, forma parejas elegidas,
comprueba la pista privada, la interacción táctil con la aguja, la revelación,
reconexiones en las fases de pista y aguja, reconexión entre rondas, dos
propuestas de un mismo equipo en Tabú y el cambio directo a un juego
individual. Los puntos de cada pareja se dividen entre sus dos integrantes,
según la decisión del usuario. El mismo ensayo comprueba el reparto de un
marcador de Tabú deliberadamente preparado entre los integrantes de equipos.
`tests/reinicio-host.cjs` recarga el anfitrión durante Dial, recupera el mismo
código y dos mandos, comprueba el reparto de un marcador de equipo preparado
en el ensayo y verifica que una segunda recarga no lo repite. La ronda activa
se cancela: no se pretende recuperar su fase. El mismo ensayo cierra la sala,
abre otra en la misma pestaña y comprueba que no hereda el directorio anterior
ni el marcador de una persona distinta con el mismo nombre.
`tests/recuperacion-probable.cjs` comprueba con dos mandos WebRTC locales dos
recargas durante la votación, los votos ya emitidos, el resultado, el marcador,
un guardado manipulado y un voto atrasado de una ronda cancelada.

La ejecución integral final aprobó **58/58 pruebas** (342,1 s) con el HTML
SHA-256 `3373f2c718c5aa0e12bfb2f2038d9c1a6a466bad16bc23d83f03813c0893939b`.
Incluye recuperación local, guardados alterados, la revisión de coincidencias
similares y Ranking/Personaje en solitario.
Los ensayos no usan
el servicio público de señalización, redes externas ni teléfonos físicos. Los
mandos son instancias de Chromium con un PeerServer local; la prueba de scroll
usa ocho registros simulados. La llegada inmediata también se simula insertando
un registro durante la transición, no con una conexión física simultánea.


### Entrada, CSV y límites de la versión actual

- El modo solo solicita un nombre y permite jugar Precio, Trivia, Ranking y
  Personaje en la misma pantalla; Personaje usa veredicto propio. Dial, Tabú, Más probable e Impostor no tienen variante
  individual implementada: sus tarjetas aparecen grises, siguen siendo pulsables y
  explican visualmente que hacen falta más jugadores. No se inventan participantes. No se han
  validado todos los demás juegos individuales.
- La sala local requiere dos participantes y permite elegir parejas de Dial sin
  crearlas automáticamente. En la sala de servidor cada mando entra con una
  conexión real; el anfitrión no cuenta como participante. Cambiar de modo
  pide confirmación y cierra las conexiones de la sala anterior.
- El importador admite texto y CSV separado por comas: campos entre comillas,
  comillas dobles escapadas y saltos de línea internos. Elige el destino y la
  variante; la ayuda muestra sus columnas. El análisis se invalida al editar
  los datos, y la importación se confirma en una segunda acción. Si falla el
  almacenamiento, conserva el texto y comunica el error.
- Más probable permite votación privada secuencial local. Tabú permite pasar
  el dispositivo para enviar una propuesta sin mostrar la carta y devolverlo
  a quien describe para resolver. Esas rutas se han ensayado en navegador, no
  con participantes físicos.
- La app y PeerJS están incorporados en el HTML. La sala con mandos necesita
  servicio de señalización externo y puede depender de la red y del navegador;
  abrir el archivo no garantiza funcionamiento multijugador. El servicio HTTPS
  publicado requiere una conexión HTTPS activa la primera vez que se abre.
- La recarga durante Más probable con anfitrión y dos mandos se probó dos
  veces; también se probaron dos recargas en modo local, resultado y guardado
  alterado. En otros juegos se conserva el marcador, pero la ronda incompleta se
  cancela; no se afirma recuperación exacta de todas las fases.

### Cambios y alcance verificado

- Las once tarjetas se abrieron mediante clics en ambos extremos a 1280 × 800 y
  390 × 844 en Chromium. Salir con Escape ya limpia el identificador del juego
  clásico, de modo que su tarjeta puede volver a abrirlo. El subtítulo del hub
  deja de prometer funcionamiento offline y muestra el número real de juegos.

- Entrada anfitrión/mando: el anfitrión no cuenta como jugador; quienes llegan
  durante una partida esperan y aparecen en la sala. La expulsión impide que
  el mando expulsado se reconecte automáticamente. En el lobby los marcadores
  se vinculan a la identidad persistente del mando, no al índice ni al canal
  temporal; la reconciliación del lobby no altera equipos durante un juego.
  Al crear otra sala se limpia su directorio y se reconcilia el asiento antes
  de confirmar el saludo, evitando asignar temporalmente puntos ajenos.
- Equipos de Dial y Tabú elegidos por los participantes; los puntos de equipo
  se dividen por igual entre sus integrantes individuales. La formación se
  solicita nuevamente al reconectar.
- La tarjeta de Precio y el tutorial de Más probable reflejan las reglas
  actuales, sin prometer equipos ni puntos que no corresponden.
- Verdad o Reto y Trivia: resultado durante cinco segundos, avance único y
  cancelación al salir. Tabú protege palabras secretas y guarda una propuesta
  por jugador, incluso si comparten equipo o uno se reconecta; Historia entrega
  al siguiente jugador únicamente la última frase. Más probable no adjudica puntos
  y permite desempatar. Avisos no interceptan clics y usan fondo de 0,38.
- Ranking: criterios y fuentes verificables, importador y prueba local de
  reconexión. Las imágenes intercambiadas de Verdad/Ranking y Probable/Impostor
  se reasignaron a sus juegos; se mantiene la identidad visual original.
- Precio Justo: seis rangos, entrada privada visible para quien escribe,
  comparación decimal exacta de hasta 100 dígitos, cero válido, más cercano o
  sin pasarse y reparto opcional de empates. Solo el más cercano puntúa:
  exacto 5; error hasta 10 % 3; hasta 20 % 2; hasta 30 % 1; más lejos 0.
  Para precio cero solo puntúa un cero exacto. La precisión del
  marcador se configura entre 2 y 6 decimales y se comunica a los mandos.
  La puntuación se guarda internamente como números JavaScript: los repartos
  periódicos, como 1/3, tienen la precisión finita habitual de esos números.
  La escala es una representación visual aproximada, no una conversión del
  precio usado para decidir ganadores. El reparto de una ronda se deshace como
  una sola operación. Se ensayaron por WebRTC local el exacto, empate de cero,
  reparto automático y manual, deshacer, sin pasarse, cifras grandes, pérdida
  simulada del primer envío, recarga de un mando y cancelación de la entrada.
  El contenido regional original se conserva con aviso de valores orientativos;
  no se añadieron precios. Las categorías vacías
  permiten cambiar de filtro o importar cifras propias.

### Decisiones de estado y recuperación

Se conservaron los adaptadores existentes para no reescribir de golpe los
juegos. El registro del lobby usa la identidad persistente del mando para
asociar marcadores y actualizar el directorio al reordenar asientos; Dial
conserva pareja y roles al cambiar de canal. Tabú identifica cada propuesta
por jugador y aplica el resultado al equipo correspondiente. La capa común de
pantallas vuelve a aplicar la personalización por conexión después de sus
adaptadores por asiento, para no sobrescribir los controles individuales.
Esto reduce ambigüedades reproducidas, pero **no demuestra que todas las capas
históricas hayan quedado unificadas**. La identidad del navegador sirve para
reconectar, no es un mecanismo de autenticación frente a clientes maliciosos.

Al recargar la misma pestaña anfitriona se intenta recuperar el código anterior;
con autoguardado se restauran los marcadores individuales y se distribuye una
sola vez el resultado de equipo guardado. **Más probable en modo servidor** puede reanudar la
votación o el resultado con los votos e identidades anteriores; datos inválidos
cancelan la ronda. En **modo local**, se conserva igualmente la frase, votos,
desempate y resultado si se mantiene la misma lista de participantes. Un guardado
incompleto o una lista modificada cancela la recuperación. La sesión se guarda al recargar normalmente y de forma
periódica: una caída repentina puede perder los cambios más recientes. Para
**todos los demás juegos**, incluido Dial, la partida vuelve al hub y la ronda
incompleta se cancela: no se reconstruyen su fase, temporizador ni secretos.
Cerrar expresamente la sala borra el indicador de recuperación. Si el código
continúa ocupado, se reintenta el mismo código y luego se avisa, sin cambiarlo
silenciosamente. El guardado está en el navegador de la PC y no es cifrado.
Esto se probó con señalización local; no se ha probado una caída total del
navegador, pérdida de energía o red pública.

Una apertura diferida tras elegir equipos se cancela si se navega a otro juego,
y restaura el marcador individual sin inventar una ronda. La entrada de Precio
no comunica que la PC guardó la estimación hasta recibir confirmación; permite
reintentar si no llega. En pantallas de 320 × 480 emuladas el teclado permite
scroll. El contenido original de precios no se amplió.

### Pendientes y límites

- Pruebas con celulares físicos, distintos navegadores/redes y señalización
  pública; ningún ensayo local demuestra que esos servicios estén averiados o
  que funcionen. El ensayo de scroll de sala usa ocho registros simulados.
- Se eliminó el registro del service worker inexistente. El modo local se
  ensayó bloqueando solicitudes de red una vez cargado el HTML; no se verificó
  instalación PWA ni que una URL remota se abra por primera vez sin conexión.
- Salvo Más probable, restaurar exactamente las fases, temporizadores y secretos
  de los juegos después de recargar **no está implementado**.
- Tabú permite elegir equipos locales sin asignación automática y repartir
  el resultado por igual; se probaron selección, recarga y deshacer. Falta
  validar más combinaciones reales de grupos y turnos.
- Persisten capas históricas y adaptadores de `teams`; falta demostrar todas las
  combinaciones de juegos, reconexiones, alternancia y cancelación. El resultado
  de equipo se guarda, pero todavía no se muestra como historial.
- La llegada inmediata durante el cambio se ensayó insertando un registro,
  no con una conexión física simultánea. Faltan más pruebas de accesibilidad,
  de desbordamiento y de los demás tamaños de pantalla.
- Los decimales monetarios admiten hasta 100 dígitos y se comparan exactamente;
  las fracciones de puntos usan números JavaScript y la escala es aproximada.
  Las referencias originales de precios no verifican el mercado actual.

#### Estado según la evidencia

Los ensayos locales cubren los recorridos descritos arriba, no la totalidad de
las combinaciones posibles. No se dispone de una medida fiable del porcentaje
real de implementación ni de preparación para producción. La validación en
celulares físicos y redes o señalización pública sigue pendiente.

### Ranking y fuentes

El banco activo de Ranking usa 30 combinaciones con criterios explícitos de
radio y posición de planetas (NASA) y número atómico (Universidad de Texas).
El orden y la fuente se muestran al revelar. Las tarjetas subjetivas originales
se conservan en la copia de recuperación y en el banco histórico, pero no se
usan como respuestas objetivas. Las tarjetas importadas requieren valores
numéricos, dirección de orden y una URL aportada por quien las importa; la
aplicación no puede verificar por sí misma que esa fuente sostenga los datos.

Fuentes del banco:

- https://science.nasa.gov/resource/solar-system-sizes/
- https://science.nasa.gov/solar-system/planets/planet-sizes-and-locations-in-our-solar-system/
- https://gchem.cm.utexas.edu/data/ptable.php

### Documentación de Skills consultada

En el repositorio remoto `shonakamura06-stack/aa`, commit
`2f1d1434384ce4a204e078c03ec6d3963e0abf9d`, se consultaron
`skills/README.md`, `skills/code-review.md`, `skills/frontend-design.md`,
`skills/e2e.md`, `skills/security-audit.md`, `skills/architect.md`,
`skills/refactor.md`, `skills/test.md`, `skills/test-coverage.md`,
`skills/web-design.md`, `skills/ui-ux-pro-max.md` y `skills/skill-creator.md`.
Son documentación leída, no comandos de Skills instalados o ejecutados.

Además, del `main` remoto de `shonakamura06-stack/aa`, commit
`7cb85c2906ce939c1a3fcbc00843f5a1c6d61deb`, se leyeron
`ponytail/AGENTS.md`, `ponytail/skills/ponytail/SKILL.md`,
`ponytail/skills/ponytail-review/SKILL.md`,
`ponytail/skills/ponytail-audit/SKILL.md` y la guía
`ponytail/docs/agent-portability.md`. Se aplicaron manualmente sus criterios de
reutilización, rastreo de dependencias, reproducción y revisión; no se ejecutó
un plugin ni se confirmó que Arena admita comandos `/ponytail`. La colección
de Ponytail está en ese `main` remoto, no en la base de esta rama.

## Trabajo en curso: importación, presentación de resultados y sala

La copia `recuperacion/antes-importacion-y-sala.html` conserva una versión anterior;
`recuperacion/antes-ejecucion-final.html` conserva la copia previa a los últimos
cambios de modo solo y recuperación local.

El importador analiza CSV real o los formatos de texto descritos en la ayuda;
distingue acentos, ñ y categoría para las palabras del Impostor. Informa
coincidencias, conserva el texto y puede exportar el informe. Personaje envía
solo pistas ya publicadas; Ranking mantiene el turno y resultado individual;
Precio utiliza decimales exactos para puntuar y una escala visual aproximada.

Se eliminaron las franjas redundantes de jugadores sin quitar el marcador ni la
gestión de turnos. Hay pruebas de ingreso local, sala con mandos, votación
local, reparto de Dial y propuesta individual de Tabú; estas no abarcan todos los juegos y fases posibles.
La revisión de tamaños de pantalla es emulada, no una prueba en dispositivos
físicos. Las pruebas de WebRTC usan un PeerServer local, no el servicio público.

El QR fue decodificado desde la imagen y su enlace abrió la pantalla de mando
en Chromium. Se verificó que JUGAR queda visible en la sala a 1366 × 768 y
390 × 844. Esto no es una lectura con cámara física.
