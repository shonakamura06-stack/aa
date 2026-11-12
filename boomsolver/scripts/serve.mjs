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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
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
