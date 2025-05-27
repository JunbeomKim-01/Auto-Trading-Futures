# strategies/bollinger_band_strategy.py
import pandas as pd
import numpy as np
from utils.helper import ohlcv_to_dataframe
from services.data_provider import BinanceDataProvider
import math
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


def bollinger_band_strategy(
    df: pd.DataFrame,
    base_tf: str = "1m",
    symbol: str = "BTC/USDT",
    length: int = 24,
    mult: float = 2.0,
    slope_len: int = 3,
    window_bw: int = 10,
    is_monior: bool = False,
    mtf_tfs: list = None,
) -> pd.DataFrame:
    """
    어떤 base_tf(1m,5m,15m,30m,1h,4h)가 들어와도
    나머지 타임프레임을 모두 계산/병합해 줍니다.
    """
    # 1) raw list → DataFrame
    if isinstance(df, list):
        df = ohlcv_to_dataframe(df)
    df = df.copy()
    df['timestamp'] = pd.to_datetime(df['timestamp'])

    # 2) MTF 목록
    default = ["1m", "5m", "15m", "30m", "1h", "4h"]
    tfs = mtf_tfs or default.copy()

    # 3) 기준프레임 볼린저 계산 & suffix 붙이기
    base_bb = compute_bollinger(df, length, mult, slope_len, window_bw)
    suf = f"_{base_tf}"
    base_bb = base_bb.add_suffix(suf).rename({f"timestamp{suf}":"timestamp"}, axis=1)

    merged = base_bb.sort_values("timestamp")
    base_minutes  = tf_to_minutes(base_tf)            # ex. base_tf="1m" → 1
    # 4) 나머지 TF 병합
    for tf in tfs:
        tf_minutes = tf_to_minutes(tf)
        # 동일 기간을 커버할 캔들 개수
        bars_required = len(df)    # ex. 125 + 3 + 24 = 152 bars:
        dynamic_limit = math.ceil(bars_required * base_minutes / tf_minutes) + 1
        #if not is_monior : 
        #    print(f'{base_minutes} _ {base_tf}: {bars_required} -> {tf}: {dynamic_limit}')
        if tf == base_tf:
            continue
        raw_tf = provider.fetch_ohlcv(symbol, tf, limit=dynamic_limit)
        df_tf = ohlcv_to_dataframe(raw_tf)
        df_tf['timestamp'] = pd.to_datetime(df_tf['timestamp'])

        bb_tf = compute_bollinger(df_tf, length, mult, slope_len, window_bw)
        suf2 = f"_{tf}"
        bb_tf = bb_tf.add_suffix(suf2).rename({f"timestamp{suf2}":"timestamp"}, axis=1)
        merged = pd.merge_asof(
            merged.sort_values("timestamp"),
            bb_tf.sort_values("timestamp"),
            on="timestamp",
            direction="backward",
            tolerance=pd.Timedelta(base_tf)  # 또는 None
        )
        merged = merged.fillna(method="bfill").fillna(method="ffill")

    # 5) Signal 생성 (예시: multi-tf 상/하단 순서 비교)
    def gen_sig(row):
        uppers = [row[f"upper_{x}"] for x in tfs if f"upper_{x}" in row]
        lowers = [row[f"lower_{x}"] for x in tfs if f"lower_{x}" in row]
        if all(uppers[i] >= uppers[i+1] for i in range(len(uppers)-1)):
            return "sell"
        if all(lowers[i] <= lowers[i+1] for i in range(len(lowers)-1)):
            return "buy"
        return None

    merged["signal"] = merged.apply(gen_sig, axis=1)
    
    return merged.reset_index(drop=True)

def tf_to_minutes(tf: str) -> int:
    unit = tf[-1]
    n    = int(tf[:-1])
    if unit == 'm':   return n
    if unit == 'h':   return n * 60
    if unit == 'd':   return n * 60 * 24
    raise ValueError(f"Unsupported tf: {tf}")
