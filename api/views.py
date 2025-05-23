# api/views.py
from flask import Blueprint, render_template, jsonify ,request
from services.data_provider import BinanceDataProvider
from services.signal_service import BollingerSignalService
from utils.helper import ohlcv_to_dataframe
from strategies.bollinger_band_strategy import bollinger_band_strategy

bp = Blueprint('dashboard', __name__)

provider = BinanceDataProvider()
signaler = BollingerSignalService()

@bp.route('/')
def index():
    return render_template('dashboard.html')

@bp.route('/data')
def data():
    tf    = request.args.get('tf', '1m')
    symbol = request.args.get('symbol', 'BTC/USDT')
    limit = int(request.args.get('limit', 100))

    # 1) OHLCV → DataFrame
    raw = provider.fetch_ohlcv(symbol, tf, limit=limit)
    df  = ohlcv_to_dataframe(raw)

    # 2) 볼린저 밴드 전략 적용 (basis, upper, lower, signal 등 컬럼 추가)
    df2 = bollinger_band_strategy(df)
    # 3) JSON 직렬화
    payload = []
    for _, row in df2.iterrows():
        payload.append({
            "timestamp": row["timestamp"].isoformat(),
            "open":      row["open"],
            "high":      row["high"],
            "low":       row["low"],
            "close":     row["close"],
            "basis":     row["basis"],
            "upper":     row["upper"],
            "lower":     row["lower"],
            "signal":    row["signal"] or ""
        })
    return jsonify(payload)

@bp.route('/account')
def account():
    """
    GET /account
    → {"BTC": 0.005, "USDT": 1500.23, ...}
    """
    bal = provider.fetch_balance()
    return jsonify(bal)

@bp.route('/positions')
def positions():
    """
    GET /positions
    → [
         {"symbol":"BTC","available":0.005,"used":0,"total":0.005},
         {"symbol":"ETH","available":0.1,"used":0,"total":0.1},
         ...
       ]
    """
    pos = provider.fetch_positions()
    return jsonify(pos)

@bp.route('/trade-logs')
def trade_logs():
    """
    GET /trade-logs
    → [
         {"timestamp":"2025-05-23T17:15:00.000Z","side":"buy","price":62000000,"amount":0.001},
         ...
       ]
    """
    logs = provider.fetch_trade_logs('BTC/USDT', limit=10)
    return jsonify(logs)
