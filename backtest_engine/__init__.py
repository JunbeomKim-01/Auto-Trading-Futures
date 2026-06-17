"""무한 백테스트 엔진 (코어 MVP).

설계서 `infinite_backtest_engine_design.md` 20장 구현 순서 1~8단계.
벡터 지표 계산(Polars) + 이벤트 기반 체결 시뮬레이션.
"""
from .engine import run_backtest
from .models import BacktestConfig, BacktestResult, Strategy, Trade

__all__ = [
    "run_backtest",
    "BacktestConfig",
    "BacktestResult",
    "Strategy",
    "Trade",
]
