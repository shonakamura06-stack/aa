# Sintonía — entrega de trabajo

El archivo `index.html` contiene la aplicación y sus recursos integrados. Esta es una versión de trabajo, **no** una versión certificada para producción. El PR está abierto y la producción pública no incluye necesariamente estos cambios.

## Iniciar en PC

1. Guarda `index.html` en una carpeta. En esa carpeta ejecuta `python3 -m http.server 8000 --bind 0.0.0.0` (Windows: `py -m http.server 8000 --bind 0.0.0.0`).
2. Abre `http://localhost:8000/` en la PC. Para jugar en un solo dispositivo selecciona el modo correspondiente. Con el archivo descargado, el modo local no necesita señalización; una URL visitada por primera vez no está garantizada sin red ni hay PWA instalada.
3. Para mandos, conecta los teléfonos a una red que pueda acceder a la PC, abre en ellos `http://IP_DE_LA_PC:8000/` (sustituye por la IP real), y sigue las instrucciones de sala/QR. La sala con mandos utiliza WebRTC y señalización pública, por lo que requiere internet; cortafuegos, red y soporte del navegador pueden impedir la conexión. Si se usa HTTPS público, no se necesita servir desde la PC.

Estas instrucciones no sustituyen una prueba con teléfonos físicos ni garantizan conexión pública. El modo local y la recuperación de rondas tienen límites; los detalles y pruebas disponibles están en `README.md` y `reportes/AUDITORIA-SINTONIA.md`.

## Qué contiene y qué falta

La entrega incorpora 300 entradas General durante la misión y protege mensajes de rondas anteriores en Historia, Yo Nunca Nunca, Personaje, Trivia, Ranking, Precio y Tabú. Se ensayaron recorridos de sala a resultado con 2, 3 y 4 mandos emulados en varios juegos y la partida de diez preguntas de Trivia. Las pruebas usan señalización local; no equivalen a red pública ni teléfonos físicos. Los mandos cargados con la versión anterior deben recargar. Faltan objetivos de contenido, recorridos y recuperación integral. Ver `reportes/CONTINUACION-MISION.md`; no es lanzamiento aprobado.
