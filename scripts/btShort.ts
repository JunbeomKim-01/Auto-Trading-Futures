// 숏 추가 검증용 일회성 스크립트. 롱전용 vs 롱+숏 백테스트 비교.
// 실행: npx tsx scripts/btShort.ts
import { readFileSync } from 'node:fs';
import type { Candle, StrategyConfig } from '../src/types';
import { runBacktest } from '../src/backtest/backtester';

async function klines(symbol: string, interval: string, limit = 1500): Promise<Candle[]> {
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const raw = (await (await fetch(url)).json()) as any[];
  return raw.map((k) => ({
    openTime: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4],
    volume: +k[5], closeTime: +k[6], closed: true,
  }));
}

function fmt(label: string, r: ReturnType<typeof runBacktest>) {
  const longs = r.tradeList.filter((t) => t.side === 'LONG').length;
  const shorts = r.tradeList.filter((t) => t.side === 'SHORT').length;
  console.log(
    `${label.padEnd(12)} ret=${r.totalReturnPercent.toFixed(2)}% ` +
    `trades=${r.trades}(L${longs}/S${shorts}) win=${r.winRatePercent.toFixed(1)}% ` +
    `PF=${r.profitFactor.toFixed(2)} MDD=${r.maxDrawdownPercent.toFixed(2)}%`,
  );
}

(async () => {
  const config: StrategyConfig = JSON.parse(
    readFileSync('db/strategies/btc_4h_countertrend_v1.json', 'utf8'),
  );
  const candles = await klines(config.symbol, config.timeframe);
  console.log(`candles=${candles.length} ${new Date(candles[0].openTime).toISOString().slice(0,10)} → ${new Date(candles.at(-1)!.openTime).toISOString().slice(0,10)}\n`);

  const longOnly: StrategyConfig = JSON.parse(JSON.stringify(config));
  delete longOnly.entry.short;

  fmt('long-only', runBacktest(longOnly, candles));
  fmt('long+short', runBacktest(config, candles));
})();
