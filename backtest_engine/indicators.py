"""인디케이터 엔진. 설계서 5장.

모든 인디케이터는 순수 함수: (df, output_name, **params) -> df(+컬럼).
부작용 없음, 입력과 동일 길이의 컬럼을 추가한다. 벡터(Polars) 계산.
"""
from __future__ import annotations

from typing import Any, Callable

import polars as pl


def _ema_expr(col: pl.Expr, period: int) -> pl.Expr:
    return col.ewm_mean(span=period, adjust=False)


def calculate_rsi(df: pl.DataFrame, output_name: str, source: str = "close",
                  period: int = 14, **_: Any) -> pl.DataFrame:
    """RSI. 설계서 5.1 (rolling mean 방식)."""
    delta = pl.col(source).diff()
    gain = pl.when(delta > 0).then(delta).otherwise(0.0)
    loss = pl.when(delta < 0).then(-delta).otherwise(0.0)
    avg_gain = gain.rolling_mean(window_size=period)
    avg_loss = loss.rolling_mean(window_size=period)
    rs = avg_gain / avg_loss
    return df.with_columns(
        (100 - (100 / (1 + rs))).alias(output_name)
    )


def calculate_ema(df: pl.DataFrame, output_name: str, source: str = "close",
                  period: int = 20, **_: Any) -> pl.DataFrame:
    return df.with_columns(_ema_expr(pl.col(source), period).alias(output_name))


def calculate_sma(df: pl.DataFrame, output_name: str, source: str = "close",
                  period: int = 20, **_: Any) -> pl.DataFrame:
    return df.with_columns(
        pl.col(source).rolling_mean(window_size=period).alias(output_name)
    )


def calculate_macd(df: pl.DataFrame, output_name: str, source: str = "close",
                   fast: int = 12, slow: int = 26, signal: int = 9,
                   **_: Any) -> pl.DataFrame:
    """MACD. {name}=line, {name}_signal, {name}_histogram."""
    line = _ema_expr(pl.col(source), fast) - _ema_expr(pl.col(source), slow)
    df = df.with_columns(line.alias(output_name))
    sig = _ema_expr(pl.col(output_name), signal)
    df = df.with_columns(sig.alias(f"{output_name}_signal"))
    return df.with_columns(
        (pl.col(output_name) - pl.col(f"{output_name}_signal")).alias(f"{output_name}_histogram")
    )


def calculate_atr(df: pl.DataFrame, output_name: str, period: int = 14,
                  **_: Any) -> pl.DataFrame:
    """ATR. True Range 의 rolling mean."""
    prev_close = pl.col("close").shift(1)
    tr = pl.max_horizontal(
        pl.col("high") - pl.col("low"),
        (pl.col("high") - prev_close).abs(),
        (pl.col("low") - prev_close).abs(),
    )
    return df.with_columns(
        tr.rolling_mean(window_size=period).alias(output_name)
    )


def calculate_bollinger(df: pl.DataFrame, output_name: str, source: str = "close",
                        period: int = 20, std: float = 2.0,
                        **_: Any) -> pl.DataFrame:
    """볼린저 밴드. {name}_upper / {name}_mid / {name}_lower."""
    mid = pl.col(source).rolling_mean(window_size=period)
    dev = pl.col(source).rolling_std(window_size=period)
    return df.with_columns(
        mid.alias(f"{output_name}_mid"),
        (mid + dev * std).alias(f"{output_name}_upper"),
        (mid - dev * std).alias(f"{output_name}_lower"),
    )


def calculate_volume_ma(df: pl.DataFrame, output_name: str, period: int = 20,
                        **_: Any) -> pl.DataFrame:
    return calculate_sma(df, output_name, source="volume", period=period)


# 설계서 5.2 인디케이터 레지스트리.
INDICATOR_REGISTRY: dict[str, Callable[..., pl.DataFrame]] = {
    "RSI": calculate_rsi,
    "EMA": calculate_ema,
    "SMA": calculate_sma,
    "MACD": calculate_macd,
    "ATR": calculate_atr,
    "BOLLINGER": calculate_bollinger,
    "VOLUME_MA": calculate_volume_ma,
}


def compute_indicators(df: pl.DataFrame, indicator_config: dict[str, dict[str, Any]]) -> pl.DataFrame:
    """전략의 indicators 정의를 모두 계산해 컬럼으로 붙인다. 설계서 5.4."""
    result = df
    for name, cfg in indicator_config.items():
        indicator_type = cfg["type"]
        fn = INDICATOR_REGISTRY.get(indicator_type)
        if fn is None:
            raise ValueError(f"지원하지 않는 인디케이터: {indicator_type}")
        params = {k: v for k, v in cfg.items() if k != "type"}
        result = fn(result, output_name=name, **params)
    return result
