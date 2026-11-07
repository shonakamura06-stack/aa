# Sala previa compacta

La distribución se limita a `#v40-sala-previa`, usando el panel de sala existente. El espacio de participantes desplaza su contenido cuando hace falta, sin desplazar toda la pantalla; estado, gestión y configuración opcional se agrupan sin eliminar sus acciones. Se reserva la esquina inferior derecha para una insignia externa estimada en 180 × 64 px. El botón Jugar se colocó a la izquierda; los avisos se elevan solo mientras está abierta esta sala. En alturas de 340 px o menos se habilita desplazamiento de emergencia para no dejar contenido inaccesible con un teclado virtual.

- `lobby-compacto-final.tap`: 7/7. Comprueba seis tamaños entre 320×480 y 1366×655, lista con 12 participantes de prueba, contenido y controles dentro de tarjetas, posición de scroll tras repintar, menús, Netlify simulado y controles reales de invitación en sala local con un mando emulado.
- `lobby-regresion-serial.tap`: 12/12. Entrada local y servidor, selección explícita de equipos, nombres, accesos y tres mandos emulados. Ejecutada antes de añadir al archivo de pruebas los dos tamaños adicionales; el código de la aplicación era el mismo.
- `lobby-acceso-juegos.tap`: 11/11. Acceso y rondas de Dial, Impostor, Tabú y Verdad/Reto; se ejecutó antes del último ajuste CSS para alturas pequeñas, que solo afecta a la sala.
- `lobby-scroll-bajo-carga.tap`: 4/5. Al ejecutarse en paralelo con otra suite, una prueba observó un cambio de posición de la lista en 740×360. Una repetición aislada, cinco repeticiones adicionales y las dos ejecuciones finales seriales pasaron. No se ha determinado la causa de ese fallo intermitente y no se considera descartado bajo carga.

La insignia de Netlify no se controla desde esta aplicación y puede variar de tamaño o ubicación; la comprobación es con una simulación, no con la insignia real. No se probó en teléfono físico ni el teclado virtual real. No se cambiaron reglas ni pantallas de los juegos.
