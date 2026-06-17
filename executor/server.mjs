// Binance Executor — 허용된 IP를 가진 VPS에서 실행하는 얇은 프록시.
// Cloudflare Workers는 Binance에 직접 접근하면 403(CloudFront)으로 막히므로,
// 워커가 이 서버를 대신 호출한다. Binance 키는 워커가 아니라 여기(허용 IP)에 둔다.
//
// 의존성 없음 (Node 18+ 내장 http + fetch + crypto).
// 환경변수:
//   PORT             (기본 8080)
//   BINANCE_BASE     예) https://testnet.binancefuture.com
//   BINANCE_API_KEY
//   BINANCE_API_SECRET
//   PROXY_TOKEN      워커-Executor 공유 시크릿 (Bearer 인증)
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT ?? 8080);
const BASE = process.env.BINANCE_BASE ?? 'https://testnet.binancefuture.com';
const API_KEY = process.env.BINANCE_API_KEY ?? '';
const API_SECRET = process.env.BINANCE_API_SECRET ?? '';
const TOKEN = process.env.PROXY_TOKEN ?? '';

if (!API_KEY || !API_SECRET || !TOKEN) {
  console.error('환경변수 누락: BINANCE_API_KEY / BINANCE_API_SECRET / PROXY_TOKEN');
  process.exit(1);
}

function sign(query) {
  return crypto.createHmac('sha256', API_SECRET).update(query).digest('hex');
}

async function signedRequest(method, path, params) {
  const usp = new URLSearchParams({
    ...params,
    timestamp: String(Date.now()),
    recvWindow: '5000',
  });
  usp.append('signature', sign(usp.toString()));
  const res = await fetch(`${BASE}${path}?${usp.toString()}`, {
    method,
    headers: { 'X-MBX-APIKEY': API_KEY },
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

async function publicRequest(path, params) {
  const usp = new URLSearchParams(params);
  const res = await fetch(`${BASE}${path}?${usp.toString()}`);
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

function readJson(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function send(res, status, obj) {
  const payload = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(payload);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    if (url.pathname === '/health') return send(res, 200, { ok: true, base: BASE });

    // Bearer 인증.
    const auth = req.headers['authorization'] ?? '';
    if (auth !== `Bearer ${TOKEN}`) return send(res, 401, { error: 'unauthorized' });

    // 공개 klines.
    if (url.pathname === '/klines' && req.method === 'GET') {
      const r = await publicRequest('/fapi/v1/klines', {
        symbol: url.searchParams.get('symbol') ?? '',
        interval: url.searchParams.get('interval') ?? '',
        limit: url.searchParams.get('limit') ?? '500',
      });
      return send(res, r.status, r.ok ? JSON.parse(r.body) : { error: r.body });
    }

    if (url.pathname === '/account' && req.method === 'POST') {
      const r = await signedRequest('GET', '/fapi/v2/account', {});
      return send(res, r.status, r.ok ? JSON.parse(r.body) : { error: r.body });
    }

    if (url.pathname === '/leverage' && req.method === 'POST') {
      const b = await readJson(req);
      const r = await signedRequest('POST', '/fapi/v1/leverage', {
        symbol: b.symbol,
        leverage: b.leverage,
      });
      return send(res, r.status, r.ok ? JSON.parse(r.body) : { error: r.body });
    }

    if (url.pathname === '/order' && req.method === 'POST') {
      const b = await readJson(req);
      const params = { symbol: b.symbol, side: b.side, type: 'MARKET', quantity: b.quantity };
      if (b.reduceOnly) params.reduceOnly = 'true';
      const r = await signedRequest('POST', '/fapi/v1/order', params);
      return send(res, r.status, r.ok ? JSON.parse(r.body) : { error: r.body });
    }

    return send(res, 404, { error: 'not found' });
  } catch (e) {
    return send(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, () => console.log(`Binance Executor listening on :${PORT} → ${BASE}`));
