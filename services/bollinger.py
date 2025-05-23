# services/bollinger.py
import pandas as pd
from typing import List
from models.ohlcv import OhlcvCandle
from services.strategy import IStrategy
from strategies.bollinger_band_strategy import bollinger_band_strategy  # 기존 로직 재사용

class BollingerStrategy(IStrategy):
    def name(self) -> str:
        return "bollinger"

    def generate_signals(self, candles: List[OhlcvCandle]) -> List[str]:
        df = pd.DataFrame([c.to_dict() for c in candles])
        df = bollinger_band_strategy(df)
        return df["signal"].fillna("").tolist()
