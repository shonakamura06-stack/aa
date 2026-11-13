// Servidor estático mínimo, sin dependencias.
// Sirve la app y expone /src para que el navegador importe el mismo motor
// que usan las pruebas (una sola implementación de la física).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * Endpoint de la validación real: ejecuta la misma evaluación que la CLI y
 * devuelve el JSON que pinta el panel de la UI.
 *
 * Por qué existe: el informe de visión tiene que poder mirarse sin abrir una
 * terminal, pero la UI NO puede importar `realEval.js` (usa `node:fs`). Así que
 * el cálculo se queda en el servidor y el navegador sólo pinta.
 *
 * Se cachea el resultado: la evaluación entera tarda ~12 s y no cambia mientras
 * no cambien el corpus ni el clasificador.
 */
let cacheValidacion = null;
async function validacionReal() {
  if (cacheValidacion) return cacheValidacion;
  const { loadRealCorpusFs, evaluateRealCorpus } = await import('../src/vision/realEval.js');
  const dir = path.join(root, 'corpus/real');
  const { casos, errores } = loadRealCorpusFs({
    dir,
    readFile: (f) => fs.readFileSync(f),
    readDir: (d) => fs.readdirSync(d),
  });
  const r = evaluateRealCorpus(casos);
  cacheValidacion = {
    capturas: r.agregado.capturas,
    niveles: r.agregado.niveles,
    objetos: r.agregado.objetos,
    vacias: r.agregado.vacias,
    porClase: r.porClase,
    confusiones: r.confusiones,
    pliegues: r.pliegues.map((p) => ({
      grupo: p.grupo,
      dev: p.dev,
      eval: p.eval,
      ok: p.resumen.objetos.correctos,
      equivocadas: p.resumen.objetos.erroneos,
      abstenidas: p.resumen.objetos.abstenidos,
      inventadas: p.resumen.vacias.inventadas,
    })),
    errores,
  };
  return cacheValidacion;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/validacion-real') {
    try {
      const data = await validacionReal();
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-frame-options': 'ALLOWALL',
        'access-control-allow-origin': '*',
      });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/public/index.html';
  if (rel.startsWith('/src/')) rel = rel; // se resuelve debajo
  const filePath = path.join(root, rel);
  if (!filePath.startsWith(root)) { res.writeHead(403).end('Prohibido'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('No encontrado: ' + rel);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': 'no-store',
      // Permite el preview embebido en iframe de cualquier origen.
      'x-frame-options': 'ALLOWALL',
      'access-control-allow-origin': '*',
    });
    res.end(data);
  });
});

server.listen(port, host, () => {
  console.log(`BoomSolver en http://${host}:${port}`);
});
