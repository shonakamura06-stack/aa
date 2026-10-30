# Trazador · Math Wars

Plano cartesiano interactivo para **planear tiros en Math Wars** (Roblox): el juego donde
escribes una `f(x)` y la bala vuela siguiendo esa curva desde tu personaje.

Todo ocurre en el navegador: sin servidor, sin dependencias y sin conectarse a la partida.

**En línea:** <https://trazador-math-wars.vercel.app>

![Captura](captura.png)

## Abrir

- En línea: <https://trazador-math-wars.vercel.app> (desplegado desde esta carpeta)
- Doble clic en `index.html` (funciona sin servidor), o
- `python3 -m http.server 8000` en esta carpeta y abrir <http://localhost:8000>.

## Cómo se usa

1. **Marca dónde estás**: arrastra el punto verde o escribe tu X e Y (en Math Wars son las
   coordenadas del plano, escala ±80).
2. **Coloca a los rivales** (diamantes) y los **obstáculos**: bloques triangulares, muros y rocas.
   Todo se arrastra y se estira.
3. **Dibuja la curva con puntos** (el lápiz ✎ de la barra, o la tecla `C`): cada toque en el plano
   añade un punto, arrástralo donde quieras y la app **busca sola la ecuación** que mejor encaja
   (recta, polinomio u ondas). Vale para cualquier forma: recta, parábola, zigzag, ola…
4. **O elige el tipo de función de la ronda** (lineal, cuadrático, seno, valor absoluto…) o escribe
   la ecuación a mano. Los parámetros (`m`, `b`, `a`, `h`, `k`…) aparecen como deslizadores.
5. **Ajusta** hasta que la curva pase por ti y esquive los bloques. La franja roja indica choque,
   con el punto exacto y la distancia.
6. **Copia la ecuación** del recuadro inferior y pégala tal cual en el chat del juego: ya lleva
   los números puestos y el desplazamiento si moviste la curva.
7. **Disparar** (`D`) para ver el recorrido de la bala.

## Curva a mano (puntos → ecuación)

| Acción | Cómo |
|---|---|
| Añadir punto | Con el lápiz activo, toca/clic en el plano |
| Mover un punto | Arrástralo (se ordena solo por X) |
| Mover toda la curva | Arrastra la línea |
| Quitar un punto | Clic derecho sobre él, o `Supr`, o la ✕ de la lista |
| Ajuste fino | Panel «Curva a mano»: Automático / Polinomio (grado 1-8) / Ondas (1-5) |
| Pasar a fórmula editable | Botón «Convertir en fórmula» |

Detalles que importan:

- La app mide el error del ajuste y lo muestra (`0,4 u` de error máximo). Si sube, añade puntos.
- **Solo la zona entre el primer y el último punto está controlada**: ahí la curva se dibuja sólida;
  fuera se dibuja punteada porque la ecuación puede desviarse.
- La ecuación se genera **con `x = 0` en tu posición** y sin notación científica (en el juego
  `2e-3` se leería como `2 · e − 3`), y siempre por debajo de 200 caracteres para que quepa en el chat.
- Todo el ajuste es álgebra de mínimos cuadrados en el navegador: sin servidor y sin enviar nada.

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
