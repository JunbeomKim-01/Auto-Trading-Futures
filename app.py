# app.py
from flask import Flask, request
from api.views import bp as views_bp
from api.events import bp_events
from services.monitor import Monitor
from services.data_provider import BinanceDataProvider
from services.signal_service import BollingerSignalService, ISignalService

def create_app():
    app = Flask(__name__)
    app.register_blueprint(views_bp)
    app.register_blueprint(bp_events)
    symbol = 'BTC/USDT'
    # 백그라운드 모니터 시작
    provider = BinanceDataProvider()
    signaler = BollingerSignalService()
    monitor = Monitor(provider, signaler, symbol=symbol, interval_sec=5)
    monitor.start()

    return app

if __name__ == '__main__':
    create_app().run(host='127.0.0.1', port=8080, debug=True)

