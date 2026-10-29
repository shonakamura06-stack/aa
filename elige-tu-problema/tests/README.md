# Pruebas (solo desarrollo)

Estas pruebas **no forman parte del sitio publicado** ni son necesarias para jugar o desplegar. Usan [jsdom](https://github.com/jsdom/jsdom) para ejecutar el `index.html` real en un DOM simulado.

```bash
cd tests
npm install
npm test
```

Suites:

| Suite | Qué comprueba |
|---|---|
| `content` | 60+ dilemas, ids únicos, categorías equilibradas, consecuencias completas y no repetidas, atributos válidos, 10 finales, ausencia de recursos externos. |
| `flow` | Inicio, partida normal, ambas opciones, consecuencias, atributos, avance, protección de doble clic, resultado, colección, segunda partida, partida larga, salir/continuar, teclado. |
| `endings` | Determinismo del final, sensibilidad a las decisiones y cobertura de los 10 finales (2000 simulaciones). |
| `daily` | Secuencia diaria determinista, independiente del historial, distinta cada día, y contador de retos completados. |
| `robustness` | `localStorage` bloqueado, JSON corrupto, estado inválido, guardado/restauración, resultado persistente, reinicio con confirmación, compartir honesto, navegación y hash. |
| `audit` | Ids HTML únicos, acciones y rutas válidas, nombres accesibles, ausencia de formularios, espacios publicitarios sin anuncios reales, transparencia de privacidad, CSS adaptable y sin dependencias remotas. |
| `sharecard` | Dibujo de la tarjeta PNG con un contexto 2D simulado, compartir archivo/texto y copia al portapapeles. |

Limitación conocida: jsdom no renderiza CSS ni dibuja canvas de verdad, así que la composición visual y la imagen PNG final deben verificarse en un navegador real (ver `PRUEBAS.md`).
