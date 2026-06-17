-- 전략 설정 (버전 관리). 문서 9장.
CREATE TABLE IF NOT EXISTS strategy_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  strategy_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  status TEXT NOT NULL,            -- draft | backtest_passed | testnet | active | archived
  created_at TEXT NOT NULL,
  activated_at TEXT,
  UNIQUE (strategy_id, version)
);

-- 포지션 상태 머신. 문서 8장. 진입 당시 전략 버전을 고정 저장한다.
CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,             -- LONG | SHORT
  strategy_id TEXT NOT NULL,
  strategy_version INTEGER NOT NULL,
  state TEXT NOT NULL,            -- IDLE..CLOSED
  avg_entry_price REAL NOT NULL DEFAULT 0,
  total_size REAL NOT NULL DEFAULT 0,
  current_step INTEGER NOT NULL DEFAULT 0,
  max_step INTEGER NOT NULL DEFAULT 0,
  realized_pnl REAL NOT NULL DEFAULT 0,
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_positions_open
  ON positions (symbol, state);

-- 주문/체결 로그. 문서 3장.
CREATE TABLE IF NOT EXISTS order_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id TEXT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,            -- BUY | SELL
  type TEXT NOT NULL,           -- MARKET | LIMIT ...
  qty REAL NOT NULL,
  price REAL,
  status TEXT NOT NULL,         -- SUBMITTED | FILLED | REJECTED | ERROR
  mode TEXT NOT NULL,           -- PAPER | TESTNET | LIVE_*
  reason TEXT,                  -- entry_step_1 / take_profit / risk_block ...
  exchange_order_id TEXT,
  raw_response TEXT,
  candle_open_time INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_logs_created
  ON order_logs (created_at);

-- 신호 로그 (점수/리스크 판단 결과). 문서 6/19장.
CREATE TABLE IF NOT EXISTS signal_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  strategy_id TEXT NOT NULL,
  strategy_version INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  candle_open_time INTEGER NOT NULL,
  side TEXT,                    -- LONG | SHORT | null(없음)
  score REAL NOT NULL DEFAULT 0,
  min_score REAL NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,   -- 0/1
  risk_passed INTEGER NOT NULL DEFAULT 0,
  decision TEXT NOT NULL,       -- enter / add / take_profit / hold / risk_block
  detail_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_signal_logs_candle
  ON signal_logs (symbol, candle_open_time);
