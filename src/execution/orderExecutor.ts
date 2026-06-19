// 주문 실행 엔진. 모드에 따라 실제 주문(TESTNET/LIVE) 또는 가상 체결(PAPER).
// 문서 11/13/18장. ALERT_ONLY/OFF는 호출 전에 차단된다.
import type { RunMode, StrategyConfig } from '../types';
import { BinanceClient } from '../market/binanceClient';

export interface OrderRequest {
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  reduceOnly: boolean;
  refPrice: number; // 수량 산출/가상 체결 기준가
  mode: RunMode;
  positionSide?: 'LONG' | 'SHORT'; // 헤지 모드: 어느 슬롯 주문인지. 지정 시 reduceOnly 무시.
}

export interface OrderResult {
  status: 'FILLED' | 'PAPER_FILLED' | 'ERROR';
  fillPrice: number;
  fillQty: number;
  exchangeOrderId: string | null;
  raw: string | null;
  error?: string;
}

// 진입/익절 수량 계산. equity 기준 명목가치 × 레버리지 × 단계비중.
export function computeQuantity(
  config: StrategyConfig,
  equity: number,
  sizePercent: number,
  price: number,
): number {
  const notional =
    equity * (config.positionSizing.maxPositionValuePercent / 100) *
    config.positionSizing.leverage * (sizePercent / 100);
  const qty = notional / price;
  return roundQty(qty);
}

// MVP: BTCUSDT 수량 스텝 0.001 가정.
function roundQty(qty: number): number {
  return Math.max(0, Math.floor(qty * 1000) / 1000);
}

export class OrderExecutor {
  constructor(private readonly client: BinanceClient) {}

  async execute(req: OrderRequest): Promise<OrderResult> {
    if (req.quantity <= 0) {
      return { status: 'ERROR', fillPrice: 0, fillQty: 0, exchangeOrderId: null, raw: null, error: 'qty<=0' };
    }

    // PAPER: 실제 주문 없이 refPrice로 체결. 문서 16/18장.
    if (req.mode === 'PAPER') {
      return {
        status: 'PAPER_FILLED',
        fillPrice: req.refPrice,
        fillQty: req.quantity,
        exchangeOrderId: null,
        raw: null,
      };
    }

    // TESTNET / LIVE_*: 실제 시장가 주문.
    try {
      const res = (await this.client.marketOrder(
        req.symbol, req.side, req.quantity, req.reduceOnly, req.positionSide,
      )) as Record<string, unknown>;
      const avgPrice = Number(res.avgPrice ?? res.price ?? 0) || req.refPrice;
      const executedQty = Number(res.executedQty ?? req.quantity) || req.quantity;
      return {
        status: 'FILLED',
        fillPrice: avgPrice,
        fillQty: executedQty,
        exchangeOrderId: res.orderId != null ? String(res.orderId) : null,
        raw: JSON.stringify(res),
      };
    } catch (e) {
      return {
        status: 'ERROR',
        fillPrice: 0,
        fillQty: 0,
        exchangeOrderId: null,
        raw: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
}
