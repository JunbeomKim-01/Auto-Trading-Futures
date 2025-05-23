import asyncio
from datetime import datetime

from rich.table import Table
import utills.logger as lg
from config.config import load_api_credentials
from client.exchange_api import BithumbClient
from strategies.bollinger_band_strategy import bollinger_band_strategy
from utills.helper import ohlcv_to_dataframe


def make_table(data_list,SYMBOL):
    table = Table(title=f"실시간 {SYMBOL} 모니터링")
    table.add_column("Time", justify="center")
    table.add_column("Price", justify="right")
    table.add_column("Slope", justify="right")
    table.add_column("Signal", justify="center")

    for item in data_list:
        sig = item["signal"] or ""
        style = "green" if sig=="buy" else "red" if sig=="sell" else ""
        table.add_row(
            item["timestamp"],
            f"{item['price']:,.0f}",
            f"{item['slope']:.4f}",
            f"[{style}]{sig}[/{style}]"
        )
    return table

async def fetch_loop(data_list, live,SYMBOL,TIMEFRAME,LIMIT,MAX_ROWS,REFRESH_SEC):
    # API 클라이언트 초기화
    api_key, api_secret = load_api_credentials()
    client = BithumbClient(api_key, api_secret)

    while True:
        try:
            # 1) 과거 캔들 + 전략 계산
            raw = client.fetch_ohlcv(SYMBOL, TIMEFRAME, limit=LIMIT)
            df  = ohlcv_to_dataframe(raw)
            df  = bollinger_band_strategy(df)

            # 2) 최신 값 추출
            price  = client.exchange.fetch_ticker(SYMBOL)["last"]
            slope  = df["slope"].iat[-1]
            signal = df["signal"].iat[-1]

            # 3) 데이터 리스트에 추가
            now = datetime.now().strftime("%H:%M:%S")
            data_list.append({
                "timestamp": now,
                "price":     price,
                "slope":     slope,
                "signal":    signal
            })
            if len(data_list) > MAX_ROWS:
                data_list.pop(0)

            # 4) 테이블 갱신
            live.update(make_table(data_list))

        except Exception as e:
            lg.logger.error(f"Error in realtime monitor: {e}")

        await asyncio.sleep(REFRESH_SEC)
