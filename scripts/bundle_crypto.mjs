// Node built-ins only. Key is supplied through the runner's secret environment.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
try {
  const keyText = process.env.REVIA_BUNDLE_KEY || '';
  if (!/^[A-Za-z0-9+/]{43}=$/.test(keyText)) throw new Error();
  const key = Buffer.from(keyText, 'base64');
  if (key.length !== 32) throw new Error();
  const slot = process.argv[3];
  if (!/^2026-10-(20|22|24|27|29|31)$/.test(slot)) throw new Error();
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length; if (size > 16*1024*1024) throw new Error();
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks);
  const aad = Buffer.from('REVIA approved column v1:' + slot);
  if (process.argv[2] === 'encrypt') {
    if (input.length > 10*1024*1024) throw new Error();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    const data = Buffer.concat([cipher.update(gzipSync(input)),cipher.final()]);
    process.stdout.write(JSON.stringify({schema:1,slot,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')}));
  } else if (process.argv[2] === 'decrypt') {
    const b = JSON.parse(input.toString());
    if (b.schema !== 1 || b.slot !== slot) throw new Error();
    const iv = Buffer.from(b.iv,'base64'), tag = Buffer.from(b.tag,'base64');
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const cipher = createDecipheriv('aes-256-gcm',key,iv);
    cipher.setAAD(aad); cipher.setAuthTag(tag);
    const data = Buffer.concat([cipher.update(Buffer.from(b.data,'base64')),cipher.final()]);
    process.stdout.write(gunzipSync(data,{maxOutputLength:10*1024*1024}));
  } else throw new Error();
} catch {
  process.stderr.write('BUNDLE_CRYPTO_FAILED\n'); process.exitCode = 1;
}
