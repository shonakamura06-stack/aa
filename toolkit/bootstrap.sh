#!/usr/bin/env bash
# bootstrap.sh — reconstruye en ~2 minutos las capacidades que el sandbox NO trae.
# Uso:  bash toolkit/bootstrap.sh
# Qué hace: Chromium real + librerías nativas + fuentes + herramientas de render y vídeo.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export WORK="${WORK:-/tmp/toolkit}"
mkdir -p "$WORK"
echo "== 1/5 librerías NSS/NSPR (ya versionadas en este repo) =="
mkdir -p /home/user/lib && cp "$ROOT"/lib/*.so /home/user/lib/
echo "== 2/5 fuentes =="
mkdir -p /home/user/lib/fonts && cp "$ROOT"/fonts/*.ttf /home/user/lib/fonts/
echo "== 3/5 Chromium (viene dentro del tarball npm, sin CDN) =="
cd "$WORK" && [ -f package.json ] || npm init -y >/dev/null
npm i --silent @sparticuz/chromium puppeteer-core playwright lighthouse chrome-launcher >/dev/null
node --input-type=module -e "import c from '@sparticuz/chromium'; console.log('chromium:', await c.executablePath())"
echo "== 4/5 utilidades de render, documentos y vídeo =="
npm i --silent satori @resvg/resvg-js @napi-rs/canvas sharp @ffmpeg-installer/ffmpeg \
  pdf-lib docx pptxgenjs exceljs katex gsap motion lucide-react @duckdb/node-api >/dev/null
echo "== 5/5 verificación =="
LD_LIBRARY_PATH=/home/user/lib node --input-type=module -e "
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({args:[...chromium.args,'--no-sandbox'],executablePath:'/tmp/chromium',headless:'shell'});
const p = await b.newPage(); await p.setContent('<h1>ok</h1>');
console.log('CHROMIUM OK:', await p.\$eval('h1', e=>e.textContent)); await b.close();
"
echo "LISTO. Exporta en cada uso:  export LD_LIBRARY_PATH=/home/user/lib"
echo "Atajo para Playwright:  chromium.launch({executablePath:'/tmp/chromium', args:['--no-sandbox']})"
