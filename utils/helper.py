import pandas as pd

def ohlcv_to_dataframe(raw_data):
    """
    Convert raw OHLCV data (either list of lists or list of OhlcvCandle objects)
    into a pandas DataFrame with proper columns and datetime index.
    """
    # 1) 객체 리스트(OhlcvCandle)인 경우 .to_dict()로 변환
    if raw_data and hasattr(raw_data[0], 'to_dict'):
        records = [c.to_dict() for c in raw_data]
        df = pd.DataFrame(records)
    else:
        # 2) 일반적인 [[ts, o, h, l, c, v], ...] 형태
        df = pd.DataFrame(raw_data, columns=['timestamp','open','high','low','close','volume'])

    # 3) timestamp 열을 datetime으로 변환
    try:
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms') 
    except (TypeError, ValueError):
        df['timestamp'] = pd.to_datetime(df['timestamp'])

    return df


def multi_time_bollinger(client,symbol,limit):
    intervals = ['1m', '5m', '15m','30m', '1h', '4h']
    dfs = {}
    for tf in intervals:
        data = client.fetch_ohlcv(symbol, timeframe=tf, limit=limit)
        df = ohlcv_to_dataframe(data)
        dfs[tf] = df   

    return dfs            

