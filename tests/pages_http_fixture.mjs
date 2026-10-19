// Local contract fixture: real generated Workers + ASSETS/static headers; no outbound network.
// Zone-level HTTP/apex redirects are modeled here, not evidence of deployed Cloudflare rules.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const [productionDir, previewDir] = process.argv.slice(2);
const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp',
  '.svg':'image/svg+xml', '.xml':'application/xml', '.txt':'text/plain',
  '.webmanifest':'application/manifest+json', '.bin':'application/octet-stream' };
const sites = [];
for (const directory of [productionDir, previewDir]) {
  const source = await readFile(resolve(directory, '_worker.js'), 'utf8');
  const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const routing = JSON.parse(await readFile(resolve(directory, '_routes.json'), 'utf8'));
  const headerText = await readFile(resolve(directory, '_headers'), 'utf8');
  const staticHeaders = Object.fromEntries([...headerText.matchAll(/^  ([^:]+): (.+)$/gm)].map(m => [m[1],m[2]]));
  const excluded = routing.exclude.map(pattern => new RegExp('^' + pattern.replace(/[.]/g, '\\.').replaceAll('*', '.*') + '$'));
  const asset = async request => {
    const path = resolve(directory, '.' + new URL(request.url).pathname);
    if (!path.startsWith(resolve(directory) + sep)) return new Response(null, { status:404 });
    try {
      const data = await readFile(path);
      return new Response(request.method === 'HEAD' ? null : data,
        {headers:{ 'Content-Type':mime[extname(path)] || 'application/octet-stream', ...staticHeaders }});
    } catch { return new Response(null, {status:404}); }
  };
  sites.push({ worker, excluded, asset });
}
const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.headers['x-revia-fixture-url'] || 'http://invalid/');
    if (!['www.revia.website','revia.website','validation.pages.dev',
           'revia-website-production.pages.dev',
           'canary.revia-website-production.pages.dev'].includes(url.hostname)) throw Error('Unknown fixture host');
    const preview = url.hostname === 'validation.pages.dev';
    let response;
    if (!preview && (url.protocol === 'http:' || url.hostname === 'revia.website')) {
      url.protocol = 'https:'; url.hostname = 'www.revia.website';
      response = new Response(null, { status:308, headers:{ Location:url.href }});
    } else {
      const site = sites[preview ? 1 : 0];
      const chunks = [];
      for await (const chunk of incoming) chunks.push(chunk);
      const request = new Request(url, {method:incoming.method,
        ...(incoming.method === 'POST' ? {body:Buffer.concat(chunks)} : {})});
      response = site.excluded.some(pattern => pattern.test(url.pathname))
        ? await site.asset(request)
        : await site.worker.fetch(request, { ASSETS:{ fetch:site.asset } });
    }
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500); outgoing.end('Fixture failed');
  }
});
server.listen(0, '127.0.0.1', () => console.log(server.address().port));
