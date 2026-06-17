# 무한 백테스트 엔진 설계서

## 0. 목표 정의

이 문서는 **자동매매 봇**이 아니라, 사용자가 원하는 인디케이터와 커스텀 조건을 조합하여 과거 차트에서 전략을 무한히 검증할 수 있는 **백테스트 엔진** 설계서입니다.

핵심 목표는 다음과 같습니다.

```text
기본 인디케이터 + 커스텀 스크립트 + 조건 조합기
→ 조건 만족 위치 자동 매매
→ 수익률 / MDD / 승률 / 손익비 / 거래 내역 / 차트 마커 확인
→ 파라미터 무한 조합 테스트
```

즉, 이 엔진은 단순히 “RSI가 몇이면 매수” 같은 계산기가 아니라, 과거 시장을 한 봉씩 재생하면서 실제 매매처럼 주문, 체결, 포지션, 수수료, 슬리피지, 청산을 처리하는 **전략 실험 시뮬레이터**입니다.

---

## 1. 전체 엔진 구조

백테스트 엔진은 6개 레이어로 분리합니다.

```text
Backtest Engine

1. Data Layer
   - 캔들 데이터 로드
   - 심볼 / 타임프레임 / 기간 관리

2. Indicator Engine
   - RSI, MACD, EMA, ATR, Bollinger 등 계산
   - 커스텀 인디케이터 계산

3. Strategy Rule Engine
   - 사용자가 조합한 조건 평가
   - AND / OR / Group / Cross 조건 처리

4. Execution Engine
   - 진입 / 청산 / 분할매수 / 분할매도 처리
   - 수수료 / 슬리피지 / 체결 가격 반영

5. Portfolio Engine
   - 현금, 포지션, 평단, 수익률, MDD 계산

6. Result Analyzer
   - 거래 내역
   - 에쿼티 커브
   - 성과 지표
   - 차트 마커 생성
```

핵심 설계 원칙은 다음과 같습니다.

```text
1. 인디케이터 계산과 매매 체결 로직을 섞지 않는다.
2. 전략 조건과 주문 실행 로직을 섞지 않는다.
3. 백테스트 결과는 항상 재현 가능해야 한다.
4. 미래 데이터를 참조하지 않는다.
5. 수익률보다 MDD, 손익비, 거래 횟수, 검증 구간 성과를 함께 본다.
```

---

## 2. 백테스트 방식

백테스트 방식은 크게 두 가지가 있습니다.

### 2.1 벡터 방식

```text
장점:
- 전체 데이터를 한 번에 계산하므로 빠르다.
- 단순 조건 전략에 적합하다.

단점:
- 분할매수, 포지션 상태, 복잡한 청산 조건에 약하다.
- 실제 매매 흐름과 차이가 생길 수 있다.
```

### 2.2 이벤트 방식

```text
장점:
- 캔들을 하나씩 순서대로 재생한다.
- 실제 매매와 비슷하다.
- 분할매수, 분할매도, 포지션 관리에 강하다.

단점:
- 벡터 방식보다 느릴 수 있다.
```

### 2.3 추천 방식: 하이브리드 구조

이 프로젝트에는 하이브리드 방식이 가장 적합합니다.

```text
지표 계산 = 벡터 방식
매매 시뮬레이션 = 이벤트 방식
```

흐름은 다음과 같습니다.

```text
과거 캔들 전체 로드
↓
RSI / MACD / EMA / ATR 등 전체 계산
↓
캔들을 0번부터 끝까지 하나씩 재생
↓
각 봉마다 조건 평가
↓
주문 / 체결 / 포지션 / 손익 처리
```

---

## 3. 추천 기술 스택

### 3.1 백엔드 / 엔진

```text
Python
Polars
NumPy
DuckDB
FastAPI
```

### 3.2 데이터 저장

```text
Parquet
DuckDB
PostgreSQL
```

### 3.3 프론트엔드

```text
Next.js
Lightweight Charts
Monaco Editor
TailwindCSS
```

### 3.4 작업 큐

```text
Celery
RQ
BullMQ
Temporal
```

개인용 MVP 기준으로는 다음 조합이 가장 빠릅니다.

```text
Next.js
+ FastAPI
+ Python Backtest Engine
+ PostgreSQL
+ DuckDB
+ Lightweight Charts
+ Monaco Editor
```

---

## 4. 데이터 레이어

백테스트의 모든 것은 OHLCV 캔들 데이터에서 시작합니다.

### 4.1 캔들 데이터 스키마

```sql
candles
- symbol        TEXT
- timeframe     TEXT
- open_time     TIMESTAMP
- close_time    TIMESTAMP
- open          DOUBLE
- high          DOUBLE
- low           DOUBLE
- close         DOUBLE
- volume        DOUBLE
- quote_volume  DOUBLE
- trades        INTEGER
```

### 4.2 캔들 로더 예시

```python
import polars as pl

def load_candles(symbol: str, timeframe: str, start: str, end: str) -> pl.DataFrame:
    df = (
        pl.scan_parquet(f"data/candles/{symbol}/{timeframe}/*.parquet")
        .filter(pl.col("open_time") >= start)
        .filter(pl.col("open_time") <= end)
        .sort("open_time")
        .collect()
    )
    return df
```

### 4.3 데이터 검증

4시간봉 기준이면 다음 간격이 정확히 유지되어야 합니다.

```text
00:00
04:00
08:00
12:00
16:00
20:00
```

데이터 로드 후 반드시 검사해야 할 항목입니다.

```text
1. 중복 캔들 없음
2. 누락 캔들 없음
3. 시간 순서 정렬됨
4. open/high/low/close 값 정상
5. volume 음수 없음
6. high >= open/close/low
7. low <= open/close/high
```

---

## 5. 인디케이터 엔진

인디케이터는 반드시 **순수 함수**로 만들어야 합니다.

```text
입력:
OHLCV 데이터 + 파라미터

출력:
동일 길이의 Series 또는 컬럼

부작용:
없음
```

### 5.1 RSI 예시

```python
def rsi(close: pl.Series, period: int = 14) -> pl.Series:
    delta = close.diff()

    gain = delta.clip(lower_bound=0)
    loss = (-delta).clip(lower_bound=0)

    avg_gain = gain.rolling_mean(period)
    avg_loss = loss.rolling_mean(period)

    rs = avg_gain / avg_loss
    return 100 - (100 / (1 + rs))
```

### 5.2 인디케이터 레지스트리

```python
INDICATOR_REGISTRY = {
    "RSI": calculate_rsi,
    "EMA": calculate_ema,
    "SMA": calculate_sma,
    "MACD": calculate_macd,
    "ATR": calculate_atr,
    "BOLLINGER": calculate_bollinger,
    "VOLUME_MA": calculate_volume_ma,
}
```

### 5.3 전략 설정에서 인디케이터 정의

```json
{
  "indicators": {
    "rsi14": {
      "type": "RSI",
      "source": "close",
      "period": 14
    },
    "ema200": {
      "type": "EMA",
      "source": "close",
      "period": 200
    },
    "atr14": {
      "type": "ATR",
      "period": 14
    }
  }
}
```

### 5.4 인디케이터 계산 함수

```python
def compute_indicators(df, indicator_config):
    result = df.clone()

    for name, cfg in indicator_config.items():
        indicator_type = cfg["type"]
        fn = INDICATOR_REGISTRY[indicator_type]
        result = fn(result, output_name=name, **cfg)

    return result
```

---

## 6. 커스텀 스크립트 설계

사용자가 직접 스크립트를 만들 수 있어야 하지만, 처음부터 완전 자유 코드를 허용하면 위험합니다.

### 6.1 잘못된 방식

```python
eval(user_script)
```

이 방식은 보안상 위험합니다.

### 6.2 추천 단계

```text
1단계: Expression DSL
   - rsi14 <= 30
   - close > ema200
   - volume > volumeMA20 * 1.5
   - cross_over(macd, macd_signal)

2단계: Sandboxed Script
   - 제한된 JavaScript / Python 함수
   - 파일 접근 금지
   - 네트워크 접근 금지
   - 시간 제한
   - 메모리 제한
```

### 6.3 MVP용 조건식 예시

```json
{
  "left": "rsi14",
  "operator": "<=",
  "right": 30
}
```

또는:

```json
{
  "type": "expression",
  "expr": "rsi14 <= 30 and close < bb_lower and volume > volume_ma20 * 1.5"
}
```

---

## 7. 조건 평가 엔진

사용자가 만든 조건은 트리 구조로 저장합니다.

### 7.1 조건 트리 예시

```json
{
  "logic": "AND",
  "conditions": [
    {
      "left": "rsi14",
      "operator": "<=",
      "right": 35
    },
    {
      "left": "close",
      "operator": "<",
      "right": "bb_lower"
    },
    {
      "left": "volume",
      "operator": ">",
      "right": "volume_ma20 * 1.5"
    }
  ]
}
```

### 7.2 단일 조건 평가

```python
def evaluate_condition(row, condition):
    left = resolve_value(row, condition["left"])
    right = resolve_value(row, condition["right"])
    op = condition["operator"]

    if op == ">":
        return left > right
    if op == ">=":
        return left >= right
    if op == "<":
        return left < right
    if op == "<=":
        return left <= right
    if op == "==":
        return left == right

    raise ValueError(f"Unsupported operator: {op}")
```

### 7.3 AND / OR 조건 평가

```python
def evaluate_rule(row, rule):
    logic = rule.get("logic", "AND")
    results = [evaluate_condition(row, c) for c in rule["conditions"]]

    if logic == "AND":
        return all(results)
    if logic == "OR":
        return any(results)

    raise ValueError(f"Unsupported logic: {logic}")
```

### 7.4 Cross 조건

지원해야 할 대표 조건입니다.

```text
cross_over(rsi14, 30)
cross_under(close, ema200)
cross_over(macd_line, macd_signal)
```

크로스는 현재 봉과 직전 봉을 함께 봐야 합니다.

```python
def cross_over(prev_a, curr_a, prev_b, curr_b):
    return prev_a <= prev_b and curr_a > curr_b
```

---

## 8. 미래 데이터 참조 금지

백테스트에서 가장 위험한 오류는 미래 데이터 참조입니다.

### 8.1 잘못된 방식

```text
현재 4시간봉 종가로 조건 확인
같은 4시간봉 종가로 진입
```

이 방식은 실제 매매에서 불가능합니다.

### 8.2 올바른 방식

```text
N번째 캔들 마감
↓
N번째 캔들의 종가와 지표로 조건 평가
↓
N+1번째 캔들의 시가에 진입
```

### 8.3 기본 체결 모델

```text
Signal Candle: 조건 발생 봉
Execution Candle: 다음 봉
Execution Price: 다음 봉 시가 + 슬리피지
```

### 8.4 구현 예시

```python
for i in range(warmup, len(df) - 1):
    signal_row = df[i]
    execution_row = df[i + 1]

    if evaluate_entry(signal_row):
        entry_price = execution_row["open"] * (1 + slippage)
```

---

## 9. 체결 엔진

백테스트 결과의 현실성을 결정하는 핵심은 체결 모델입니다.

### 9.1 지원 주문

```text
Market
Limit
Stop Loss
Take Profit
```

### 9.2 MVP 체결 방식

```text
진입:
다음 봉 시가에 시장가 진입

청산:
TP/SL 중 하나가 다음 봉의 high/low에 닿으면 청산

비용:
진입/청산 각각 수수료 반영

슬리피지:
진입 시 불리하게, 청산 시 불리하게 반영
```

### 9.3 슬리피지 적용

```python
def apply_slippage(price, side, action, slippage):
    if side == "LONG" and action == "BUY":
        return price * (1 + slippage)
    if side == "LONG" and action == "SELL":
        return price * (1 - slippage)
    if side == "SHORT" and action == "SELL":
        return price * (1 - slippage)
    if side == "SHORT" and action == "BUY":
        return price * (1 + slippage)

    return price
```

---

## 10. TP와 SL이 같은 봉에서 동시에 닿는 경우

OHLCV만으로는 한 봉 안에서 TP와 SL 중 무엇이 먼저 닿았는지 알 수 없습니다.

예시:

```text
open: 100
high: 110
low: 90
close: 105

TP: 108
SL: 95
```

이 경우 옵션을 제공해야 합니다.

```text
1. conservative
   - 불리한 쪽 먼저 체결
   - 롱이면 SL 우선

2. optimistic
   - 유리한 쪽 먼저 체결
   - 롱이면 TP 우선

3. open-path assumption
   - open → high → low → close
   또는
   - open → low → high → close

4. lower timeframe replay
   - 4시간봉 백테스트 중
   - 체결 판단은 5분봉으로 확인
```

MVP 기본값은 conservative를 추천합니다.

```text
모호하면 손실로 처리한다.
```

---

## 11. 포지션 객체

### 11.1 기본 포지션

```python
from dataclasses import dataclass

@dataclass
class Position:
    side: str                 # LONG or SHORT
    qty: float
    avg_entry: float
    entry_time: str
    entry_index: int
    realized_pnl: float = 0.0
```

### 11.2 분할 진입 지원 포지션

```python
@dataclass
class Position:
    side: str
    qty: float
    avg_entry: float
    total_cost: float
    entry_steps: int
    max_steps: int
    realized_pnl: float
    unrealized_pnl: float
```

### 11.3 추가 진입 시 평단 계산

```python
def add_position(position, add_qty, add_price):
    new_total_cost = position.avg_entry * position.qty + add_price * add_qty
    new_qty = position.qty + add_qty

    position.avg_entry = new_total_cost / new_qty
    position.qty = new_qty
    position.entry_steps += 1

    return position
```

---

## 12. 포트폴리오 엔진

포트폴리오는 현금, 포지션, 에쿼티를 관리합니다.

### 12.1 포트폴리오 객체

```python
from dataclasses import dataclass

@dataclass
class Portfolio:
    initial_cash: float
    cash: float
    equity: float
    position: Position | None
    trades: list
    equity_curve: list
```

### 12.2 현재가 평가

```python
def mark_to_market(portfolio, current_price):
    if portfolio.position is None:
        portfolio.equity = portfolio.cash
        return portfolio.equity

    pos = portfolio.position

    if pos.side == "LONG":
        unrealized = (current_price - pos.avg_entry) * pos.qty
    else:
        unrealized = (pos.avg_entry - current_price) * pos.qty

    portfolio.equity = portfolio.cash + unrealized
    return portfolio.equity
```

---

## 13. 백테스트 루프

핵심 루프는 다음과 같습니다.

```python
def run_backtest(df, strategy, config):
    portfolio = Portfolio(
        initial_cash=config.initial_cash,
        cash=config.initial_cash,
        equity=config.initial_cash,
        position=None,
        trades=[],
        equity_curve=[]
    )

    warmup = config.warmup_bars

    for i in range(warmup, len(df) - 1):
        signal_bar = df.row(i, named=True)
        next_bar = df.row(i + 1, named=True)

        # 1. 현재 포지션 평가
        mark_to_market(portfolio, signal_bar["close"])

        # 2. 기존 포지션 청산 조건 확인
        if portfolio.position is not None:
            handle_exit(
                portfolio=portfolio,
                signal_bar=signal_bar,
                execution_bar=next_bar,
                strategy=strategy,
                config=config
            )

        # 3. 포지션 없으면 진입 조건 확인
        if portfolio.position is None:
            if evaluate_rule(signal_bar, strategy["entry"]):
                execute_entry(
                    portfolio=portfolio,
                    execution_bar=next_bar,
                    strategy=strategy,
                    config=config
                )

        # 4. 에쿼티 기록
        portfolio.equity_curve.append({
            "time": signal_bar["open_time"],
            "equity": portfolio.equity
        })

    return analyze_result(portfolio)
```

분할매수/분할매도는 다음 단계에서 추가합니다.

```python
if portfolio.position is not None:
    handle_scale_in(...)
    handle_scale_out(...)
```

---

## 14. 결과 분석 지표

백테스트 결과에는 최소한 아래 지표가 필요합니다.

### 14.1 수익 지표

```text
총 수익률
연환산 수익률
월별 수익률
에쿼티 커브
```

### 14.2 위험 지표

```text
MDD
최대 연속 손실
평균 손실
최악의 거래
```

### 14.3 매매 품질 지표

```text
거래 횟수
승률
평균 수익
평균 손실
손익비
Profit Factor
Expectancy
```

### 14.4 전략 안정성 지표

```text
Long 수익률
Short 수익률
기간별 성과
상승장 / 하락장 / 횡보장 성과
```

### 14.5 MDD 계산 예시

```python
def calculate_mdd(equity_curve):
    peak = equity_curve[0]
    max_drawdown = 0

    for equity in equity_curve:
        if equity > peak:
            peak = equity

        drawdown = (equity - peak) / peak
        max_drawdown = min(max_drawdown, drawdown)

    return max_drawdown
```

### 14.6 Profit Factor 계산 예시

```python
def profit_factor(trades):
    gross_profit = sum(t.pnl for t in trades if t.pnl > 0)
    gross_loss = abs(sum(t.pnl for t in trades if t.pnl < 0))

    if gross_loss == 0:
        return float("inf")

    return gross_profit / gross_loss
```

### 14.7 기대값

```text
기대값 = 승률 × 평균 수익 - 패배율 × 평균 손실
```

---

## 15. 결과 저장 구조

무한 백테스트에서는 결과 저장과 재현성이 중요합니다.

### 15.1 해시 관리

```text
strategy_hash = 전략 JSON을 정렬해서 해시
data_hash = 사용한 데이터셋 해시
result_hash = strategy_hash + data_hash + fee + slippage
```

### 15.2 DB 스키마

```sql
backtest_runs
- id
- strategy_id
- strategy_hash
- symbol
- timeframe
- start_time
- end_time
- initial_cash
- fee
- slippage
- total_return
- mdd
- win_rate
- profit_factor
- trade_count
- created_at

backtest_trades
- id
- run_id
- side
- entry_time
- entry_price
- exit_time
- exit_price
- qty
- pnl
- pnl_percent
- exit_reason

backtest_equity_curve
- run_id
- time
- equity
- drawdown
```

---

## 16. 파라미터 무한 조합 엔진

사용자는 다음처럼 범위를 지정할 수 있어야 합니다.

```json
{
  "rsi_period": [7, 14, 21],
  "rsi_oversold": [25, 30, 35],
  "take_profit": [0.02, 0.03, 0.04],
  "stop_loss": [0.01, 0.015, 0.02]
}
```

### 16.1 파라미터 조합 생성

```python
from itertools import product

def generate_param_grid(grid):
    keys = list(grid.keys())
    values = list(grid.values())

    for combination in product(*values):
        yield dict(zip(keys, combination))
```

### 16.2 Grid Search

```python
def run_grid_search(base_strategy, param_grid, df):
    results = []

    for params in generate_param_grid(param_grid):
        strategy = apply_params(base_strategy, params)
        result = run_backtest(df, strategy, config)

        results.append({
            "params": params,
            "return": result.total_return,
            "mdd": result.mdd,
            "win_rate": result.win_rate,
            "profit_factor": result.profit_factor,
            "trade_count": result.trade_count
        })

    return sorted(
        results,
        key=lambda x: (x["profit_factor"], x["return"], -abs(x["mdd"])),
        reverse=True
    )
```

### 16.3 추천 정렬 기준

단순 수익률 순으로 정렬하면 안 됩니다.

```text
1. Profit Factor
2. MDD 낮음
3. 거래 횟수 충분함
4. 수익률
5. 최대 연속 손실 낮음
```

---

## 17. 과최적화 방지

무한 백테스트는 과최적화 위험이 큽니다.

```text
문제:
과거 데이터에만 우연히 잘 맞는 전략을 찾게 된다.
```

### 17.1 필수 검증 기능

```text
1. In-Sample / Out-of-Sample 분리
2. Walk Forward Test
3. 수수료/슬리피지 민감도 테스트
4. 거래 횟수 최소 기준
5. 구간별 성과 확인
6. 특정 한두 거래에 수익이 의존하는지 확인
```

### 17.2 구간 예시

```text
학습 구간:
2020-01-01 ~ 2023-12-31

검증 구간:
2024-01-01 ~ 2026-06-17
```

### 17.3 좋은 전략의 특징

```text
학습 구간 수익률: 좋음
검증 구간 수익률: 양호
MDD: 감당 가능
거래 횟수: 충분
특정 한두 거래에 수익 의존하지 않음
```

### 17.4 버려야 할 전략

```text
전체 수익률 +300%
하지만 거래 4번
그중 한 번이 전체 수익의 95%
검증 구간에서는 손실
```

---

## 18. MVP 범위

처음부터 너무 크게 만들지 않습니다.

### 18.1 MVP 1차

```text
심볼:
- BTCUSDT

타임프레임:
- 4h

지원 지표:
- RSI
- EMA
- MACD
- Bollinger Band
- ATR
- Volume MA

진입:
- 조건 조합 AND/OR
- 다음 봉 시가 진입

청산:
- Take Profit
- Stop Loss
- 조건 청산

비용:
- 수수료
- 슬리피지

결과:
- 총 수익률
- MDD
- 승률
- Profit Factor
- 거래 내역
- 차트 마커
```

### 18.2 MVP 2차

```text
- 분할매수
- 분할매도
- 커스텀 조건식
- 전략 저장
- 전략 복제
- 결과 비교
```

### 18.3 MVP 3차

```text
- Grid Search
- Walk Forward
- Out-of-Sample
- 다중 심볼
- 다중 타임프레임
```

### 18.4 MVP 4차

```text
- 커스텀 스크립트 샌드박스
- 고급 체결 모델
- 4h 전략 + 5m 내부 체결 검증
- 전략 랭킹
```

---

## 19. 최종 아키텍처

```text
Frontend
│
├─ Strategy Builder
├─ Indicator Builder
├─ Custom Script Editor
├─ Backtest Result Viewer
├─ Optimization Lab
└─ Chart Viewer

Backend API
│
├─ Strategy API
├─ Backtest API
├─ Optimization API
├─ Data API
└─ Result API

Backtest Engine
│
├─ Data Loader
├─ Indicator Engine
├─ Rule Evaluator
├─ Execution Simulator
├─ Portfolio Engine
├─ Metrics Analyzer
└─ Optimization Runner

Storage
│
├─ Candle Data: Parquet / DuckDB
├─ Strategy Config: PostgreSQL
├─ Backtest Results: PostgreSQL / DuckDB
└─ Large Result Cache: Object Storage
```

---

## 20. 구현 순서

가장 먼저 만들어야 할 순서는 다음과 같습니다.

```text
1. 캔들 데이터 로더
2. RSI / EMA / MACD / ATR 계산기
3. JSON 조건 평가 엔진
4. 단일 진입 / 단일 청산 백테스트 루프
5. 수수료 / 슬리피지 반영
6. 거래 내역 생성
7. 수익률 / MDD / 승률 / PF 계산
8. 차트 마커 생성
9. 전략 JSON 저장
10. 파라미터 Grid Search
```

처음부터 커스텀 스크립트 샌드박스나 복잡한 최적화를 만들지 말고, **조건 조합 백테스트가 정확하게 돌아가는지**부터 만들어야 합니다.

---

## 21. 최종 정리

이 백테스트 엔진의 핵심은 다음과 같습니다.

```text
핵심:
벡터 지표 계산 + 이벤트 기반 체결 시뮬레이션

전략:
JSON 조건 트리 + 커스텀 조건식

체결:
다음 봉 시가 진입
수수료/슬리피지 반영
TP/SL 동시 터치 시 보수적 처리

결과:
수익률보다 MDD, Profit Factor, 거래 횟수, 검증 구간 성과를 함께 판단

확장:
Grid Search → Walk Forward → Custom Script → Multi Symbol
```

처음 만들 MVP는 아래 하나면 충분합니다.

```text
BTCUSDT 4H Infinite Backtest Engine

입력:
전략 JSON

출력:
거래 내역
에쿼티 커브
수익률
MDD
승률
Profit Factor
차트 진입/청산 마커
```

이 엔진만 정확하게 만들면, 이후에는 인디케이터와 조건을 계속 추가하면서 진짜 **무한 백테스트 툴**로 확장할 수 있습니다.
