import logging
import queue

# ─── 전역 로그 큐 정의 ────────────────────────────────────────────────────
log_queue = queue.Queue()

def get_log_queue():
    return log_queue

# ─── 로거 설정 ───────────────────────────────────────────────────────────
logger = logging.getLogger("monitor")
logger.setLevel(logging.INFO)

fmt = logging.Formatter("[%(asctime)s] - %(levelname)s - %(message)s")

# 콘솔 핸들러
ch = logging.StreamHandler()
ch.setFormatter(fmt)
logger.addHandler(ch)

# 큐 핸들러: 로그 레코드를 log_queue 에 푸시
class QueueHandler(logging.Handler):
    def emit(self, record):
        log_queue.put(self.format(record))

qh = QueueHandler()
qh.setFormatter(fmt)
logger.addHandler(qh)
