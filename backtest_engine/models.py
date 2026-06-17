"""엔진 전반에서 쓰는 데이터 모델. 설계서 11/12/14/15장."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

Side = Literal["LONG", "SHORT"]


@dataclass
class Strategy:
    """전략 JSON을 파싱한 형태. 설계서 5.3 / 7.1 / 9.2 / 18.1."""

    name: str
    indicators: dict[str, dict[str, Any]]
    entry_side: Side
    entry_rule: dict[str, Any]
    take_profit_pct: float | None
    stop_loss_pct: float | None
    exit_rule: dict[str, Any] | None = None

    @staticmethod
    def from_json(obj: dict[str, Any]) -> "Strategy":
        entry = obj["entry"]
        exit_cfg = obj.get("exit", {})
        return Strategy(
            name=obj.get("name", "unnamed"),
            indicators=obj.get("indicators", {}),
            entry_side=entry.get("side", "LONG"),
            entry_rule=entry["rule"],
            take_profit_pct=exit_cfg.get("take_profit_pct"),
            stop_loss_pct=exit_cfg.get("stop_loss_pct"),
            exit_rule=exit_cfg.get("rule"),
        )


@dataclass
class BacktestConfig:
    """체결/비용/시드 설정. 설계서 9.2 / 13장."""

    initial_cash: float = 10_000.0
    position_pct: float = 1.0  # 진입 시 현금의 몇 %를 쓸지 (0~1)
    fee: float = 0.0004  # 편도 수수료 (taker 0.04%)
    slippage: float = 0.0005  # 편도 슬리피지 (0.05%)
    tp_sl_priority: Literal["conservative", "optimistic"] = "conservative"
    warmup_bars: int = 210  # EMA200 안정화. 설계서 13장.


@dataclass
class Trade:
    """체결 완료된 단일 거래. 설계서 15.2 backtest_trades."""

    side: Side
    entry_time: int
    entry_price: float
    exit_time: int
    exit_price: float
    qty: float
    pnl: float  # 수수료 차감 후 순손익 (USDT)
    pnl_percent: float  # 진입 명목가 대비
    exit_reason: Literal["take_profit", "stop_loss", "exit_rule", "end_of_data"]
    bars: int


@dataclass
class EquityPoint:
    time: int
    equity: float
    drawdown: float


@dataclass
class ChartMarker:
    """차트 진입/청산 마커. 설계서 14장 / 18.1 차트 마커. step 8."""

    time: int
    price: float
    kind: Literal["entry", "exit"]
    side: Side
    text: str


@dataclass
class BacktestResult:
    """성과 지표 + 거래 내역 + 에쿼티 커브 + 마커. 설계서 14장."""

    strategy_name: str
    start_time: int
    end_time: int

    initial_cash: float
    final_equity: float
    total_return_percent: float

    trade_count: int
    wins: int
    losses: int
    win_rate_percent: float
    profit_factor: float
    expectancy: float
    avg_win: float
    avg_loss: float

    max_drawdown_percent: float
    max_consecutive_losses: float
    worst_trade_pnl: float
    best_trade_pnl: float
    avg_holding_bars: float

    long_return: float
    short_return: float
    open_at_end: bool

    trades: list[Trade] = field(default_factory=list)
    equity_curve: list[EquityPoint] = field(default_factory=list)
    markers: list[ChartMarker] = field(default_factory=list)
