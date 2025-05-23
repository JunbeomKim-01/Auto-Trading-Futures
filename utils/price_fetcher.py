import utills.helper as DF
class PriceFetcher:
    """Fetch latest ticker price from exchange."""
    def __init__(self, exchange_client, symbol: str):
        self.client = exchange_client
        self.symbol = symbol

    def fetch(self) -> float:
        ticker = self.client.exchange.fetch_ticker(self.symbol)
        return ticker['last']

    def get_historical(self, timeframe='1m', limit=100):
        """
        1분봉 기준으로 과거 limit개 캔들 데이터를 가져와 DataFrame으로 반환
        """
        raw = self.client.fetch_ohlcv('BTC/USDT', timeframe, limit)
        df = DF.ohlcv_to_dataframe(raw)
        return df    