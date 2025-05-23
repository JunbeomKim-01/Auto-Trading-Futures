# app.py
from pydoc import cli
import time
import threading
import queue
import logging
from tkinter import W

from flask import Flask, Response, render_template

from config.config import load_api_credentials
from client.exchange_api import BithumbClient
from strategies.bollinger_band_strategy import bollinger_band_strategy
from utills.helper import ohlcv_to_dataframe, multi_time_bollinger

# ─── Flask & Log Queue 세팅 ────────────────────────────────────────────────
app = Flask(__name__)
log_queue = queue.Queue()

# 표준 로거 구성 (콘솔 + 큐 핸들러)
logger = logging.getLogger("monitor")
logger.setLevel(logging.INFO)
fmt   = logging.Formatter("[%(asctime)s] - %(levelname)s - %(message)s")

# 콘솔 핸들러
ch = logging.StreamHandler()
ch.setFormatter(fmt)
logger.addHandler(ch)

# 큐 핸들러
class QueueHandler(logging.Handler):
    def emit(self, record):
        log_queue.put(self.format(record))

qh = QueueHandler()
qh.setFormatter(fmt)
logger.addHandler(qh)

# ─── 백그라운드 모니터링 스레드 ──────────────────────────────────────────
def monitor_loop(
    symbol: str    = "BTC/USDT",
    timeframe: str = "1m",
    limit: int     = 100,
    interval: int  = 5 
):
    api_key, api_secret = load_api_credentials()
    client = BithumbClient(api_key, api_secret)

    while True:
        try:
            dfs = multi_time_bollinger(client,symbol,limit)
            df  = bollinger_band_strategy(dfs['1m'])
            price  = client.exchange.fetch_ticker(symbol)["last"]
            slope  = df["slope"].iat[-1]
            df["signal"].iat[-1] = 'buy'
            signal = df["signal"].iat[-1] or "–"
            basis = df["basis"].iat[-1]
            width = df["bandwidth"].iat[-1]
            logger.info(
                f"{symbol} | Price: {price:,.0f} | Slope: {slope:.4f} | Signal: {signal} | basis:{basis} | width:{width}"
            )
        except Exception as e:
            logger.error(f"모니터링 에러: {e}")
        time.sleep(interval)

# 스레드 시작
threading.Thread(target=monitor_loop, daemon=True).start()

# ─── Flask 라우트 ────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("logs.html")

@app.route("/stream")
def stream():
    def event_stream():
        while True:
            line = log_queue.get()  # 대기 until a log is available
            yield f"data: {line}\n\n"
    return Response(event_stream(), mimetype="text/event-stream")

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=1030, threaded=True, debug=True)
