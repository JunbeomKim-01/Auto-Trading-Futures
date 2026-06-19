// Binance USDM Futures 클라이언트.
// 배포 환경(Cloudflare Workers)에서는 Binance가 워커 IP를 403으로 막으므로,
// EXECUTOR_URL이 설정되면 허용 IP를 가진 VPS Executor를 경유한다.
// EXECUTOR_URL이 없으면(로컬 dev) Binance에 직접 서명 호출한다.
import type { Env, RunMode } from '../types';

export class BinanceClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly apiSecret?: string;
  private readonly executorUrl?: string;
  private readonly proxyToken?: string;

  constructor(env: Env, mode: RunMode) {
    const live = mode === 'LIVE_SMALL' || mode === 'LIVE_FULL';
    this.baseUrl = live ? env.BINANCE_LIVE_BASE : env.BINANCE_TESTNET_BASE;
    this.apiKey = env.BINANCE_API_KEY;
    this.apiSecret = env.BINANCE_API_SECRET;
    this.executorUrl = env.EXECUTOR_URL?.replace(/\/$/, '');
    this.proxyToken = env.PROXY_TOKEN;
  }

  private get viaExecutor(): boolean {
    return !!this.executorUrl;
  }

  // 4시간봉 kline.
  async getKlines(symbol: string, interval: string, limit: number): Promise<number[][]> {
    if (this.viaExecutor) {
      return (await this.executorGet(
        `/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
      )) as number[][];
    }
    const url = `${this.baseUrl}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`klines ${res.status}: ${await res.text()}`);
    return (await res.json()) as number[][];
  }

  async getAccount(): Promise<unknown> {
    if (this.viaExecutor) return this.executorPost('/account', {});
    return this.signedRequest('GET', '/fapi/v2/account', {});
  }

  async setLeverage(symbol: string, leverage: number): Promise<unknown> {
    if (this.viaExecutor) return this.executorPost('/leverage', { symbol, leverage });
    return this.signedRequest('POST', '/fapi/v1/leverage', { symbol, leverage });
  }

  // 헤지 모드(dualSidePosition)에서는 positionSide(LONG/SHORT)가 필수이고 reduceOnly는
  // 보내면 안 된다(방향이 positionSide로 결정됨). positionSide 미지정 시 단방향 호환 동작.
  async marketOrder(
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    reduceOnly = false,
    positionSide?: 'LONG' | 'SHORT',
  ): Promise<unknown> {
    if (this.viaExecutor) {
      return this.executorPost('/order', { symbol, side, quantity, reduceOnly, positionSide });
    }
    return this.signedRequest('POST', '/fapi/v1/order', {
      symbol,
      side,
      type: 'MARKET',
      quantity,
      ...(positionSide ? { positionSide } : reduceOnly ? { reduceOnly: 'true' } : {}),
    });
  }

  // --- Executor 경유 ---
  private async executorGet(path: string): Promise<unknown> {
    const res = await fetch(`${this.executorUrl}${path}`, {
      headers: { authorization: `Bearer ${this.proxyToken}` },
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`executor ${path} ${res.status}: ${body}`);
    return JSON.parse(body);
  }

  private async executorPost(path: string, payload: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${this.executorUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.proxyToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`executor ${path} ${res.status}: ${body}`);
    return JSON.parse(body);
  }

  // --- Binance 직접 서명 (로컬 dev) ---
  private async signedRequest(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    params: Record<string, string | number>,
  ): Promise<unknown> {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('BINANCE_API_KEY / BINANCE_API_SECRET 미설정');
    }
    const query = new URLSearchParams({
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      timestamp: String(Date.now()),
      recvWindow: '5000',
    });
    const signature = await hmacSha256Hex(this.apiSecret, query.toString());
    query.append('signature', signature);

    const url = `${this.baseUrl}${path}?${query.toString()}`;
    const res = await fetch(url, { method, headers: { 'X-MBX-APIKEY': this.apiKey } });
    const body = await res.text();
    if (!res.ok) throw new Error(`${path} ${res.status}: ${body}`);
    return body ? JSON.parse(body) : {};
  }
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
