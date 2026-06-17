"""파라미터 무한 조합(Grid Search) 엔진. 설계서 16/17장.

전략 JSON 템플릿($placeholder) + param_grid → 모든 조합을 백테스트하고
Profit Factor / MDD / 거래횟수 / 수익률 기준으로 랭킹한다.

랭킹(설계서 16.3 + 요청):
  0. 거래 횟수 최소 기준 통과 여부 (통과한 전략이 항상 위) — 설계서 17.4 과최적화 방지
  1. Profit Factor 높은 순
  2. MDD 낮은 순
  3. 총 수익률 높은 순
  4. 최대 연속 손실 낮은 순
"""
from __future__ import annotations

import argparse
import copy
import csv
import json
import math
from dataclasses import asdict, dataclass, field
from itertools import product
from typing import Any

import polars as pl

from .data import load_candles, validate_candles
from .engine import run_backtest
from .models import BacktestConfig, Strategy


@dataclass
class GridResult:
    params: dict[str, Any]
    profit_factor: float
    mdd: float                 # max_drawdown_percent (양수, 낮을수록 좋음)
    total_return: float
    win_rate: float
    trade_count: int
    max_consecutive_losses: int
    expectancy: float
    passed_min_trades: bool = field(default=True)


def generate_param_grid(grid: dict[str, list[Any]]):
    """모든 파라미터 조합을 dict 로 생성. 설계서 16.1."""
    keys = list(grid.keys())
    for combo in product(*(grid[k] for k in keys)):
        yield dict(zip(keys, combo))


def apply_params(template: Any, params: dict[str, Any]) -> Any:
    """$placeholder 토큰을 파라미터 값으로 치환. 설계서 16장 apply_params.

    - 문자열 전체가 "$name" 이면 원시 값(int/float)으로 치환(타입 보존).
    - 문자열 안에 "$name" 이 섞여 있으면 문자열 보간(`"close - atr * $k"`).
    """
    if isinstance(template, dict):
        return {k: apply_params(v, params) for k, v in template.items()}
    if isinstance(template, list):
        return [apply_params(v, params) for v in template]
    if isinstance(template, str):
        if template.startswith("$") and template[1:] in params:
            return params[template[1:]]  # 타입 보존
        for name, val in params.items():
            template = template.replace(f"${name}", str(val))
        return template
    return template


def run_grid_search(template: dict[str, Any], grid: dict[str, list[Any]],
                    df: pl.DataFrame, config: BacktestConfig | None = None,
                    min_trades: int = 10) -> list[GridResult]:
    """조합별 run_backtest 후 랭킹 정렬된 결과 리스트 반환."""
    cfg = config or BacktestConfig()
    results: list[GridResult] = []

    for params in generate_param_grid(grid):
        strat_json = apply_params(copy.deepcopy(template), params)
        strategy = Strategy.from_json(strat_json)
        r = run_backtest(df, strategy, cfg)
        results.append(GridResult(
            params=params,
            profit_factor=r.profit_factor,
            mdd=r.max_drawdown_percent,
            total_return=r.total_return_percent,
            win_rate=r.win_rate_percent,
            trade_count=r.trade_count,
            max_consecutive_losses=r.max_consecutive_losses,
            expectancy=r.expectancy,
            passed_min_trades=r.trade_count >= min_trades,
        ))

    return sorted(results, key=_rank_key)


def _rank_key(r: GridResult) -> tuple:
    # PF=inf(무손실) 는 정렬용으로 캡. 진짜 우위가 아니라 표본 부족일 수 있음.
    pf_sort = 1e12 if math.isinf(r.profit_factor) else r.profit_factor
    return (
        not r.passed_min_trades,  # 통과(False=0)가 먼저
        -pf_sort,                 # Profit Factor 높은 순
        r.mdd,                    # MDD 낮은 순
        -r.total_return,          # 총 수익률 높은 순
        r.max_consecutive_losses,  # 최대 연속 손실 낮은 순
    )


def _json_safe(v: Any) -> Any:
    if isinstance(v, float):
        if math.isinf(v):
            return "inf"
        if math.isnan(v):
            return None
    return v


def save_results(results: list[GridResult], out_prefix: str) -> None:
    """랭킹 결과를 {prefix}.csv / {prefix}.json 으로 저장."""
    param_keys = sorted(results[0].params.keys()) if results else []
    metric_keys = ["profit_factor", "mdd", "total_return", "win_rate",
                   "trade_count", "max_consecutive_losses", "expectancy",
                   "passed_min_trades"]

    with open(f"{out_prefix}.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["rank", *param_keys, *metric_keys])
        for i, r in enumerate(results, 1):
            d = asdict(r)
            w.writerow([i, *[r.params[k] for k in param_keys],
                        *[d[k] for k in metric_keys]])

    rows = []
    for i, r in enumerate(results, 1):
        d = asdict(r)
        rows.append({"rank": i, **{k: _json_safe(v) for k, v in d.items()}})
    with open(f"{out_prefix}.json", "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)


def _print_top(results: list[GridResult], top: int) -> None:
    print(f"{'rank':>4} {'PF':>6} {'MDD%':>7} {'ret%':>8} {'win%':>6} {'trades':>7}  params")
    for i, r in enumerate(results[:top], 1):
        pf = "inf" if math.isinf(r.profit_factor) else f"{r.profit_factor:.2f}"
        flag = "" if r.passed_min_trades else " (거래부족)"
        print(f"{i:>4} {pf:>6} {r.mdd:>7.2f} {r.total_return:>8.2f} "
              f"{r.win_rate:>6.1f} {r.trade_count:>7}  {r.params}{flag}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Grid Search 최적화 (설계서 16장)")
    ap.add_argument("--data", required=True)
    ap.add_argument("--strategy", required=True, help="$placeholder 가 든 전략 템플릿 JSON")
    ap.add_argument("--grid", required=True, help="param_grid JSON")
    ap.add_argument("--min-trades", type=int, default=10)
    ap.add_argument("--cash", type=float, default=10_000.0)
    ap.add_argument("--fee", type=float, default=0.0004)
    ap.add_argument("--slippage", type=float, default=0.0005)
    ap.add_argument("--warmup", type=int, default=210)
    ap.add_argument("--out", help="결과 출력 경로 prefix ({prefix}.csv/.json)")
    ap.add_argument("--top", type=int, default=20)
    args = ap.parse_args()

    with open(args.strategy, encoding="utf-8") as f:
        template = json.load(f)
    with open(args.grid, encoding="utf-8") as f:
        grid = json.load(f)

    df = load_candles(args.data)
    validate_candles(df, template.get("timeframe", "4h"))

    cfg = BacktestConfig(initial_cash=args.cash, fee=args.fee,
                         slippage=args.slippage, warmup_bars=args.warmup)
    total = 1
    for v in grid.values():
        total *= len(v)
    print(f"조합 {total}개 백테스트 중 (min_trades={args.min_trades})...")
    results = run_grid_search(template, grid, df, cfg, min_trades=args.min_trades)

    _print_top(results, args.top)
    if args.out:
        save_results(results, args.out)
        print(f"\n저장: {args.out}.csv / {args.out}.json")


if __name__ == "__main__":
    main()
