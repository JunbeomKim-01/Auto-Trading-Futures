# services/signal_service.py (볼린저밴드 구현체)
import pandas as pd
from models.ohlcv import OhlcvCandle
from strategies.bollinger_band_strategy import bollinger_band_strategy

# services/signal_service.py
from abc import ABC, abstractmethod
from typing import List
from models.ohlcv import OhlcvCandle

class ISignalService(ABC):
    @abstractmethod
    def generate_signals(self, candles: List[OhlcvCandle]) -> List[str]:
        """각 봉마다 'buy'/'sell'/None 시그널 생성"""


class BollingerSignalService(ISignalService):
    def generate_signals(self, candles):
        df = pd.DataFrame([c.to_dict() for c in candles])
        df = bollinger_band_strategy(df)
        return df['signal'].fillna('').tolist()
