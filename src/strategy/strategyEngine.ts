// 캔들 + 전략 설정 → EvalContext 구성 및 진입/추가/청산 판단. 문서 6/13장.
import type { Candle, EvalContext, Position, StrategyConfig } from '../types';
import {
  calculateATR,
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
    rsi14: p.rsi[i],
    ema200: p.ema[i],
    atr14: p.atr[i],
    volumeMA20: p.volMa[i],
    'macd.histogram': p.macd.histogram[i],
    'macd.histogram.previous': p.macd.histogram[i - 1],
    'fvg.bullish': p.fvg.bullish[i],
    'fvg.bearish': p.fvg.bearish[i],
    'fvg.direction': p.fvg.direction[i],
    'fvg.low': p.fvg.low[i],
    'fvg.high': p.fvg.high[i],
    'fvg.mid': p.fvg.mid[i],
    'fvg.size': p.fvg.size[i],
    'ob.bullish': p.ob.bullish[i],
    'ob.bearish': p.ob.bearish[i],
    'ob.direction': p.ob.direction[i],
    'ob.low': p.ob.low[i],
    'ob.high': p.ob.high[i],
    'ob.mid': p.ob.mid[i],
    'ob.size': p.ob.size[i],
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

export type Decision =
  | { action: 'enter'; side: 'LONG'; sizePercent: number; score: ScoreResult }
  | { action: 'add'; side: 'LONG'; step: number; sizePercent: number }
  | { action: 'take_profit'; side: 'LONG'; sizePercent: number; tpIndex: number; closeRemaining: boolean }
  | { action: 'stop_loss'; side: 'LONG'; sizePercent: number; closeRemaining: true }
  | { action: 'hold'; reason: string }
  | { action: 'no_signal'; score: ScoreResult };

// 포지션 유무에 따라 다음 행동 후보 1개를 결정한다 (리스크 엔진 통과 전).
export function decide(config: StrategyConfig, ctx: EvalContext, position: Position | null): Decision {
  const long = config.entry.long;

  // 1) 보유 포지션이 없으면 신규 진입 후보 평가.
  if (!position || position.state === 'CLOSED' || position.state === 'IDLE') {
    if (!long || !long.enabled) return { action: 'hold', reason: 'long disabled' };
    const score = evaluateEntry(long, ctx);
    if (score.passed) {
      const step1 = config.positionSizing.entries[0];
      return { action: 'enter', side: 'LONG', sizePercent: step1.sizePercent, score };
    }
    return { action: 'no_signal', score };
  }

  // 2) 보유 중: 익절 먼저 확인 (청산 우선). 문서 11장.
  // 분할익절 레벨은 가격 오름차순이므로 다음 미체결 레벨(tpFilled)만 본다.
  // 각 레벨은 1회만 체결하고, 마지막 레벨은 잔량을 전량 청산한다(잔여 dust 방지).
  const tps = config.exit.takeProfit;
  const t = position.tpFilled;
  if (t < tps.length && safeTrigger(tps[t].trigger, ctx)) {
    const isLast = t === tps.length - 1;
    return {
      action: 'take_profit',
      side: 'LONG',
      sizePercent: tps[t].sizePercent,
      tpIndex: t,
      closeRemaining: isLast,
    };
  }

  const stopLoss = config.exit.stopLoss;
  if (stopLoss && safeTrigger(stopLoss.trigger, ctx)) {
    return { action: 'stop_loss', side: 'LONG', sizePercent: stopLoss.sizePercent, closeRemaining: true };
  }

  // 3) 분할 추가매수: 다음 단계 트리거 확인.
  const nextStep = position.currentStep + 1;
  const stepCfg = config.positionSizing.entries.find((e) => e.step === nextStep);
  if (stepCfg && nextStep <= position.maxStep && safeTrigger(stepCfg.trigger, ctx)) {
    return { action: 'add', side: 'LONG', step: nextStep, sizePercent: stepCfg.sizePercent };
  }

  return { action: 'hold', reason: 'no exit/add trigger' };
}

function safeTrigger(expr: string, ctx: EvalContext): boolean {
  // 'initial_signal' 같은 비표현식 트리거는 자동 판단 대상이 아니다.
  if (!/[<>=]/.test(expr)) return false;
  try {
    return evaluateTrigger(expr, ctx);
  } catch {
    return false;
  }
}
