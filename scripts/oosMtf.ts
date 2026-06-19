// OOS 검증: 6개월 5m 받아 전반(과거=OOS)/후반(인샘플) 두 창에서 튜닝된 config 백테스트.
// 인샘플만 좋고 OOS 무너지면 과적합. 실행: npx tsx scripts/oosMtf.ts
import { readFileSync } from 'node:fs';
import type { Candle, StrategyConfig } from '../src/types';
import { runBacktestMTF, type BacktestResult } from '../src/backtest/backtester';
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
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
function line(tag: string, w: Candle[], r: BacktestResult) {
  const L = r.tradeList.filter((t) => t.side === 'LONG').length;
  const S = r.tradeList.filter((t) => t.side === 'SHORT').length;
  console.log(`${tag} ${day(w[0].openTime)}→${day(w.at(-1)!.openTime)}  ret=${r.totalReturnPercent.toFixed(2)}% PF=${r.profitFactor.toFixed(2)} win=${r.winRatePercent.toFixed(0)}% n=${r.trades}(L${L}/S${S}) MDD=${r.maxDrawdownPercent.toFixed(1)}%`);
}

(async () => {
  const config: StrategyConfig = JSON.parse(readFileSync('db/strategies/btc_5m_mtf_scalp_v1.json', 'utf8'));
  const sym = config.symbol;
  console.log('페치 중... (5m 약 6개월)');
  const [m5, h4, d1, w1] = await Promise.all([
    fetchRange(sym, '5m', 52000), fetchRange(sym, '4h', 1500), fetchRange(sym, '1d', 500), fetchRange(sym, '1w', 300),
  ]);
  const mid = Math.floor(m5.length / 2);
  const older = m5.slice(0, mid);   // OOS (튜닝에 안 쓴 과거)
  const newer = m5.slice(mid);      // 인샘플 (튜닝한 구간)
  console.log(`5m=${m5.length} (반=${mid})\n`);

  const base = { '4h': h4, '1d': d1, '1w': w1 };
  line('OOS(과거) ', older, runBacktestMTF(config, { ...base, '5m': older } as Streams));
  line('IS (최근) ', newer, runBacktestMTF(config, { ...base, '5m': newer } as Streams));
})();
