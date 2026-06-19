// 자동 전략 탐색기.
// - 12H/4H/1H OB·FVG는 "자리"로 쓰고, 5m RSI/거래량/종가 반전은 "타이밍"으로 쓴다.
// - 고승률 저수익형과 저승률 고수익형을 따로 랭킹한다.
// - 같은 조합을 과거 절반(OOS)과 최근 절반(IS)에 다시 돌려 과최적화를 걸러낸다.
//
// 실행:
//   npx tsx scripts/findStrategies.ts
//   npx tsx scripts/findStrategies.ts --symbol ETHUSDT --bars 36000 --min-trades 15

import type { Candle, StrategyConfig } from '../src/types';
import { runBacktestMTF, type BacktestResult } from '../src/backtest/backtester';
import type { Streams } from '../src/strategy/strategyEngine';

const BASE = 'https://fapi.binance.com/fapi/v1/klines';

type Direction = 'both' | 'long' | 'short';

interface SearchParams {
  direction: Direction;
  gate: number;
  volumeX: number;
  rsiLong: number;
  rsiShort: number;
  slPct: number;
  rr: number;
}

interface Candidate {
  params: SearchParams;
  config: StrategyConfig;
  all: BacktestResult;
  oos: BacktestResult;
  is: BacktestResult;
}

function argValue(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function batch(symbol: string, interval: string, endTime?: number): Promise<unknown[][]> {
  let url = `${BASE}?symbol=${symbol}&interval=${interval}&limit=1500`;
  if (endTime) url += `&endTime=${endTime}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance ${interval} ${res.status}: ${await res.text()}`);
  return (await res.json()) as unknown[][];
}

async function fetchRange(symbol: string, interval: string, total: number): Promise<Candle[]> {
  let rows: unknown[][] = [];
  let endTime = Date.now();
  while (rows.length < total) {
    const chunk = await batch(symbol, interval, endTime);
    if (!chunk.length) break;
    rows = chunk.concat(rows);
    endTime = Number(chunk[0][0]) - 1;
    if (chunk.length < 1500) break;
  }
  return rows.map((k) => ({
    openTime: Number(k[0]),
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    closeTime: Number(k[6]),
    closed: true,
  }));
}

function baseConfig(symbol: string): StrategyConfig {
  return {
    strategyId: 'auto_found_ob_fvg_htf_timing',
    name: 'Auto Found OB/FVG HTF Timing',
    symbol,
    market: 'BINANCE_USDM_FUTURES',
    timeframe: '4h',
    executionTimeframe: '5m',
    mode: 'backtest',
    indicators: {
      ob12h: { type: 'OB', timeframe: '12h' },
      ob4h: { type: 'OB', timeframe: '4h' },
      ob1h: { type: 'OB', timeframe: '1h' },
      fvg12h: { type: 'FVG', timeframe: '12h' },
      fvg4h: { type: 'FVG', timeframe: '4h' },
      fvg1h: { type: 'FVG', timeframe: '1h' },
      rsi5m: { type: 'RSI', timeframe: '5m', period: 14 },
      vol5m: { type: 'SMA', source: 'volume', timeframe: '5m', period: 20 },
    },
    entry: {
      long: {
        enabled: true,
        minimumScore: 0,
        hardFilters: [{
          left: 'ob12h.activeBullish * 3 + fvg12h.activeBullish * 3 + ob4h.activeBullish * 2 + fvg4h.activeBullish * 2 + ob1h.activeBullish + fvg1h.activeBullish',
          operator: '>=',
          right: 2,
          description: '상위 Bull OB/FVG 가중 합류',
        }],
        scoreRules: [],
        confirmTrigger: 'close > previousClose AND volume > vol5m * 1.2 AND rsi5m > 30',
      },
      short: {
        enabled: true,
        minimumScore: 0,
        hardFilters: [{
          left: 'ob12h.activeBearish * 3 + fvg12h.activeBearish * 3 + ob4h.activeBearish * 2 + fvg4h.activeBearish * 2 + ob1h.activeBearish + fvg1h.activeBearish',
          operator: '>=',
          right: 2,
          description: '상위 Bear OB/FVG 가중 합류',
        }],
        scoreRules: [],
        confirmTrigger: 'close < previousClose AND volume > vol5m * 1.2 AND rsi5m < 70',
      },
    },
    positionSizing: {
      type: 'fixed',
      maxPositionValuePercent: 20,
      leverage: 5,
      entries: [{ step: 1, sizePercent: 100 }],
    },
    exit: {
      takeProfit: [{ sizePercent: 100, pct: 0.9 }],
      stopLoss: { sizePercent: 100, pct: 0.6 },
      trailingStop: { enabled: false, sizePercent: 0, atrMultiplier: 1.5 },
    },
    risk: {
      maxDailyLossPercent: 3,
      maxWeeklyLossPercent: 8,
      maxConsecutiveLosses: 5,
      minLiquidationDistancePercent: 3,
      maxOpenPositions: 2,
      disableNewEntryWhenOrderPending: true,
    },
  };
}

function makeConfig(base: StrategyConfig, p: SearchParams): StrategyConfig {
  const c = JSON.parse(JSON.stringify(base)) as StrategyConfig;
  c.name = `Auto ${p.direction} gate${p.gate} vol${p.volumeX} rsi${p.rsiLong}/${p.rsiShort} SL${p.slPct} RR${p.rr}`;
  c.entry.long!.hardFilters[0].right = p.gate;
  c.entry.short!.hardFilters[0].right = p.gate;
  c.entry.long!.confirmTrigger = `close > previousClose AND volume > vol5m * ${p.volumeX} AND rsi5m > ${p.rsiLong}`;
  c.entry.short!.confirmTrigger = `close < previousClose AND volume > vol5m * ${p.volumeX} AND rsi5m < ${p.rsiShort}`;
  c.entry.long!.enabled = p.direction === 'both' || p.direction === 'long';
  c.entry.short!.enabled = p.direction === 'both' || p.direction === 'short';
  c.exit.stopLoss = { sizePercent: 100, pct: p.slPct };
  c.exit.takeProfit = [{ sizePercent: 100, pct: round2(p.slPct * p.rr) }];
  return c;
}

function paramGrid(): SearchParams[] {
  const out: SearchParams[] = [];
  const directions: Direction[] = ['both', 'long', 'short'];
  const gates = [2, 3, 4];
  const volumeXs = [1.0, 1.2, 1.5];
  const rsiPairs = [
    { rsiLong: 28, rsiShort: 72 },
    { rsiLong: 30, rsiShort: 70 },
    { rsiLong: 35, rsiShort: 65 },
  ];
  const slPcts = [0.4, 0.6, 0.8];
  const rrs = [1.2, 1.5];
  for (const direction of directions) {
    for (const gate of gates) {
      for (const volumeX of volumeXs) {
        for (const pair of rsiPairs) {
          for (const slPct of slPcts) {
            for (const rr of rrs) {
              out.push({ direction, gate, volumeX, ...pair, slPct, rr });
            }
          }
        }
      }
    }
  }
  return out;
}

function splitExec(streams: Streams): { oos: Streams; is: Streams } {
  const exec = streams['5m'];
  const mid = Math.floor(exec.length / 2);
  const shared = { '1h': streams['1h'], '4h': streams['4h'], '12h': streams['12h'] };
  return {
    oos: { ...shared, '5m': exec.slice(0, mid) },
    is: { ...shared, '5m': exec.slice(mid) },
  };
}

function passesOos(c: Candidate, minTrades: number): boolean {
  return c.all.trades >= minTrades
    && c.oos.trades >= Math.max(5, Math.floor(minTrades / 4))
    && c.is.trades >= Math.max(5, Math.floor(minTrades / 4))
    && c.all.totalReturnPercent > 0
    && c.oos.totalReturnPercent >= 0
    && c.is.totalReturnPercent >= 0
    && Number.isFinite(c.all.profitFactor)
    && c.all.profitFactor >= 1.1;
}

function highWinCandidates(rows: Candidate[], minTrades: number): Candidate[] {
  return rows
    .filter((c) => passesOos(c, minTrades))
    .filter((c) => c.all.winRatePercent >= 55 && c.all.maxDrawdownPercent <= 25)
    .sort((a, b) =>
      b.all.winRatePercent - a.all.winRatePercent
      || a.all.maxDrawdownPercent - b.all.maxDrawdownPercent
      || b.all.profitFactor - a.all.profitFactor
      || b.all.totalReturnPercent - a.all.totalReturnPercent,
    );
}

function highReturnCandidates(rows: Candidate[], minTrades: number): Candidate[] {
  return rows
    .filter((c) => passesOos(c, minTrades))
    .filter((c) => c.all.winRatePercent <= 55 && c.all.totalReturnPercent >= 5 && c.all.maxDrawdownPercent <= 35)
    .sort((a, b) =>
      b.all.totalReturnPercent - a.all.totalReturnPercent
      || b.all.profitFactor - a.all.profitFactor
      || a.all.maxDrawdownPercent - b.all.maxDrawdownPercent,
    );
}

function line(c: Candidate): string {
  const r = c.all;
  const p = c.params;
  return `${p.direction.padEnd(5)} gate>=${p.gate} vol>${p.volumeX} RSI ${p.rsiLong}/${p.rsiShort} `
    + `TP${round2(p.slPct * p.rr)}/SL${p.slPct} RR${p.rr}  `
    + `ret=${fmt(r.totalReturnPercent)}% PF=${pf(r)} win=${fmt(r.winRatePercent)}% `
    + `n=${r.trades} MDD=${fmt(r.maxDrawdownPercent)}%  `
    + `OOS=${fmt(c.oos.totalReturnPercent)}% IS=${fmt(c.is.totalReturnPercent)}%`;
}

function printSection(title: string, rows: Candidate[]): void {
  console.log(`\n[${title}]`);
  if (!rows.length) {
    console.log('조건을 통과한 후보가 없습니다. --bars를 늘리거나 min-trades를 낮춰보세요.');
    return;
  }
  rows.slice(0, 10).forEach((c, i) => console.log(`#${String(i + 1).padStart(2)} ${line(c)}`));
}

function fmt(v: number): string {
  return Number.isFinite(v) ? v.toFixed(2) : '∞';
}

function pf(r: BacktestResult): string {
  return r.profitFactor === Infinity ? '∞' : fmt(r.profitFactor);
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function day(candles: Candle[]): string {
  if (!candles.length) return '-';
  return `${new Date(candles[0].openTime).toISOString().slice(0, 10)}→${new Date(candles.at(-1)!.openTime).toISOString().slice(0, 10)}`;
}

(async () => {
  const symbol = argValue('--symbol', 'BTCUSDT').toUpperCase();
  const bars = Number(argValue('--bars', '52000'));
  const minTrades = Number(argValue('--min-trades', '20'));
  const base = baseConfig(symbol);

  console.log(`자동 탐색 시작: ${symbol}`);
  console.log('데이터 페치 중... (5m + 1h/4h/12h)');
  const [m5, h1, h4, h12] = await Promise.all([
    fetchRange(symbol, '5m', bars),
    fetchRange(symbol, '1h', 5000),
    fetchRange(symbol, '4h', 1500),
    fetchRange(symbol, '12h', 800),
  ]);
  const streams: Streams = { '5m': m5, '1h': h1, '4h': h4, '12h': h12 };
  const split = splitExec(streams);
  console.log(`5m=${m5.length} ${day(m5)} | combos=${paramGrid().length} | minTrades=${minTrades}`);

  const rows: Candidate[] = [];
  const started = Date.now();
  for (const params of paramGrid()) {
    const config = makeConfig(base, params);
    const all = runBacktestMTF(config, streams);
    const oos = runBacktestMTF(config, split.oos);
    const is = runBacktestMTF(config, split.is);
    rows.push({ params, config, all, oos, is });
  }

  console.log(`탐색 완료: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  printSection('High Win / Low Return candidates', highWinCandidates(rows, minTrades));
  printSection('Low Win / High Return candidates', highReturnCandidates(rows, minTrades));

  const fallback = rows
    .filter((c) => c.all.trades >= minTrades && c.all.totalReturnPercent > 0 && Number.isFinite(c.all.profitFactor))
    .sort((a, b) => b.all.profitFactor - a.all.profitFactor || b.all.totalReturnPercent - a.all.totalReturnPercent);
  printSection('PF-ranked fallback (OOS 미통과 포함)', fallback);
})();
