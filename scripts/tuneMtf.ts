// MTF 스캘핑 파라미터 그리드 탐색. 데이터 1회 페치 → 조합별 백테스트 → 상위 출력.
// 실행: npx tsx scripts/tuneMtf.ts
import { readFileSync } from 'node:fs';
import type { Candle, StrategyConfig } from '../src/types';
import { runBacktestMTF } from '../src/backtest/backtester';
import type { Streams } from '../src/strategy/strategyEngine';

const BASE = 'https://fapi.binance.com/fapi/v1/klines';
async function batch(s: string, i: string, end?: number): Promise<any[]> {
  let u = `${BASE}?symbol=${s}&interval=${i}&limit=1500`;
  if (end) u += `&endTime=${end}`;
  return (await (await fetch(u)).json()) as any[];
}
async function fetchRange(s: string, i: string, total: number): Promise<Candle[]> {
  let rows: any[] = [];
  let end = Date.now();
  while (rows.length < total) {
    const b = await batch(s, i, end);
    if (!b.length) break;
    rows = b.concat(rows);
    end = b[0][0] - 1;
    if (b.length < 1500) break;
  }
  return rows.map((k) => ({ openTime: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], closeTime: +k[6], closed: true }));
}

(async () => {
  const base: StrategyConfig = JSON.parse(readFileSync('db/strategies/btc_5m_mtf_scalp_v1.json', 'utf8'));
  const sym = base.symbol;
  console.log('페치 중...');
  const [m5, h4, d1, w1] = await Promise.all([
    fetchRange(sym, '5m', 26000), fetchRange(sym, '4h', 1100), fetchRange(sym, '1d', 400), fetchRange(sym, '1w', 300),
  ]);
  const streams: Streams = { '5m': m5, '4h': h4, '1d': d1, '1w': w1 };
  console.log(`bars 5m=${m5.length}, 기간 ${new Date(m5[0].openTime).toISOString().slice(0, 10)}→${new Date(m5.at(-1)!.openTime).toISOString().slice(0, 10)}\n`);

  const TP = [0.4, 0.6, 0.8, 1.0, 1.5];
  const SL = [0.3, 0.4, 0.6, 0.8];
  const GATE = [1, 2, 3];
  const DIR = ['both', 'long', 'short'] as const;

  const rows: any[] = [];
  for (const dir of DIR) for (const gate of GATE) for (const tp of TP) for (const sl of SL) {
    const c: StrategyConfig = JSON.parse(JSON.stringify(base));
    c.exit.takeProfit = [{ sizePercent: 100, pct: tp }];
    c.exit.stopLoss = { sizePercent: 100, pct: sl };
    c.entry.long!.hardFilters[0].right = gate;
    c.entry.short!.hardFilters[0].right = gate;
    if (dir !== 'long') c.entry.long!.enabled = dir === 'both';
    if (dir !== 'short') c.entry.short!.enabled = dir === 'both';
    const r = runBacktestMTF(c, streams);
    rows.push({ dir, gate, tp, sl, ret: r.totalReturnPercent, pf: r.profitFactor, win: r.winRatePercent, n: r.trades, mdd: r.maxDrawdownPercent });
  }

  const good = rows.filter((r) => r.n >= 20 && Number.isFinite(r.pf)).sort((a, b) => b.ret - a.ret);
  console.log('상위 12 (거래 20건+):');
  for (const r of good.slice(0, 12)) {
    console.log(`${r.dir.padEnd(5)} gate>=${r.gate} TP${r.tp}/SL${r.sl}  ret=${r.ret.toFixed(2)}% PF=${r.pf.toFixed(2)} win=${r.win.toFixed(0)}% n=${r.n} MDD=${r.mdd.toFixed(1)}%`);
  }
})();
