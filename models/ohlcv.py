import pandas as pd
from datetime import datetime, timedelta

class OhlcvCandle:
    def __init__(
        self,
        timestamp,
        open,
        high,
        low,
        close,
        volume,
        **indicators
    ):
        # CCXT가 ms 타임스탬프로 줄 경우 datetime으로 변환
        if isinstance(timestamp, (int, float)):
            self.timestamp = pd.to_datetime(timestamp, unit='ms') + timedelta(hours=9)
        else:
            self.timestamp = timestamp + timedelta(hours=9)

        # 기본 OHLCV 필드
        self.open = open
        self.high = high
        self.low = low
        self.close = close
        self.volume = volume

        # 추가 지표들은 indicators dict에 담아 속성으로 부착
        for key, value in indicators.items():
            setattr(self, key, value)

    def set_indicator(self, **kwargs):
        """
        이후 계산된 지표를 동적으로 추가하거나 업데이트합니다.
        예: candle.set_indicator(basis=..., stddev=..., upper=...)
        """
        for key, value in kwargs.items():
            setattr(self, key, value)

    def to_dict(self):
        # 기본 OHLCV 딕셔너리
        base = {
            'timestamp': self.timestamp,
            'open':      self.open,
            'high':      self.high,
            'low':       self.low,
            'close':     self.close,
            'volume':    self.volume,
        }
        # 추가된 지표 속성만 필터링
        base_keys = set(base.keys())
        extras = {
            key: value
            for key, value in self.__dict__.items()
            if key not in base_keys
        }
        # 합쳐서 반환
        return {**base, **extras}
