# services/rsi.py
import pandas as pd
from typing import List
from models.ohlcv import OhlcvCandle
from services.strategy import IStrategy

def compute_rsi(df: pd.DataFrame, period: int = 14) -> pd.Series:
    delta = df["close"].diff()
    gain  = delta.clip(lower=0).rolling(period).mean()
    loss  = -delta.clip(upper=0).rolling(period).mean()
    rs    = gain / loss
    return 100 - (100 / (1 + rs))

class RsiStrategy(IStrategy):
    def name(self) -> str:
        return "rsi"

    def generate_signals(self, candles: List[OhlcvCandle]) -> List[str]:
        df = pd.DataFrame([c.to_dict() for c in candles])
        df["rsi"] = compute_rsi(df)
        signals = []
        for i in range(len(df)):
            if df["rsi"].iat[i] < 30:
                signals.append("buy")
            elif df["rsi"].iat[i] > 70:
                signals.append("sell")
            else:
                signals.append("")
        return signals
