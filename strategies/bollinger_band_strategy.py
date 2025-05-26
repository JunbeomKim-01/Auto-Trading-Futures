# strategies/bollinger_band_strategy.py
import pandas as pd
import numpy as np
from utils.helper import ohlcv_to_dataframe
from services.data_provider import BinanceDataProvider
import pprint
provider = BinanceDataProvider()

def linreg_slope(x: np.ndarray) -> float:
    """
    OLS 선형회귀로 기울기 계산 (NaN 처리, SVD 에러 방지 로직 포함)
    fallback: 수학적 방법으로 직접 계산
    """
    # NumPy 배열로 변환 및 NaN 마스킹
    y = np.array(x, dtype=float)
    mask = ~np.isnan(y)
    if mask.sum() < 2:
        return np.nan
    xi = np.arange(len(y))[mask]
    yi = y[mask]
    # 공분산/분산 계산 방식으로 slope 도출
    x_mean = xi.mean()
    y_mean = yi.mean()
    num = ((xi - x_mean) * (yi - y_mean)).sum()
    den = ((xi - x_mean) ** 2).sum()
    return num / den if den != 0 else 0.0



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
    # 리스트(raw) 입력 처리
    if isinstance(df, list):
        df = ohlcv_to_dataframe(df)
    df = df.copy()

    # 중심선 및 표준편차 계산 (최소 1개부터 계산)
    df['basis']    = df['close'].rolling(window=length, min_periods=1).mean()
    df['stddev']   = df['close'].rolling(window=length, min_periods=1).std(ddof=0)
    # 상단/하단 밴드
    df['upper']    = df['basis'] + mult * df['stddev']
    df['lower']    = df['basis'] - mult * df['stddev']

    # 밴드폭 계산
    df['bandwidth'] = (df['upper'] - df['lower']) / df['basis'] * 100
    # slope 및 과거 최고치 (부분 윈도우 허용)
    df['slope']    = df['bandwidth'].rolling(window=slope_len, min_periods=1).apply(linreg_slope, raw=True)
    df['hi_bw']    = df['bandwidth'].rolling(window=window_bw, min_periods=1).max()

    # NaN 제거: basis, stddev 기반뿐 아니라 slope, hi_bw 까지 계산된 로우만 남김
    #df_merged.dropna(subset=['basis', 'upper', 'lower', 'slope']).reset_index()
    #df = df.dropna(subset=['basis', 'upper', 'lower', 'slope', 'stddev', 'slope', 'hi_bw']).reset_index()
    return df


def generate_mtf_signal(row) -> str:
    """병합된 MTF 데이터에서 시그널 생성"""
    signal = None
    # 타임프레임별 upper 순서 비교: 30m > 1h > 15m > 5m > 4h -> 하락세 강화
    if (
        row.get('upper_30m', np.nan) >= row.get('upper_1h', np.nan) >=
        row.get('upper_15m', np.nan) >= row.get('upper_5m', np.nan) >=
        row.get('upper_4h', np.nan)
    ):
        signal = 'sell'
    # 타임프레임별 lower 순서 비교: 1h <= 30m <= 15m <= 5m <= 4h -> 반등세 강화
    elif (
        row.get('lower_1h', np.nan) <= row.get('lower_30m', np.nan) <=
        row.get('lower_15m', np.nan) <= row.get('lower_5m', np.nan) <=
        row.get('lower_4h', np.nan)
    ):
        signal = 'buy'
    return signal



def bollinger_band_strategy(
    df: pd.DataFrame,
    base_tf: str = "1m",
    length: int = 24,
    mult: float = 2.0,
    slope_len: int = 3,
    window_bw: int = 10,
    symbol: str = "BTC/USDT",
    mtf_tfs: list = None,
    lag_count: int = 30
) -> pd.DataFrame:
    """
    멀티타임프레임 MTF Bollinger Band 전략 구현
    Parameters:
        df: 기준 프레임 OHLCV DataFrame (e.g., 5m, 15m 등)
    Returns:
        멀티타임프레임 밴드 계산 및 signal 컬럼이 추가된 DataFrame
    """
    # 기준 프레임 볼린저밴드 계산
    base_df = provider.fetch_ohlcv(symbol, "1m", limit = window_bw + slope_len + length)
    base_bb = compute_bollinger(df, length, mult, slope_len, window_bw)
    df_merged = base_bb.copy()
    #print(len(df))
    default_tfs = ['1m','5m','15m','30m','1h','4h']
    if mtf_tfs is None:
        mtf_tfs = [tf for tf in default_tfs]
    #print(mtf_tfs)

    # 3) Fetch and merge other timeframes
    limit = window_bw + slope_len + length
    for i,tf in enumerate(mtf_tfs):
        scale = [1,5,15,30,60,240]
        ln = len(df) // (scale[i])
        if ln <= 0:
            ln = 1
        raw_tf = provider.fetch_ohlcv(symbol, tf, limit = 100)
        df_tf  = ohlcv_to_dataframe(raw_tf)
        bb_tf  = compute_bollinger(df_tf, length, mult, slope_len, window_bw)
        bb_slice = bb_tf[-ln:].copy()  
        bb_slice['timestamp'] = pd.to_datetime(bb_slice['timestamp'])
        bb_slice.sort_values('timestamp', inplace=True)

        # 칼럼 접미사 붙이기 (_5m, _15m 등)
        tmp = bb_slice.add_suffix(f'_{tf}') \
                    .rename(columns={f'timestamp_{tf}': 'timestamp'})
        #tmp = tmp[['timestamp'] + [f'lower_{tf}',f'upper_{tf}']].copy()
        # (3) 1분봉 기준 backward merge
        df_merged = pd.merge_asof(
            df_merged,
            tmp,
            on='timestamp',
            direction='backward',
            # 필요하면 tolerance 옵션도 추가 가능:
            # tolerance=pd.Timedelta(tf)
        )
    # 4) Signal generation
    for col in df_merged.columns[:-1]:
        df_merged[f'{col}'] = df_merged[f'{col}'].bfill()
    df_merged['signal'] = df_merged.apply(generate_mtf_signal, axis=1)
    return df_merged