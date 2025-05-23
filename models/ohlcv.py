# models/ohlcv.py
import pandas as pd

class OhlcvCandle:
    def __init__(self, timestamp, open, high, low, close, volume):
        # CCXT가 ms 타임스탬프로 줄 경우 datetime으로 변환
        if isinstance(timestamp, (int, float)):
            self.timestamp = pd.to_datetime(timestamp, unit='ms')
        else:
            self.timestamp = timestamp
        self.open   = open
        self.high   = high
        self.low    = low
        self.close  = close
        self.volume = volume

    def to_dict(self):
        return {
            'timestamp': self.timestamp,
            'open':      self.open,
            'high':      self.high,
            'low':       self.low,
            'close':     self.close,
            'volume':    self.volume,
        }
