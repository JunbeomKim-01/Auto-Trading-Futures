import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from matplotlib.animation import FuncAnimation
import datetime

class RealTimePlot:
    """Generic real-time plotter using matplotlib animation with proper datetime axis."""
    def __init__(
        self,
        data_provider,
        symbol: str,
        max_points: int = 100,
        interval_sec: float = 5.0
    ):
        self.data_provider = data_provider
        self.symbol = symbol
        self.max_points = max_points
        self.interval_ms = int(interval_sec * 1000)

        # 1) 시작 시 과거 데이터 로드 → datetime 객체로 처리
        hist_df = self.data_provider.get_historical(timeframe="1m", limit=max_points)
        # pandas.Timestamp 리스트로 변환
        self.x_data = hist_df['timestamp'].dt.to_pydatetime().tolist()
        self.y_data = hist_df['close'].tolist()

        # 2) Figure/Axis & 초기 Line2D 객체 생성
        self.fig, self.ax = plt.subplots()
        self.line, = self.ax.plot(self.x_data, self.y_data, label=self.symbol)
        # x축을 datetime 축으로 설정하고 포맷 지정
        self.ax.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M:%S'))
        self.ax.xaxis_date()
        self.ax.set_title(f"Real-time {self.symbol} Price")
        self.ax.set_xlabel("Time")
        self.ax.set_ylabel("Price (KRW)")
        self.ax.legend()
        plt.gcf().autofmt_xdate()
        plt.tight_layout()

        # 3) 애니메이션 객체
        self.ani = FuncAnimation(
            self.fig,
            self._update,
            interval=self.interval_ms,
            blit=True
        )

    def _update(self, frame):
        # 4) 새 데이터 가져오기
        price = self.data_provider.fetch()
        now = datetime.datetime.now()

        # 5) 리스트에 추가 & 크기 유지
        self.x_data.append(now)
        self.y_data.append(price)
        if len(self.x_data) > self.max_points:
            self.x_data = self.x_data[-self.max_points:]
            self.y_data = self.y_data[-self.max_points:]

        # 6) Line2D에 데이터 갱신
        self.line.set_data(self.x_data, self.y_data)

        # 7) 축 리미트 재설정
        self.ax.relim()
        self.ax.autoscale_view()

        return (self.line,)

    def show(self):
        plt.show()

