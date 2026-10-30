# Trazador · Math Wars

Plano cartesiano interactivo para **planear tiros en Math Wars** (Roblox): el juego donde
escribes una `f(x)` y la bala vuela siguiendo esa curva desde tu personaje.

Todo ocurre en el navegador: sin servidor, sin dependencias y sin conectarse a la partida.

![Captura](captura.png)

## Abrir

- Doble clic en `index.html` (funciona sin servidor), o
- `python3 -m http.server 8000` en esta carpeta y abrir <http://localhost:8000>.

## Cómo se usa

1. **Marca dónde estás**: arrastra el punto verde o escribe tu X e Y (en Math Wars son las
   coordenadas del plano, escala ±80).
2. **Coloca a los rivales** (diamantes) y los **obstáculos**: bloques triangulares, muros y rocas.
   Todo se arrastra y se estira.
3. **Elige el tipo de función de la ronda** (lineal, cuadrático, seno, valor absoluto…) o escribe
   la ecuación a mano. Los parámetros (`m`, `b`, `a`, `h`, `k`…) aparecen como deslizadores.
4. **Ajusta** hasta que la línea pase por ti y esquive los bloques. La franja roja indica choque,
   con el punto exacto y la distancia.
5. **Copia la ecuación** del recuadro inferior y pégala tal cual en el chat del juego: ya lleva
   los números puestos y el desplazamiento si moviste la curva.
6. **Disparar** (`D`) para ver el recorrido de la bala.

## Funciones incluidas

Las mismas familias que reparte el juego, cada una con su forma general y deslizadores:

| | |
|---|---|
| Lineal | `m*x + b` |
| Cuadrático | `a*x^2 + b*x + c` |
| Cúbico | `a*x^3 + b*x^2 + c*x + d` |
| Valor absoluto | `a*abs(x - h) + k` |
| Logaritmo / Log natural | `a*log(x - h) + k` · `a*ln(x - h) + k` |
| Seno / Coseno | `a*sin(b*(x - h)) + k` |
| Exponencial | `a*e^(b*(x - h)) + k` |
| Raíz cuadrada | `a*sqrt(x - h) + k` |
| Seno/Coseno inverso, tan. inversa, tanh | `a*asin(b*(x - h)) + k` … |
| Tangente / Recíproco | `a*tan(b*(x - h)) + k` · `a/(x - h) + k` |

## Sintaxis aceptada

Se puede pegar directamente lo que se escribe en el juego:

```
f(x) = 24sin(πx/40) + 0.0005x(x−40)(x−80)
y = 50-abs(x-70)
2x + 1          →  multiplicación implícita
```

Acepta `π`, `×`, `÷`, `−`, `f(x) =`, `y =`; funciones `sin cos tan asin acos atan sinh cosh tanh
sqrt abs ln log log2 exp floor ceil round sign min max`; constantes `pi`, `e`, `tau`.
Los decimales van con **punto** (`0.5`).

## Lo que te dice la página

- **Dónde estás**: coordenadas tuyas y de cada rival, con distancia y ángulo entre vosotros.
- **Dónde choca**: obstáculo, punto exacto, distancia recorrida y tiempo hasta el impacto.
- **Si le da a alguien**: 🎯 cuando la curva pasa cerca de un rival (o a cuántas unidades pasa).
- **La ecuación exacta** para pegar en el chat, ya con los números y desplazamientos aplicados.

## Atajos

| Tecla | Acción |
|---|---|
| `D` | Disparar |
| `F` | Encuadrar todo |
| `G` | Rejilla |
| `V` | Modo selección |
| `P` | Colocar mi punto |
| `+` / `-` | Zoom |
| Flechas | Mover lo seleccionado (`Shift` = fino) |
| `Supr` | Borrar lo seleccionado |
| `Esc` | Cancelar |
| Rueda | Zoom · arrastrar el fondo = mover la vista |

## Nota

Una web **no puede leer** tu partida de Roblox. Copia tus coordenadas y la posición de los
bloques a mano: con dos o tres puntos ya tienes una escena muy fiel para calcular el tiro.

## Archivos

- `index.html` — estructura y paneles.
- `styles.css` — diseño.
- `app.js` — lienzo, arrastre, colisiones, bala, estado y guardado.
- `parser.js` — evaluador de expresiones propio (sin `eval`, con multiplicación implícita).
