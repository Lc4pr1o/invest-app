// Servidor minimo local so para testar o index.html com as functions /api/*
// (nao roda em producao, a Vercel serve as functions de verdade).
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const envPath = path.join(ROOT, '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.replace(/\r$/, '').match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2];
}

const routes = {
    '/api/fundamentals': (await import('../api/fundamentals.js')).default,
    '/api/quote': (await import('../api/quote.js')).default,
    '/api/search': (await import('../api/search.js')).default,
    '/api/dividends': (await import('../api/dividends.js')).default
};

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const handler = routes[url.pathname];

    if (handler) {
        const query = Object.fromEntries(url.searchParams);
        const fauxRes = {
            setHeader: (k, v) => res.setHeader(k, v),
            status(code) { res.statusCode = code; return this; },
            json(data) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); },
            end() { res.end(); }
        };
        await handler({ method: req.method, query }, fauxRes);
        return;
    }

    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    filePath = path.join(ROOT, filePath);
    fs.readFile(filePath, (err, data) => {
        if (err) { res.statusCode = 404; res.end('not found'); return; }
        res.setHeader('Content-Type', filePath.endsWith('.html') ? 'text/html' : 'text/plain');
        res.end(data);
    });
});

const PORT = 8792;
server.listen(PORT, () => console.log(`dev server on http://localhost:${PORT}`));
