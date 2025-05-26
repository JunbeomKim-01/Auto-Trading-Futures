# api/views.py
from flask import Blueprint, render_template, jsonify ,request
from services.data_provider import BinanceDataProvider
from services.signal_service import BollingerSignalService
from utils.helper import ohlcv_to_dataframe
from strategies.bollinger_band_strategy import bollinger_band_strategy
import pprint
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
    df2 = bollinger_band_strategy(df,symbol=symbol,base_tf=tf)
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
            "slope":     row["slope"],
            "upper_1m":  row["upper_1m"],
            "lower_1m":  row["lower_1m"],
            "upper_5m":  row["upper_5m"],
            "lower_5m":  row["lower_5m"],
            "upper_15m":  row["upper_15m"],
            "lower_15m":  row["lower_15m"],
            "upper_30m":  row["upper_30m"],
            "lower_30m":  row["lower_30m"],
            "upper_1h":  row["upper_1h"],
            "lower_1h":  row["lower_1h"],
            "upper_4h":  row["upper_4h"],
            "lower_4h":  row["lower_4h"],
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

@bp.route('/position')  # 혹은 /positions 로 바꿔도 무방
def position():
    """
    GET /position
    → ['BTC/USDT','ETH/USDT','XRP/USDT'] 에 대한
      fetch_futures_positions 결과를 모두 합쳐서 반환.
    """
    symbols = ['BTC/USDT', 'ETH/USDT', 'XRP/USDT']
    all_positions = []
    for sym in symbols:
        pos = provider.fetch_futures_positions(sym)
        # pos가 리스트라면 extend, 단일 dict이면 append
        if isinstance(pos, list):
            all_positions.extend(pos)
        elif pos:
            all_positions.append(pos)
    return jsonify(all_positions)

@bp.route('/trade-logs')
def trade_logs():
    """
    GET /trade-logs
    → [
         {"timestamp":"2025-05-23T17:15:00.000Z","side":"buy","price":62000000,"amount":0.001},
         ...
       ]
    """
    symbols = ['BTC/USDT', 'ETH/USDT', 'XRP/USDT']
    all_trade_logs = []
    for sym in symbols:
        pos = provider.fetch_trade_logs(sym, limit=10)
        # pos가 리스트라면 extend, 단일 dict이면 append
        if isinstance(pos, list):
            all_trade_logs.extend(pos)
        elif pos:
            all_trade_logs.append(pos)
    return jsonify(all_trade_logs)

@bp.route('/ticker')
def ticker():
    symbol = request.args.get('symbol', 'BTC/USDT')
    t      = provider.fetch_ticker(symbol)
    # 백엔드에 changePercent24h 등 계산 로직이 없으면 간단히 0으로 둡시다
    return jsonify({
      "last": t, 
      "changePercent24h": provider.fetch_24h_change_percent(symbol)
    })

@bp.route('/profit-logs')
def profit_logs():
    """
    GET /profit-logs?symbol=BTC/USDT
    → 각 트레이드별 profit 내역 반환
    """
    symbols = ['BTC/USDT', 'ETH/USDT', 'XRP/USDT']
    all_trade_logs = []
    for sym in symbols:
        pos = provider.fetch_profit_logs(sym, limit=10)
        # pos가 리스트라면 extend, 단일 dict이면 append
        if isinstance(pos, list):
            all_trade_logs.extend(pos)
        elif pos:
            all_trade_logs.append(pos)
    return jsonify(all_trade_logs)