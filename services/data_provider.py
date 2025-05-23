# services/data_provider.py

from abc import ABC, abstractmethod
from typing import List
from ccxt import binance
from config.config import load_api_credentials
from models.ohlcv import OhlcvCandle

class IDataProvider(ABC):
    @abstractmethod
    def fetch_ohlcv(self, symbol: str, timeframe: str, limit: int) -> List[OhlcvCandle]:
        """OHLCV 리스트 조회"""

    @abstractmethod
    def fetch_ticker(self, symbol: str) -> float:
        """현재가 조회"""

    # (Balance/Positions/Trades는 인터페이스에 포함시켜도 좋습니다)
    # @abstractmethod
    # def fetch_balance(self) -> dict: ...
    # @abstractmethod
    # def fetch_positions(self) -> list: ...
    # @abstractmethod
    # def fetch_trade_logs(self, symbol: str, limit: int) -> list: ...


class BinanceDataProvider(IDataProvider):
    def __init__(self):
        api_key, api_secret = load_api_credentials()
        self._exchange = binance({
            'apiKey': api_key,
            'secret': api_secret,
            'enableRateLimit': True,
            'options': {
                'adjustForTimeDifference': True, 
                'defaultType': 'future'
                }
        })
        #self._exchange.load_markets()

    def fetch_ohlcv(self, symbol: str, timeframe: str, limit: int) -> List[OhlcvCandle]:
        raw = self._exchange.fetch_ohlcv(symbol, timeframe, None ,limit)
        # OhlcvCandle 모델로 래핑
        return [OhlcvCandle(*c) for c in raw]

    def fetch_ticker(self, symbol: str) -> float:
        t = self._exchange.fetch_ticker(symbol)
        return float(t['close'])

    def fetch_balance(self) -> dict:
        bal = self._exchange.fetch_balance()
        return bal['total']
        
    def fetch_futures_positions(self, symbol: str) -> list:
        return self._exchange.fetch_positions([symbol])

    def fetch_positions(self) -> list:
        bal = self._exchange.fetch_balance()
        pos = []
        for asset, total in bal['total'].items():
            if total and total > 0:
                pos.append({
                    'symbol':    asset,
                    'available': bal['free'].get(asset, 0),
                    'used':      bal['used'].get(asset, 0),
                    'total':     total,
                })
        return pos

    def fetch_trade_logs(self, symbol: str, limit: int = 10) -> list:
        trades = self._exchange.fetch_my_trades(symbol, limit=limit)
        return [
            {
                'timestamp': t['datetime'],
                'side':      t['side'],
                'price':     float(t['price']),
                'amount':    float(t['amount']),
            }
            for t in trades
        ]
