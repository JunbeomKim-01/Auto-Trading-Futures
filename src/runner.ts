// 4시간봉 마감 기준 전략 실행 오케스트레이터. 문서 13장.
import type { Env, RunMode } from './types';
import { BinanceClient } from './market/binanceClient';
import { fetchCandles, lastClosedCandle } from './market/candleService';
import { buildContext, decideHedge, type Decision } from './strategy/strategyEngine';
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

  // 헤지: 롱/숏 슬롯을 함께 조회해 한 바에 양방향 판단. 평단은 슬롯별로 다르므로 ctx는
  // 포지션 비종속(null)으로 만든다.
  const book = await d1.getOpenPositions(SYMBOL);
  const ctx = buildContext(strategy.config, closedCandles, null);
  const decisions = decideHedge(strategy.config, ctx, book);

  // 신호 로그 공통 필드.
  const baseSignal = {
    strategyId: strategy.strategyId,
    strategyVersion: strategy.version,
    symbol: SYMBOL,
    candleOpenTime: last.openTime,
  };

  // 실제 주문이 필요한 행동만 추린다 (hold/no_signal 제외).
  const actionable = decisions.filter(
    (d): d is Extract<Decision, { side: 'LONG' | 'SHORT' }> => 'side' in d,
  );

  // 행동 없음: 대표 점수 1개만 기록.
  if (actionable.length === 0) {
    const ns = decisions.find((d) => d.action === 'no_signal');
    const score = ns?.action === 'no_signal' ? ns.score : null;
    await d1.logSignal({
      ...baseSignal,
      side: null,
      score: score?.score ?? 0,
      minScore: score?.minimumScore ?? 0,
      passed: false,
      riskPassed: false,
      decision: 'no_signal',
      detailJson: JSON.stringify({ ctx: summarizeCtx(ctx), score }),
    });
    await kv.setLastProcessedCandle(SYMBOL, last.openTime);
    return { ran: true, reason: 'no action', decision: 'no_signal', candleOpenTime: last.openTime };
  }

  const equity = await resolveEquity(client, mode);

  // ALERT_ONLY: 신호만 기록, 주문 없음. 문서 18장.
  if (mode === 'ALERT_ONLY') {
    for (const decision of actionable) {
      await d1.logSignal({
        ...baseSignal,
        side: decision.side,
        score: decision.action === 'enter' ? decision.score.score : 0,
        minScore: decision.action === 'enter' ? decision.score.minimumScore : 0,
        passed: true,
        riskPassed: false,
        decision: `alert:${decision.action}`,
        detailJson: JSON.stringify({ ctx: summarizeCtx(ctx) }),
      });
    }
    await kv.setLastProcessedCandle(SYMBOL, last.openTime);
    return {
      ran: true, reason: 'alert only',
      decision: actionable.map((d) => d.action).join(','), candleOpenTime: last.openTime,
    };
  }

  const executor = new OrderExecutor(client);
  const price = ctx.close;
  // 리스크 스냅샷은 바 시작 시점 기준 1회. 진입/추가만 승인 대상.
  const snap = await d1.getRiskSnapshot(SYMBOL, equity);
  const done: string[] = [];

  for (const decision of actionable) {
    const side = decision.side;
    const pos = side === 'LONG' ? book.long : book.short;

    // 진입/추가는 리스크 엔진 승인 필요. 익절/손절은 차단하지 않는다. 문서 12장.
    if (decision.action === 'enter' || decision.action === 'add') {
      const risk = checkEntryRisk(strategy.config, snap, decision.action === 'enter');
      if (!risk.approved) {
        await d1.logSignal({
          ...baseSignal, side,
          score: decision.action === 'enter' ? decision.score.score : 0,
          minScore: decision.action === 'enter' ? decision.score.minimumScore : 0,
          passed: true, riskPassed: false, decision: 'risk_block',
          detailJson: JSON.stringify({ blockedBy: risk.blockedBy }),
        });
        done.push(`risk_block:${side}`);
        continue;
      }

      const qty = computeQuantity(strategy.config, equity, decision.sizePercent, price);
      // 진입/추가: 롱이면 BUY, 숏이면 SELL. positionSide로 슬롯 지정(헤지 모드).
      const orderSide = side === 'LONG' ? 'BUY' : 'SELL';
      const res = await executor.execute({
        symbol: SYMBOL, side: orderSide, quantity: qty, reduceOnly: false,
        refPrice: price, mode, positionSide: side,
      });
      await d1.logOrder({
        positionId: pos?.positionId ?? null,
        symbol: SYMBOL, side: orderSide, type: 'MARKET', qty,
        price: res.fillPrice || price, status: res.status, mode,
        reason: decision.action === 'enter' ? 'entry_step_1' : `entry_step_${decision.step}`,
        exchangeOrderId: res.exchangeOrderId, rawResponse: res.raw, candleOpenTime: last.openTime,
      });
      if (res.status !== 'ERROR') {
        const updated = decision.action === 'enter'
          ? openPosition(strategy, side, res.fillPrice, res.fillQty, now)
          : addToPosition(pos!, decision.step, res.fillPrice, res.fillQty, now);
        await d1.upsertPosition(updated);
      }
      await d1.logSignal({
        ...baseSignal, side,
        score: decision.action === 'enter' ? decision.score.score : 0,
        minScore: decision.action === 'enter' ? decision.score.minimumScore : 0,
        passed: true, riskPassed: true, decision: decision.action,
        detailJson: JSON.stringify({ qty, fill: res.fillPrice, status: res.status }),
      });
      done.push(`${decision.action}:${side}`);
    } else if ((decision.action === 'take_profit' || decision.action === 'stop_loss') && pos) {
      const isSl = decision.action === 'stop_loss';
      // 손절/마지막 레벨은 잔량 전량, 그 외는 비중만큼.
      const closeQty = isSl || decision.closeRemaining
        ? roundCloseQty(pos.totalSize)
        : roundCloseQty(pos.totalSize * (decision.sizePercent / 100));
      // 청산은 진입 반대 방향: 롱은 SELL, 숏은 BUY. positionSide는 슬롯 방향 유지.
      const closeSide = side === 'LONG' ? 'SELL' : 'BUY';
      const res = await executor.execute({
        symbol: SYMBOL, side: closeSide, quantity: closeQty, reduceOnly: true,
        refPrice: price, mode, positionSide: side,
      });
      await d1.logOrder({
        positionId: pos.positionId,
        symbol: SYMBOL, side: closeSide, type: 'MARKET', qty: closeQty,
        price: res.fillPrice || price, status: res.status, mode,
        reason: isSl ? 'stop_loss' : `take_profit_${decision.tpIndex + 1}`,
        exchangeOrderId: res.exchangeOrderId, rawResponse: res.raw, candleOpenTime: last.openTime,
      });
      if (res.status !== 'ERROR') {
        const updated = reducePosition(
          pos, res.fillQty, res.fillPrice, now,
          isSl ? pos.tpFilled : decision.tpIndex,
          isSl ? true : decision.closeRemaining,
        );
        await d1.upsertPosition(updated);
      }
      await d1.logSignal({
        ...baseSignal, side, score: 0, minScore: 0,
        passed: true, riskPassed: true, decision: decision.action,
        detailJson: JSON.stringify({ closeQty, fill: res.fillPrice, status: res.status }),
      });
      done.push(`${decision.action}:${side}`);
    }
  }

  await kv.setLastProcessedCandle(SYMBOL, last.openTime);
  return { ran: true, reason: 'executed', decision: done.join(','), candleOpenTime: last.openTime };
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

function summarizeCtx(ctx: { close: number; rsi: number; ema: number; atr: number }) {
  return { close: ctx.close, rsi: ctx.rsi, ema: ctx.ema, atr: ctx.atr };
}
