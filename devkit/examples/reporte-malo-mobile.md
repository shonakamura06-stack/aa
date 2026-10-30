# Auditoría de diseño e interfaz

**Objetivo:** `test/fixtures/bad.html`  
**Viewport:** 390×844  
**Fecha:** 2026-10-30 14:28:55 UTC  
**Puntuación del motor:** 0/100

| Métrica | Valor |
|---|---|
| Errores | 9 |
| Advertencias | 5 |
| Observaciones | 0 |
| Elementos en el DOM | 15 |
| Elementos de texto | 11 |
| Controles interactivos | 5 |
| Alto de página | 844px (1.0 pantallas) |
| Ocupación visual | 63.0% del área |

## Escala tipográfica medida

| Tamaño | Usos |
|---:|---:|
| 26px | 1 |
| 18px | 1 |
| 17px | 1 |
| 16px | 2 |
| 14px | 1 |
| 13px | 1 |
| 11px | 4 |

**Familias en uso:** `Arial` (11)

## Hallazgos

### 🔴 Contraste insuficiente 1.33:1 (mín 4.5:1)

`contraste` · `contrast-wcag`

Texto rgb(139, 150, 255) sobre rgb(107, 124, 255) a 11px. APCA Lc -10.5 → invisible / no usar.

```
"Inicio" · <a>
```

### 🔴 Contraste insuficiente 1.88:1 (mín 4.5:1)

`contraste` · `contrast-wcag`

Texto rgb(185, 185, 185) sobre rgb(250, 250, 250) a 18px. APCA Lc 34.8 → decorativo, no legible.

```
"Este párrafo es demasiado ancho, tiene poco contraste y sirv" · <p>
```

### 🔴 Contraste insuficiente 3.53:1 (mín 4.5:1)

`contraste` · `contrast-wcag`

Texto rgb(255, 255, 255) sobre rgb(107, 124, 255) a 11px. APCA Lc -68 → mínimo (cuerpo grande / ≥18px).

```
"Comprar" · <button.btn>
```

### 🔴 5 controles por debajo de 44×44px

`interacción` · `tap-targets`

WCAG 2.5.5 (AAA) pide 44×44. 2.5.8 (AA) pide 24×24 con separación.

```
<a> 31×15 "Inicio" | <a> 51×15 "Producto" | <a> 35×15 "Precio" | <button> 52×17 "Comprar" | <a> 53×19 "enlace"
```

### 🔴 5 controles incumplen incluso el mínimo AA (24×24)

`interacción` · `tap-targets-aa`

Riesgo real de toques erróneos en móvil.

```
31×15, 51×15, 35×15, 52×17, 53×19
```

### 🔴 1 imágenes sin atributo alt

`contenido` · `img-alt`

Un alt="" es válido para decorativas; ausente es un fallo de accesibilidad.

```
if;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==
```

### 🔴 Scroll horizontal en el documento

`layout` · `h-scroll`

scrollWidth 1412 > clientWidth 390. Rompe la percepción de "app".

```
<p.> right=1412
```

### 🔴 Ningún elemento muestra indicador de foco

`accesibilidad` · `no-focus`

Navegación por teclado imposible de seguir. Revisar outline:none sin reemplazo.

```
5 elementos enfocados, ninguno cambió outline/border/shadow
```

### 🔴 Falta meta viewport

`responsive` · `no-viewport-meta`

Sin ella el móvil renderiza a 980px y hace zoom-out.

### 🟡 6 valores de espaciado fuera de la retícula de 4px

`espaciado` · `spacing-no-grid`

Una retícula (4 u 8 px) produce alineación consistente entre componentes.

```
3px×6, 9px×6, 7px×5, 2px×4, 5px×3, 13px×3
```

### 🟡 1 imágenes sin width/height

`rendimiento` · `img-dims`

Sin dimensiones reservadas el navegador no puede reservar espacio → CLS.

```
if;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==
```

### 🟡 Salto de nivel h1 → h3

`estructura` · `heading-skip`

Los saltos rompen la navegación por lectores de pantalla.

```
"Subtítulo que se salta un nivel"
```

### 🟡 Falta meta description

`seo` · `no-meta-description`

Afecta al CTR en resultados de búsqueda.

### 🟡 Falta lang en <html>

`accesibilidad` · `no-lang`

Los lectores de pantalla eligen la pronunciación con lang.

## axe-core (WCAG 2.1 AA)

| Regla | Impacto | Nodos | Descripción |
|---|---|---:|---|
| `color-contrast` | serious | 4 | Elements must meet minimum color contrast ratio thresholds |
| `html-has-lang` | serious | 1 | <html> element must have a lang attribute |
| `image-alt` | critical | 1 | Images must have alternative text |
