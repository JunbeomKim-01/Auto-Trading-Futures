// Worker 엔트리: cron 전략 실행 + 대시보드 API. 문서 13/14장.
import type { Env, RunMode } from './types';
import type { Candle, StrategyConfig } from './types';
import { runBacktest } from './backtest/backtester';
import { runStrategyTick } from './runner';
import { D1Repository } from './storage/d1Repository';
import { KvRepository } from './storage/kvRepository';
import { dashboardHtml } from './dashboard/page';

const VALID_MODES: RunMode[] = ['OFF', 'ALERT_ONLY', 'PAPER', 'TESTNET', 'LIVE_SMALL', 'LIVE_FULL'];

export default {
  // 매분 실행되지만 4시간봉 마감 + 미처리일 때만 실제 판단. 문서 13장.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runStrategyTick(env).then(
        (s) => console.log('tick', JSON.stringify(s)),
        (e) => console.error('tick error', e),
      ),
    );
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === '/' ) return html(dashboardHtml());

    if (path === '/api/status') return json(await status(env));
    if (path === '/api/signals') return json(await new D1Repository(env).recentSignals(30));
    if (path === '/api/orders') return json(await new D1Repository(env).recentOrders(30));
    if (path === '/api/backtest' && req.method === 'POST') {
      return handleBacktest(req);
    }

    if (path === '/api/mode' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as { mode?: string };
      const mode = body.mode as RunMode;
      if (!VALID_MODES.includes(mode)) {
        return json({ error: `mode는 ${VALID_MODES.join(', ')} 중 하나` }, 400);
      }
      await new KvRepository(env).setMode(mode);
      return json({ ok: true, mode });
    }

    // 수동 트리거 (검증용). 문서 19장.
    if (path === '/api/run' && req.method === 'POST') {
      return json(await runStrategyTick(env));
    }

    return json({ error: 'not found' }, 404);
  },
};

async function handleBacktest(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as {
      config?: StrategyConfig;
      years?: number;
      startEquity?: number;
    };
    if (!body.config) return json({ error: 'config가 필요합니다' }, 400);

    const config = body.config;
    const years = clamp(Number(body.years ?? 3), 0.25, 8);
    const candles = await fetchHistoricalCandles(config.symbol, config.timeframe, years);
    if (candles.length < 250) {
      return json({ error: `캔들 데이터 부족: ${candles.length}개` }, 400);
    }

    const result = runBacktest(config, candles, {
      startEquity: Number(body.startEquity ?? 10000),
    });
    return json({ ok: true, result });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

async function fetchHistoricalCandles(symbol: string, interval: string, years: number): Promise<Candle[]> {
  const intervalMs = intervalToMs(interval);
  const endTime = Date.now();
  const startTime = endTime - years * 365 * 86400_000;
  const out: Candle[] = [];
  let cursor = startTime;

  while (cursor < endTime) {
    const url = new URL('https://fapi.binance.com/fapi/v1/klines');
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('startTime', String(Math.floor(cursor)));
    url.searchParams.set('endTime', String(endTime));
    url.searchParams.set('limit', '1500');

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Binance klines ${res.status}: ${await res.text()}`);
    const raw = (await res.json()) as unknown[][];
    if (!raw.length) break;

    for (const k of raw) {
      out.push({
        openTime: Number(k[0]),
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
        volume: Number(k[5]),
        closeTime: Number(k[6]),
        closed: true,
      });
    }

    const lastOpen = Number(raw[raw.length - 1][0]);
    const next = lastOpen + intervalMs;
    if (next <= cursor || raw.length < 1500) break;
    cursor = next;
  }

  const deduped = new Map<number, Candle>();
  for (const c of out) deduped.set(c.openTime, c);
  return [...deduped.values()].sort((a, b) => a.openTime - b.openTime);
}

function intervalToMs(interval: string): number {
  const value = Number(interval.slice(0, -1));
  const unit = interval.slice(-1);
  if (!Number.isFinite(value) || value <= 0) return 14400_000;
  if (unit === 'm') return value * 60_000;
  if (unit === 'h') return value * 3600_000;
  if (unit === 'd') return value * 86400_000;
  return 14400_000;
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

async function status(env: Env) {
  const kv = new KvRepository(env);
  const d1 = new D1Repository(env);
  const mode = await kv.getMode();
  const position = await d1.getOpenPosition('BTCUSDT');
  const lastCandle = await kv.getLastProcessedCandle('BTCUSDT');
  return { mode, symbol: 'BTCUSDT', lastProcessedCandle: lastCandle, position };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function html(body: string): Response {
  return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
