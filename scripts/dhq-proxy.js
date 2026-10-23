// dhq-proxy.js — localhost reverse proxy to the LIVE Dispatch HQ domain.
// Serves the exact live bytes (incl. Cloudflare edge responses) on :3000 so a
// clean preview webview can load the production site. Auth cookies will be
// Secure (upstream is https) and therefore not stored by the localhost browser
// — a known artifact, noted separately when reading results.
const http = require('http');
const tls = require('tls');
const { Readable } = require('stream');

const UPSTREAM = 'dispatch-hq-deandrewharris.zocomputer.io';
const PORT = 3000;

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'transfer-encoding', 'upgrade',
  'content-length', 'content-encoding', 'proxy-authenticate',
  'proxy-authorization', 'te', 'trailer',
]);

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, `https://${UPSTREAM}`);
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (k === 'host') continue; // upstream host is set below
      headers[k] = v;
    }
    headers.host = UPSTREAM;
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const body = hasBody ? Readable.toWeb(req) : undefined;
    if (hasBody) delete headers['content-length']; // undici will chunk the web stream
    const up = await fetch(u, {
      method: req.method,
      headers,
      body,
      duplex: 'half',
      redirect: 'manual',
    });
    const outHeaders = {};
    up.headers.forEach((v, k) => {
      if (HOP_BY_HOP.has(k.toLowerCase())) return;
      outHeaders[k] = v;
    });
    res.writeHead(up.status, outHeaders);
    if (up.body) {
      const reader = up.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    }
    res.end();
  } catch (e) {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('proxy error: ' + e.message);
  }
});

// Raw TCP tunnel for WebSocket upgrades: forward the browser's exact upgrade
// request to the upstream TLS port with the Host header rewritten.
server.on('upgrade', (req, socket) => {
  console.error('[tunnel] upgrade event fired for', req.url);
  const lines = [];
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    const k = req.rawHeaders[i];
    const v = k.toLowerCase() === 'host' ? UPSTREAM : req.rawHeaders[i + 1];
    lines.push(`${k}: ${v}\r\n`);
  }
  const raw = `${req.method} ${req.url} HTTP/1.1\r\n${lines.join('')}\r\n`;
  const t = tls.connect(443, UPSTREAM, { servername: UPSTREAM }, () => {
    console.error('[tunnel] tls connected, alpn:', t.alpnProtocol);
    t.write(raw);
  });
  t.on('data', (d) => socket.write(d));
  t.on('end', () => { console.error('[tunnel] upstream FIN'); socket.end(); });
  t.on('error', (e) => { console.error('[tunnel] tls error:', e.message); socket.destroy(); });
  socket.on('data', (d) => t.write(d));
  socket.on('end', () => t.end());
  socket.on('error', (e) => { console.error('[tunnel] client error:', e.message); t.destroy(); });
  socket.on('close', (h) => console.error('[tunnel] client socket closed, hadError=', h));
});

server.listen(PORT, () => {
  console.log(`[dhq-proxy] http://localhost:${PORT} -> https://${UPSTREAM}`);
});
