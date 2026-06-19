// 지표 계산 함수 모음 + Registry. 문서 7장.
// 모든 함수는 시간 오름차순(과거→현재) 배열을 입력받아
// 캔들과 동일 길이의 배열을 반환한다. 워밍업 구간은 NaN.

export function calculateEMA(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  // 초기값은 첫 period 구간의 SMA.
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let ema = sum / period;
  out[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

export function calculateSMA(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export interface BollingerResult {
  upper: number[];
  lower: number[];
  mid: number[];
  percentB: number[]; // (close - lower) / (upper - lower)
}

// 볼린저 밴드. mid = SMA(period), 밴드 = mid ± std * 표준편차. 롤링 합으로 O(n).
export function calculateBollinger(closes: number[], period: number, std: number): BollingerResult {
  const n = closes.length;
  const upper = new Array<number>(n).fill(NaN);
  const lower = new Array<number>(n).fill(NaN);
  const mid = new Array<number>(n).fill(NaN);
  const percentB = new Array<number>(n).fill(NaN);
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    sum += closes[i];
    sumSq += closes[i] * closes[i];
    if (i >= period) {
      sum -= closes[i - period];
      sumSq -= closes[i - period] * closes[i - period];
    }
    if (i >= period - 1) {
      const mean = sum / period;
      const variance = Math.max(0, sumSq / period - mean * mean);
      const sd = Math.sqrt(variance);
      const up = mean + std * sd;
      const lo = mean - std * sd;
      mid[i] = mean;
      upper[i] = up;
      lower[i] = lo;
      percentB[i] = up > lo ? (closes[i] - lo) / (up - lo) : 0.5;
    }
  }
  return { upper, lower, mid, percentB };
}

// Wilder's RSI (TradingView 기본과 동일 평활).
export function calculateRSI(closes: number[], period: number): number[] {
  const out = new Array<number>(closes.length).fill(NaN);
  if (closes.length <= period) return out;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = rsiFrom(avgGain, avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = rsiFrom(avgGain, avgLoss);
  }
  return out;
}

function rsiFrom(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface MACDResult {
  macd: number[];
  signal: number[];
  histogram: number[];
}

export function calculateMACD(
  closes: number[],
  fast: number,
  slow: number,
  signalPeriod: number,
): MACDResult {
  const emaFast = calculateEMA(closes, fast);
  const emaSlow = calculateEMA(closes, slow);
  const macd = closes.map((_, i) =>
    Number.isNaN(emaFast[i]) || Number.isNaN(emaSlow[i]) ? NaN : emaFast[i] - emaSlow[i],
  );
  // signal = MACD의 EMA. NaN 구간을 건너뛰고 유효 구간만 평활한다.
  const firstValid = macd.findIndex((v) => !Number.isNaN(v));
  const signal = new Array<number>(closes.length).fill(NaN);
  if (firstValid !== -1) {
    const valid = macd.slice(firstValid);
    const sig = calculateEMA(valid, signalPeriod);
    for (let i = 0; i < sig.length; i++) signal[firstValid + i] = sig[i];
  }
  const histogram = macd.map((v, i) =>
    Number.isNaN(v) || Number.isNaN(signal[i]) ? NaN : v - signal[i],
  );
  return { macd, signal, histogram };
}

// Wilder's ATR.
export function calculateATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period: number,
): number[] {
  const n = closes.length;
  const out = new Array<number>(n).fill(NaN);
  if (n <= period) return out;
  const tr = new Array<number>(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    tr[i] = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    );
  }
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  let atr = sum / period;
  out[period] = atr;
  for (let i = period + 1; i < n; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    out[i] = atr;
  }
  return out;
}

// FVG / Order Block 같은 가격 구역(zone) 지표의 공통 출력.
// bullish/bearish/direction 은 0/1, -1/0/1. 구역 가격(low/high/mid/size)은 없으면 NaN.
export interface ZoneResult {
  bullish: number[];
  bearish: number[];
  direction: number[];
  low: number[];
  high: number[];
  mid: number[];
  size: number[];
  activeBullish: number[];
  activeBearish: number[];
  activeDirection: number[];
  activeLow: number[];
  activeHigh: number[];
  activeMid: number[];
  activeSize: number[];
}

function emptyZone(n: number): ZoneResult {
  return {
    bullish: new Array<number>(n).fill(0),
    bearish: new Array<number>(n).fill(0),
    direction: new Array<number>(n).fill(0),
    low: new Array<number>(n).fill(NaN),
    high: new Array<number>(n).fill(NaN),
    mid: new Array<number>(n).fill(NaN),
    size: new Array<number>(n).fill(NaN),
    activeBullish: new Array<number>(n).fill(0),
    activeBearish: new Array<number>(n).fill(0),
    activeDirection: new Array<number>(n).fill(0),
    activeLow: new Array<number>(n).fill(NaN),
    activeHigh: new Array<number>(n).fill(NaN),
    activeMid: new Array<number>(n).fill(NaN),
    activeSize: new Array<number>(n).fill(NaN),
  };
}

type ActiveZone = { dir: 1 | -1; low: number; high: number; created: number };

function markActiveZone(z: ZoneResult, i: number, zone: ActiveZone): void {
  if (zone.dir === 1) z.activeBullish[i] = 1;
  else z.activeBearish[i] = 1;
  z.activeDirection[i] = zone.dir;
  z.activeLow[i] = zone.low;
  z.activeHigh[i] = zone.high;
  z.activeMid[i] = (zone.low + zone.high) / 2;
  z.activeSize[i] = zone.high - zone.low;
}

// Fair Value Gap. 3봉 구조만 사용(미래 봉 참조 없음). Python 엔진과 동일.
//  - bullish FVG: low[i] > high[i-2]
//  - bearish FVG: high[i] < low[i-2]
export function calculateFVG(highs: number[], lows: number[]): ZoneResult {
  const n = highs.length;
  const z = emptyZone(n);
  const active: ActiveZone[] = [];
  for (let i = 2; i < n; i++) {
    const twoBackHigh = highs[i - 2];
    const twoBackLow = lows[i - 2];
    const bullish = lows[i] > twoBackHigh;
    const bearish = highs[i] < twoBackLow;
    if (bullish) {
      z.bullish[i] = 1;
      z.direction[i] = 1;
      z.low[i] = twoBackHigh;
      z.high[i] = lows[i];
    } else if (bearish) {
      z.bearish[i] = 1;
      z.direction[i] = -1;
      z.low[i] = highs[i];
      z.high[i] = twoBackLow;
    }
    if (bullish || bearish) {
      z.mid[i] = (z.low[i] + z.high[i]) / 2;
      z.size[i] = z.high[i] - z.low[i];
      active.push({ dir: bullish ? 1 : -1, low: z.low[i], high: z.high[i], created: i });
    }

    for (let j = active.length - 1; j >= 0; j--) {
      const zone = active[j];
      const overlaps = i > zone.created && lows[i] <= zone.high && highs[i] >= zone.low;
      const closeInZone = lows[i] <= zone.high && highs[i] >= zone.low;
      if (closeInZone && z.activeDirection[i] === 0) markActiveZone(z, i, zone);
      if (overlaps) active.splice(j, 1);
    }
  }
  return z;
}

// Order Block. 현재 봉이 직전 반대색 캔들을 변위 돌파하면 직전 캔들을 OB 구역으로 확정.
//  - bullish OB: 직전 bearish + 현재 bullish + close > 직전 high
//  - bearish OB: 직전 bullish + 현재 bearish + close < 직전 low
// minBodyRatio = 현재 봉 몸통/레인지 최소값. Python 엔진과 동일.
export function calculateOrderBlock(
  opens: number[],
  highs: number[],
  lows: number[],
  closes: number[],
  minBodyRatio = 0,
): ZoneResult {
  const n = closes.length;
  const z = emptyZone(n);
  for (let i = 1; i < n; i++) {
    const prevOpen = opens[i - 1];
    const prevHigh = highs[i - 1];
    const prevLow = lows[i - 1];
    const prevClose = closes[i - 1];
    const prevBodyLow = Math.min(prevOpen, prevClose);
    const prevBodyHigh = Math.max(prevOpen, prevClose);
    const range = highs[i] - lows[i];
    const body = Math.abs(closes[i] - opens[i]);
    const bodyOk = (range > 0 ? body / range : 0) >= minBodyRatio;
    const prevBearish = prevClose < prevOpen;
    const prevBullish = prevClose > prevOpen;
    const curBullish = closes[i] > opens[i];
    const curBearish = closes[i] < opens[i];
    const bullish = prevBearish && curBullish && closes[i] > prevHigh && bodyOk;
    const bearish = prevBullish && curBearish && closes[i] < prevLow && bodyOk;
    if (bullish) {
      z.bullish[i] = 1;
      z.direction[i] = 1;
    } else if (bearish) {
      z.bearish[i] = 1;
      z.direction[i] = -1;
    }
    if (bullish || bearish) {
      z.low[i] = prevBodyLow;
      z.high[i] = prevBodyHigh;
      z.mid[i] = (prevBodyLow + prevBodyHigh) / 2;
      z.size[i] = prevBodyHigh - prevBodyLow;
    }
  }
  markActiveOrderBlocks(z, closes);
  return z;
}

function markActiveOrderBlocks(z: ZoneResult, closes: number[]): void {
  const active: ActiveZone[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (z.direction[i] === 1 || z.direction[i] === -1) {
      active.push({ dir: z.direction[i] as 1 | -1, low: z.low[i], high: z.high[i], created: i });
    }
    for (let j = active.length - 1; j >= 0; j--) {
      const zone = active[j];
      const invalidated = zone.dir === 1 ? closes[i] < zone.low : closes[i] > zone.high;
      if (invalidated) {
        active.splice(j, 1);
        continue;
      }
      const closeInZone = closes[i] >= zone.low && closes[i] <= zone.high;
      if (closeInZone && z.activeDirection[i] === 0) markActiveZone(z, i, zone);
    }
  }
}

// 플러그인 레지스트리. 새 지표는 여기에 등록한다. (문서 7장)
export const indicatorRegistry: Record<string, unknown> = {
  RSI: calculateRSI,
  MACD: calculateMACD,
  EMA: calculateEMA,
  SMA: calculateSMA,
  ATR: calculateATR,
  FVG: calculateFVG,
  OB: calculateOrderBlock,
  ORDER_BLOCK: calculateOrderBlock,
};
