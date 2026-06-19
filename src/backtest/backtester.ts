// 백테스트 엔진. 문서 16/17장.
// 라이브와 동일한 buildContext/decide/상태머신을 과거 4시간봉에 바-바이-바로 적용해,
// 실거래 판단과 일치하는 결과를 낸다. 체결은 해당 캔들 종가로 가정.
import type { Candle, Position, StrategyConfig, StrategyRecord } from '../types';
import {
  precomputeIndicators, contextAt, decideHedge,
  precomputeMTF, contextAtMTF, type Decision, type Streams,
} from '../strategy/strategyEngine';
import { computeQuantity } from '../execution/orderExecutor';
import { addToPosition, openPosition, reducePosition } from '../position/positionStateMachine';

export interface Trade {
  side: 'LONG' | 'SHORT';
  entryTime: number;
  exitTime: number;
  avgEntry: number;
  exitPrice: number;
  size: number;
  pnl: number;
  bars: number;
  steps: number;
}

export interface BacktestResult {
  startEquity: number;
  endEquity: number;
  totalReturnPercent: number;
  trades: number;
  wins: number;
  losses: number;
  winRatePercent: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  maxConsecutiveLosses: number;
  avgHoldingBars: number;
  worstTradePnl: number;
  bestTradePnl: number;
  openAtEnd: boolean;
  firstCandle: number;
  lastCandle: number;
  tradeList: Trade[];
  equityCurve: EquityPoint[];
}

export interface EquityPoint {
  time: number; // 캔들 openTime (ms)
  equity: number;
}

export interface BacktestOptions {
  startEquity?: number;
  warmupBars?: number;
}

export function runBacktest(
  config: StrategyConfig,
  candles: Candle[],
  opts: BacktestOptions = {},
): BacktestResult {
  const startEquity = opts.startEquity ?? 10000;
  const warmup = opts.warmupBars ?? 210; // EMA200 안정화

  // 시드 전략 버전 컨텍스트(상태머신용). 백테스트는 단일 활성 전략 기준.
  const strategy: StrategyRecord = {
    strategyId: config.strategyId,
    version: 1,
    name: config.name,
    config,
    status: 'active',
  };

  // 헤지: 롱/숏 슬롯 독립 운용. 각 슬롯은 자체 DCA 단계/진입바를 가진다.
  const long: Slot = { pos: null, entryBar: 0 };
  const short: Slot = { pos: null, entryBar: 0 };
  const trades: Trade[] = [];
  let cumPnl = 0;

  const equityCurve: EquityPoint[] = [];

  // 지표는 전체 캔들에 대해 한 번만 계산하고 바별로 인덱싱한다 (O(n)).
  const indicators = precomputeIndicators(config, candles);

  for (let i = warmup; i < candles.length; i++) {
    const price = candles[i].close;
    // 헤지에서는 평단이 슬롯별로 다르므로 포지션 비종속 ctx(avgEntry=NaN)로 평가한다.
    const ctx = contextAt(indicators, i, null); // [0..i], i가 "마감된" 마지막 캔들
    const decisions = decideHedge(config, ctx, { long: long.pos, short: short.pos });

    for (const decision of decisions) {
      if (!('side' in decision)) continue; // hold / no_signal
      const slot = decision.side === 'LONG' ? long : short;
      cumPnl += applyDecision(slot, decision, i, price, candles, config, strategy, startEquity, trades);
    }

    // 에쿼티 곡선(실현 + 미실현)으로 MDD 산출. 숏은 부호 반대. 두 슬롯 합산.
    const unrealized = slotUnrealized(long.pos, price) + slotUnrealized(short.pos, price);
    equityCurve.push({ time: candles[i].openTime, equity: startEquity + cumPnl + unrealized });
  }

  return summarize(trades, equityCurve, startEquity, candles, !!(long.pos || short.pos), warmup);
}

function summarize(
  trades: Trade[],
  equityCurve: EquityPoint[],
  startEquity: number,
  candles: Candle[],
  openAtEnd: boolean,
  warmup: number,
): BacktestResult {
  let grossProfit = 0;
  let grossLoss = 0;
  let wins = 0;
  let losses = 0;
  let maxConsec = 0;
  let consec = 0;
  let best = -Infinity;
  let worst = Infinity;
  let holdSum = 0;
  for (const t of trades) {
    if (t.pnl >= 0) {
      grossProfit += t.pnl;
      wins++;
      consec = 0;
    } else {
      grossLoss += -t.pnl;
      losses++;
      consec++;
      maxConsec = Math.max(maxConsec, consec);
    }
    best = Math.max(best, t.pnl);
    worst = Math.min(worst, t.pnl);
    holdSum += t.bars;
  }

  let peak = -Infinity;
  let maxDd = 0;
  for (const point of equityCurve) {
    peak = Math.max(peak, point.equity);
    if (peak > 0) maxDd = Math.max(maxDd, (peak - point.equity) / peak);
  }

  const endEquity = equityCurve.length ? equityCurve[equityCurve.length - 1].equity : startEquity;
  return {
    startEquity,
    endEquity,
    totalReturnPercent: ((endEquity - startEquity) / startEquity) * 100,
    trades: trades.length,
    wins,
    losses,
    winRatePercent: trades.length ? (wins / trades.length) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    maxDrawdownPercent: maxDd * 100,
    maxConsecutiveLosses: maxConsec,
    avgHoldingBars: trades.length ? holdSum / trades.length : 0,
    worstTradePnl: trades.length ? worst : 0,
    bestTradePnl: trades.length ? best : 0,
    openAtEnd,
    firstCandle: candles[warmup]?.openTime ?? 0,
    lastCandle: candles[candles.length - 1]?.openTime ?? 0,
    tradeList: trades,
    equityCurve,
  };
}

// MTF 백테스트: 지표는 각 상위봉, 진입/청산은 executionTimeframe 봉마다. 헤지 호환.
export function runBacktestMTF(
  config: StrategyConfig,
  streams: Streams,
  opts: BacktestOptions = {},
): BacktestResult {
  const startEquity = opts.startEquity ?? 10000;
  const strategy: StrategyRecord = {
    strategyId: config.strategyId, version: 1, name: config.name, config, status: 'active',
  };

  const p = precomputeMTF(config, streams);
  const exec = p.exec;
  const long: Slot = { pos: null, entryBar: 0 };
  const short: Slot = { pos: null, entryBar: 0 };
  const trades: Trade[] = [];
  let cumPnl = 0;
  const equityCurve: EquityPoint[] = [];

  for (let i = p.warmup; i < exec.length; i++) {
    const price = exec[i].close;
    const ctx = contextAtMTF(p, i, null);
    const decisions = decideHedge(config, ctx, { long: long.pos, short: short.pos });
    for (const decision of decisions) {
      if (!('side' in decision)) continue;
      const slot = decision.side === 'LONG' ? long : short;
      cumPnl += applyDecision(slot, decision, i, price, exec, config, strategy, startEquity, trades);
    }
    const unrealized = slotUnrealized(long.pos, price) + slotUnrealized(short.pos, price);
    equityCurve.push({ time: exec[i].openTime, equity: startEquity + cumPnl + unrealized });
  }

  return summarize(trades, equityCurve, startEquity, exec, !!(long.pos || short.pos), p.warmup);
}

interface Slot {
  pos: Position | null;
  entryBar: number;
}

function slotUnrealized(pos: Position | null, price: number): number {
  if (!pos) return 0;
  return (pos.side === 'LONG' ? price - pos.avgEntryPrice : pos.avgEntryPrice - price) * pos.totalSize;
}

// 한 슬롯에 결정 1개 적용. 슬롯을 변경하고, 청산 시 trades에 push. 실현손익 증분을 반환.
function applyDecision(
  slot: Slot,
  decision: Decision & { side: 'LONG' | 'SHORT' },
  i: number,
  price: number,
  candles: Candle[],
  config: StrategyConfig,
  strategy: StrategyRecord,
  startEquity: number,
  trades: Trade[],
): number {
  const when = new Date(candles[i].closeTime);

  if (decision.action === 'enter') {
    const qty = computeQuantity(config, startEquity, decision.sizePercent, price);
    if (qty > 0) {
      slot.pos = openPosition(strategy, decision.side, price, qty, when);
      slot.entryBar = i;
    }
    return 0;
  }

  const pos = slot.pos;
  if (!pos) return 0;

  if (decision.action === 'add') {
    const qty = computeQuantity(config, startEquity, decision.sizePercent, price);
    if (qty > 0) slot.pos = addToPosition(pos, decision.step, price, qty, when);
    return 0;
  }

  if (decision.action === 'take_profit' || decision.action === 'stop_loss') {
    const isSl = decision.action === 'stop_loss';
    const closeQty = isSl || decision.closeRemaining
      ? floorQty(pos.totalSize)
      : floorQty(pos.totalSize * (decision.sizePercent / 100));
    const before = pos.realizedPnl;
    const sizeAtEntry = pos.totalSize;
    const tpIndex = isSl ? pos.tpFilled : decision.tpIndex;
    const closeRemaining = isSl ? true : decision.closeRemaining;
    const updated = reducePosition(pos, closeQty, price, when, tpIndex, closeRemaining);
    if (updated.state === 'CLOSED') {
      trades.push({
        side: pos.side,
        entryTime: pos.openedAt ? Date.parse(pos.openedAt) : candles[slot.entryBar].openTime,
        exitTime: candles[i].closeTime,
        avgEntry: pos.avgEntryPrice,
        exitPrice: price,
        size: sizeAtEntry,
        pnl: updated.realizedPnl,
        bars: i - slot.entryBar,
        steps: pos.currentStep,
      });
      slot.pos = null;
    } else {
      slot.pos = updated;
    }
    return updated.realizedPnl - before;
  }

  return 0;
}

function floorQty(qty: number): number {
  return Math.max(0, Math.floor(qty * 1000) / 1000);
}
