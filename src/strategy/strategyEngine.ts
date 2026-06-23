// 캔들 + 전략 설정 → EvalContext 구성 및 진입/추가/청산 판단. 문서 6/13장.
import type { Candle, EvalContext, IndicatorSpec, Position, PositionBook, StrategyConfig } from '../types';
import {
  calculateATR,
  calculateBollinger,
  calculateEMA,
  calculateFVG,
  calculateMACD,
  calculateOrderBlock,
  calculateRSI,
  calculateSMA,
} from '../indicators';
import { evaluateEntry, type ScoreResult } from './scoreEngine';
import { evaluateTrigger } from './conditionParser';

// 전체 캔들에 대해 표준 지표 세트를 한 번만 계산해 둔다.
// 백테스트는 이를 바별로 인덱싱해 O(n)으로 평가한다 (바마다 재계산 X). 문서 19장.
export interface PrecomputedIndicators {
  closes: number[];
  highs: number[];
  lows: number[];
  volumes: number[];
  rsi: number[];
  atr: number[];
  ema: number[];
  volMa: number[];
  macd: ReturnType<typeof calculateMACD>;
  fvg: ReturnType<typeof calculateFVG>;
  ob: ReturnType<typeof calculateOrderBlock>;
  boll: ReturnType<typeof calculateBollinger>;
}

export function precomputeIndicators(config: StrategyConfig, candles: Candle[]): PrecomputedIndicators {
  const closes = candles.map((c) => c.close);
  const opens = candles.map((c) => c.open);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);

  const rsiPeriod = config.indicators.rsi14?.period ?? 14;
  const atrPeriod = config.indicators.atr14?.period ?? 14;
  const emaPeriod = config.indicators.ema200?.period ?? 200;
  const volMaPeriod = config.indicators.volumeMA20?.period ?? 20;
  const macdSpec = config.indicators.macd ?? { type: 'MACD', fast: 12, slow: 26, signal: 9 };

  const obSpec = config.indicators.ob ?? config.indicators.orderBlock;
  const bollSpec = config.indicators.boll ?? config.indicators.bollinger;

  return {
    closes,
    highs,
    lows,
    volumes,
    rsi: calculateRSI(closes, rsiPeriod),
    atr: calculateATR(highs, lows, closes, atrPeriod),
    ema: calculateEMA(closes, emaPeriod),
    volMa: calculateSMA(volumes, volMaPeriod),
    macd: calculateMACD(closes, macdSpec.fast ?? 12, macdSpec.slow ?? 26, macdSpec.signal ?? 9),
    // FVG / Order Block: 가격 구역 지표. 조건식에서 fvg.* / ob.* 로 참조한다.
    fvg: calculateFVG(highs, lows),
    ob: calculateOrderBlock(opens, highs, lows, closes, obSpec?.minBodyRatio ?? 0),
    // 볼린저 밴드. 조건식에서 boll.upper / boll.lower / boll.mid / boll.percentB 로 참조한다.
    boll: calculateBollinger(closes, bollSpec?.period ?? 20, bollSpec?.std ?? 2),
  };
}

// 미리 계산된 지표 배열에서 인덱스 i 시점의 EvalContext를 만든다.
export function contextAt(p: PrecomputedIndicators, i: number, position: Position | null): EvalContext {
  return {
    close: p.closes[i],
    previousClose: p.closes[i - 1],
    high: p.highs[i],
    low: p.lows[i],
    volume: p.volumes[i],
    rsi: p.rsi[i],
    ema: p.ema[i],
    atr: p.atr[i],
    volMa: p.volMa[i],
    'macd.histogram': p.macd.histogram[i],
    'macd.histogram.previous': p.macd.histogram[i - 1],
    'fvg.bullish': p.fvg.bullish[i],
    'fvg.bearish': p.fvg.bearish[i],
    'fvg.direction': p.fvg.direction[i],
    'fvg.low': p.fvg.low[i],
    'fvg.high': p.fvg.high[i],
    'fvg.mid': p.fvg.mid[i],
    'fvg.size': p.fvg.size[i],
    'fvg.activeBullish': p.fvg.activeBullish[i],
    'fvg.activeBearish': p.fvg.activeBearish[i],
    'fvg.activeDirection': p.fvg.activeDirection[i],
    'fvg.activeLow': p.fvg.activeLow[i],
    'fvg.activeHigh': p.fvg.activeHigh[i],
    'fvg.activeMid': p.fvg.activeMid[i],
    'fvg.activeSize': p.fvg.activeSize[i],
    'ob.bullish': p.ob.bullish[i],
    'ob.bearish': p.ob.bearish[i],
    'ob.direction': p.ob.direction[i],
    'ob.low': p.ob.low[i],
    'ob.high': p.ob.high[i],
    'ob.mid': p.ob.mid[i],
    'ob.size': p.ob.size[i],
    'ob.activeBullish': p.ob.activeBullish[i],
    'ob.activeBearish': p.ob.activeBearish[i],
    'ob.activeDirection': p.ob.activeDirection[i],
    'ob.activeLow': p.ob.activeLow[i],
    'ob.activeHigh': p.ob.activeHigh[i],
    'ob.activeMid': p.ob.activeMid[i],
    'ob.activeSize': p.ob.activeSize[i],
    'obFvg.bullishConfluence': p.ob.activeBullish[i] && p.fvg.activeBullish[i] ? 1 : 0,
    'obFvg.bearishConfluence': p.ob.activeBearish[i] && p.fvg.activeBearish[i] ? 1 : 0,
    'boll.upper': p.boll.upper[i],
    'boll.lower': p.boll.lower[i],
    'boll.mid': p.boll.mid[i],
    'boll.percentB': p.boll.percentB[i],
    avgEntry: position ? position.avgEntryPrice : NaN,
    price: p.closes[i],
  };
}

// MVP 지표는 전략 JSON에 선언되지만, 계산은 표준 세트로 고정한다
// (RSI14 / MACD / ATR14 / EMA200 / volumeMA20). 문서 19장.
export function buildContext(config: StrategyConfig, candles: Candle[], position: Position | null): EvalContext {
  const p = precomputeIndicators(config, candles);
  return contextAt(p, candles.length - 1, position); // 마지막(=마감) 캔들
}

// ───────────── 멀티 타임프레임(MTF) ─────────────
// 지표는 각자 timeframe(상위봉)으로 계산하고, executionTimeframe(예: 5m)마다 평가한다.
// 변수명은 지표 key가 접두사: 예) key "ob4h" → ob4h.activeBullish, key "boll" → boll.upper.
// 가격(close/high/low/volume)은 실행봉 값. 상위봉 값은 "그 시점까지 마감된 최신 봉"으로 채운다.

export type Streams = Record<string, Candle[]>;

interface MtfKey {
  key: string;
  tf: string;
  type: string;
  scalar?: number[];
  macd?: ReturnType<typeof calculateMACD>;
  boll?: ReturnType<typeof calculateBollinger>;
  zone?: ReturnType<typeof calculateFVG>; // FVG/OB 공통 ZoneResult
}

export interface MtfPrecomp {
  exec: Candle[];
  tfMap: Record<string, number[]>; // tf -> (execIndex -> 마감된 최신 htf index, 없으면 -1)
  keys: MtfKey[];
  warmup: number; // 사용 가능한 첫 실행봉 index
}

function indicatorTf(config: StrategyConfig, spec: IndicatorSpec): string {
  return spec.timeframe ?? config.timeframe;
}

// tf별 워밍업 필요 봉 수 = 그 tf에서 쓰는 지표들의 최대 lookback.
function tfWarmup(config: StrategyConfig, tf: string): number {
  let need = 3; // FVG/OB 최소
  for (const spec of Object.values(config.indicators)) {
    if (indicatorTf(config, spec) !== tf) continue;
    const t = spec.type.toUpperCase();
    if (t === 'MACD') need = Math.max(need, (spec.slow ?? 26) + (spec.signal ?? 9));
    else if (t === 'BOLL' || t === 'BOLLINGER') need = Math.max(need, spec.period ?? 20);
    else if (spec.period) need = Math.max(need, spec.period);
  }
  return need;
}

// exec 봉 i 시점에 "마감된 최신 htf 봉" 인덱스. 두 배열 모두 시간 오름차순 → 포인터 1회 주행.
function buildTfMap(exec: Candle[], htf: Candle[]): number[] {
  const map = new Array<number>(exec.length).fill(-1);
  let j = -1;
  for (let i = 0; i < exec.length; i++) {
    while (j + 1 < htf.length && htf[j + 1].closeTime <= exec[i].closeTime) j++;
    map[i] = j;
  }
  return map;
}

export function precomputeMTF(config: StrategyConfig, streams: Streams): MtfPrecomp {
  const execTf = config.executionTimeframe;
  if (!execTf || !streams[execTf]) throw new Error(`executionTimeframe 캔들 없음: ${execTf}`);
  const exec = streams[execTf];

  const tfMap: Record<string, number[]> = {};
  const ensureMap = (tf: string) => {
    if (!tfMap[tf]) {
      if (!streams[tf]) throw new Error(`타임프레임 캔들 없음: ${tf}`);
      tfMap[tf] = buildTfMap(exec, streams[tf]);
    }
  };

  const keys: MtfKey[] = [];
  let warmupTime = 0;
  for (const [key, spec] of Object.entries(config.indicators)) {
    const tf = indicatorTf(config, spec);
    ensureMap(tf);
    const c = streams[tf];
    const closes = c.map((x) => x.close);
    const t = spec.type.toUpperCase();
    const mk: MtfKey = { key, tf, type: t };
    if (t === 'RSI') mk.scalar = calculateRSI(closes, spec.period ?? 14);
    else if (t === 'EMA') mk.scalar = calculateEMA(closes, spec.period ?? 200);
    else if (t === 'SMA') mk.scalar = calculateSMA(spec.source === 'volume' ? c.map((x) => x.volume) : closes, spec.period ?? 20);
    else if (t === 'ATR') mk.scalar = calculateATR(c.map((x) => x.high), c.map((x) => x.low), closes, spec.period ?? 14);
    else if (t === 'MACD') mk.macd = calculateMACD(closes, spec.fast ?? 12, spec.slow ?? 26, spec.signal ?? 9);
    else if (t === 'BOLL' || t === 'BOLLINGER') mk.boll = calculateBollinger(closes, spec.period ?? 20, spec.std ?? 2);
    else if (t === 'FVG') mk.zone = calculateFVG(c.map((x) => x.high), c.map((x) => x.low));
    else if (t === 'OB' || t === 'ORDERBLOCK') mk.zone = calculateOrderBlock(c.map((x) => x.open), c.map((x) => x.high), c.map((x) => x.low), closes, spec.minBodyRatio ?? 0);
    else continue; // 알 수 없는 타입은 무시
    keys.push(mk);

    // 이 tf의 워밍업이 끝나는 htf closeTime → 그 시점 이후 첫 exec 봉부터 사용 가능.
    const needBars = tfWarmup(config, tf);
    const htf = streams[tf];
    if (htf[needBars]) warmupTime = Math.max(warmupTime, htf[needBars].closeTime);
  }

  // 모든 tf 워밍업을 만족하는 첫 실행봉.
  let warmup = exec.findIndex((b) => b.closeTime >= warmupTime);
  if (warmup < 1) warmup = 1; // previousClose 위해 최소 1
  return { exec, tfMap, keys, warmup };
}

function fillZone(ctx: Record<string, number>, prefix: string, z: ReturnType<typeof calculateFVG>, j: number): void {
  const g = (arr: number[]) => (j >= 0 ? arr[j] : NaN);
  ctx[prefix + '.bullish'] = g(z.bullish);
  ctx[prefix + '.bearish'] = g(z.bearish);
  ctx[prefix + '.direction'] = g(z.direction);
  ctx[prefix + '.low'] = g(z.low);
  ctx[prefix + '.high'] = g(z.high);
  ctx[prefix + '.mid'] = g(z.mid);
  ctx[prefix + '.size'] = g(z.size);
  ctx[prefix + '.activeBullish'] = g(z.activeBullish);
  ctx[prefix + '.activeBearish'] = g(z.activeBearish);
  ctx[prefix + '.activeDirection'] = g(z.activeDirection);
  ctx[prefix + '.activeLow'] = g(z.activeLow);
  ctx[prefix + '.activeHigh'] = g(z.activeHigh);
  ctx[prefix + '.activeMid'] = g(z.activeMid);
  ctx[prefix + '.activeSize'] = g(z.activeSize);
}

// 실행봉 i 시점의 EvalContext. 가격은 5m, 지표는 각 상위봉의 마감 최신값.
export function contextAtMTF(p: MtfPrecomp, i: number, position: Position | null): EvalContext {
  const ctx: Record<string, number> = {
    // 표준 필드는 MTF에서 직접 쓰지 않으면 NaN (조건이 참조하면 비교가 false).
    rsi: NaN, ema: NaN, atr: NaN, volMa: NaN,
    'macd.histogram': NaN, 'macd.histogram.previous': NaN,
  };
  const exec = p.exec;
  ctx.close = exec[i].close;
  ctx.previousClose = i > 0 ? exec[i - 1].close : NaN;
  ctx.high = exec[i].high;
  ctx.low = exec[i].low;
  ctx.volume = exec[i].volume;
  ctx.price = exec[i].close;
  ctx.avgEntry = position ? position.avgEntryPrice : NaN;

  for (const mk of p.keys) {
    const j = p.tfMap[mk.tf][i];
    const valid = j >= 0;
    if (mk.scalar) {
      ctx[mk.key] = valid ? mk.scalar[j] : NaN;
    } else if (mk.macd) {
      ctx[mk.key + '.histogram'] = valid ? mk.macd.histogram[j] : NaN;
      ctx[mk.key + '.histogram.previous'] = valid && j > 0 ? mk.macd.histogram[j - 1] : NaN;
    } else if (mk.boll) {
      ctx[mk.key + '.upper'] = valid ? mk.boll.upper[j] : NaN;
      ctx[mk.key + '.lower'] = valid ? mk.boll.lower[j] : NaN;
      ctx[mk.key + '.mid'] = valid ? mk.boll.mid[j] : NaN;
      ctx[mk.key + '.percentB'] = valid ? mk.boll.percentB[j] : NaN;
    } else if (mk.zone) {
      fillZone(ctx, mk.key, mk.zone, valid ? j : -1);
    }
  }
  return ctx as unknown as EvalContext;
}

export type Decision =
  | { action: 'enter'; side: 'LONG' | 'SHORT'; sizePercent: number; score: ScoreResult }
  | { action: 'add'; side: 'LONG' | 'SHORT'; step: number; sizePercent: number }
  | { action: 'take_profit'; side: 'LONG' | 'SHORT'; sizePercent: number; tpIndex: number; closeRemaining: boolean }
  | { action: 'stop_loss'; side: 'LONG' | 'SHORT'; sizePercent: number; closeRemaining: true }
  | { action: 'hold'; reason: string }
  | { action: 'no_signal'; score: ScoreResult };

// 평단 대비 거리(가격). pnlPercent는 레버리지 적용 PnL/ROE %, pct는 가격 %, 없으면 atrMult * ATR.
function stepDistance(
  step: { pnlPercent?: number; atrMult?: number; pct?: number },
  avg: number,
  atr: number,
  leverage = 1,
): number {
  if (step.pnlPercent != null) return avg * (step.pnlPercent / Math.max(1, leverage)) / 100;
  if (step.pct != null) return avg * (step.pct / 100);
  return (step.atrMult ?? 0) * atr;
}

// 헤지 모드 판단. 롱/숏 슬롯을 독립적으로 평가해 이번 바의 행동 목록을 만든다.
// - 빈 슬롯: 해당 방향 진입 후보 평가.
// - 보유 슬롯: 평단 대비 청산/추가 판단 (manageSide).
// 슬롯이 상호 독립이므로 한 바에 최대 2개(롱·숏) 행동이 나올 수 있다.
export function decideHedge(config: StrategyConfig, ctx: EvalContext, book: PositionBook): Decision[] {
  const out: Decision[] = [];
  const step1 = config.positionSizing.entries[0];

  // 보유 슬롯 관리 (익절/손절/추가).
  if (book.long) out.push(manageSide(config, ctx, book.long));
  if (book.short) out.push(manageSide(config, ctx, book.short));

  // 빈 슬롯 진입 평가. 무포지션인 방향만. HTF 게이트 통과 + (있으면) 실행봉 confirmTrigger.
  if (!book.long && config.entry.long?.enabled) {
    const score = evaluateEntry(config.entry.long, ctx);
    if (score.passed && triggerOk(config.entry.long.confirmTrigger, ctx)) {
      out.push({ action: 'enter', side: 'LONG', sizePercent: step1.sizePercent, score });
    } else out.push({ action: 'no_signal', score });
  }
  if (!book.short && config.entry.short?.enabled) {
    const score = evaluateEntry(config.entry.short, ctx);
    if (score.passed && triggerOk(config.entry.short.confirmTrigger, ctx)) {
      out.push({ action: 'enter', side: 'SHORT', sizePercent: step1.sizePercent, score });
    } else out.push({ action: 'no_signal', score });
  }
  return out;
}

// confirmTrigger: 없으면 통과. 식 평가 결과가 참(1)이어야 진입.
function triggerOk(trigger: string | undefined, ctx: EvalContext): boolean {
  if (!trigger) return true;
  try {
    return evaluateTrigger(trigger, ctx);
  } catch {
    return false; // 식 오류/미정의 변수면 진입 보류
  }
}

// 보유 중인 단일 포지션의 청산/추가 판단. side 방향에 맞춰 거리 부호 적용. 익절 우선. 문서 11장.
function manageSide(config: StrategyConfig, ctx: EvalContext, position: Position): Decision {
  const isLong = position.side === 'LONG';
  const avg = position.avgEntryPrice;
  const atr = ctx.atr;
  const price = ctx.price;

  // 분할익절: 다음 미체결 레벨만. 유리 방향으로 거리만큼 갔을 때.
  const tps = config.exit.takeProfit;
  const t = position.tpFilled;
  if (t < tps.length) {
    const d = stepDistance(tps[t], avg, atr, config.positionSizing.leverage);
    const hit = isLong ? price >= avg + d : price <= avg - d;
    if (hit) {
      return {
        action: 'take_profit',
        side: position.side,
        sizePercent: tps[t].sizePercent,
        tpIndex: t,
        closeRemaining: t === tps.length - 1,
      };
    }
  }

  // 손절: 불리 방향으로 거리만큼 갔을 때.
  const sl = config.exit.stopLoss;
  if (sl) {
    const d = stepDistance(sl, avg, atr, config.positionSizing.leverage);
    const hit = isLong ? price <= avg - d : price >= avg + d;
    if (hit) return { action: 'stop_loss', side: position.side, sizePercent: sl.sizePercent, closeRemaining: true };
  }

  // 분할 추가: 평단 대비 불리 방향으로 거리만큼 갔을 때.
  const nextStep = position.currentStep + 1;
  const stepCfg = config.positionSizing.entries.find((e) => e.step === nextStep);
  if (stepCfg && nextStep <= position.maxStep) {
    const d = stepDistance(stepCfg, avg, atr);
    const hit = isLong ? price <= avg - d : price >= avg + d;
    if (hit) return { action: 'add', side: position.side, step: nextStep, sizePercent: stepCfg.sizePercent };
  }

  return { action: 'hold', reason: 'no exit/add trigger' };
}
