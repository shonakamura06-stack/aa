# toolkit — capacidades que el sandbox NO trae, ya resueltas

Todo lo de aquí fue **ejecutado y verificado** en el sandbox (2026-10-30), no copiado de documentación.
Objetivo: que una sesión nueva pase de "no puedo renderizar ni ver vídeo" a "puedo" en ~2 minutos.

## Arranque

```bash
bash toolkit/bootstrap.sh
export LD_LIBRARY_PATH=/home/user/lib   # necesario en cada shell
```

## Qué desbloquea, y qué costó descubrirlo

| Capacidad | Antes | Ahora | Cómo |
|---|---|---|---|
| **Chromium real** | 🔴 `npx playwright install` falla (CDN bloqueado) | ✅ v153 headless | El binario viene **dentro del tarball npm** de `@sparticuz/chromium` (nada de CDN) |
| **Arrancar Chromium** | 🔴 faltaban `libnss3/libnspr4/libplc4/libplds4` y **no hay apt** | ✅ | `libnss3.so`+`libnssutil3.so` versionadas aquí (1.4 MB); **NSPR compilado con gcc** desde `servo/nspr` |
| **Screenshots / validación visual** | 🔴 no podía ver el resultado | ✅ | Puppeteer + Playwright contra `/tmp/chromium` |
| **PDF de una página** | 🟡 solo `pdf-lib` (dibujo a mano) | ✅ `page.pdf()` real | Chromium |
| **Lighthouse / Core Web Vitals** | 🔴 imposible | ✅ performance 100 / a11y 86 medidos | `lighthouse` + `chrome-launcher` con `chromePath` |
| **E2E de navegador** | 🔴 no | ✅ | `playwright` con `executablePath` (sin descargar navegadores) |
| **Fuentes** | 🔴 `fc-list` = 0 fuentes | ✅ 14 TTF | `@fontsource/*` woff2 → TTF con `fonttools` (PyPI) |
| **Diseño gráfico** | 🟡 solo `convert` de IM6 | ✅ | `satori` (flexbox→SVG) + `@resvg/resvg-js` + `@napi-rs/canvas` + `sharp` |
| **Vídeo / audio** | 🔴 sin ffmpeg | ✅ ffmpeg estático 2018 | `@ffmpeg-installer/ffmpeg` (binario en npm) |
| **Documentos** | 🔴 sin pandoc/libreoffice | ✅ PDF/DOCX/PPTX/XLSX nativos | `pdf-lib`, `docx`, `pptxgenjs`, `exceljs` |
| **Analítica sobre archivos** | 🟡 csv con stdlib | ✅ DuckDB embebido | `@duckdb/node-api` (SQL real sobre parquet/csv) |
| **Animación** | 🟡 CSS a mano | ✅ | `gsap`, `motion` |

## Plantillas

* `templates/poster.mjs` — cartel 1200×630 con flexbox real, gradientes, tipografía y jerarquía.
  Sustituye el texto y tienes portada, OG image, slide o banner.

## Recetas verificadas

```bash
# screenshot de cualquier página servida en el sandbox
export LD_LIBRARY_PATH=/home/user/lib
node -e "import('puppeteer-core').then(async({default:p})=>{const b=await p.launch({executablePath:'/tmp/chromium',args:['--no-sandbox']});const g=await b.newPage();await g.setViewport({width:1440,height:900});await g.goto('http://localhost:8080',{waitUntil:'networkidle0'});await g.screenshot({path:'/tmp/shot.png'});await b.close()})"

# vídeo a partir de capturas (timelapse de diseño)
ffmpeg -framerate 24 -i /tmp/frames/%04d.png -c:v libx264 -pix_fmt yuv420p /tmp/out.mp4
```

## Lo que sigue sin ser posible (y su rodeo)

| Falta | Rodeo |
|---|---|
| Docker / Postgres / Redis locales | SQLite (`node:sqlite`) o Supabase por conector |
| Java / Go / Rust / PHP / .NET / Ruby | Código + CI en GitHub Actions |
| `pandoc`, `libreoffice` | `pdf-lib`/`docx`/`pptxgenjs` (no convierten DOCX→PDF) |
| Emuladores Android/iOS | Simulación web + PWA |
| WebGL pesado en capturas | `--use-gl=swiftshader` (lento, 2 vCPU) |
