# streams/live_plot_dash.py
import dash
from dash import dcc, html
from dash.dependencies import Output, Input
import plotly.graph_objs as go
from strategies.bollinger_band_strategy import bollinger_band_strategy
from config.config import load_api_credentials
from client.exchange_api import BithumbClient
from utills.helper import ohlcv_to_dataframe

# 1) API 클라이언트 세팅
API_KEY, API_SECRET = load_api_credentials()
client = BithumbClient(API_KEY, API_SECRET)

# 2) Dash 앱 초기화
app = dash.Dash(__name__)
app.layout = html.Div([
    html.H3("Real-time BTC/USDT Candlestick"),
    dcc.Graph(id="live-candlestick"),
    # 5초마다 콜백 트리거
    dcc.Interval(id="interval-component", interval=1000, n_intervals=0)
])

# 3) 콜백: interval마다 차트 업데이트
@app.callback(
    Output("live-candlestick", "figure"),
    Input("interval-component", "n_intervals")
)
def update_candlestick(n):
    # 최근 100개 1분봉 캔들 데이터 로드
    raw = client.exchange.fetch_ohlcv("BTC/USDT", "1h", limit=300)
    df  = ohlcv_to_dataframe(raw)
    # 3) 볼린저 밴드 전략 적용 → signal 컬럼 획득
    signals_df = bollinger_band_strategy(df)

    # 4) 매수/매도 시그널만 분리
    buy_df  = signals_df[signals_df['signal'] == 'buy']
    sell_df = signals_df[signals_df['signal'] == 'sell']

    
    fig = go.Figure(data=[go.Candlestick(
        x=df['timestamp'],
        open=df['open'],
        high=df['high'],
        low=df['low'],
        close=df['close'],
        name="BTC/USDT"
    )])
    # 5) 매수 마커 (초록 ↑)
    fig.add_trace(go.Scatter(
        x=buy_df['timestamp'],
        y=buy_df['close'],
        mode='markers',
        marker=dict(symbol='triangle-up', size=12, color='green'),
        name='Buy'
    ))
    # 6) 매도 마커 (빨강 ↓)
    fig.add_trace(go.Scatter(
        x=sell_df['timestamp'],
        y=sell_df['close'],
        mode='markers',
        marker=dict(symbol='triangle-down', size=12, color='red'),
        name='Sell'
    ))

    fig.update_layout(
        xaxis_rangeslider_visible=False,
        title=f"BTC/USDT - Updated {df['timestamp'].iloc[-1].strftime('%H:%M:%S')}"
    )
    return fig

if __name__ == "__main__":
    # 0.0.0.0 으로 열면 외부에서도 접속 가능
    app.run(host="127.0.0.1", port=8051, debug=True)
