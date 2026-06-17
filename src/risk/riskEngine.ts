// 리스크 엔진: 모든 주문의 최종 승인/거부. 문서 12장.
// 전략 점수가 아무리 높아도 여기서 막히면 주문은 실행되지 않는다.
import type { StrategyConfig } from '../types';

// 계정/포지션 현황 스냅샷. d1Repository가 집계해서 넘긴다.
export interface RiskSnapshot {
  openPositionsCount: number;
  hasPendingOrder: boolean;
  dailyPnlPercent: number;     // 음수면 손실 (예: -1.5)
  weeklyPnlPercent: number;
  consecutiveLosses: number;
  liquidationDistancePercent: number; // 신규/추가 진입 대상의 청산가까지 거리(%). 모르면 100.
}

export interface RiskResult {
  approved: boolean;
  blockedBy: string[];
}

// 신규 진입/추가 진입에 대한 리스크 평가. 청산(익절)은 차단하지 않는다.
export function checkEntryRisk(
  config: StrategyConfig,
  snap: RiskSnapshot,
  isNewPosition: boolean,
): RiskResult {
  const r = config.risk;
  const blockedBy: string[] = [];

  if (isNewPosition && snap.openPositionsCount >= r.maxOpenPositions) {
    blockedBy.push(`최대 동시 포지션 초과 (${snap.openPositionsCount}/${r.maxOpenPositions})`);
  }
  if (r.disableNewEntryWhenOrderPending && snap.hasPendingOrder) {
    blockedBy.push('미체결 주문 존재');
  }
  if (snap.dailyPnlPercent <= -r.maxDailyLossPercent) {
    blockedBy.push(`일일 손실 한도 초과 (${snap.dailyPnlPercent}% ≤ -${r.maxDailyLossPercent}%)`);
  }
  if (snap.weeklyPnlPercent <= -r.maxWeeklyLossPercent) {
    blockedBy.push(`주간 손실 한도 초과 (${snap.weeklyPnlPercent}% ≤ -${r.maxWeeklyLossPercent}%)`);
  }
  if (snap.consecutiveLosses >= r.maxConsecutiveLosses) {
    blockedBy.push(`연속 손실 한도 (${snap.consecutiveLosses}/${r.maxConsecutiveLosses})`);
  }
  if (snap.liquidationDistancePercent < r.minLiquidationDistancePercent) {
    blockedBy.push(
      `청산가 거리 부족 (${snap.liquidationDistancePercent}% < ${r.minLiquidationDistancePercent}%)`,
    );
  }

  return { approved: blockedBy.length === 0, blockedBy };
}
