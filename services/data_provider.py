# services/data_provider.py

from abc import ABC, abstractmethod
from typing import List
from ccxt import binance
from config.config import load_api_credentials
from models.ohlcv import OhlcvCandle
import pandas as pd 

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

    def fetch_24h_change_percent(self, symbol: str) -> float:
        """
        24시간 변동률(%) 리턴.
        CCXT fetch_ticker 의 'percentage' 필드를 사용하고,
        없으면 (last - open) / open * 100 으로 계산합니다.
        """
        t = self._exchange.fetch_ticker(symbol)
        # CCXT 표준 필드인 'percentage' 확인
        pct = t.get('percentage')
        if pct is not None:
            return float(pct)
        # 없으면 직접 계산
        open_price = float(t.get('open', 0))  
        last_price = float(t.get('last', 0))
        if open_price:
            return (last_price - open_price) / open_price * 100
        return 0.0

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

    def fetch_profit_logs(self, symbol: str, limit: int = 100) -> list:
        """
        my_trades 를 불러와서, buy↔sell 페어링으로 각 트레이드의 profit을 계산해 반환.
        리턴 리스트 형식:
        [
          {
            'entryTime':  datetime,
            'exitTime':   datetime,
            'side':       'long' or 'short',
            'entryPrice': float,
            'exitPrice':  float,
            'amount':     float,
            'profit':     float
          }, …
        ]
        """
        trades = self._exchange.fetch_my_trades(symbol, limit=limit)
        # 시간순 정렬
        trades.sort(key=lambda t: t['timestamp'])
        profit_logs = []
        stack = []  # buy/short entry 쌓아둠

        for t in trades:
            side = t['side']  # 'buy' or 'sell'
            amt  = float(t['amount'])
            price= float(t['price'])
            ts   = pd.to_datetime(t['timestamp'])

            if side == 'buy':
                # long 진입
                stack.append({'side':'long','entryTime':ts,'entryPrice':price,'amount':amt})
            else:
                # long 청산 (매도) -> pop
                if stack and stack[0]['side']=='long':
                    e = stack.pop(0)
                    matched = min(e['amount'], amt)
                    profit = (price - e['entryPrice']) * matched
                    profit_logs.append({
                        'entryTime':    e['entryTime'].isoformat(),
                        'exitTime':     ts.isoformat(),
                        'side':         'long',
                        'entryPrice':   e['entryPrice'],
                        'exitPrice':    price,
                        'amount':       matched,
                        'profit':       profit
                    })
                # (partial/short 매칭 로직은 생략)
        return profit_logs
