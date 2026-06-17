// kline 원시 배열 → Candle[] 변환 + 마감 판정. 문서 13장.
import type { Candle } from '../types';
import { BinanceClient } from './binanceClient';

// Binance kline 배열 인덱스:
// [0]openTime [1]open [2]high [3]low [4]close [5]volume [6]closeTime ...
export async function fetchCandles(
  client: BinanceClient,
  symbol: string,
  interval: string,
  limit: number,
  now: number = Date.now(),
): Promise<Candle[]> {
  const raw = await client.getKlines(symbol, interval, limit);
  return raw.map((k) => {
    const closeTime = Number(k[6]);
    return {
      openTime: Number(k[0]),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
      closeTime,
      closed: now > closeTime, // 마지막 캔들이 실제로 마감되었는지
    };
  });
}

// 마지막으로 "마감된" 캔들. 전략 판단은 이 캔들 기준으로만 한다.
export function lastClosedCandle(candles: Candle[]): Candle | null {
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i].closed) return candles[i];
  }
  return null;
}
