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

// 플러그인 레지스트리. 새 지표는 여기에 등록한다. (문서 7장)
export const indicatorRegistry: Record<string, unknown> = {
  RSI: calculateRSI,
  MACD: calculateMACD,
  EMA: calculateEMA,
  SMA: calculateSMA,
  ATR: calculateATR,
};
