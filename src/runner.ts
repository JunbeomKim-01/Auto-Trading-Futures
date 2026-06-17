// 4시간봉 마감 기준 전략 실행 오케스트레이터. 문서 13장.
import type { Env, RunMode } from './types';
import { BinanceClient } from './market/binanceClient';
import { fetchCandles, lastClosedCandle } from './market/candleService';
import { buildContext, decide } from './strategy/strategyEngine';
import { checkEntryRisk } from './risk/riskEngine';
import { OrderExecutor, computeQuantity } from './execution/orderExecutor';
import { addToPosition, openPosition, reducePosition } from './position/positionStateMachine';
import { D1Repository } from './storage/d1Repository';
import { KvRepository } from './storage/kvRepository';

const SYMBOL = 'BTCUSDT';
const INTERVAL = '4h';
const CANDLE_LIMIT = 300; // EMA200 워밍업 확보
const PAPER_EQUITY = 10000;

export interface RunSummary {
  ran: boolean;
  reason: string;
  decision?: string;
  candleOpenTime?: number;
}

export async function runStrategyTick(env: Env, now: Date = new Date()): Promise<RunSummary> {
  const kv = new KvRepository(env);
  const d1 = new D1Repository(env);

  const mode = await kv.getMode();
  if (mode === 'OFF') return { ran: false, reason: 'mode OFF' };

  const strategy = await d1.getActiveStrategy(SYMBOL);
  if (!strategy) return { ran: false, reason: 'active 전략 없음' };

  const client = new BinanceClient(env, mode);
  // 데이터 소스 장애(예: Binance가 Cloudflare 출구 IP를 차단하는 403)는
  // 예외로 터뜨리지 않고 요약으로 반환한다 — cron이 매분 죽지 않도록.
  let candles;
  try {
    candles = await fetchCandles(client, SYMBOL, INTERVAL, CANDLE_LIMIT, now.getTime());
  } catch (e) {
    return { ran: false, reason: `데이터 조회 실패: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}` };
  }
  const closedCandles = candles.filter((c) => c.closed);
  const last = lastClosedCandle(candles);
  if (!last) return { ran: false, reason: '마감된 캔들 없음' };

  // 이미 처리한 캔들이면 중복 실행 방지. 문서 13장.
  const lastProcessed = await kv.getLastProcessedCandle(SYMBOL);
  if (lastProcessed === last.openTime) {
    return { ran: false, reason: '이미 처리한 캔들', candleOpenTime: last.openTime };
  }
  if (!(await kv.tryLockCandle(SYMBOL, last.openTime))) {
    return { ran: false, reason: '동시 실행 락', candleOpenTime: last.openTime };
  }

  const position = await d1.getOpenPosition(SYMBOL);
  const ctx = buildContext(strategy.config, closedCandles, position);
  const decision = decide(strategy.config, ctx, position);

  // 신호 로그 공통 필드.
  const baseSignal = {
    strategyId: strategy.strategyId,
    strategyVersion: strategy.version,
    symbol: SYMBOL,
    candleOpenTime: last.openTime,
  };

  // 행동 없음.
  if (decision.action === 'hold' || decision.action === 'no_signal') {
    const score = decision.action === 'no_signal' ? decision.score : null;
    await d1.logSignal({
      ...baseSignal,
      side: null,
      score: score?.score ?? 0,
      minScore: score?.minimumScore ?? 0,
      passed: false,
      riskPassed: false,
      decision: decision.action === 'hold' ? `hold:${decision.reason}` : 'no_signal',
      detailJson: JSON.stringify({ ctx: summarizeCtx(ctx), score }),
    });
    await kv.setLastProcessedCandle(SYMBOL, last.openTime);
    return { ran: true, reason: 'no action', decision: decision.action, candleOpenTime: last.openTime };
  }

  const equity = await resolveEquity(client, mode);

  // ALERT_ONLY: 신호만 기록, 주문 없음. 문서 18장.
  if (mode === 'ALERT_ONLY') {
    await d1.logSignal({
      ...baseSignal,
      side: 'LONG',
      score: decision.action === 'enter' ? decision.score.score : 0,
      minScore: decision.action === 'enter' ? decision.score.minimumScore : 0,
      passed: true,
      riskPassed: false,
      decision: `alert:${decision.action}`,
      detailJson: JSON.stringify({ ctx: summarizeCtx(ctx) }),
    });
    await kv.setLastProcessedCandle(SYMBOL, last.openTime);
    return { ran: true, reason: 'alert only', decision: decision.action, candleOpenTime: last.openTime };
  }

  // 진입/추가는 리스크 엔진 승인 필요. 익절은 차단하지 않는다. 문서 12장.
  const isEntry = decision.action === 'enter' || decision.action === 'add';
  if (isEntry) {
    const snap = await d1.getRiskSnapshot(SYMBOL, equity);
    const risk = checkEntryRisk(strategy.config, snap, decision.action === 'enter');
    if (!risk.approved) {
      await d1.logSignal({
        ...baseSignal,
        side: 'LONG',
        score: decision.action === 'enter' ? decision.score.score : 0,
        minScore: decision.action === 'enter' ? decision.score.minimumScore : 0,
        passed: true,
        riskPassed: false,
        decision: 'risk_block',
        detailJson: JSON.stringify({ blockedBy: risk.blockedBy }),
      });
      await kv.setLastProcessedCandle(SYMBOL, last.openTime);
      return { ran: true, reason: 'risk blocked', decision: 'risk_block', candleOpenTime: last.openTime };
    }
  }

  const executor = new OrderExecutor(client);
  const price = ctx.close;

  if (decision.action === 'enter' || decision.action === 'add') {
    const qty = computeQuantity(strategy.config, equity, decision.sizePercent, price);
    const res = await executor.execute({
      symbol: SYMBOL, side: 'BUY', quantity: qty, reduceOnly: false, refPrice: price, mode,
    });
    await d1.logOrder({
      positionId: position?.positionId ?? null,
      symbol: SYMBOL, side: 'BUY', type: 'MARKET', qty,
      price: res.fillPrice || price, status: res.status, mode,
      reason: decision.action === 'enter' ? 'entry_step_1' : `entry_step_${decision.step}`,
      exchangeOrderId: res.exchangeOrderId, rawResponse: res.raw, candleOpenTime: last.openTime,
    });

    if (res.status !== 'ERROR') {
      const updated = decision.action === 'enter'
        ? openPosition(strategy, 'LONG', res.fillPrice, res.fillQty, now)
        : addToPosition(position!, decision.step, res.fillPrice, res.fillQty, now);
      await d1.upsertPosition(updated);
    }
    await d1.logSignal({
      ...baseSignal, side: 'LONG',
      score: decision.action === 'enter' ? decision.score.score : 0,
      minScore: decision.action === 'enter' ? decision.score.minimumScore : 0,
      passed: true, riskPassed: true, decision: decision.action,
      detailJson: JSON.stringify({ qty, fill: res.fillPrice, status: res.status }),
    });
  } else if (decision.action === 'take_profit' && position) {
    // 마지막 레벨은 잔량 전량 청산, 그 외는 비중만큼.
    const closeQty = decision.closeRemaining
      ? roundCloseQty(position.totalSize)
      : roundCloseQty(position.totalSize * (decision.sizePercent / 100));
    const res = await executor.execute({
      symbol: SYMBOL, side: 'SELL', quantity: closeQty, reduceOnly: true, refPrice: price, mode,
    });
    await d1.logOrder({
      positionId: position.positionId,
      symbol: SYMBOL, side: 'SELL', type: 'MARKET', qty: closeQty,
      price: res.fillPrice || price, status: res.status, mode,
      reason: `take_profit_${decision.tpIndex + 1}`,
      exchangeOrderId: res.exchangeOrderId, rawResponse: res.raw, candleOpenTime: last.openTime,
    });
    if (res.status !== 'ERROR') {
      const updated = reducePosition(
        position, res.fillQty, res.fillPrice, now, decision.tpIndex, decision.closeRemaining,
      );
      await d1.upsertPosition(updated);
    }
    await d1.logSignal({
      ...baseSignal, side: 'LONG', score: 0, minScore: 0,
      passed: true, riskPassed: true, decision: 'take_profit',
      detailJson: JSON.stringify({ closeQty, fill: res.fillPrice, status: res.status }),
    });
  }

  await kv.setLastProcessedCandle(SYMBOL, last.openTime);
  return { ran: true, reason: 'executed', decision: decision.action, candleOpenTime: last.openTime };
}

function roundCloseQty(qty: number): number {
  return Math.max(0, Math.floor(qty * 1000) / 1000);
}

async function resolveEquity(client: BinanceClient, mode: RunMode): Promise<number> {
  if (mode === 'PAPER' || mode === 'ALERT_ONLY') return PAPER_EQUITY;
  try {
    const acct = (await client.getAccount()) as Record<string, unknown>;
    const bal = Number(acct.totalWalletBalance ?? acct.availableBalance ?? 0);
    return bal > 0 ? bal : PAPER_EQUITY;
  } catch {
    return PAPER_EQUITY;
  }
}

function summarizeCtx(ctx: { close: number; rsi14: number; ema200: number; atr14: number }) {
  return { close: ctx.close, rsi14: ctx.rsi14, ema200: ctx.ema200, atr14: ctx.atr14 };
}
