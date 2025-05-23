import pandas as pd

def ohlcv_to_dataframe(raw_data, tz_adjust_hours: int = 9) -> pd.DataFrame:
    """
    Convert raw OHLCV list to pandas DataFrame and adjust timezone.
    :param raw_data: List of [timestamp, open, high, low, close, volume]
    :param tz_adjust_hours: Hours to add to timestamp for timezone correction (default: 9 for KST)
    :return: pandas.DataFrame with parsed and adjusted timestamp
    """
    df = pd.DataFrame(raw_data, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
    # Convert milliseconds to datetime (UTC)
    df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms', utc=True)
    # Adjust timezone
    df['timestamp'] = df['timestamp'] + pd.Timedelta(hours=tz_adjust_hours)
    return df

def multi_time_bollinger(client,symbol,limit):
    intervals = ['1m', '5m', '15m','30m', '1h', '4h']
    dfs = {}
    for tf in intervals:
        data = client.fetch_ohlcv(symbol, timeframe=tf, limit=limit)
        df = ohlcv_to_dataframe(data)
        dfs[tf] = df   

    return dfs            