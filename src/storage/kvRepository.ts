// KV: 운영 모드, 마지막 처리 캔들, 중복 주문 방지 플래그. 문서 13장.
import type { Env, RunMode } from '../types';

const MODE_KEY = 'system:mode';
const lastCandleKey = (symbol: string) => `candle:last:${symbol}`;
const dedupKey = (symbol: string, openTime: number) => `order:lock:${symbol}:${openTime}`;

export class KvRepository {
  constructor(private readonly env: Env) {}

  // 런타임 모드(대시보드 ON/OFF). 없으면 wrangler 기본값.
  async getMode(): Promise<RunMode> {
    const v = await this.env.KV.get(MODE_KEY);
    return (v as RunMode) ?? (this.env.DEFAULT_MODE as RunMode);
  }

  async setMode(mode: RunMode): Promise<void> {
    await this.env.KV.put(MODE_KEY, mode);
  }

  async getLastProcessedCandle(symbol: string): Promise<number | null> {
    const v = await this.env.KV.get(lastCandleKey(symbol));
    return v ? Number(v) : null;
  }

  async setLastProcessedCandle(symbol: string, openTime: number): Promise<void> {
    await this.env.KV.put(lastCandleKey(symbol), String(openTime));
  }

  // 동일 캔들 중복 주문 방지. 이미 잠겨 있으면 false. 문서 13장.
  async tryLockCandle(symbol: string, openTime: number): Promise<boolean> {
    const key = dedupKey(symbol, openTime);
    const exists = await this.env.KV.get(key);
    if (exists) return false;
    await this.env.KV.put(key, '1', { expirationTtl: 60 * 60 * 24 * 7 });
    return true;
  }
}
