// Worker 엔트리: cron 전략 실행 + 대시보드 API. 문서 13/14장.
import type { Env, RunMode } from './types';
import type { Candle, StrategyConfig } from './types';
import { runBacktest, runBacktestMTF } from './backtest/backtester';
import { runStrategyTick } from './runner';
import { D1Repository } from './storage/d1Repository';
import { KvRepository } from './storage/kvRepository';
import { dashboardHtml } from './dashboard/page';
import { BinanceClient } from './market/binanceClient';

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
    if (path === '/api/health') return json(await health(env));
    if (path === '/api/signals') return json(await new D1Repository(env).recentSignals(30));
    if (path === '/api/orders') return json(await new D1Repository(env).recentOrders(30));
    if (path === '/api/klines') return handleKlines(url, env);
    if (path === '/api/backtest' && req.method === 'POST') {
      return handleBacktest(req, env);
    }

    if (path === '/api/strategies' && req.method === 'GET') {
      return json(await new D1Repository(env).listStrategies());
    }
    if (path === '/api/strategies' && req.method === 'POST') {
      return handleSaveStrategy(req, env);
    }
    if (path === '/api/strategies/activate' && req.method === 'POST') {
      return handleStrategyAction(req, env, 'activate');
    }
    if (path === '/api/strategies/delete' && req.method === 'POST') {
      return handleStrategyAction(req, env, 'delete');
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

async function handleSaveStrategy(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    config?: StrategyConfig;
    name?: string;
    metrics?: unknown;
  };
  if (!body.config || !body.config.strategyId || !body.config.symbol) {
    return json({ error: 'config(strategyId, symbol 포함)가 필요합니다' }, 400);
  }
  const name = (body.name ?? body.config.name ?? '저장 전략').trim() || '저장 전략';
  const saved = await new D1Repository(env).saveStrategy(body.config, name, body.metrics ?? null);
  return json({ ok: true, ...saved });
}

async function handleStrategyAction(
  req: Request, env: Env, action: 'activate' | 'delete',
): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as { strategyId?: string };
  if (!body.strategyId) return json({ error: 'strategyId가 필요합니다' }, 400);
  try {
    const repo = new D1Repository(env);
    if (action === 'activate') await repo.activateStrategy(body.strategyId);
    else await repo.deleteStrategy(body.strategyId);
    return json({ ok: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
}

async function handleBacktest(req: Request, env: Env): Promise<Response> {
  try {
    const body = (await req.json()) as {
      config?: StrategyConfig;
      years?: number;
      days?: number;
      startEquity?: number;
    };
    if (!body.config) return json({ error: 'config가 필요합니다' }, 400);

    const config = body.config;
    const startEquity = Number(body.startEquity ?? 10000);

    // MTF: executionTimeframe 있으면 멀티 스트림 + runBacktestMTF.
    // 실행봉(5m 등)은 CPU 많이 먹어 기간을 일 단위로 캡한다(Workers CPU 한도).
    if (config.executionTimeframe) {
      return handleBacktestMtf(env, config, body.days, startEquity);
    }

    const years = clamp(Number(body.years ?? 3), 0.25, 8);
    const candles = await fetchHistoricalCandles(env, config.symbol, config.timeframe, years);
    if (candles.length < 250) {
      return json({ error: `캔들 데이터 부족: ${candles.length}개` }, 400);
    }

    const result = runBacktest(config, candles, { startEquity });
    // 차트(Lightweight Charts)용 가격 시리즈. 진입/청산 마커를 실제 가격축에 그린다.
    const series = candles.map((c) => ({ t: c.openTime, o: c.open, h: c.high, l: c.low, c: c.close }));
    return json({ ok: true, result, candles: series });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

// MTF 백테스트: 실행봉은 days로 캡, 상위봉은 워밍업 포함해 넉넉히 페치.
async function handleBacktestMtf(
  env: Env,
  config: StrategyConfig,
  daysRaw: number | undefined,
  startEquity: number,
): Promise<Response> {
  const execTf = config.executionTimeframe as string;
  const days = clamp(Number(daysRaw ?? 2), 1, 14);
  const endTime = Date.now();
  const execStart = endTime - days * 86400_000;

  // 사용 TF 집합: 실행봉 + 각 지표 timeframe(없으면 config.timeframe).
  const tfs = new Set<string>([execTf]);
  for (const spec of Object.values(config.indicators)) tfs.add(spec.timeframe ?? config.timeframe);

  const streams: Record<string, Candle[]> = {};
  for (const tf of tfs) {
    // 실행봉은 days만, 상위봉은 그 이전 워밍업(약 300봉)까지.
    const start = tf === execTf ? execStart : execStart - 300 * intervalToMs(tf);
    streams[tf] = await fetchHistoricalRange(env, config.symbol, tf, start, endTime);
  }
  const exec = streams[execTf];
  if (!exec || exec.length < 50) {
    return json({ error: `실행봉(${execTf}) 데이터 부족: ${exec?.length ?? 0}개` }, 400);
  }

  const result = runBacktestMTF(config, streams, { startEquity });
  const series = exec.map((c) => ({ t: c.openTime, o: c.open, h: c.high, l: c.low, c: c.close }));
  return json({
    ok: true, result, candles: series,
    note: `MTF 백테스트: 실행봉 ${execTf} ${days}일 구간. CPU 한도로 기간이 제한됩니다.`,
  });
}

// startTime~endTime 구간 klines 페이징.
async function fetchHistoricalRange(
  env: Env, symbol: string, interval: string, startTime: number, endTime: number,
): Promise<Candle[]> {
  const intervalMs = intervalToMs(interval);
  const out: Candle[] = [];
  let cursor = startTime;
  while (cursor < endTime) {
    const raw = await fetchKlines(env, { symbol, interval, startTime: Math.floor(cursor), endTime, limit: 1500 });
    if (!raw.length) break;
    for (const k of raw) {
      out.push({
        openTime: Number(k[0]), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]),
        close: Number(k[4]), volume: Number(k[5]), closeTime: Number(k[6]), closed: true,
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

// 라이브 차트용 최근 캔들. Lightweight Charts 가격축에 주문 마커를 그린다.
async function handleKlines(url: URL, env: Env): Promise<Response> {
  try {
    const symbol = (url.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
    const interval = url.searchParams.get('interval') || '4h';
    const limit = clamp(Number(url.searchParams.get('limit') ?? 200), 10, 1000);
    const raw = await fetchKlines(env, {
      symbol,
      interval,
      limit: Math.floor(limit),
    });
    const candles = raw.map((k) => ({
      t: Number(k[0]),
      o: Number(k[1]),
      h: Number(k[2]),
      l: Number(k[3]),
      c: Number(k[4]),
    }));
    return json({ ok: true, candles });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
}

async function fetchHistoricalCandles(env: Env, symbol: string, interval: string, years: number): Promise<Candle[]> {
  const intervalMs = intervalToMs(interval);
  const endTime = Date.now();
  const startTime = endTime - years * 365 * 86400_000;
  const out: Candle[] = [];
  let cursor = startTime;

  while (cursor < endTime) {
    const raw = await fetchKlines(env, {
      symbol,
      interval,
      startTime: Math.floor(cursor),
      endTime,
      limit: 1500,
    });
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

async function fetchKlines(
  env: Env,
  params: {
    symbol: string;
    interval: string;
    limit: number;
    startTime?: number;
    endTime?: number;
  },
): Promise<unknown[][]> {
  const query = new URLSearchParams({
    symbol: params.symbol,
    interval: params.interval,
    limit: String(params.limit),
  });
  if (params.startTime != null) query.set('startTime', String(params.startTime));
  if (params.endTime != null) query.set('endTime', String(params.endTime));

  const executor = env.EXECUTOR_URL?.replace(/\/$/, '');
  if (executor) {
    const res = await fetch(`${executor}/klines?${query.toString()}`, {
      headers: { authorization: `Bearer ${env.PROXY_TOKEN ?? ''}` },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Executor klines ${res.status}: ${text}`);
    return JSON.parse(text) as unknown[][];
  }

  const url = new URL('https://fapi.binance.com/fapi/v1/klines');
  for (const [key, value] of query.entries()) url.searchParams.set(key, value);
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    const hint = res.status === 403
      ? 'Cloudflare Worker에서 Binance 직접 호출이 차단되었습니다. EXECUTOR_URL/PROXY_TOKEN을 설정하세요.'
      : 'Binance 요청 실패';
    throw new Error(`${hint} Binance klines ${res.status}: ${text}`);
  }
  return JSON.parse(text) as unknown[][];
}

function intervalToMs(interval: string): number {
  const value = Number(interval.slice(0, -1));
  const unit = interval.slice(-1);
  if (!Number.isFinite(value) || value <= 0) return 14400_000;
  if (unit === 'm') return value * 60_000;
  if (unit === 'h') return value * 3600_000;
  if (unit === 'd') return value * 86400_000;
  if (unit === 'w') return value * 7 * 86400_000;
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
  const positions = await d1.getOpenPositions('BTCUSDT');
  const lastCandle = await kv.getLastProcessedCandle('BTCUSDT');
  // position: 단일 표시용 하위호환(롱 우선). positions: 헤지 슬롯 전체.
  const position = positions.long ?? positions.short;

  // 실거래/테스트넷 + 보유 포지션일 때만 Binance에서 실시간 지표(markPrice/청산가/미실현)
  // 를 가져온다. 실패해도 status 본체는 유지(live=null).
  let live = null;
  if (position && (mode === 'TESTNET' || mode === 'LIVE_SMALL' || mode === 'LIVE_FULL')) {
    live = await positionMetrics(env, mode, 'BTCUSDT', position.side).catch(() => null);
  }

  return {
    mode, symbol: 'BTCUSDT', lastProcessedCandle: lastCandle,
    position, positions, live,
  };
}

// Binance positionRisk에서 표시용 실시간 지표 추출.
async function positionMetrics(env: Env, mode: RunMode, symbol: string, side: 'LONG' | 'SHORT') {
  const raw = await new BinanceClient(env, mode).getPositionRisk(symbol);
  const rows = (Array.isArray(raw) ? raw : []) as Array<Record<string, unknown>>;
  const row =
    rows.find((r) => r.symbol === symbol && (r.positionSide === side || r.positionSide === 'BOTH')) ??
    rows[0];
  if (!row) return null;
  const markPrice = Number(row.markPrice);
  const liquidationPrice = Number(row.liquidationPrice);
  const liqDistancePct =
    markPrice > 0 && liquidationPrice > 0
      ? (Math.abs(markPrice - liquidationPrice) / markPrice) * 100
      : null;
  return {
    markPrice,
    liquidationPrice,
    unrealizedPnl: Number(row.unRealizedProfit),
    leverage: Number(row.leverage),
    notional: Math.abs(Number(row.notional ?? 0)),
    liqDistancePct,
  };
}

// Executor 연결 상태 핑. 터널이 죽으면 여기서 잡힌다.
async function health(env: Env) {
  const executor = env.EXECUTOR_URL?.replace(/\/$/, '');
  if (!executor) return { executor: 'none' };
  try {
    const res = await fetch(`${executor}/health`, { signal: AbortSignal.timeout(4000) });
    return { executor: res.ok ? 'ok' : 'down', status: res.status };
  } catch (e) {
    return { executor: 'down', error: e instanceof Error ? e.message : String(e) };
  }
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
