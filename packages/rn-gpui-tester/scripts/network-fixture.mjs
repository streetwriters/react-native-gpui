import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import WebSocket from 'ws';

const httpPort = Number(process.env.RN_GPUI_NETWORK_HTTP_PORT ?? 43181);
const wsPort = Number(process.env.RN_GPUI_NETWORK_WS_PORT ?? 43182);
const certDir = process.env.RN_GPUI_NETWORK_CERT_DIR;
const uploadFile = '/tmp/rn-gpui-networking-upload.txt';
fs.writeFileSync(uploadFile, 'file-upload-ok');

function handleHttp(request, response) {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/text') {
    response.end('network-text-ok');
  } else if (url.pathname === '/svg') {
    response.setHeader('content-type', 'image/svg+xml');
    response.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"><rect width="120" height="80" rx="12" fill="#152238"/><path d="M18 57 43 25l19 21 14-17 26 28" fill="none" stroke="#64d2ff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="88" cy="25" r="6" fill="#ff6584"/></svg>',
    );
  } else if (url.pathname === '/json') {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ ok: true, source: 'gpui-network-fixture' }));
  } else if (url.pathname === '/redirect') {
    response.writeHead(302, { location: '/text' }).end();
  } else if (url.pathname === '/status') {
    response.writeHead(418, { 'content-type': 'text/plain' });
    response.end('status-body-readable');
  } else if (url.pathname === '/cookie/set') {
    response.setHeader('set-cookie', 'gpui-network=present; Path=/; HttpOnly');
    response.end('cookie-set');
  } else if (url.pathname === '/cookie/check') {
    response.end(request.headers.cookie ?? 'cookie-missing');
  } else if (url.pathname === '/upload') {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      console.log(
        `multipart diagnostic ${request.headers['content-type']}: ${body}`,
      );
      response.end(
        request.headers['content-type']?.includes('multipart/form-data') &&
          body.includes('hello-from-form-data') &&
          body.includes('file-upload-ok') &&
          body.includes('filename="fixture.txt"')
          ? 'multipart-ok'
          : 'multipart-invalid',
      );
    });
  } else if (url.pathname === '/blob-upload') {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      response.end(
        Buffer.concat(chunks).equals(Buffer.from([0, 1, 2, 127, 254, 255]))
          ? 'blob-upload-ok'
          : 'blob-upload-invalid',
      );
    });
  } else if (url.pathname === '/blob') {
    response.setHeader('content-type', 'application/octet-stream');
    response.end(Buffer.from([0, 1, 2, 127, 254, 255]));
  } else if (url.pathname === '/slow') {
    setTimeout(() => response.end('too-late'), 1500);
  } else if (url.pathname === '/idle') {
    setTimeout(() => response.end('network-idle-ok'), 2200);
  } else if (url.pathname === '/stream') {
    response.setHeader('content-type', 'text/plain');
    response.write('first-');
    setTimeout(() => response.write('second-'), 150);
    setTimeout(() => response.end('third'), 350);
  } else {
    response.writeHead(404).end('fixture-not-found');
  }
}

const httpServer = http.createServer(handleHttp);
httpServer.listen(httpPort, '127.0.0.1', () => {
  console.log(`GPUI network fixture listening on ${httpPort}`);
});

if (certDir) {
  const tlsServer = https.createServer(
    {
      cert: fs.readFileSync(`${certDir}/networking-test-cert.pem`),
      key: fs.readFileSync(`${certDir}/networking-test-key.pem`),
    },
    handleHttp,
  );
  const webSocketServer = new WebSocket.Server({ server: tlsServer });
  webSocketServer.on('connection', socket => {
    console.log('WSS connected');
    socket.on('message', message => {
      const isBinary = Buffer.isBuffer(message);
      console.log(
        `WSS received ${isBinary ? 'binary' : 'text'} ${message.length} bytes`,
      );
      socket.send(message, { binary: isBinary });
    });
    socket.on('close', (code, reason) => {
      console.log(`WSS closed ${code} ${reason.toString()}`);
    });
    socket.on('error', error => console.log(`WSS error ${error.message}`));
  });
  tlsServer.listen(wsPort, '127.0.0.1');
}
