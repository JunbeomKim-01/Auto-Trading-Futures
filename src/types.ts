// 공용 타입 정의. 문서 5/8장.

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  DEFAULT_MODE: string;
  BINANCE_TESTNET_BASE: string;
  BINANCE_LIVE_BASE: string;
  BINANCE_API_KEY?: string;
  BINANCE_API_SECRET?: string;
  // 배포 시 Binance 직접 호출이 막히므로 VPS Executor 경유. 미설정 시 직접 호출(로컬 dev).
  EXECUTOR_URL?: string;
  PROXY_TOKEN?: string;
}

export type RunMode =
  | 'OFF'
  | 'ALERT_ONLY'
  | 'PAPER'
  | 'TESTNET'
  | 'LIVE_SMALL'
  | 'LIVE_FULL';

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  closed: boolean;
}

export type Operator = '>' | '>=' | '<' | '<=' | '==' | '!=';

export interface ScoreRule {
  name: string;
  left: string;
  operator: Operator;
  right: number | string;
  score: number;
}

export interface HardFilter {
  left: string;
  operator: Operator;
  right: number | string;
  description?: string;
}

export interface EntrySide {
  enabled: boolean;
  minimumScore: number;
  hardFilters: HardFilter[];
  scoreRules: ScoreRule[];
}

export interface SizingStep {
  step: number;
  sizePercent: number;
  trigger: string;
}

export interface ExitStep {
  sizePercent: number;
  trigger: string;
}

export interface IndicatorSpec {
  type: string;
  period?: number;
  fast?: number;
  slow?: number;
  signal?: number;
  source?: string;
  minBodyRatio?: number; // Order Block: 현재 봉 몸통/레인지 최소 비율
}

export interface StrategyConfig {
  strategyId: string;
  name: string;
  symbol: string;
  market: string;
  timeframe: string;
  mode: string;
  indicators: Record<string, IndicatorSpec>;
  entry: { long?: EntrySide; short?: EntrySide };
  positionSizing: {
    type: string;
    maxPositionValuePercent: number;
    leverage: number;
    entries: SizingStep[];
  };
  exit: {
    takeProfit: ExitStep[];
    stopLoss?: ExitStep;
    trailingStop: { enabled: boolean; sizePercent: number; atrMultiplier: number };
  };
  risk: {
    maxDailyLossPercent: number;
    maxWeeklyLossPercent: number;
    maxConsecutiveLosses: number;
    minLiquidationDistancePercent: number;
    maxOpenPositions: number;
    disableNewEntryWhenOrderPending: boolean;
  };
}

export interface StrategyRecord {
  strategyId: string;
  version: number;
  name: string;
  config: StrategyConfig;
  status: string;
}

export type PositionState =
  | 'IDLE'
  | 'SIGNAL_DETECTED'
  | 'ENTERED_STEP_1'
  | 'ENTERED_STEP_2'
  | 'ENTERED_STEP_3'
  | 'ENTERED_FULL'
  | 'PARTIAL_TAKE_PROFIT'
  | 'TRAILING'
  | 'CLOSED';

export interface Position {
  positionId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  strategyId: string;
  strategyVersion: number;
  state: PositionState;
  avgEntryPrice: number;
  totalSize: number;
  currentStep: number;
  maxStep: number;
  tpFilled: number;        // 체결 완료한 분할익절 레벨 수 (각 레벨 1회만 체결)
  realizedPnl: number;
  openedAt: string;
  closedAt: string | null;
  updatedAt: string;
}

// 룰/트리거 평가용 변수 컨텍스트. conditionParser가 참조한다.
export interface EvalContext {
  close: number;
  previousClose: number;
  high: number;
  low: number;
  volume: number;
  rsi14: number;
  ema200: number;
  atr14: number;
  volumeMA20: number;
  'macd.histogram': number;
  'macd.histogram.previous': number;
  // 포지션 의존 변수 (없으면 NaN)
  avgEntry: number;
  price: number;
  [key: string]: number;
}
