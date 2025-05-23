# strategies/bollinger_band_strategy.py

import pandas as pd
import numpy as np

def bollinger_band_strategy(
    df: pd.DataFrame,
    length: int        = 24,
    mult: float        = 2.0,
    ma_type: str       = "SMA",
    window_bw: int     = 125,
    slope_len: int     = 10,
) -> pd.DataFrame:
    """
    Bollinger Bands 기반 전략:
      - Trend-following: 밴드 확장 & slope 양수 시 밴드 돌파 방향으로 진입
      - Mean-reversion: 밴드 최고점 도달 & slope 음수 시 밴드 반대 방향 진입

    입력 df: timestamp, open, high, low, close, volume 칼럼 필수
    리턴 df: basis, upper, lower, bandwidth, slope, hi_bw, signal 칼럼 추가
    """

    # 1) Basis (중심선) 계산 (SMA/EMA)
    if ma_type.upper() == "SMA":
        df['basis'] = df['close'].rolling(length).mean()
    elif ma_type.upper() == "EMA":
        df['basis'] = df['close'].ewm(span=length, adjust=False).mean()
    else:
        raise ValueError("ma_type must be 'SMA' or 'EMA'")

    # 2) StdDev & Bands
    df['stddev'] = df['close'].rolling(length).std()
    df['upper'] = df['basis'] + mult * df['stddev']
    df['lower'] = df['basis'] - mult * df['stddev']

    # 3) Bandwidth
    df['bandwidth'] = (df['upper'] - df['lower']) / df['basis'] * 100

    # 4) Slope: 선형회귀 기울기 (OLS slope) 계산
    def linreg_slope(x: np.ndarray) -> float:
        idx = np.arange(len(x))
        return np.polyfit(idx, x, 1)[0]
    df['slope'] = df['bandwidth'].rolling(slope_len).apply(linreg_slope, raw=True)

    # 5) hi_bw: 과거 window_bw 기간 중 최대 Bandwidth
    df['hi_bw'] = df['bandwidth'].rolling(window_bw).max()

    # 6) 공통 필터: 시가가 밴드 내부, 종가가 밴드 외부
    cond = (
        (df['open'] > df['lower']) &
        (df['open'] < df['upper']) &
        ((df['close'] > df['upper']) | (df['close'] < df['lower']))
    )

    # 7) 시그널 생성
    signals = []
    for i in range(len(df)):
        if not cond.iat[i]:
            signals.append(None)
            continue

        bw  = df['bandwidth'].iat[i]
        hi  = df['hi_bw'].iat[i]
        slp = df['slope'].iat[i]
        c   = df['close'].iat[i]
        up  = df['upper'].iat[i]
        lo  = df['lower'].iat[i]

        # Trend-following
        if bw > hi / 2 and slp > 0:
            if c > up:
                signals.append("buy")
            elif c < lo:
                signals.append("sell")
            else:
                signals.append(None)

        # Mean-reversion
        elif bw == hi and slp < 0:
            if c > up:
                signals.append("sell")
            elif c < lo:
                signals.append("buy")
            else:
                signals.append(None)
        else:
            signals.append(None)

    df['signal'] = signals
    return df
