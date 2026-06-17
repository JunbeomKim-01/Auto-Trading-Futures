# 무한 백테스트 엔진 (코어 MVP)

설계서 [`infinite_backtest_engine_design.md`](../infinite_backtest_engine_design.md) 20장 **구현 순서 1~8단계**.
벡터 지표 계산(Polars) + 이벤트 기반 체결 시뮬레이션. 라이브 봇(TS)과 분리된 Python 엔진.

## 구현 범위

| 단계 | 내용 | 모듈 |
|---|---|---|
| 1 | 캔들 로더 + 무결성 검증 | `data.py` |
| 2 | RSI/EMA/SMA/MACD/ATR/Bollinger/VolumeMA + 레지스트리 | `indicators.py` |
| 3 | JSON 조건 트리 평가 (AND/OR/cross, 산술식) | `rules.py` |
| 4 | 단일 진입/단일 청산 이벤트 루프 (다음 봉 시가 진입) | `engine.py` |
| 5 | 수수료 / 슬리피지 / TP·SL 동시 터치 보수적 처리 | `engine.py` |
| 6 | 거래 내역 생성 | `engine.py` / `models.py` |
| 7 | 수익률 / MDD / 승률 / PF / 기대값 | `metrics.py` |
| 8 | 차트 진입·청산 마커 | `engine.py` (`--markers`) |

| 9 | 파라미터 Grid Search + 랭킹 + CSV/JSON 출력 | `optimization.py` |

> 미구현(설계서 17장, MVP 3차+): Walk-Forward, In/Out-of-Sample 분리,
> 분할매수/매도, 커스텀 스크립트 샌드박스, 멀티 심볼.

## 설치

```bash
python3 -m venv .venv
.venv/bin/pip install -r backtest_engine/requirements.txt
```

## 사용

```bash
# 1) 데이터 수집 (로컬/회사 IP — Binance 비차단)
.venv/bin/python -m backtest_engine.fetch_binance --symbol BTCUSDT --interval 4h --years 3

# 2) 백테스트
.venv/bin/python -m backtest_engine.run \
    --data data/candles/BTCUSDT/4h \
    --strategy backtest_engine/strategies/btc_4h_rsi_reversion.json \
    --markers out.json
```

`--markers` 는 차트용 마커 + 에쿼티 커브 + 거래 내역을 JSON 으로 저장한다.

## Grid Search 최적화 (설계서 16장)

전략 템플릿에 `$placeholder` 를 두고 param_grid 의 모든 조합을 백테스트한다.

```bash
.venv/bin/python -m backtest_engine.optimization \
    --data data/candles/BTCUSDT/4h \
    --strategy backtest_engine/strategies/btc_4h_rsi_template.json \
    --grid backtest_engine/strategies/example_grid.json \
    --min-trades 10 --out result/opt
```

- 템플릿: `"period": "$rsi_period"`, `"right": "$rsi_oversold"` 처럼 토큰 사용.
  토큰이 문자열 전체면 숫자 타입 그대로 주입, 식 중간이면(`"atr14 * $k"`) 보간.
- `--grid`: `{ "rsi_period": [7,14,21], "rsi_oversold": [25,30,35], ... }`.
- `--out result/opt` → `result/opt.csv` + `result/opt.json` 저장.

**랭킹 순서**: ① 거래 횟수 `--min-trades` 통과 전략이 항상 위(설계서 17.4 과최적화
방지) → ② Profit Factor ↓ → ③ MDD ↑ → ④ 총 수익률 ↓ → ⑤ 최대 연속 손실 ↑.
단순 수익률순 정렬은 표본 부족·과최적화 전략을 상위로 끌어올리므로 쓰지 않는다.

## 전략 JSON 스키마

라이브 봇의 점수제(`db/strategies/*.json`)와 **다른** 설계서 전용 스키마다.

```json
{
  "name": "...", "symbol": "BTCUSDT", "timeframe": "4h",
  "indicators": { "rsi14": { "type": "RSI", "source": "close", "period": 14 } },
  "entry": {
    "side": "LONG",
    "rule": { "logic": "AND", "conditions": [
      { "left": "rsi14", "operator": "<=", "right": 35 },
      { "left": "close", "operator": ">", "right": "ema200" }
    ] }
  },
  "exit": { "take_profit_pct": 0.03, "stop_loss_pct": 0.02 }
}
```

- `left`/`right`: 컬럼명, 숫자, 또는 산술식(`"volume_ma20 * 1.5"`).
- `operator`: `>` `>=` `<` `<=` `==` `!=` `cross_over` `cross_under`.
- `conditions` 안에 하위 `{ "logic": ..., "conditions": [...] }` 중첩 가능.
- `exit.rule` 을 추가하면 조건 청산(다음 봉 시가 체결)도 동작.

## 체결 모델 (설계서 8~10장)

- 신호는 봉 i 종가에서 평가, 진입은 **봉 i+1 시가**에 체결 → 미래 데이터 참조 없음.
- TP/SL 은 보유 중 각 봉의 high/low 터치로 인트라바 체결.
- 한 봉에서 TP·SL 동시 터치 시 기본값 `conservative`(손실 우선).

## 테스트

```bash
.venv/bin/python -m pytest backtest_engine/tests -q
```
