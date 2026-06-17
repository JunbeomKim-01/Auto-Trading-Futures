"""데이터 레이어. 설계서 4장.

OHLCV 캔들 로드(Parquet/CSV) + 무결성 검증.
미래 데이터 참조를 막기 위해 시간순 정렬과 누락/중복 검사를 강제한다.
"""
from __future__ import annotations

from pathlib import Path

import polars as pl

CANDLE_COLUMNS = ["open_time", "open", "high", "low", "close", "volume"]

# 타임프레임 → 밀리초. 누락/중복 검사용. 설계서 4.3.
TIMEFRAME_MS: dict[str, int] = {
    "1m": 60_000,
    "5m": 300_000,
    "15m": 900_000,
    "1h": 3_600_000,
    "2h": 7_200_000,
    "4h": 14_400_000,
    "1d": 86_400_000,
}


def load_candles(path: str | Path) -> pl.DataFrame:
    """Parquet 파일/디렉터리 또는 CSV에서 캔들을 로드해 시간순 정렬한다.

    설계서 4.2. 디렉터리를 주면 그 안의 모든 *.parquet 을 합친다.
    """
    p = Path(path)
    if p.is_dir():
        df = pl.read_parquet(str(p / "*.parquet"))
    elif p.suffix == ".csv":
        df = pl.read_csv(str(p))
    else:
        df = pl.read_parquet(str(p))

    missing = [c for c in CANDLE_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"캔들 컬럼 누락: {missing}")

    return df.select(
        # quote_volume/trades 등 부가 컬럼이 있어도 핵심만 표준화.
        *[pl.col(c) for c in CANDLE_COLUMNS],
    ).sort("open_time")


def validate_candles(df: pl.DataFrame, timeframe: str) -> None:
    """설계서 4.3 데이터 검증 7항목. 위반 시 ValueError.

    1. 중복 캔들 없음  2. 누락 캔들 없음  3. 시간 정렬됨
    4. OHLC 정상       5. volume 음수 없음
    6. high >= max(o,c,l)  7. low <= min(o,c,h)
    """
    if df.height == 0:
        raise ValueError("캔들이 비어 있음")

    times = df["open_time"]

    # 1 + 3: 정렬 + 중복
    if not times.is_sorted():
        raise ValueError("open_time 이 정렬되어 있지 않음")
    if times.n_unique() != df.height:
        raise ValueError("중복 캔들 존재")

    # 2: 누락 — 인접 간격이 모두 step 과 같아야 함
    step = TIMEFRAME_MS.get(timeframe)
    if step is not None and df.height > 1:
        diffs = times.diff().drop_nulls()
        bad = diffs.filter(diffs != step)
        if bad.len() > 0:
            raise ValueError(
                f"누락/불규칙 캔들 {bad.len()}개 (기대 간격 {step}ms, "
                f"예: {bad.head(3).to_list()})"
            )

    # 4~7: OHLC 무결성
    o, h, l, c, v = (df[k] for k in ("open", "high", "low", "close", "volume"))
    if (v < 0).any():
        raise ValueError("volume 음수 존재")
    hi_ok = (h >= o) & (h >= c) & (h >= l)
    lo_ok = (l <= o) & (l <= c) & (l <= h)
    if not hi_ok.all():
        raise ValueError("high 가 o/c/l 보다 작은 봉 존재")
    if not lo_ok.all():
        raise ValueError("low 가 o/c/h 보다 큰 봉 존재")
