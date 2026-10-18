#!/usr/bin/env node
/**
 * WebDJ - zero-dependency static development server (Node).
 *
 * Why not `python3 -m http.server`?
 *   - It sends no cache headers, so after editing CSS/JS the browser can serve a
 *     stale mix of old and new files and the app breaks with a JS error.
 *   - It has a tiny accept backlog and no HTTP Range support.
 *
 * This server sends `Cache-Control: no-store`, correct MIME types (a wrong
 * `Content-Type` makes the browser refuse to run the JS/CSS) and Range support
 * so audio seeking works.
 *
 * Usage:
 *   npm run dev              # recommended
 *   node dev-server.mjs 8000
 */

import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 8000);
const HOST = '127.0.0.1';
const NO_CACHE = 'no-store, must-revalidate';

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.oga': 'audio/ogg',
    '.opus': 'audio/opus',
    '.flac': 'audio/flac',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2'
};

/**
 * Resolve a request path to a file inside ROOT (never outside of it).
 */
function resolveFile(urlPath) {
    let decoded;
    try {
        decoded = decodeURIComponent(urlPath);
    } catch {
        return null;
    }

    const target = resolve(join(ROOT, normalize(decoded)));
    if (target !== ROOT && !target.startsWith(ROOT + sep)) return null;

    let stats;
    try {
        stats = statSync(target);
    } catch {
        return null;
    }

    if (stats.isDirectory()) {
        const indexPath = join(target, 'index.html');
        try {
            return { path: indexPath, stats: statSync(indexPath) };
        } catch {
            return null;
        }
    }

    return { path: target, stats };
}

/**
 * Parse a `Range: bytes=...` header. Returns {start, end} or null.
 */
function parseRange(header, size) {
    const match = /^bytes=(\d*)-(\d*)$/.exec((header || '').trim());
    if (!match) return null;

    const [, rawStart, rawEnd] = match;
    if (rawStart === '' && rawEnd === '') return null;

    let start;
    let end;
    if (rawStart === '') {
        // Suffix range: the last N bytes.
        const suffix = Number(rawEnd);
        if (!Number.isFinite(suffix) || suffix <= 0) return null;
        start = Math.max(0, size - suffix);
        end = size - 1;
    } else {
        start = Number(rawStart);
        end = rawEnd === '' ? size - 1 : Number(rawEnd);
    }

    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
        return null;
    }

    return { start, end: Math.min(end, size - 1) };
}

function sendError(res, status, message) {
    const body = `${status} ${message}\n`;
    res.writeHead(status, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Cache-Control': NO_CACHE
    });
    res.end(body);
}

const server = createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD', 'Cache-Control': NO_CACHE });
        res.end();
        return;
    }

    const urlPath = new URL(req.url, `http://${HOST}`).pathname;
    const found = resolveFile(urlPath);

    if (!found) {
        console.log(`404 ${req.method} ${urlPath}`);
        sendError(res, 404, 'Not Found');
        return;
    }

    const { path: filePath, stats } = found;
    const headers = {
        'Content-Type': MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': NO_CACHE,
        'Accept-Ranges': 'bytes'
    };

    const range = parseRange(req.headers.range, stats.size);

    if (req.headers.range && !range) {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stats.size}` });
        res.end();
        return;
    }

    if (range) {
        const { start, end } = range;
        console.log(`206 ${req.method} ${urlPath}`);
        res.writeHead(206, {
            ...headers,
            'Content-Range': `bytes ${start}-${end}/${stats.size}`,
            'Content-Length': end - start + 1
        });
        if (req.method === 'HEAD') {
            res.end();
            return;
        }
        createReadStream(filePath, { start, end }).pipe(res);
        return;
    }

    console.log(`200 ${req.method} ${urlPath}`);
    res.writeHead(200, { ...headers, 'Content-Length': stats.size });
    if (req.method === 'HEAD') {
        res.end();
        return;
    }
    createReadStream(filePath).pipe(res);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Try another one: node dev-server.mjs ${PORT + 1}`);
    } else {
        console.error(err);
    }
    process.exit(1);
});

server.listen(PORT, HOST, () => {
    console.log(`WebDJ dev server -> http://localhost:${PORT}`);
    console.log('Cache disabled (no-store). Press Ctrl+C to stop.');
});
