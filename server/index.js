'use strict';
/*
 * CV Studio server — plain node:http, no framework needed.
 *   GET  /api/templates        template catalog metadata
 *   POST /api/export/pdf       { templateId, data, settings } -> application/pdf
 *   POST /api/export/docx      { templateId, data, settings } -> .docx
 *   GET  /*                    static SPA (history-API fallback to index.html)
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const CV = require('../shared/cv.js');
const { buildDocx } = require('./docx.js');
const { buildPdf, closeBrowser } = require('./pdf.js');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const STATIC = [['/shared/', path.join(ROOT, 'shared')], ['/', PUBLIC]];
const MAX_BODY = 4 * 1024 * 1024; // photos are resized client-side; 4 MB is plenty

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json',
  '.woff2': 'font/woff2',
};

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}
const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (!/^application\/json/i.test(req.headers['content-type'] || '')) return reject(new HttpError(415, 'Send the CV as JSON.'));
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new HttpError(413, 'CV data is too large (max 4 MB). Try a smaller photo.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'CV data is not valid JSON.')); }
    });
    req.on('error', reject);
  });
}

function fileName(data, ext) {
  const base = String(data?.personal?.fullName || 'cv').normalize('NFC').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'cv';
  return `${base}-CV.${ext}`;
}

async function exportRoute(req, res, kind) {
  const body = await readJson(req);
  const templateId = CV.TEMPLATES.some((t) => t.id === body.templateId) ? body.templateId : null;
  if (!templateId) throw new HttpError(400, 'Unknown template.');
  const data = CV.normalize(body.data);
  const settings = { accent: CV.normalizeHex(body.settings?.accent, undefined), font: body.settings?.font, lang: body.settings?.lang };
  const started = Date.now();
  let buf, type;
  if (kind === 'pdf') {
    try { buf = await buildPdf(templateId, data, settings); } catch (err) {
      console.error('[pdf] render failed:', err.message);
      throw new HttpError(503, 'PDF export is unavailable: the server could not start Chrome. See README → PDF export.');
    }
    type = 'application/pdf';
  } else {
    buf = await buildDocx(templateId, data, settings);
    type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  console.log(`[export] ${kind} template=${templateId} bytes=${buf.length} ms=${Date.now() - started}`);
  const name = fileName(data, kind);
  send(res, 200, buf, {
    'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="${name.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/"/g, '') || 'CV.' + kind}"; filename*=UTF-8''${encodeURIComponent(name)}`,
  });
}

function serveStatic(req, res, urlPath) {
  for (const [prefix, dir] of STATIC) {
    if (!urlPath.startsWith(prefix)) continue;
    const rel = decodeURIComponent(urlPath.slice(prefix.length)) || 'index.html';
    const file = path.normalize(path.join(dir, rel));
    if (!file.startsWith(dir + path.sep) && file !== dir) return send(res, 403, 'Forbidden');
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const ext = path.extname(file);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' });
      return fs.createReadStream(file).pipe(res);
    }
    if (prefix === '/shared/') return send(res, 404, 'Not found');
  }
  // SPA fallback: any unknown non-file path renders the app shell
  if (!path.extname(urlPath)) {
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
    return fs.createReadStream(path.join(PUBLIC, 'index.html')).pipe(res);
  }
  send(res, 404, 'Not found');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/health') return json(res, 200, { ok: true });
    if (url.pathname === '/api/templates' && req.method === 'GET') {
      return json(res, 200, CV.TEMPLATES.map(({ id, name, category, blurb, accent, font, photo }) => ({ id, name, category, blurb, accent, font, photo })));
    }
    if (url.pathname === '/api/export/pdf' && req.method === 'POST') return await exportRoute(req, res, 'pdf');
    if (url.pathname === '/api/export/docx' && req.method === 'POST') return await exportRoute(req, res, 'docx');
    if (url.pathname.startsWith('/api/')) throw new HttpError(404, 'No such API route.');
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500 && !err.status) console.error('[error]', req.method, url.pathname, err);
    if (!res.headersSent) json(res, status, { error: err.status ? err.message : 'Something went wrong while building your file. Try again.' });
    else res.destroy();
  }
});

server.listen(PORT, HOST, () => console.log(`CV Studio running at http://localhost:${PORT}`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, async () => { await closeBrowser(); process.exit(0); });
