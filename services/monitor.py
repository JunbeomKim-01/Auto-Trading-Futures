# services/monitor.py
import threading, time
from typing import Callable
from services.data_provider import IDataProvider
from services.signal_service import ISignalService
from utils.logger import logger

class Monitor:
    def __init__(
        self,
        provider: IDataProvider,
        signal_service: ISignalService,
        symbol: str,
        interval_sec: int = 5,
        limit: int = 100
    ):
        self.provider = provider
        self.signaler = signal_service
        self.symbol   = symbol
        self.interval = interval_sec
        self.limit    = limit
        self._stop    = threading.Event()

    def start(self):
        thread = threading.Thread(target=self._run, daemon=True)
        thread.start()

    def stop(self):
        self._stop.set()

    def _run(self):
        while not self._stop.is_set():
            try:
                candles = self.provider.fetch_ohlcv(self.symbol,'1m', limit=2)
                price   = self.provider.fetch_ticker(self.symbol)
                signals = self.signaler.generate_signals(candles,True)
                latest  = signals[-1] or '-'
                if latest == 'buy':
                    logger.info(f"▲ BUY {self.symbol}  | Price: {price:,.2f}")
                elif latest == 'sell':
                    logger.info(f"▼ SELL {self.symbol}  | Price: {price:,.2f}")
                else:
                    logger.info(f"{self.symbol}  | Signal: No Signal \n")
            except Exception as e:
                logger.error(f"Monitor error: {e}")
            time.sleep(self.interval)
