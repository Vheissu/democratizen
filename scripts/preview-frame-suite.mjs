import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const workspace = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const root = path.join(workspace, 'dist/frame-suite/preview');
const port = Number(process.env.SUITE_PORT || 4396);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
};
await fs.access(path.join(root, 'index.html'));
http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      const target = path.resolve(
        root,
        '.' +
          decodeURIComponent(
            url.pathname === '/' ? '/index.html' : url.pathname,
          ),
      );
      if (
        !target.startsWith(root + path.sep) ||
        !['GET', 'HEAD'].includes(req.method) ||
        !['127.0.0.1', 'localhost'].includes(
          new URL(`http://${req.headers.host}`).hostname,
        )
      ) {
        res.writeHead(403).end();
        return;
      }
      const data = await fs.readFile(target);
      res.writeHead(200, {
        'Content-Type':
          types[path.extname(target)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(404).end('Not found');
    }
  })
  .listen(port, '127.0.0.1', () =>
    console.log(`Frame Apps preview: http://127.0.0.1:${port}`),
  );
