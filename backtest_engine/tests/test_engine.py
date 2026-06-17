"""엔진 검증. 합성 데이터로 결정론적 시나리오를 확인한다.

설계서 0장: 백테스트 결과는 항상 재현 가능해야 한다.
실행: .venv/bin/python -m pytest backtest_engine/tests -q
"""
from __future__ import annotations

import math

import polars as pl
import pytest

from backtest_engine.data import validate_candles
from backtest_engine.engine import run_backtest
from backtest_engine.indicators import compute_indicators
from backtest_engine.models import BacktestConfig, Strategy
from backtest_engine.rules import evaluate_condition, evaluate_rule, resolve_value

H4 = 14_400_000


def make_df(bars: list[tuple]) -> pl.DataFrame:
    """bars: (open, high, low, close, volume) 리스트 → 표준 캔들 DF."""
    return pl.DataFrame({
        "open_time": [i * H4 for i in range(len(bars))],
        "open": [b[0] for b in bars],
        "high": [b[1] for b in bars],
        "low": [b[2] for b in bars],
        "close": [b[3] for b in bars],
        "volume": [b[4] for b in bars],
    })


# ---------- 인디케이터 ----------

def test_sma_ema_known_values():
    df = make_df([(0, 0, 0, float(c), 0) for c in [2, 4, 6, 8, 10]])
    out = compute_indicators(df, {
        "sma3": {"type": "SMA", "period": 3},
        "ema3": {"type": "EMA", "period": 3},
    })
    sma = out["sma3"].to_list()
    assert sma[0] is None and sma[1] is None
    assert sma[2] == pytest.approx(4.0)   # (2+4+6)/3
    assert sma[4] == pytest.approx(8.0)   # (6+8+10)/3
    # EMA(span=3, adjust=False): alpha=0.5. seed=2 → 3 → 4.5 → 6.25 → 8.125
    assert out["ema3"].to_list()[-1] == pytest.approx(8.125)


def test_macd_columns_present():
    df = make_df([(0, 0, 0, float(c), 0) for c in range(1, 60)])
    out = compute_indicators(df, {"macd": {"type": "MACD"}})
    for col in ["macd", "macd_signal", "macd_histogram"]:
        assert col in out.columns


def test_rsi_all_up_is_100():
    df = make_df([(0, 0, 0, float(c), 0) for c in range(1, 40)])
    out = compute_indicators(df, {"rsi": {"type": "RSI", "period": 14}})
    assert out["rsi"].to_list()[-1] == pytest.approx(100.0)


def test_fvg_detects_three_candle_gaps_without_lookahead():
    df = make_df([
        (10, 12, 9, 11, 1),
        (11, 12, 10, 11, 1),
        (14, 15, 13, 14, 1),  # bullish FVG: low[2]=13 > high[0]=12
        (9, 10, 8, 9, 1),     # bearish FVG: high[3]=10 < low[1]=10 is false
        (7, 8, 6, 7, 1),      # bearish FVG: high[4]=8 < low[2]=13
    ])
    out = compute_indicators(df, {"fvg": {"type": "FVG"}})

    assert out["fvg_bullish"].to_list() == [False, False, True, False, False]
    assert out["fvg_bearish"].to_list() == [False, False, False, False, True]
    assert out["fvg_direction"].to_list() == [0, 0, 1, 0, -1]
    assert out["fvg_low"].to_list()[2] == pytest.approx(12.0)
    assert out["fvg_high"].to_list()[2] == pytest.approx(13.0)
    assert out["fvg_low"].to_list()[4] == pytest.approx(8.0)
    assert out["fvg_high"].to_list()[4] == pytest.approx(13.0)


def test_order_block_detects_previous_opposite_candle_zone():
    df = make_df([
        (10.0, 11.0, 9.0, 10.0, 1),
        (10.0, 10.5, 8.0, 9.0, 1),   # bearish candle, potential bullish OB zone
        (9.0, 12.0, 8.8, 11.0, 1),   # bullish displacement close > prev high
        (11.0, 13.0, 10.0, 12.0, 1), # bullish candle, potential bearish OB zone
        (12.0, 12.5, 9.0, 9.5, 1),   # bearish displacement close < prev low
    ])
    out = compute_indicators(df, {"ob": {"type": "OB"}})

    assert out["ob_bullish"].to_list() == [False, False, True, False, False]
    assert out["ob_bearish"].to_list() == [False, False, False, False, True]
    assert out["ob_direction"].to_list() == [0, 0, 1, 0, -1]
    assert out["ob_low"].to_list()[2] == pytest.approx(8.0)
    assert out["ob_high"].to_list()[2] == pytest.approx(10.5)
    assert out["ob_low"].to_list()[4] == pytest.approx(10.0)
    assert out["ob_high"].to_list()[4] == pytest.approx(13.0)


def test_order_block_min_body_ratio_filter():
    df = make_df([
        (10.0, 11.0, 9.0, 10.0, 1),
        (10.0, 10.5, 8.0, 9.0, 1),
        (9.0, 12.0, 8.8, 11.0, 1),
    ])
    out = compute_indicators(df, {"ob": {"type": "ORDER_BLOCK", "min_body_ratio": 0.9}})
    assert out["ob_bullish"].to_list() == [False, False, False]


# ---------- 조건 엔진 ----------

def test_resolve_expression():
    row = {"volume": 30.0, "volume_ma20": 10.0, "atr14": 5.0, "close": 100.0}
    assert resolve_value(row, "volume_ma20 * 1.5") == pytest.approx(15.0)
    assert resolve_value(row, "close - atr14 * 1.2") == pytest.approx(94.0)
    assert resolve_value(row, 42) == 42


def test_cross_over():
    cond = {"left": "a", "operator": "cross_over", "right": "b"}
    prev = {"a": 1.0, "b": 2.0}
    curr = {"a": 3.0, "b": 2.0}
    assert evaluate_condition(curr, prev, cond) is True
    assert evaluate_condition(prev, prev, cond) is False


def test_rule_and_or():
    row = {"rsi": 30.0, "close": 100.0, "ema": 90.0}
    rule = {"logic": "AND", "conditions": [
        {"left": "rsi", "operator": "<=", "right": 35},
        {"left": "close", "operator": ">", "right": "ema"},
    ]}
    assert evaluate_rule(row, None, rule) is True
    rule["conditions"][0]["right"] = 25
    assert evaluate_rule(row, None, rule) is False
    rule["logic"] = "OR"
    assert evaluate_rule(row, None, rule) is True  # close>ema 여전히 참


def test_nan_condition_is_false():
    cond = {"left": "x", "operator": ">", "right": 1}
    assert evaluate_condition({"x": math.nan}, None, cond) is False
    assert evaluate_condition({"x": None}, None, cond) is False


# ---------- 데이터 검증 ----------

def test_validate_detects_gap():
    df = make_df([(1, 1, 1, 1, 1)] * 3)
    df = df.with_columns(pl.Series("open_time", [0, H4, 3 * H4]))  # 한 칸 누락
    with pytest.raises(ValueError, match="누락"):
        validate_candles(df, "4h")


def test_validate_detects_bad_ohlc():
    df = make_df([(10, 9, 8, 9, 1)])  # high < open
    with pytest.raises(ValueError, match="high"):
        validate_candles(df, "4h")


# ---------- 전체 백테스트 (다음 봉 시가 진입 + TP/SL) ----------

ALWAYS_LONG = {
    "name": "t", "indicators": {},
    "entry": {"side": "LONG", "rule": {"logic": "AND",
              "conditions": [{"left": "close", "operator": ">", "right": 0}]}},
    "exit": {"take_profit_pct": 0.03, "stop_loss_pct": 0.02},
}
NOCOST = BacktestConfig(initial_cash=10_000, fee=0.0, slippage=0.0, warmup_bars=0)


def test_take_profit_fill():
    # bar0 신호→ bar1 시가(100) 진입, TP=103. bar2 high=104 로 TP 체결.
    df = make_df([
        (100, 100.5, 99.5, 100, 1),
        (100, 101, 99, 100, 1),     # 진입 봉(이 봉은 청산 판정 안 함)
        (100, 104, 99.8, 103, 1),   # TP 터치
        (103, 103, 102, 102, 1),
    ])
    r = run_backtest(df, Strategy.from_json(ALWAYS_LONG), NOCOST)
    assert r.trades[0].exit_reason == "take_profit"
    assert r.trades[0].entry_price == pytest.approx(100.0)
    assert r.trades[0].exit_price == pytest.approx(103.0)
    # qty = 10000/100 = 100, pnl = 3*100 = 300
    assert r.trades[0].pnl == pytest.approx(300.0)
    assert r.trades[0].pnl_percent == pytest.approx(3.0)


def test_stop_loss_fill():
    df = make_df([
        (100, 100.5, 99.5, 100, 1),
        (100, 101, 99, 100, 1),
        (100, 100.5, 97, 98, 1),    # low=97 → SL=98 터치
        (98, 98, 97, 97, 1),
    ])
    r = run_backtest(df, Strategy.from_json(ALWAYS_LONG), NOCOST)
    assert r.trades[0].exit_reason == "stop_loss"
    assert r.trades[0].pnl == pytest.approx(-200.0)  # (98-100)*100


def test_simultaneous_touch_is_conservative_loss():
    df = make_df([
        (100, 100.5, 99.5, 100, 1),
        (100, 101, 99, 100, 1),
        (100, 104, 97, 100, 1),     # TP(103)·SL(98) 동시 터치 → 보수적=손실
    ])
    r = run_backtest(df, Strategy.from_json(ALWAYS_LONG), NOCOST)
    assert r.trades[0].exit_reason == "stop_loss"


def test_fees_reduce_pnl():
    df = make_df([
        (100, 100.5, 99.5, 100, 1),
        (100, 101, 99, 100, 1),
        (100, 104, 99.8, 103, 1),
    ])
    cfg = BacktestConfig(initial_cash=10_000, fee=0.001, slippage=0.0, warmup_bars=0)
    r = run_backtest(df, Strategy.from_json(ALWAYS_LONG), cfg)
    # gross 300 - (entry 100*100*0.001=10) - (exit 103*100*0.001=10.3) = 279.7
    assert r.trades[0].pnl == pytest.approx(279.7)


def test_no_lookahead_entry_on_next_open():
    # 신호 봉의 종가가 아니라 '다음 봉 시가'에 들어가는지. 다음 봉 시가=120.
    df = make_df([
        (100, 100.5, 99.5, 100, 1),   # 신호
        (120, 125, 119, 124, 1),      # 진입가 = 120 (시가)
        (124, 200, 123, 199, 1),      # TP(120*1.03=123.6) 터치
    ])
    r = run_backtest(df, Strategy.from_json(ALWAYS_LONG), NOCOST)
    assert r.trades[0].entry_price == pytest.approx(120.0)


def test_entry_bar_take_profit_is_checked():
    # bar0 신호 → bar1 시가(100) 진입. 같은 bar1 high=104 로 TP=103 즉시 터치.
    df = make_df([
        (100, 100.5, 99.5, 100, 1),
        (100, 104, 99, 100, 1),
        (100, 100, 99, 100, 1),
    ])
    r = run_backtest(df, Strategy.from_json(ALWAYS_LONG), NOCOST)
    assert r.trades[0].exit_reason == "take_profit"
    assert r.trades[0].entry_time == H4
    assert r.trades[0].exit_time == H4
    assert r.trades[0].pnl == pytest.approx(300.0)


def test_entry_bar_stop_loss_is_checked():
    # bar0 신호 → bar1 시가(100) 진입. 같은 bar1 low=97 로 SL=98 즉시 터치.
    df = make_df([
        (100, 100.5, 99.5, 100, 1),
        (100, 101, 97, 100, 1),
        (100, 100, 99, 100, 1),
    ])
    r = run_backtest(df, Strategy.from_json(ALWAYS_LONG), NOCOST)
    assert r.trades[0].exit_reason == "stop_loss"
    assert r.trades[0].entry_time == H4
    assert r.trades[0].exit_time == H4
    assert r.trades[0].pnl == pytest.approx(-200.0)


def test_entry_bar_simultaneous_touch_is_conservative_loss():
    df = make_df([
        (100, 100.5, 99.5, 100, 1),
        (100, 104, 97, 100, 1),  # TP(103)·SL(98) 동시 터치 → 보수적=손실
        (100, 100, 99, 100, 1),
    ])
    r = run_backtest(df, Strategy.from_json(ALWAYS_LONG), NOCOST)
    assert r.trades[0].exit_reason == "stop_loss"


def test_end_of_data_close_updates_final_equity_with_costs():
    no_exit = {
        "name": "t", "indicators": {},
        "entry": {"side": "LONG", "rule": {"logic": "AND",
                  "conditions": [{"left": "close", "operator": ">", "right": 0}]}},
        "exit": {},
    }
    df = make_df([
        (100, 100, 100, 100, 1),
        (100, 101, 99, 100, 1),
        (110, 111, 109, 110, 1),
    ])
    cfg = BacktestConfig(initial_cash=10_000, fee=0.001, slippage=0.01, warmup_bars=0)
    r = run_backtest(df, Strategy.from_json(no_exit), cfg)
    assert r.open_at_end is True
    assert r.trades[0].exit_reason == "end_of_data"
    assert r.final_equity == pytest.approx(r.initial_cash + sum(t.pnl for t in r.trades))
    assert r.equity_curve[-1].equity == pytest.approx(r.final_equity)


def test_open_equity_curve_includes_entry_fee():
    df = make_df([
        (100, 100.5, 99.5, 100, 1),
        (100, 101, 99, 100, 1),  # 진입 후 아직 TP/SL 없음. 진입 수수료만 반영되어야 함.
        (100, 101, 99, 100, 1),
    ])
    cfg = BacktestConfig(initial_cash=10_000, fee=0.001, slippage=0.0, warmup_bars=0)
    r = run_backtest(df, Strategy.from_json(ALWAYS_LONG), cfg)
    assert r.equity_curve[1].equity == pytest.approx(9_990.0)
