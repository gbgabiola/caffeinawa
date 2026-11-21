import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// Run decoder failures outside Vitest so a delayed uncaught stream error cannot
// terminate the test runner or be hidden by an in-process error handler.
const probe = String.raw`
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { gzipSync, deflateSync, brotliCompressSync } from 'node:zlib';
import { ExpressAdapter } from '@nestjs/platform-express';

const encoding = process.argv[1];
const compress = { gzip: gzipSync, deflate: deflateSync, br: brotliCompressSync }[encoding];
const adapter = new ExpressAdapter();
// This is the same default parser registration used by Nest with rawBody:true.
adapter.registerParserMiddleware('', true);
const app = adapter.getInstance();
app.post('/echo', (req, res) => res.json({
  body: req.body,
  raw: req.rawBody?.toString('utf8'),
}));
app.get('/health', (_req, res) => res.sendStatus(200));
app.use((error, _req, res, _next) => res.sendStatus(error.status ?? 500));
const server = createServer(app);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const payload = JSON.stringify({ message: 'Caffeinawa ☕', amount: 12500 });
async function send(body, contentType = 'application/json', contentEncoding) {
  return fetch(origin + '/echo', {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
      ...(contentEncoding ? { 'Content-Encoding': contentEncoding } : {}),
    },
    body,
    signal: AbortSignal.timeout(3000),
  });
}
try {
  const plain = await send(payload);
  assert.equal(plain.status, 200);
  assert.deepEqual(await plain.json(), { body: JSON.parse(payload), raw: payload });

  const form = await send('drink[name]=Latte&quantity=2', 'application/x-www-form-urlencoded');
  assert.equal(form.status, 200);
  assert.deepEqual((await form.json()).body, { drink: { name: 'Latte' }, quantity: '2' });

  const compressed = compress(Buffer.from(payload));
  const valid = await send(compressed, 'application/json', encoding);
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { body: JSON.parse(payload), raw: payload });

  const trailing = await send(Buffer.concat([compressed, Buffer.from('trailing-bytes')]), 'application/json', encoding);
  // Decoders differ in their treatment of trailing bytes. Either a correctly
  // decoded body or a rejected request is safe; a server error/process exit is not.
  assert.ok([200, 400].includes(trailing.status), 'Unexpected trailing-byte status: ' + trailing.status);
  if (trailing.status === 200) {
    assert.deepEqual(await trailing.json(), { body: JSON.parse(payload), raw: payload });
  } else {
    await trailing.arrayBuffer();
  }
  const truncated = await send(compressed.subarray(0, Math.floor(compressed.length / 2)), 'application/json', encoding);
  assert.equal(truncated.status, 400);
  await truncated.arrayBuffer();
  // Let deferred decompression errors surface before checking continued service.
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal((await fetch(origin + '/health')).status, 200);
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
`;

describe('Default Nest/Express request body parsers', () => {
  it.each(['gzip', 'deflate', 'br'])(
    'preserves JSON/raw bytes and survives malformed %s requests',
    (encoding) => {
      const result = spawnSync(
        process.execPath,
        ['--input-type=module', '-e', probe, encoding],
        {
          cwd: import.meta.dirname + '/../..',
          encoding: 'utf8',
          timeout: 15_000,
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.signal, result.stderr).toBeNull();
      expect(result.status, result.stderr).toBe(0);
    },
    20_000,
  );
});
