"""결과 분석 지표. 설계서 14장.

수익률보다 MDD / Profit Factor / 거래 횟수 / 구간 성과를 함께 본다(설계서 0장 원칙).
"""
from __future__ import annotations

from .models import BacktestResult, ChartMarker, EquityPoint, Trade


def _max_drawdown(equity: list[float]) -> tuple[float, list[float]]:
    """MDD(양수 %) 와 각 시점 drawdown 리스트. 설계서 14.5."""
    peak = float("-inf")
    max_dd = 0.0
    dd_series: list[float] = []
    for e in equity:
        if e > peak:
            peak = e
        dd = (peak - e) / peak if peak > 0 else 0.0
        dd_series.append(dd)
        if dd > max_dd:
            max_dd = dd
    return max_dd * 100, dd_series


def analyze_result(strategy_name: str, initial_cash: float, trades: list[Trade],
                   equity_curve: list[tuple[int, float]], markers: list[ChartMarker],
                   open_at_end: bool) -> BacktestResult:
    times = [t for t, _ in equity_curve]
    equities = [e for _, e in equity_curve]

    max_dd, dd_series = _max_drawdown(equities)
    final_equity = equities[-1] if equities else initial_cash

    wins = [t for t in trades if t.pnl >= 0]
    losses = [t for t in trades if t.pnl < 0]
    gross_profit = sum(t.pnl for t in wins)
    gross_loss = abs(sum(t.pnl for t in losses))

    n = len(trades)
    win_rate = len(wins) / n if n else 0.0
    avg_win = gross_profit / len(wins) if wins else 0.0
    avg_loss = gross_loss / len(losses) if losses else 0.0  # 양수 크기
    # 기대값 = 승률 × 평균수익 - 패배율 × 평균손실. 설계서 14.7.
    expectancy = win_rate * avg_win - (1 - win_rate) * avg_loss

    if gross_loss > 0:
        profit_factor = gross_profit / gross_loss
    else:
        profit_factor = float("inf") if gross_profit > 0 else 0.0

    # 최대 연속 손실. 설계서 14.2.
    max_consec = consec = 0
    for t in trades:
        if t.pnl < 0:
            consec += 1
            max_consec = max(max_consec, consec)
        else:
            consec = 0

    long_pnl = sum(t.pnl for t in trades if t.side == "LONG")
    short_pnl = sum(t.pnl for t in trades if t.side == "SHORT")

    equity_points = [
        EquityPoint(time=tm, equity=eq, drawdown=dd)
        for tm, eq, dd in zip(times, equities, dd_series)
    ]

    return BacktestResult(
        strategy_name=strategy_name,
        start_time=times[0] if times else 0,
        end_time=times[-1] if times else 0,
        initial_cash=initial_cash,
        final_equity=final_equity,
        total_return_percent=(final_equity - initial_cash) / initial_cash * 100 if initial_cash else 0.0,
        trade_count=n,
        wins=len(wins),
        losses=len(losses),
        win_rate_percent=win_rate * 100,
        profit_factor=profit_factor,
        expectancy=expectancy,
        avg_win=avg_win,
        avg_loss=avg_loss,
        max_drawdown_percent=max_dd,
        max_consecutive_losses=max_consec,
        worst_trade_pnl=min((t.pnl for t in trades), default=0.0),
        best_trade_pnl=max((t.pnl for t in trades), default=0.0),
        avg_holding_bars=sum(t.bars for t in trades) / n if n else 0.0,
        long_return=long_pnl / initial_cash * 100 if initial_cash else 0.0,
        short_return=short_pnl / initial_cash * 100 if initial_cash else 0.0,
        open_at_end=open_at_end,
        trades=trades,
        equity_curve=equity_points,
        markers=markers,
    )
