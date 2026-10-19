const ROUTES = __ROUTES__;
const PUBLIC_FILES = new Set(__PUBLIC_FILES__);
const PRODUCTION_APPROVED = __PRODUCTION_APPROVED__;
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'none'; form-action 'none'; base-uri 'self'";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const preview = !PRODUCTION_APPROVED || url.hostname !== 'www.revia.website';
    const headers = { 'X-Content-Type-Options': 'nosniff' };
    // Production assets (including CSS/JS/images) are visible only on the official host.
    // This guard must execute before mocks, route mapping, and env.ASSETS.fetch().
    if (PRODUCTION_APPROVED && url.hostname !== 'www.revia.website') {
      return new Response('Not found', {status:404, headers:{
        'Content-Type':'text/plain; charset=utf-8',
        'X-Content-Type-Options':'nosniff',
        'X-Robots-Tag':'noindex, nofollow, noarchive',
        'Cache-Control':'no-store'
      }});
    }
    if (preview) {
      headers['X-Robots-Tag'] = 'noindex, nofollow, noarchive';
      headers['Content-Security-Policy'] = CSP;
    }
    // Preview never calls real GAS, sends mail, books appointments or emits GA4.
    if (preview && url.pathname === '/__qa/booking') {
      if (!['GET','HEAD','POST'].includes(request.method)) return new Response(null,{status:405,headers});
      const date = '2026-10-20';
      const payload = {ok:true,testOnly:true,slots:[{id:'2026-10-20T10:00',date,time:'10:00',timeLabel:'10:00〜10:30（テスト）',label:'2026年10月20日 10:00〜10:30（テスト）',startIso:'2026-10-20T10:00:00+09:00',endIso:'2026-10-20T10:30:00+09:00'}],dates:[{date,label:"2026年10月20日（テスト）"}],contactEmail:'test@example.invalid',message:'TEST ONLY: no real booking'};
      if (request.method === 'POST') {
        // Do not parse, echo, log or retain submitted personal data.
        return Response.json({ok:true,testOnly:true,message:'TEST ONLY: no real booking'},{headers:{...headers,'Cache-Control':'no-store'}});
      }
      const callback = url.searchParams.get('callback');
      if (callback && !/^[a-zA-Z_$][\w$]*$/.test(callback)) return new Response(null,{status:400,headers});
      if (callback && /^[a-zA-Z_$][\w$]*$/.test(callback)) {
        return new Response(`${callback}(${JSON.stringify(payload)});`,{headers:{...headers,'Content-Type':'application/javascript'}});
      }
      return Response.json(payload,{headers});
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {status:405,headers:{...headers,Allow:'GET, HEAD'}});
    }
    if (preview && url.pathname === '/robots.txt') {
      return new Response('User-agent: *\nDisallow: /\n',{headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
    }
    if (url.pathname === '/column') {
      return new Response(null,{status:308,headers:{...headers,Location:'/column/'+url.search}});
    }
    const htmlAsset = ROUTES[url.pathname];
    let status = 200;
    let asset = htmlAsset;
    if (!asset && PUBLIC_FILES.has(url.pathname)) asset = url.pathname;
    if (!asset) { asset = ROUTES['/404.html']; status = 404; }
    const upstream = new URL(request.url);
    upstream.pathname = asset;
    upstream.search = '';
    const response = await env.ASSETS.fetch(new Request(upstream, {method:request.method}));
    if (response.status !== 200) {
      return new Response('Asset unavailable',{status:503,headers});
    }
    const resultHeaders = new Headers(response.headers);
    for (const [key,value] of Object.entries(headers)) resultHeaders.set(key,value);
    if (htmlAsset || status === 404) resultHeaders.set('Content-Type','text/html; charset=utf-8');
    return new Response(request.method === 'HEAD' ? null : response.body,{status,headers:resultHeaders});
  }
};
