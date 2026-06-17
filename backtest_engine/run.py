"""백테스트 CLI. 설계서 18.1 MVP 출력.

  # 데이터 먼저 받기 (회사/로컬 IP 는 Binance 비차단)
  python -m backtest_engine.fetch_binance --symbol BTCUSDT --interval 4h --years 3

  # 백테스트 실행
  python -m backtest_engine.run \
      --data data/candles/BTCUSDT/4h \
      --strategy backtest_engine/strategies/btc_4h_rsi_reversion.json \
      [--cash 10000] [--fee 0.0004] [--slippage 0.0005] [--markers out.json]
"""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict

from .data import load_candles, validate_candles
from .engine import run_backtest
from .models import BacktestConfig, Strategy


def main() -> None:
    ap = argparse.ArgumentParser(description="무한 백테스트 엔진 (코어 MVP)")
    ap.add_argument("--data", required=True, help="parquet 디렉터리/파일 또는 csv")
    ap.add_argument("--strategy", required=True, help="전략 JSON 경로")
    ap.add_argument("--cash", type=float, default=10_000.0)
    ap.add_argument("--position-pct", type=float, default=1.0)
    ap.add_argument("--fee", type=float, default=0.0004)
    ap.add_argument("--slippage", type=float, default=0.0005)
    ap.add_argument("--warmup", type=int, default=210)
    ap.add_argument("--priority", choices=["conservative", "optimistic"], default="conservative")
    ap.add_argument("--markers", help="차트 마커/에쿼티 JSON 출력 경로(선택)")
    args = ap.parse_args()

    with open(args.strategy, encoding="utf-8") as f:
        strat_json = json.load(f)
    strategy = Strategy.from_json(strat_json)

    df = load_candles(args.data)
    validate_candles(df, strat_json.get("timeframe", "4h"))

    cfg = BacktestConfig(
        initial_cash=args.cash, position_pct=args.position_pct, fee=args.fee,
        slippage=args.slippage, warmup_bars=args.warmup, tp_sl_priority=args.priority,
    )
    r = run_backtest(df, strategy, cfg)
    _print_report(r)

    if args.markers:
        with open(args.markers, "w", encoding="utf-8") as f:
            json.dump({
                "markers": [asdict(m) for m in r.markers],
                "equity_curve": [asdict(p) for p in r.equity_curve],
                "trades": [asdict(t) for t in r.trades],
            }, f, ensure_ascii=False, indent=2)
        print(f"\n마커/에쿼티/거래내역 저장: {args.markers}")


def _print_report(r) -> None:
    from datetime import datetime, timezone

    def d(ms: int) -> str:
        return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")

    pf = "∞" if r.profit_factor == float("inf") else f"{r.profit_factor:.2f}"
    line = "=" * 52
    print(line)
    print(f"백테스트: {r.strategy_name}")
    print(f"기간: {d(r.start_time)} ~ {d(r.end_time)}")
    print(line)
    print(f"시작 자본          {r.initial_cash:.2f} USDT")
    print(f"종료 자본          {r.final_equity:.2f} USDT")
    print(f"총 수익률          {r.total_return_percent:.2f} %")
    print("-" * 52)
    print(f"거래 횟수          {r.trade_count}")
    print(f"승 / 패            {r.wins} / {r.losses}")
    print(f"승률               {r.win_rate_percent:.2f} %")
    print(f"Profit Factor      {pf}")
    print(f"기대값(거래당)     {r.expectancy:.2f} USDT")
    print(f"평균 수익/손실     {r.avg_win:.2f} / -{r.avg_loss:.2f} USDT")
    print("-" * 52)
    print(f"최대 낙폭 (MDD)    {r.max_drawdown_percent:.2f} %   ← 핵심")
    print(f"최대 연속 손실     {r.max_consecutive_losses} 회       ← 핵심")
    print(f"최악/최고 단일     {r.worst_trade_pnl:.2f} / {r.best_trade_pnl:.2f} USDT")
    print(f"평균 보유          {r.avg_holding_bars:.1f} 봉")
    print(f"Long / Short 수익  {r.long_return:.2f} / {r.short_return:.2f} %")
    print(f"종료 시 미청산     {'예' if r.open_at_end else '아니오'}")
    print(line)
    if r.trade_count == 0:
        print("⚠️  체결된 거래 없음 — 진입 조건이 너무 빡빡하거나 데이터 부족.")


if __name__ == "__main__":
    main()
