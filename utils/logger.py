# utils/logger.py

import logging
import queue
from rich.logging import RichHandler

# ─── 전역 로그 큐 정의 ────────────────────────────────────────────────────
log_queue = queue.Queue()
def get_log_queue():
    return log_queue

# ─── 로거 설정 ───────────────────────────────────────────────────────────
logger = logging.getLogger("monitor")
logger.setLevel(logging.INFO)

# 1) 콘솔 핸들러: RichHandler 로 대체
console_handler = RichHandler(
    show_time=True,      # [HH:MM:SS] 타임스탬프
    show_level=True,     # INFO / ERROR 등 레벨
    show_path=False,     # 파일 경로 생략
    markup=True          # 메시지에 [bold red] 등 Rich 마크업 가능
)
logger.addHandler(console_handler)

# 2) 큐 핸들러: 기존 Formatter 유지 (SSE 에 plain text 로 전달)
fmt = logging.Formatter("[%(asctime)s] - %(levelname)s - %(message)s")
class QueueHandler(logging.Handler):
    def emit(self, record):
        log_queue.put(self.format(record))

queue_handler = QueueHandler()
queue_handler.setFormatter(fmt)
logger.addHandler(queue_handler)
