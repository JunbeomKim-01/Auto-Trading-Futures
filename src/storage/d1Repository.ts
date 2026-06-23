// D1: 전략/포지션/주문로그/신호로그 저장 및 리스크 집계. 문서 9/12장.
import type { Env, Position, PositionBook, PositionState, StrategyConfig, StrategyRecord } from '../types';
import type { RiskSnapshot } from '../risk/riskEngine';

interface PositionRow {
  position_id: string;
  symbol: string;
  side: string;
  strategy_id: string;
  strategy_version: number;
  state: string;
  avg_entry_price: number;
  total_size: number;
  current_step: number;
  max_step: number;
  tp_filled: number;
  realized_pnl: number;
  opened_at: string;
  closed_at: string | null;
  updated_at: string;
}

export interface OrderLog {
  positionId: string | null;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: string;
  qty: number;
  price: number | null;
  status: string;
  mode: string;
  reason: string;
  exchangeOrderId: string | null;
  rawResponse: string | null;
  candleOpenTime: number | null;
}

export interface SavedStrategy {
  strategyId: string;
  version: number;
  name: string;
  status: string;
  createdAt: string;
  activatedAt: string | null;
  symbol: string;
  config: StrategyConfig;
  metrics: Record<string, number> | null;
}

export interface SignalLog {
  strategyId: string;
  strategyVersion: number;
  symbol: string;
  candleOpenTime: number;
  side: string | null;
  score: number;
  minScore: number;
  passed: boolean;
  riskPassed: boolean;
  decision: string;
  detailJson: string;
}

export class D1Repository {
  constructor(private readonly env: Env) {}

  async getActiveStrategy(symbol: string): Promise<StrategyRecord | null> {
    const row = await this.env.DB.prepare(
      `SELECT strategy_id, version, name, config_json
         FROM strategy_configs
        WHERE status = 'active'
          AND json_extract(config_json, '$.symbol') = ?
        ORDER BY version DESC LIMIT 1`,
    )
      .bind(symbol)
      .first<{ strategy_id: string; version: number; name: string; config_json: string }>();
    if (!row) return null;
    return {
      strategyId: row.strategy_id,
      version: row.version,
      name: row.name,
      config: JSON.parse(row.config_json) as StrategyConfig,
      status: 'active',
    };
  }

  // 저장소 목록: 모든 저장 전략을 최신순으로. metrics_json은 마지막 백테스트 지표(없으면 null).
  async listStrategies(): Promise<SavedStrategy[]> {
    const res = await this.env.DB.prepare(
      `SELECT strategy_id, version, name, status, created_at, activated_at, config_json, metrics_json
         FROM strategy_configs
        ORDER BY created_at DESC, id DESC`,
    ).all<{
      strategy_id: string; version: number; name: string; status: string;
      created_at: string; activated_at: string | null;
      config_json: string; metrics_json: string | null;
    }>();
    return (res.results ?? []).map((r) => ({
      strategyId: r.strategy_id,
      version: r.version,
      name: r.name,
      status: r.status,
      createdAt: r.created_at,
      activatedAt: r.activated_at,
      symbol: (JSON.parse(r.config_json) as StrategyConfig).symbol,
      config: JSON.parse(r.config_json) as StrategyConfig,
      metrics: r.metrics_json ? (JSON.parse(r.metrics_json) as Record<string, number>) : null,
    }));
  }

  // 새 전략 버전 저장. status=draft. strategyId가 같은 게 있으면 version+1, 아니면 1.
  async saveStrategy(config: StrategyConfig, name: string, metrics: unknown): Promise<{ strategyId: string; version: number }> {
    const prev = await this.env.DB.prepare(
      `SELECT COALESCE(MAX(version), 0) AS v FROM strategy_configs WHERE strategy_id = ?`,
    )
      .bind(config.strategyId)
      .first<{ v: number }>();
    const version = (prev?.v ?? 0) + 1;
    await this.env.DB.prepare(
      `INSERT INTO strategy_configs
         (strategy_id, version, name, config_json, status, metrics_json, created_at)
       VALUES (?,?,?,?,?,?,?)`,
    )
      .bind(
        config.strategyId, version, name, JSON.stringify(config), 'draft',
        metrics == null ? null : JSON.stringify(metrics), new Date().toISOString(),
      )
      .run();
    return { strategyId: config.strategyId, version };
  }

  // 적용: 같은 심볼의 기존 active를 archived로 내리고, 대상 전략을 active로 올린다.
  async activateStrategy(strategyId: string): Promise<void> {
    const row = await this.env.DB.prepare(
      `SELECT config_json FROM strategy_configs WHERE strategy_id = ? ORDER BY version DESC LIMIT 1`,
    )
      .bind(strategyId)
      .first<{ config_json: string }>();
    if (!row) throw new Error('전략을 찾을 수 없습니다');
    const symbol = (JSON.parse(row.config_json) as StrategyConfig).symbol;
    const now = new Date().toISOString();
    await this.env.DB.prepare(
      `UPDATE strategy_configs SET status = 'archived'
        WHERE status = 'active' AND json_extract(config_json, '$.symbol') = ?`,
    )
      .bind(symbol)
      .run();
    await this.env.DB.prepare(
      `UPDATE strategy_configs SET status = 'active', activated_at = ? WHERE strategy_id = ?`,
    )
      .bind(now, strategyId)
      .run();
  }

  // 삭제: active이거나 오픈 포지션이 참조 중이면 거부(봇 깨짐 방지).
  async deleteStrategy(strategyId: string): Promise<void> {
    const active = await this.env.DB.prepare(
      `SELECT 1 FROM strategy_configs WHERE strategy_id = ? AND status = 'active' LIMIT 1`,
    )
      .bind(strategyId)
      .first();
    if (active) throw new Error('활성 전략은 삭제할 수 없습니다. 다른 전략을 먼저 적용하세요.');
    const used = await this.env.DB.prepare(
      `SELECT 1 FROM positions WHERE strategy_id = ? AND state != 'CLOSED' LIMIT 1`,
    )
      .bind(strategyId)
      .first();
    if (used) throw new Error('오픈 포지션이 이 전략을 사용 중이라 삭제할 수 없습니다.');
    await this.env.DB.prepare(
      `DELETE FROM strategy_configs WHERE strategy_id = ?`,
    )
      .bind(strategyId)
      .run();
  }

  // 헤지: 심볼당 롱/숏 각 1개의 오픈 포지션을 슬롯으로 반환. 같은 방향에 복수 오픈이
  // 있으면 최신(id DESC) 1개만 사용한다.
  async getOpenPositions(symbol: string): Promise<PositionBook> {
    const res = await this.env.DB.prepare(
      `SELECT * FROM positions WHERE symbol = ? AND state != 'CLOSED'
       ORDER BY id DESC`,
    )
      .bind(symbol)
      .all<PositionRow>();
    const book: PositionBook = { long: null, short: null };
    for (const row of res.results ?? []) {
      const pos = rowToPosition(row);
      if (pos.side === 'LONG' && !book.long) book.long = pos;
      else if (pos.side === 'SHORT' && !book.short) book.short = pos;
    }
    return book;
  }

  async upsertPosition(p: Position): Promise<void> {
    await this.env.DB.prepare(
      `INSERT INTO positions
         (position_id, symbol, side, strategy_id, strategy_version, state,
          avg_entry_price, total_size, current_step, max_step, tp_filled, realized_pnl,
          opened_at, closed_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(position_id) DO UPDATE SET
         state = excluded.state,
         avg_entry_price = excluded.avg_entry_price,
         total_size = excluded.total_size,
         current_step = excluded.current_step,
         tp_filled = excluded.tp_filled,
         realized_pnl = excluded.realized_pnl,
         closed_at = excluded.closed_at,
         updated_at = excluded.updated_at`,
    )
      .bind(
        p.positionId, p.symbol, p.side, p.strategyId, p.strategyVersion, p.state,
        p.avgEntryPrice, p.totalSize, p.currentStep, p.maxStep, p.tpFilled, p.realizedPnl,
        p.openedAt, p.closedAt, p.updatedAt,
      )
      .run();
  }

  async logOrder(o: OrderLog): Promise<void> {
    await this.env.DB.prepare(
      `INSERT INTO order_logs
         (position_id, symbol, side, type, qty, price, status, mode, reason,
          exchange_order_id, raw_response, candle_open_time, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        o.positionId, o.symbol, o.side, o.type, o.qty, o.price, o.status, o.mode,
        o.reason, o.exchangeOrderId, o.rawResponse, o.candleOpenTime,
        new Date().toISOString(),
      )
      .run();
  }

  async logSignal(s: SignalLog): Promise<void> {
    await this.env.DB.prepare(
      `INSERT INTO signal_logs
         (strategy_id, strategy_version, symbol, candle_open_time, side, score,
          min_score, passed, risk_passed, decision, detail_json, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        s.strategyId, s.strategyVersion, s.symbol, s.candleOpenTime, s.side, s.score,
        s.minScore, s.passed ? 1 : 0, s.riskPassed ? 1 : 0, s.decision, s.detailJson,
        new Date().toISOString(),
      )
      .run();
  }

  // 리스크 집계: 일/주 PnL%, 연속 손실, 오픈 포지션 수. MVP 근사.
  async getRiskSnapshot(symbol: string, accountEquity: number): Promise<RiskSnapshot> {
    const openCount = await this.env.DB.prepare(
      `SELECT COUNT(*) AS c FROM positions WHERE symbol = ? AND state != 'CLOSED'`,
    )
      .bind(symbol)
      .first<{ c: number }>();

    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    const daily = await this.env.DB.prepare(
      `SELECT COALESCE(SUM(realized_pnl),0) AS pnl FROM positions
        WHERE symbol = ? AND closed_at >= ?`,
    )
      .bind(symbol, dayAgo)
      .first<{ pnl: number }>();
    const weekly = await this.env.DB.prepare(
      `SELECT COALESCE(SUM(realized_pnl),0) AS pnl FROM positions
        WHERE symbol = ? AND closed_at >= ?`,
    )
      .bind(symbol, weekAgo)
      .first<{ pnl: number }>();

    // 최근 청산 포지션의 연속 손실.
    const recent = await this.env.DB.prepare(
      `SELECT realized_pnl FROM positions
        WHERE symbol = ? AND state = 'CLOSED'
        ORDER BY closed_at DESC LIMIT 10`,
    )
      .bind(symbol)
      .all<{ realized_pnl: number }>();
    let consecutive = 0;
    for (const r of recent.results ?? []) {
      if (r.realized_pnl < 0) consecutive++;
      else break;
    }

    const equity = accountEquity > 0 ? accountEquity : 1;
    return {
      openPositionsCount: openCount?.c ?? 0,
      hasPendingOrder: false, // MVP: 시장가만 사용, 미체결 개념 단순화
      dailyPnlPercent: ((daily?.pnl ?? 0) / equity) * 100,
      weeklyPnlPercent: ((weekly?.pnl ?? 0) / equity) * 100,
      consecutiveLosses: consecutive,
      liquidationDistancePercent: 100, // MVP: 청산가 거리 미산출 → 통과
    };
  }

  async recentSignals(limit: number): Promise<unknown[]> {
    const res = await this.env.DB.prepare(
      `SELECT * FROM signal_logs ORDER BY id DESC LIMIT ?`,
    )
      .bind(limit)
      .all();
    return res.results ?? [];
  }

  async recentOrders(limit: number): Promise<unknown[]> {
    const res = await this.env.DB.prepare(
      `SELECT * FROM order_logs ORDER BY id DESC LIMIT ?`,
    )
      .bind(limit)
      .all();
    return res.results ?? [];
  }
}

function rowToPosition(r: PositionRow): Position {
  return {
    positionId: r.position_id,
    symbol: r.symbol,
    side: r.side as 'LONG' | 'SHORT',
    strategyId: r.strategy_id,
    strategyVersion: r.strategy_version,
    state: r.state as PositionState,
    avgEntryPrice: r.avg_entry_price,
    totalSize: r.total_size,
    currentStep: r.current_step,
    maxStep: r.max_step,
    tpFilled: r.tp_filled,
    realizedPnl: r.realized_pnl,
    openedAt: r.opened_at,
    closedAt: r.closed_at,
    updatedAt: r.updated_at,
  };
}
