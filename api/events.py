# api/events.py (SSE)
from flask import Blueprint, Response
from utils.logger import get_log_queue

bp_events = Blueprint('events', __name__)

@bp_events.route('/stream')
def stream():
    q = get_log_queue()
    def gen():
        while True:
            yield f"data: {q.get()}\n\n"
    return Response(gen(), mimetype='text/event-stream')
