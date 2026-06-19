// 포지션 상태 머신. 문서 8장. 진입 당시 전략 버전을 고정 저장한다.
import type { Position, PositionState, StrategyRecord } from '../types';

const STEP_STATE: Record<number, PositionState> = {
  1: 'ENTERED_STEP_1',
  2: 'ENTERED_STEP_2',
  3: 'ENTERED_STEP_3',
};

export function newPositionId(symbol: string, now: Date): string {
  const d = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `pos_${symbol}_${d}_${rand}`;
}

// 1단계 신규 진입.
export function openPosition(
  strategy: StrategyRecord,
  side: 'LONG' | 'SHORT',
  fillPrice: number,
  fillQty: number,
  now: Date,
): Position {
  const maxStep = strategy.config.positionSizing.entries.length;
  return {
    positionId: newPositionId(strategy.config.symbol, now),
    symbol: strategy.config.symbol,
    side,
    strategyId: strategy.strategyId,
    strategyVersion: strategy.version,
    state: STEP_STATE[1],
    avgEntryPrice: fillPrice,
    totalSize: fillQty,
    currentStep: 1,
    maxStep,
    tpFilled: 0,
    realizedPnl: 0,
    openedAt: now.toISOString(),
    closedAt: null,
    updatedAt: now.toISOString(),
  };
}

// 분할 추가매수: 평단 갱신 + 단계 전진.
export function addToPosition(
  pos: Position,
  step: number,
  fillPrice: number,
  fillQty: number,
  now: Date,
): Position {
  const newSize = pos.totalSize + fillQty;
  const avg = (pos.avgEntryPrice * pos.totalSize + fillPrice * fillQty) / newSize;
  const fullyLoaded = step >= pos.maxStep;
  return {
    ...pos,
    avgEntryPrice: avg,
    totalSize: newSize,
    currentStep: step,
    state: fullyLoaded ? 'ENTERED_FULL' : STEP_STATE[step] ?? 'ENTERED_FULL',
    updatedAt: now.toISOString(),
  };
}

// 부분/전체 익절. 청산 비율만큼 줄이고 실현손익 누적.
// tpIndex 레벨을 체결 처리(tpFilled = tpIndex+1)하고, closeRemaining이면 잔량 전량 청산.
export function reducePosition(
  pos: Position,
  closeQty: number,
  fillPrice: number,
  now: Date,
  tpIndex: number,
  closeRemaining: boolean,
): Position {
  const qty = closeRemaining ? pos.totalSize : Math.min(closeQty, pos.totalSize);
  const pnl = pos.side === 'LONG'
    ? (fillPrice - pos.avgEntryPrice) * qty
    : (pos.avgEntryPrice - fillPrice) * qty;
  const remaining = +(pos.totalSize - qty).toFixed(8);
  const closed = closeRemaining || remaining <= 0;
  return {
    ...pos,
    totalSize: closed ? 0 : remaining,
    tpFilled: tpIndex + 1,
    realizedPnl: pos.realizedPnl + pnl,
    state: closed ? 'CLOSED' : 'PARTIAL_TAKE_PROFIT',
    closedAt: closed ? now.toISOString() : pos.closedAt,
    updatedAt: now.toISOString(),
  };
}
