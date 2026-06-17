"""백테스트 루프 + 체결/포트폴리오. 설계서 8/9/10/11/12/13장.

하이브리드: 지표는 벡터(Polars)로 미리 계산, 체결은 이벤트(봉 단위)로 재생.
미래 데이터 참조 금지 — 신호는 봉 i 종가에서 평가하고 진입은 봉 i+1 시가에 체결.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import polars as pl

from .indicators import compute_indicators
from .metrics import analyze_result
from .models import BacktestConfig, BacktestResult, ChartMarker, Side, Strategy, Trade
from .rules import evaluate_rule


@dataclass
class _Position:
    side: Side
    qty: float
    avg_entry: float  # 슬리피지 반영된 체결가
    entry_time: int
    entry_index: int


def _entry_fill(price: float, side: Side, slippage: float) -> float:
    # 진입은 불리하게. LONG 은 비싸게 사고, SHORT 은 싸게 판다. 설계서 9.3.
    return price * (1 + slippage) if side == "LONG" else price * (1 - slippage)


def _exit_fill(price: float, side: Side, slippage: float) -> float:
    # 청산도 불리하게.
    return price * (1 - slippage) if side == "LONG" else price * (1 + slippage)


def _gross_pnl(side: Side, entry: float, exit_: float, qty: float) -> float:
    return (exit_ - entry) * qty if side == "LONG" else (entry - exit_) * qty


def _unrealized(pos: _Position | None, price: float) -> float:
    if pos is None:
        return 0.0
    return _gross_pnl(pos.side, pos.avg_entry, price, pos.qty)


def _check_tp_sl(pos: _Position, bar: dict[str, Any], strat: Strategy,
                 cfg: BacktestConfig) -> tuple[str, float] | None:
    """이 봉의 high/low 로 TP/SL 터치 판정. 동시 터치는 설계서 10장 규칙.

    반환: (exit_reason, 슬리피지 적용된 체결가) 또는 None.
    """
    entry = pos.avg_entry
    tp_pct, sl_pct = strat.take_profit_pct, strat.stop_loss_pct
    if pos.side == "LONG":
        tp_price = entry * (1 + tp_pct) if tp_pct is not None else None
        sl_price = entry * (1 - sl_pct) if sl_pct is not None else None
        hit_tp = tp_price is not None and bar["high"] >= tp_price
        hit_sl = sl_price is not None and bar["low"] <= sl_price
    else:  # SHORT
        tp_price = entry * (1 - tp_pct) if tp_pct is not None else None
        sl_price = entry * (1 + sl_pct) if sl_pct is not None else None
        hit_tp = tp_price is not None and bar["low"] <= tp_price
        hit_sl = sl_price is not None and bar["high"] >= sl_price

    if hit_tp and hit_sl:
        # 한 봉 안 순서를 OHLCV 만으로 알 수 없음. conservative=손실 우선. 설계서 10장.
        if cfg.tp_sl_priority == "conservative":
            return ("stop_loss", _exit_fill(sl_price, pos.side, cfg.slippage))
        return ("take_profit", _exit_fill(tp_price, pos.side, cfg.slippage))
    if hit_sl:
        return ("stop_loss", _exit_fill(sl_price, pos.side, cfg.slippage))
    if hit_tp:
        return ("take_profit", _exit_fill(tp_price, pos.side, cfg.slippage))
    return None


def run_backtest(df: pl.DataFrame, strategy: Strategy,
                 config: BacktestConfig | None = None) -> BacktestResult:
    """단일 진입/단일 청산 이벤트 백테스트. 설계서 13장."""
    cfg = config or BacktestConfig()
    data = compute_indicators(df, strategy.indicators)
    rows = data.to_dicts()
    n = len(rows)
    warmup = min(cfg.warmup_bars, n)

    pos: _Position | None = None
    pending_entry = False
    pending_exit = False
    realized = 0.0  # 누적 실현 손익(수수료 차감 후)
    trades: list[Trade] = []
    markers: list[ChartMarker] = []
    equity_curve: list[tuple[int, float]] = []

    def close_position(p: _Position, raw_exit: float, reason: str, bar: dict[str, Any]) -> None:
        nonlocal realized
        qty = p.qty
        gross = _gross_pnl(p.side, p.avg_entry, raw_exit, qty)
        entry_fee = p.avg_entry * qty * cfg.fee
        exit_fee = raw_exit * qty * cfg.fee
        net = gross - entry_fee - exit_fee
        realized += net
        entry_notional = p.avg_entry * qty
        trades.append(Trade(
            side=p.side, entry_time=p.entry_time, entry_price=p.avg_entry,
            exit_time=bar["open_time"], exit_price=raw_exit, qty=qty, pnl=net,
            pnl_percent=(net / entry_notional * 100) if entry_notional else 0.0,
            exit_reason=reason, bars=bar_index - p.entry_index,
        ))
        markers.append(ChartMarker(
            time=bar["open_time"], price=raw_exit, kind="exit", side=p.side,
            text=f"{reason} {net:+.2f}",
        ))

    for bar_index in range(warmup, n):
        bar = rows[bar_index]
        prev = rows[bar_index - 1] if bar_index > 0 else None

        # 1. 보유 포지션 청산 (인트라바 TP/SL 우선, 없으면 예약된 조건 청산)
        if pos is not None:
            tp_sl = _check_tp_sl(pos, bar, strategy, cfg)
            if tp_sl is not None:
                close_position(pos, tp_sl[1], tp_sl[0], bar)
                pos, pending_exit = None, False
            elif pending_exit:
                raw = _exit_fill(bar["open"], pos.side, cfg.slippage)
                close_position(pos, raw, "exit_rule", bar)
                pos, pending_exit = None, False

        # 2. 직전 봉 신호로 이번 봉 시가 진입
        if pos is None and pending_entry:
            entry_price = _entry_fill(bar["open"], strategy.entry_side, cfg.slippage)
            notional = (cfg.initial_cash + realized) * cfg.position_pct
            qty = notional / entry_price if entry_price > 0 else 0.0
            if qty > 0:
                pos = _Position(strategy.entry_side, qty, entry_price,
                                bar["open_time"], bar_index)
                markers.append(ChartMarker(
                    time=bar["open_time"], price=entry_price, kind="entry",
                    side=strategy.entry_side, text=f"entry @ {entry_price:.2f}",
                ))
            pending_entry = False

        # 3. 이번 봉 종가 기준 신호 평가 → 다음 봉 예약
        if pos is None:
            if evaluate_rule(bar, prev, strategy.entry_rule):
                pending_entry = True
        elif strategy.exit_rule is not None:
            if evaluate_rule(bar, prev, strategy.exit_rule):
                pending_exit = True

        # 4. 에쿼티 기록 (실현 + 미실현)
        equity = cfg.initial_cash + realized + _unrealized(pos, bar["close"])
        equity_curve.append((bar["open_time"], equity))

    open_at_end = pos is not None
    if pos is not None and n > 0:
        last = rows[n - 1]
        raw = _exit_fill(last["close"], pos.side, cfg.slippage)
        close_position(pos, raw, "end_of_data", last)

    return analyze_result(
        strategy_name=strategy.name,
        initial_cash=cfg.initial_cash,
        trades=trades,
        equity_curve=equity_curve,
        markers=markers,
        open_at_end=open_at_end,
    )
