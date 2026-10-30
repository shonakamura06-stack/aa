# devkit

Entorno de desarrollo **verificado** para el sandbox. No es una colección de scripts: es un CLI con
navegador real, motor de auditoría medido, generador de design tokens accesibles, regresión visual y
una puerta de calidad para CI.

Todo lo que aparece aquí se ejecutó; los números del §Resultados son salida real, no estimaciones.

---

## Por qué existe

Sin esto, el trabajo de interfaz se hacía a ciegas: el sandbox no trae navegador (la descarga de
Playwright está bloqueada), no tiene fuentes, y `apt` no tiene repositorios. Consecuencia: no se podía
*ver* una página, ni *medir* contraste, ni comprobar que un cambio no rompió el layout.

`devkit` cierra ese hueco con tres piezas:

1. **Chromium real** obtenido de un tarball npm (`@sparticuz/chromium`) con las librerías NSS/NSPR que
   faltaban, compiladas desde fuente con gcc. Ver `../toolkit/`.
2. **Un motor que mide, no opina.** Todo hallazgo sale de `getComputedStyle` y
   `getBoundingClientRect` sobre el layout ya calculado por Chromium.
3. **Un sistema de diseño que se calcula.** Los colores no se eligen a ojo: se derivan de Radix y se
   corrigen hasta cumplir WCAG AA, verificado por tests.

---

## Instalación

```bash
bash ../toolkit/bootstrap.sh      # binario + librerías + fuentes (~2 min)
cd devkit && npm ci
node bin/devkit.mjs doctor        # cada capacidad se autoverifica
```

`node_modules` pesa 362 MB y **no** sobrevive a los snapshots del workspace. Para no reinstalar en cada
sesión, el archivo real vive fuera del repo y aquí solo hay un symlink:

```bash
mkdir -p ~/devkit-archive && cp package*.json ~/devkit-archive/ && (cd ~/devkit-archive && npm ci)
rm -rf devkit/node_modules && ln -s ~/devkit-archive/node_modules devkit/node_modules
```

---

## Comandos

| Comando | Qué hace | Salida |
|---|---|---|
| `devkit doctor [--json]` | Verifica navegador, librerías, fuentes, módulos y binarios | tabla + exit 1 si algo crítico falta |
| `devkit shot <url> [--viewport vp] [--full] [--dark]` | Captura real | PNG + JSON con ms y bytes |
| `devkit audit <url> [--viewport vp] [--lighthouse] [--json]` | Auditoría completa | `.md` + `.json` en `reports/` |
| `devkit check <url> [--max-errors 0] [--min-score 90]` | **Gate de CI** | exit 1 si empeora |
| `devkit vdiff <nombre> <url> [--update]` | Regresión visual por píxel | exit 2 si difiere |
| `devkit pdf <url> [--out x.pdf]` | PDF de la página renderizada | PDF |
| `devkit tokens` | Regenera `reference/tokens.*` | CSS + JSON + tarjeta HTML |
| `devkit render [--template poster.mjs]` | Diseño gráfico sin navegador (satori→PNG) | PNG |
| `devkit list` | Baselines y reportes | — |

Viewports: `desktop` 1440×900 · `laptop` 1280×800 · `tablet` 834×1112 · `mobile` 390×844 ·
`mobile-lg` 430×932 · `og` 1200×630.

---

## Qué mide el motor

**Contraste** — WCAG 2.1 (ratio 1–21, umbral 4.5 / 3 para texto grande) **y** APCA 0.98G (Lc, el modelo
perceptual del borrador de WCAG 3). Compone alfa sobre el fondo efectivo subiendo por los ancestros.
Un color que pasa WCAG pero rinde mal en APCA se reporta como advertencia, no como éxito.

**Tipografía** — número de pasos, colisiones (ratio < 1.08), familias en uso, medida de línea
(caracteres por línea, no píxeles), presencia del cuerpo base.

**Espaciado** — cuántos valores distintos y cuántos caen fuera de la retícula de 4 px.

**Interacción** — objetivos táctiles contra 44×44 (WCAG 2.5.5) y 24×24 (2.5.8), indicador de foco
comprobado **enfocando de verdad** cada control y comparando `outline`, `border`, `box-shadow` y
`background` antes y después.

**Layout** — scroll horizontal, elementos que desbordan el viewport, ocupación visual, altura en
pantallas.

**Estructura** — jerarquía de encabezados (saltos), `h1` único, `lang`, meta viewport, meta description,
imágenes sin `alt` o sin dimensiones, formularios sin etiqueta.

**Estándar externo** — `axe-core` con las reglas WCAG 2.1 A/AA, para no depender solo del criterio propio.

Con `--lighthouse`: LCP, FCP, CLS, TBT, Speed Index y las cuatro categorías, con Chromium real.

---

## Design tokens

`devkit tokens` genera:

- **96 colores** (8 familias × 12 pasos semánticos de Radix) en claro y oscuro.
- **Sólidos accesibles calculados**: se toma el paso 9, se mide contra blanco y negro, y si no llega a
  4.5:1 se **oscurece iterativamente** hasta cumplirlo. Se usa blanco por convención; negro solo cuando
  el color es tan claro (amarillos) que el blanco sería ilegible.
- **Escalas modulares** (1.125 / 1.200 / 1.250 / 1.333) sobre base 16 px.
- **Retícula de espaciado** estricta de 4 px (más `--space-px` y `--space-half` explícitamente fuera de retícula para hairlines).
- Radios, sombras, easings y duraciones, con `prefers-reduced-motion` a cero.
- `tokens.html`: tarjeta visual autogenerada, para ver la paleta y la escala renderizadas.

**Corrección medida en este repo:** 6 de 8 sólidos de Radix **no** cumplen AA con texto blanco
(`blue-9 #0090ff` da 3.26:1). Los tokens generados usan las variantes corregidas (`#0076d1` → 4.65:1).
Esto se comprueba en `test/tokens.test.mjs`, no se confía.

---

## Resultados reales

| Verificación | Resultado |
|---|---|
| Tests (`npm test`) | **20/20** |
| `audit` de `test/fixtures/good.html` | **100/100**, 0 errores, axe sin violaciones |
| `audit` de `test/fixtures/bad.html` | **0–5/100**, 8 errores, 14 hallazgos, axe: 3 reglas |
| `check` sobre la interfaz buena | exit 0 |
| `check` sobre la interfaz mala | exit 1 con la lista de errores |
| `vdiff` sin cambios | 0 píxeles distintos |
| `vdiff` tras cambiar un radio | 162 píxeles, exit 2 |
| Determinismo | dos ejecuciones producen hallazgos idénticos |
| Lighthouse sobre la interfaz de referencia | performance **100**, accessibility **100**, best-practices 96, SEO **100** · LCP 0,8 s · CLS 0 · TBT 0 ms |
| CI en GitHub Actions (Chromium del sistema) | ✅ verde: tests + tokens sin deriva + gate de diseño |

---

## Estructura

```
devkit/
├── bin/devkit.mjs        CLI (doctor, shot, audit, check, vdiff, pdf, tokens, render)
├── bin/tokens.mjs        generador de design system con corrección de contraste
├── lib/color.mjs         WCAG 2.1 + APCA 0.98G, composición alfa
├── lib/browser.mjs       lanzador único (libs, fuentes, viewports, emulación)
├── lib/design-audit.mjs  recolección en el DOM + reglas de análisis
├── lib/report.mjs        Markdown y JSON estables
├── lib/vdiff.mjs         diff por píxel con pngjs + pixelmatch
├── reference/            tokens generados (CSS, JSON, tarjeta HTML)
├── templates/            plantillas de diseño (satori)
├── baselines/            capturas de referencia para regresión
└── test/                 20 tests + fixtures buena/mala
```

---

## CI

`.github/workflows/devkit.yml` ejecuta lo que el sandbox no puede:

- Node 22 sobre Ubuntu,
- Chromium del sistema (`browser-actions/setup-chrome`), no el binario del sandbox,
- las fuentes del repo (`FONT_DIR=toolkit/fonts`), para que las capturas sean idénticas a las locales,
- anotaciones `::error::` con el detalle de cada hallazgo: el fallo se explica sin abrir los logs,
- tests, regeneración de tokens con detección de deriva (`git diff --exit-code`),
- gate de diseño sobre la interfaz de referencia,
- aviso si se commitea un archivo > 3 MB.

Es la parte que demuestra que esto no depende de esta máquina.
