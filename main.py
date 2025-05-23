import asyncio
from datetime import datetime
from rich.live import Live
from rich.console import Console
import streams.realtime_monitor as RM 

async def run():
   
    use_plot = False
    #await monitor_realtime(SYMBOL, INTERVAL, use_plot)

async def run():
    SYMBOL = 'BTC/USDT'
    INTERVAL = 10  # s 단위
    data_list = []
    console = Console()
    # Live 컨텍스트로 콘솔 화면 부분 갱신
    with Live(RM.make_table(data_list,SYMBOL), console=console, refresh_per_second=4):
        await RM.fetch_loop(data_list, console,SYMBOL,"15m",30,100,INTERVAL)

if __name__ == '__main__':
    print("Starting real-time monitor...")
    asyncio.run(run())
