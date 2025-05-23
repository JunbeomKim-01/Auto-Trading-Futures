import ccxt
import utills.helper as dataframe

class BithumbClient:
    def __init__(self, api_key: str, api_secret: str):
        self.exchange = ccxt.binance({
            'apiKey': api_key,
            'secret': api_secret,
            'enableRateLimit': True,
            'options': {
                'defaultType': 'future'
            }
        })

    def fetch_ohlcv(self, symbol: str, timeframe: str, limit: int = 200):
        """
        Fetch OHLCV candlestick data.
        :param symbol: Trading pair, e.g. 'BTC/KRW'
        :param timeframe: Timeframe string, e.g. '1m', '5m', '1h'
        :param limit: Number of candles to fetch.
        :return: List of [timestamp, open, high, low, close, volume]
        """
        try:
            ohlcv = self.exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
            return dataframe.ohlcv_to_dataframe(ohlcv)
        except AuthenticationError:
            raise
        except Exception as e:
            raise RuntimeError(f"Failed to fetch OHLCV: {e}")


    def fetch_balance(self):
        return self.exchange.fetch_balance()['USDT']

    def place_market_order(self, symbol: str, side: str, amount: float):
        if side == 'buy':
            return self.exchange.create_market_buy_order(symbol, amount)
        else:
            return self.exchange.create_market_sell_order(symbol, amount)