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
  // MTF: HTF 게이트(위 필터/룰) 통과 후, 실행봉(예: 5m)에서 추가로 만족해야 진입하는
  // 확인 트리거. 비교/논리식. 없으면 게이트 통과 즉시 진입.
  confirmTrigger?: string;
}

export interface SizingStep {
  step: number;
  sizePercent: number;
  // 분할 진입: 평단 대비 "불리" 방향 거리. step1은 초기 진입이라 생략.
  // LONG은 하락, SHORT는 상승 시 추가. pct가 있으면 % 거리, 없으면 atrMult * ATR.
  atrMult?: number;
  pct?: number;
}

export interface ExitStep {
  sizePercent: number;
  // 평단 대비 거리. TP=유리 방향, SL=불리 방향 (side에 따라 엔진이 부호 적용).
  // pnlPercent는 레버리지 적용 PnL/ROE % 기준, pct는 가격 %, 없으면 atrMult * ATR.
  pnlPercent?: number;
  atrMult?: number;
  pct?: number;
}

export interface IndicatorSpec {
  type: string;
  period?: number;
  fast?: number;
  slow?: number;
  signal?: number;
  source?: string;
  minBodyRatio?: number; // Order Block: 현재 봉 몸통/레인지 최소 비율
  std?: number; // Bollinger: 표준편차 배수
  timeframe?: string; // MTF: 이 지표를 계산할 봉. 없으면 config.timeframe(신호봉).
}

export interface StrategyConfig {
  strategyId: string;
  name: string;
  symbol: string;
  market: string;
  timeframe: string;
  // MTF: 진입/청산 판단·체결 봉. 설정 시 지표는 각자 timeframe(상위봉)으로 계산하고
  // 이 봉(예: 5m)마다 평가한다. 없으면 단일TF(=timeframe) 동작.
  executionTimeframe?: string;
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

// 헤지 모드: 한 심볼에 롱/숏 포지션을 동시에 한 개씩 보유. 각 슬롯 독립.
export interface PositionBook {
  long: Position | null;
  short: Position | null;
}

// 룰/트리거 평가용 변수 컨텍스트. conditionParser가 참조한다.
export interface EvalContext {
  close: number;
  previousClose: number;
  high: number;
  low: number;
  volume: number;
  rsi: number;
  ema: number;
  atr: number;
  volMa: number;
  'macd.histogram': number;
  'macd.histogram.previous': number;
  // 포지션 의존 변수 (없으면 NaN)
  avgEntry: number;
  price: number;
  [key: string]: number;
}
