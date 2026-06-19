// MTF 스캘핑 백테스트 검증. 5m/4h/1d/1w 페치 → runBacktestMTF.
// 실행: npx tsx scripts/btMtf.ts
import { readFileSync } from 'node:fs';
import type { Candle, StrategyConfig } from '../src/types';
import { runBacktestMTF, type BacktestResult } from '../src/backtest/backtester';
import type { Streams } from '../src/strategy/strategyEngine';

const BASE = 'https://fapi.binance.com/fapi/v1/klines';

async function batch(symbol: string, interval: string, endTime?: number): Promise<any[]> {
  let url = `${BASE}?symbol=${symbol}&interval=${interval}&limit=1500`;
  if (endTime) url += `&endTime=${endTime}`;
  return (await (await fetch(url)).json()) as any[];
}

// total 개수만큼 과거로 페이징해서 모은다 (시간 오름차순).
async function fetchRange(symbol: string, interval: string, total: number): Promise<Candle[]> {
  let rows: any[] = [];
  let endTime = Date.now();
  while (rows.length < total) {
    const b = await batch(symbol, interval, endTime);
    if (!b.length) break;
    rows = b.concat(rows);
    endTime = b[0][0] - 1;
    if (b.length < 1500) break;
  }
  return rows.map((k) => ({
    openTime: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4],
    volume: +k[5], closeTime: +k[6], closed: true,
  }));
}

function fmt(r: BacktestResult) {
  const L = r.tradeList.filter((t) => t.side === 'LONG').length;
  const S = r.tradeList.filter((t) => t.side === 'SHORT').length;
  console.log(
    `ret=${r.totalReturnPercent.toFixed(2)}% trades=${r.trades}(L${L}/S${S}) ` +
    `win=${r.winRatePercent.toFixed(1)}% PF=${r.profitFactor.toFixed(2)} ` +
    `MDD=${r.maxDrawdownPercent.toFixed(2)}% avgBars=${r.avgHoldingBars.toFixed(1)}`,
  );
}

(async () => {
  const config: StrategyConfig = JSON.parse(readFileSync('db/strategies/btc_5m_mtf_scalp_v1.json', 'utf8'));
  const sym = config.symbol;
  console.log('페치 중... (5m 약 3개월 + 4h/1d/1w)');
  const [m5, h4, d1, w1] = await Promise.all([
    fetchRange(sym, '5m', 26000), // ~90일
    fetchRange(sym, '4h', 1100),
    fetchRange(sym, '1d', 400),
    fetchRange(sym, '1w', 300),
  ]);
  const streams: Streams = { '5m': m5, '4h': h4, '1d': d1, '1w': w1 };
  console.log(`bars 5m=${m5.length} 4h=${h4.length} 1d=${d1.length} 1w=${w1.length}`);
  console.log(`기간 ${new Date(m5[0].openTime).toISOString().slice(0, 10)} → ${new Date(m5.at(-1)!.openTime).toISOString().slice(0, 10)}\n`);

  const t0 = Date.now();
  const r = runBacktestMTF(config, streams);
  console.log(`백테스트 ${Date.now() - t0}ms`);
  fmt(r);
})();
