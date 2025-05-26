# strategies/bollinger_band_strategy.py
import pandas as pd
import numpy as np
from utils.helper import ohlcv_to_dataframe
from services.data_provider import BinanceDataProvider

provider = BinanceDataProvider()

def linreg_slope(x: np.ndarray) -> float:
    """OLS 선형회귀로 기울기 계산 (NaN 처리)"""
    idx = np.arange(len(x))
    if np.any(np.isnan(x)):
        return np.nan
    return np.polyfit(idx, x, 1)[0]


def compute_bollinger(
    df: pd.DataFrame,
    length: int = 24,
    mult: float = 2.0,
    slope_len: int = 5,
    window_bw: int = 125,
) -> pd.DataFrame:
    """
    단일 타임프레임 볼린저 밴드 계산:
      - basis, upper, lower, bandwidth, slope, hi_bw 컬럼 추가
    """
    # 리스트(raw) 입력을 DataFrame으로 변환
    if isinstance(df, list):
        df = ohlcv_to_dataframe(df)

    df = df.copy()
    df['basis']    = df['close'].rolling(length).mean()
    df['stddev']   = df['close'].rolling(length).std()
    df['upper']    = df['basis'] + mult * df['stddev']
    df['lower']    = df['basis'] - mult * df['stddev']
    df['bandwidth']= (df['upper'] - df['lower']) / df['basis'] * 100
    df['slope']    = df['bandwidth'].rolling(slope_len).apply(linreg_slope, raw=True)
    df['hi_bw']    = df['bandwidth'].rolling(window_bw).max()
    return df


def generate_mtf_signal(row) -> str:
    """병합된 MTF 데이터에서 시그널 생성"""
    signal = None
    if row['close'] > row.get('upper_5m', np.nan) and row['close'] > row.get('upper_15m', np.nan):
        signal = 'buy'
    elif row['close'] < row.get('lower_5m', np.nan) and row['close'] < row.get('lower_1h', np.nan):
        signal = 'sell'
    return signal


def bollinger_band_strategy(
    df: pd.DataFrame,
    length: int = 24,
    mult: float = 2.0,
    slope_len: int = 3,
    window_bw: int = 10,
    symbol: str = "BTC/USDT",
) -> pd.DataFrame:
    """
    멀티타임프레임 MTF Bollinger Band 전략 구현
    Parameters:
        df: 기준 프레임(5m) OHLCV DataFrame
    Returns:
        멀티타임프레임 밴드 계산 및 signal 컬럼이 추가된 DataFrame
    """

    # 2) 5m 볼린저밴드 계산 (기준 프레임)
    bb_5m = compute_bollinger(df, length, mult, slope_len, window_bw)

    # 3) MTF 병합 준비: df_merged는 bb_5m 베이스
    df_merged = bb_5m.copy()
    tfs = ['5m','15m', '30m', '1h', '4h']
    for tf in tfs:
        raw_tf = provider.fetch_ohlcv(symbol, tf, limit=length)
        df_tf  = ohlcv_to_dataframe(raw_tf)
        bb_tf  = compute_bollinger(df_tf, length, mult, slope_len, window_bw)
        bb_tf = bb_tf[['upper', 'lower']].rename(columns={
            'upper': f'upper_{tf}',
            'lower': f'lower_{tf}'
        })
        df_merged = df_merged.merge(bb_tf, how='left', left_index=True, right_index=True)
        df_merged[f'upper_{tf}'] = df_merged[f'upper_{tf}'].ffill()
        df_merged[f'lower_{tf}'] = df_merged[f'lower_{tf}'].ffill()

    # 4) signal 생성
    df_merged['signal'] = df_merged.apply(generate_mtf_signal, axis=1)

    # 5) 필수 컬럼(dropna) 후 반환
    return df_merged.dropna(subset=['basis', 'upper', 'lower', 'slope']).reset_index()
