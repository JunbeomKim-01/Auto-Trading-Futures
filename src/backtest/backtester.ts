// 백테스트 엔진. 문서 16/17장.
// 라이브와 동일한 buildContext/decide/상태머신을 과거 4시간봉에 바-바이-바로 적용해,
// 실거래 판단과 일치하는 결과를 낸다. 체결은 해당 캔들 종가로 가정.
import type { Candle, Position, StrategyConfig, StrategyRecord } from '../types';
import { buildContext, decide } from '../strategy/strategyEngine';
import { computeQuantity } from '../execution/orderExecutor';
import { addToPosition, openPosition, reducePosition } from '../position/positionStateMachine';

export interface Trade {
  side: 'LONG';
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

  let position: Position | null = null;
  let entryBarIndex = 0;
  const trades: Trade[] = [];
  let cumPnl = 0;

  const equityCurve: EquityPoint[] = [];

  for (let i = warmup; i < candles.length; i++) {
    const window = candles.slice(0, i + 1); // [0..i], i가 "마감된" 마지막 캔들
    const price = candles[i].close;
    const ctx = buildContext(config, window, position);
    const decision = decide(config, ctx, position);

    if (decision.action === 'enter') {
      const qty = computeQuantity(config, startEquity, decision.sizePercent, price);
      if (qty > 0) {
        position = openPosition(strategy, 'LONG', price, qty, new Date(candles[i].closeTime));
        entryBarIndex = i;
      }
    } else if (decision.action === 'add' && position) {
      const qty = computeQuantity(config, startEquity, decision.sizePercent, price);
      if (qty > 0) {
        position = addToPosition(position, decision.step, price, qty, new Date(candles[i].closeTime));
      }
    } else if (decision.action === 'take_profit' && position) {
      const closeQty = decision.closeRemaining
        ? floorQty(position.totalSize)
        : floorQty(position.totalSize * (decision.sizePercent / 100));
      const before = position.realizedPnl;
      const sizeAtEntry = position.totalSize;
      const updated = reducePosition(
        position, closeQty, price, new Date(candles[i].closeTime),
        decision.tpIndex, decision.closeRemaining,
      );
      cumPnl += updated.realizedPnl - before;
      if (updated.state === 'CLOSED') {
        trades.push({
          side: 'LONG',
          entryTime: position.openedAt ? Date.parse(position.openedAt) : candles[entryBarIndex].openTime,
          exitTime: candles[i].closeTime,
          avgEntry: position.avgEntryPrice,
          exitPrice: price,
          size: sizeAtEntry,
          pnl: updated.realizedPnl,
          bars: i - entryBarIndex,
          steps: position.currentStep,
        });
        position = null;
      } else {
        position = updated;
      }
    } else if (decision.action === 'stop_loss' && position) {
      const before = position.realizedPnl;
      const sizeAtEntry = position.totalSize;
      const updated = reducePosition(
        position,
        floorQty(position.totalSize),
        price,
        new Date(candles[i].closeTime),
        position.tpFilled,
        true,
      );
      cumPnl += updated.realizedPnl - before;
      trades.push({
        side: 'LONG',
        entryTime: position.openedAt ? Date.parse(position.openedAt) : candles[entryBarIndex].openTime,
        exitTime: candles[i].closeTime,
        avgEntry: position.avgEntryPrice,
        exitPrice: price,
        size: sizeAtEntry,
        pnl: updated.realizedPnl,
        bars: i - entryBarIndex,
        steps: position.currentStep,
      });
      position = null;
    }

    // 에쿼티 곡선(실현 + 미실현)으로 MDD 산출.
    const unrealized = position
      ? (price - position.avgEntryPrice) * position.totalSize
      : 0;
    equityCurve.push({ time: candles[i].openTime, equity: startEquity + cumPnl + unrealized });
  }

  return summarize(trades, equityCurve, startEquity, candles, !!position, warmup);
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

function floorQty(qty: number): number {
  return Math.max(0, Math.floor(qty * 1000) / 1000);
}
