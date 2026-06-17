"""Grid Search 검증. 설계서 16장."""
from __future__ import annotations

import json

from backtest_engine.optimization import (
    GridResult,
    apply_params,
    generate_param_grid,
    run_grid_search,
    save_results,
)
from backtest_engine.models import BacktestConfig
from .test_engine import make_df


def test_generate_param_grid_count():
    grid = {"a": [1, 2, 3], "b": [10, 20]}
    combos = list(generate_param_grid(grid))
    assert len(combos) == 6
    assert {"a": 1, "b": 10} in combos
    assert {"a": 3, "b": 20} in combos


def test_apply_params_type_preserving():
    template = {
        "indicators": {"rsi": {"period": "$rsi_period"}},
        "entry": {"rule": {"conditions": [{"right": "$rsi_oversold"}]}},
        "exit": {"take_profit_pct": "$take_profit"},
        "expr": {"right": "atr14 * $k"},
    }
    out = apply_params(template, {"rsi_period": 14, "rsi_oversold": 30,
                                  "take_profit": 0.03, "k": 1.5})
    assert out["indicators"]["rsi"]["period"] == 14  # int 보존
    assert isinstance(out["indicators"]["rsi"]["period"], int)
    assert out["exit"]["take_profit_pct"] == 0.03    # float 보존
    assert out["expr"]["right"] == "atr14 * 1.5"     # 문자열 보간


def test_apply_params_does_not_mutate_template():
    template = {"p": "$x"}
    apply_params(template, {"x": 1})
    assert template["p"] == "$x"


TEMPLATE = {
    "name": "t", "timeframe": "4h", "indicators": {},
    "entry": {"side": "LONG", "rule": {"logic": "AND",
              "conditions": [{"left": "close", "operator": ">", "right": 0}]}},
    "exit": {"take_profit_pct": "$tp", "stop_loss_pct": "$sl"},
}


def _trending_df():
    # 꾸준히 오르는 시리즈: TP 가 잘 맞고 SL 은 거의 안 맞음.
    bars = []
    p = 100.0
    for _ in range(60):
        o = p
        c = p * 1.01
        bars.append((o, c * 1.005, o * 0.999, c, 1))
        p = c
    return make_df(bars)


def test_grid_search_ranks_and_gates():
    df = _trending_df()
    grid = {"tp": [0.02, 0.05], "sl": [0.02]}
    cfg = BacktestConfig(initial_cash=10_000, fee=0.0, slippage=0.0, warmup_bars=0)
    results = run_grid_search(TEMPLATE, grid, df, cfg, min_trades=1)
    assert len(results) == 2
    assert all(isinstance(r, GridResult) for r in results)
    # 정렬되어 있어야 함: 통과 전략이 위 + PF 내림차순 우선
    assert results[0].passed_min_trades or not results[-1].passed_min_trades


def test_min_trades_gate_demotes():
    df = _trending_df()
    grid = {"tp": [0.02], "sl": [0.02]}
    cfg = BacktestConfig(initial_cash=10_000, fee=0.0, slippage=0.0, warmup_bars=0)
    # 비현실적으로 높은 최소 거래수 → 통과 실패로 표시
    results = run_grid_search(TEMPLATE, grid, df, cfg, min_trades=10_000)
    assert results[0].passed_min_trades is False


def test_save_results(tmp_path):
    df = _trending_df()
    grid = {"tp": [0.02, 0.05], "sl": [0.02]}
    cfg = BacktestConfig(initial_cash=10_000, fee=0.0, slippage=0.0, warmup_bars=0)
    results = run_grid_search(TEMPLATE, grid, df, cfg, min_trades=1)
    prefix = str(tmp_path / "opt")
    save_results(results, prefix)
    csv_text = (tmp_path / "opt.csv").read_text()
    assert "rank" in csv_text and "profit_factor" in csv_text
    data = json.loads((tmp_path / "opt.json").read_text())  # inf 직렬화 안전 확인
    assert data[0]["rank"] == 1
