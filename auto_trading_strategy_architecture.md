# Binance 자동매매 전략 시스템 확장형 설계 문서

## 1. 문서 목적

이 문서는 Binance 선물 자동매매 시스템을 Cloudflare Worker 기반으로 구축할 때, 매매 전략의 변수 변경, 수정, 확장, 백테스트, 테스트넷 검증, 실거래 전환이 쉽도록 설계하기 위한 아키텍처 문서이다.

핵심 목표는 다음과 같다.

- 전략 로직과 주문 실행 로직을 분리한다.
- 매매 조건을 코드에 고정하지 않고 설정값으로 관리한다.
- 전략 변경 시 기존 포지션 관리가 꼬이지 않도록 버전 관리한다.
- 분할 매수, 분할 매도, 손절, 익절, 트레일링 스탑을 모듈화한다.
- 리스크 엔진이 모든 주문 실행의 최종 승인권을 갖도록 한다.
- Binance Futures Testnet과 백테스트를 통해 실거래 전 충분히 검증한다.

---

## 2. 핵심 설계 원칙

자동매매 시스템의 가장 중요한 원칙은 다음과 같다.

```text
전략 = 설정값
지표 = 모듈
진입/청산 = 룰
리스크 관리 = 별도 엔진
주문 실행 = 독립 엔진
```

잘못된 구조는 다음과 같다.

```text
RSI < 30이면 바로 시장가 매수
```

좋은 구조는 다음과 같다.

```text
RSI 조건 충족
→ 전략 점수 계산
→ 리스크 엔진 통과
→ 포지션 상태 확인
→ 주문 엔진 실행
```

자동매매에서 중요한 것은 좋은 진입 조건보다 나쁜 상황에서 진입하지 않는 구조이다.

---

## 3. 전체 시스템 구조

```text
Cloudflare Pages
- 웹 대시보드
- 전략 설정 수정
- 차트, 포지션, 손익, 최근 신호 표시

Cloudflare Worker
- Binance API 호출
- 4시간봉 데이터 조회
- 전략 엔진 실행
- 주문 실행 API 호출
- TradingView webhook 수신

Cloudflare Durable Object
- 실시간 상태 관리
- 현재 포지션 상태 관리
- WebSocket 대시보드 브로드캐스트

Cloudflare D1
- 전략 설정 저장
- 전략 버전 저장
- 주문 로그 저장
- 체결 로그 저장
- 백테스트 결과 저장

Cloudflare KV
- 현재 활성 전략 ID
- 마지막 처리한 캔들 openTime
- 임시 상태 저장
- 중복 주문 방지 플래그

Binance Futures Testnet
- 실전 전 주문 테스트
- API 서명, 주문, 취소, 포지션 조회 검증

Binance Historical Data / Kline API
- 4시간봉 백테스트 데이터 확보
```

---

## 4. 디렉터리 구조 예시

```text
/src
  /market
    binanceClient.ts
    candleService.ts
    positionService.ts

  /indicators
    rsi.ts
    macd.ts
    ema.ts
    atr.ts
    volume.ts
    stochastic.ts
    divergence.ts
    customIndicatorRegistry.ts

  /strategy
    strategyEngine.ts
    ruleEvaluator.ts
    scoreEngine.ts
    conditionParser.ts
    strategyRegistry.ts

  /risk
    riskEngine.ts
    liquidationCheck.ts
    dailyLossGuard.ts
    exposureGuard.ts
    consecutiveLossGuard.ts

  /execution
    orderExecutor.ts
    testnetExecutor.ts
    liveExecutor.ts
    orderReconciler.ts

  /position
    positionStateMachine.ts
    scalingManager.ts
    exitManager.ts

  /storage
    d1Repository.ts
    kvRepository.ts

  /dashboard
    strategyApi.ts
    backtestApi.ts
    signalApi.ts
```

---

## 5. 전략 설정 기반 구조

전략은 코드에 직접 작성하지 않고 JSON 설정으로 관리한다.

예시 전략 설정은 다음과 같다.

```json
{
  "strategyId": "btc_4h_countertrend_v1",
  "name": "BTC 4H 역추세 분할매수 전략",
  "symbol": "BTCUSDT",
  "market": "BINANCE_USDM_FUTURES",
  "timeframe": "4h",
  "mode": "testnet",

  "indicators": {
    "rsi14": {
      "type": "RSI",
      "period": 14
    },
    "macd": {
      "type": "MACD",
      "fast": 12,
      "slow": 26,
      "signal": 9
    },
    "atr14": {
      "type": "ATR",
      "period": 14
    },
    "ema200": {
      "type": "EMA",
      "period": 200
    },
    "volumeMA20": {
      "type": "SMA",
      "source": "volume",
      "period": 20
    }
  },

  "entry": {
    "long": {
      "enabled": true,
      "minimumScore": 70,
      "hardFilters": [
        {
          "left": "close",
          "operator": ">",
          "right": "ema200",
          "description": "장기 하락 추세에서는 롱 진입 제한"
        }
      ],
      "scoreRules": [
        {
          "name": "RSI 과매도",
          "left": "rsi14",
          "operator": "<=",
          "right": 35,
          "score": 25
        },
        {
          "name": "MACD 하락 둔화",
          "left": "macd.histogram",
          "operator": ">",
          "right": "macd.histogram.previous",
          "score": 20
        },
        {
          "name": "거래량 증가",
          "left": "volume",
          "operator": ">",
          "right": "volumeMA20 * 1.5",
          "score": 20
        },
        {
          "name": "ATR 기준 과도한 하락",
          "left": "close",
          "operator": "<",
          "right": "previousClose - atr14 * 1.2",
          "score": 25
        }
      ]
    }
  },

  "positionSizing": {
    "type": "split",
    "maxPositionValuePercent": 25,
    "leverage": 2,
    "entries": [
      {
        "step": 1,
        "sizePercent": 25,
        "trigger": "initial_signal"
      },
      {
        "step": 2,
        "sizePercent": 25,
        "trigger": "price <= avgEntry - atr14 * 0.7"
      },
      {
        "step": 3,
        "sizePercent": 25,
        "trigger": "price <= avgEntry - atr14 * 1.2"
      },
      {
        "step": 4,
        "sizePercent": 25,
        "trigger": "price <= avgEntry - atr14 * 2.0"
      }
    ]
  },

  "exit": {
    "takeProfit": [
      {
        "sizePercent": 30,
        "trigger": "price >= avgEntry + atr14 * 0.7"
      },
      {
        "sizePercent": 30,
        "trigger": "price >= avgEntry + atr14 * 1.2"
      },
      {
        "sizePercent": 30,
        "trigger": "price >= avgEntry + atr14 * 2.0"
      }
    ],
    "trailingStop": {
      "enabled": true,
      "sizePercent": 10,
      "atrMultiplier": 1.5
    }
  },

  "risk": {
    "maxDailyLossPercent": 2,
    "maxWeeklyLossPercent": 5,
    "maxConsecutiveLosses": 3,
    "minLiquidationDistancePercent": 5,
    "maxOpenPositions": 1,
    "disableNewEntryWhenOrderPending": true
  }
}
```

이 구조의 장점은 다음과 같다.

```text
RSI 35 → RSI 30
ATR 1.2배 → ATR 1.5배
레버리지 2배 → 3배
분할매수 4회 → 5회
익절 0.7 ATR → 1.0 ATR
```

위와 같은 변경을 코드 수정 없이 대시보드에서 처리할 수 있다.

---

## 6. 점수제 전략 엔진

단순 AND 조건은 너무 경직되어 있다.

나쁜 구조는 다음과 같다.

```text
RSI < 30 AND MACD 상승 AND 거래량 증가 AND 지지선 도달이면 매수
```

좋은 구조는 점수제이다.

```text
RSI 과매도: +25점
MACD 둔화: +20점
거래량 증가: +20점
지지선 근처: +25점
캔들 반전: +10점

총점 70점 이상이면 진입 후보
```

단, 점수와 별개로 절대 금지 조건이 필요하다.

```text
청산가가 너무 가까움 → 진입 금지
일일 손실 초과 → 진입 금지
미체결 주문 존재 → 진입 금지
변동성 과열 → 진입 금지
4시간봉 미마감 → 진입 금지
```

전체 판단 흐름은 다음과 같다.

```text
1. 신호 점수 계산
2. 최소 점수 통과 여부 확인
3. 리스크 필터 확인
4. 포지션 상태 확인
5. 주문 실행
```

---

## 7. Indicator Registry 설계

지표는 플러그인처럼 등록 가능하게 만든다.

```ts
export const indicatorRegistry = {
  RSI: calculateRSI,
  MACD: calculateMACD,
  EMA: calculateEMA,
  ATR: calculateATR,
  STOCHASTIC: calculateStochastic,
  DIVERGENCE: calculateDivergence,
  CUSTOM_NA_COUNTER: calculateNaCounterTrendSignal
};
```

새로운 지표를 추가할 때는 다음 순서로 처리한다.

```text
1. /indicators 디렉터리에 지표 계산 함수 추가
2. indicatorRegistry에 등록
3. 전략 JSON의 indicators 항목에 추가
4. scoreRules 또는 hardFilters에서 사용
```

예시:

```json
{
  "stochastic": {
    "type": "STOCHASTIC",
    "kPeriod": 14,
    "dPeriod": 3,
    "smooth": 3
  }
}
```

---

## 8. 포지션 상태 머신 설계

포지션은 상태 머신으로 관리한다.

```text
IDLE
↓
SIGNAL_DETECTED
↓
ENTERED_STEP_1
↓
ENTERED_STEP_2
↓
ENTERED_STEP_3
↓
ENTERED_FULL
↓
PARTIAL_TAKE_PROFIT
↓
TRAILING
↓
CLOSED
```

각 포지션에는 반드시 전략 버전을 저장한다.

```json
{
  "positionId": "pos_20260617_001",
  "symbol": "BTCUSDT",
  "side": "LONG",
  "strategyId": "btc_4h_countertrend_v1",
  "strategyVersion": 3,
  "state": "ENTERED_STEP_2",
  "avgEntryPrice": 65200,
  "totalSize": 0.04,
  "currentStep": 2,
  "maxStep": 4,
  "createdAt": "2026-06-17T00:00:00Z"
}
```

중요한 원칙은 다음과 같다.

```text
전략 v1로 롱 진입
↓
중간에 전략 v2로 변경
↓
기존 포지션은 v1 청산 규칙 유지
↓
신규 진입부터 v2 적용
```

이렇게 해야 전략 변경 중에도 기존 포지션 관리가 꼬이지 않는다.

---

## 9. 전략 버전 관리

전략은 반드시 버전 관리해야 한다.

```text
btc_4h_countertrend_v1
btc_4h_countertrend_v2
btc_4h_countertrend_v3
```

DB 테이블 예시는 다음과 같다.

```sql
CREATE TABLE strategy_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  strategy_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  name TEXT NOT NULL,
  config_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  activated_at TEXT
);
```

status 값은 다음과 같이 관리한다.

```text
draft
backtest_passed
testnet
active
archived
```

전략 변경 흐름은 다음과 같다.

```text
1. 전략 수정
2. draft 저장
3. 백테스트 실행
4. 결과 확인
5. 테스트넷 적용
6. active 전환
```

절대 하면 안 되는 방식은 다음과 같다.

```text
실거래 중 active 전략 조건을 바로 수정
```

좋은 방식은 다음과 같다.

```text
수정본은 v2로 저장
백테스트 통과
테스트넷 검증
신규 포지션부터 v2 적용
```

---

## 10. 분할 매수/매도 확장 설계

분할매수 방식은 하드코딩하지 않고 타입으로 구분한다.

```text
fixed_percent
- 고정 비율 분할매수

atr_based
- ATR 기준 가격 간격 분할매수

grid_based
- 일정 퍼센트 간격 분할매수

signal_based
- 추가 신호 발생 시 분할매수

hybrid
- ATR + 신호 + 최대 손실 제한 혼합
```

분할매수 예시는 다음과 같다.

```json
{
  "scaling": {
    "type": "atr_based",
    "maxSteps": 4,
    "steps": [
      {
        "step": 1,
        "sizePercent": 25,
        "trigger": "initial"
      },
      {
        "step": 2,
        "sizePercent": 25,
        "trigger": "price <= avgEntry - atr14 * 0.7"
      },
      {
        "step": 3,
        "sizePercent": 25,
        "trigger": "price <= avgEntry - atr14 * 1.2"
      },
      {
        "step": 4,
        "sizePercent": 25,
        "trigger": "price <= avgEntry - atr14 * 2.0"
      }
    ],
    "stopAddingWhen": [
      "dailyLossPercent >= 2",
      "liquidationDistancePercent <= 5",
      "rsi14 < 20 AND volume > volumeMA20 * 3"
    ]
  }
}
```

분할매수에서 가장 중요한 것은 추가 진입 조건이 아니라 추가 진입 금지 조건이다.

필수 제한은 다음과 같다.

```text
최대 분할 횟수
최대 포지션 비중
최대 레버리지
최대 일일 손실
최대 청산가 근접도
추세 붕괴 시 추가 진입 금지
```

---

## 11. 청산 로직 설계

청산도 설정값으로 관리한다.

```json
{
  "exit": {
    "takeProfit": [
      {
        "step": 1,
        "sizePercent": 30,
        "trigger": "price >= avgEntry + atr14 * 0.7"
      },
      {
        "step": 2,
        "sizePercent": 30,
        "trigger": "price >= avgEntry + atr14 * 1.2"
      },
      {
        "step": 3,
        "sizePercent": 30,
        "trigger": "price >= avgEntry + atr14 * 2.0"
      }
    ],
    "trailingStop": {
      "enabled": true,
      "sizePercent": 10,
      "atrMultiplier": 1.5
    },
    "emergencyExit": [
      "dailyLossPercent >= 2",
      "liquidationDistancePercent <= 3",
      "close < majorSupport AND volume > volumeMA20 * 2"
    ]
  }
}
```

청산 로직은 다음으로 나눈다.

```text
1. 계획된 익절
2. 부분 익절
3. 트레일링 스탑
4. 손절
5. 비상 청산
6. 시스템 오류 청산
```

---

## 12. Risk Engine 설계

리스크 엔진은 모든 주문의 최종 승인권을 가져야 한다.

전략 엔진이 다음처럼 판단해도:

```text
롱 진입 점수 85점
```

리스크 엔진이 다음처럼 판단하면 주문은 막혀야 한다.

```text
오늘 손실 -2% 초과
청산가 거리 부족
이미 미체결 주문 존재
연속 손실 3회
변동성 과열
```

리스크 엔진 체크 항목은 다음과 같다.

```text
계좌 기준
- 일일 최대 손실
- 주간 최대 손실
- 월간 최대 손실
- 연속 손실 횟수

포지션 기준
- 최대 포지션 비중
- 최대 레버리지
- 청산가 최소 거리
- 미체결 주문 존재 여부

시장 기준
- ATR 과열
- 거래량 비정상 폭증
- 급락/급등 캔들
- 주요 지지/저항 붕괴

시스템 기준
- Binance API 오류
- 주문 응답 지연
- 중복 주문 위험
- Worker 실행 오류
```

---

## 13. 4시간봉 기준 실행 흐름

Cloudflare Worker는 매분 실행될 수 있지만, 전략 판단은 4시간봉 마감 기준으로만 수행한다.

```text
Cron 매분 실행
↓
BTCUSDT 4h 캔들 조회
↓
마지막 캔들이 마감되었는지 확인
↓
이미 처리한 캔들인지 확인
↓
지표 계산
↓
전략 점수 계산
↓
리스크 체크
↓
포지션 상태 확인
↓
진입 / 추가진입 / 익절 / 손절 판단
↓
Binance Testnet 주문
↓
결과 저장
↓
웹 대시보드에 표시
```

중복 주문 방지를 위해 마지막 처리한 4시간봉 openTime을 KV 또는 D1에 저장한다.

```text
lastProcessedCandleOpenTime = 2026-06-17T00:00:00Z
```

동일 openTime에 대해서는 절대 두 번 주문하지 않는다.

---

## 14. 대시보드에서 수정 가능한 변수

웹 대시보드에서는 다음 항목을 수정할 수 있게 만든다.

```text
전략 기본값
- 심볼
- 타임프레임
- 롱/숏 사용 여부
- 테스트넷/실거래 모드

지표 변수
- RSI 기간
- RSI 과매수/과매도 기준
- MACD fast/slow/signal
- EMA 기간
- ATR 기간
- 거래량 평균 기간

진입 조건
- 최소 점수
- 각 조건별 점수
- 필수 조건 여부
- 롱/숏 방향별 조건

분할매수
- 최대 진입 횟수
- 각 단계별 비중
- 추가 진입 간격
- ATR 배수
- 물타기 금지 조건

청산 조건
- 분할 익절 비중
- 익절 ATR 배수
- 트레일링 스탑 여부
- 강제 손절 조건

리스크
- 레버리지
- 최대 포지션 비중
- 일일 최대 손실
- 주간 최대 손실
- 연속 손실 제한
- 청산가 최소 거리

운영
- 자동매매 ON/OFF
- 신규 진입만 중지
- 전체 포지션 정리
- 테스트넷 전환
```

---

## 15. TradingView 연동 방식

TradingView는 두 가지 방식으로 활용할 수 있다.

### 15.1 TradingView Webhook 방식

```text
TradingView Pine Script
→ 4시간봉 마감 기준 alertcondition()
→ Webhook URL = Cloudflare Worker 주소
→ Worker가 신호 수신
→ 리스크 엔진 검증
→ Binance Testnet 주문
```

장점:

```text
구현이 빠르다.
TradingView 차트와 신호를 그대로 볼 수 있다.
Pine Script로 전략 실험이 쉽다.
```

단점:

```text
TradingView 알림에 의존한다.
Worker 내부에서 Pine Script를 직접 실행할 수 없다.
전략 독립성이 낮다.
```

### 15.2 직접 계산 방식

```text
Binance 4h 캔들 수집
→ Worker에서 RSI, MACD, EMA, ATR 직접 계산
→ 전략 룰 엔진 실행
→ Binance 주문
```

장점:

```text
TradingView 의존도가 낮다.
백테스트와 실시간 전략의 일관성이 높다.
전략 자동화에 적합하다.
```

단점:

```text
지표 계산을 직접 구현해야 한다.
Pine Script와 값이 미세하게 다를 수 있다.
```

추천 구조는 다음과 같다.

```text
초기 버전: TradingView Webhook + Worker 리스크 검증
안정화 후: Worker 직접 지표 계산 방식으로 독립화
```

---

## 16. 백테스트와 테스트넷의 차이

백테스트와 테스트넷은 다르다.

```text
백테스트
- 과거 데이터로 전략 기대값 검증
- 승률, 손익비, MDD, 연속 손실 확인

테스트넷
- 가짜 자금으로 주문 로직 검증
- API 서명, 주문, 취소, 포지션 조회 확인

페이퍼 트레이딩
- 실시간 시세로 가상 체결
- 실제 주문 없이 전략 운영 검증

실거래
- 실제 자금으로 주문 실행
```

권장 순서는 다음과 같다.

```text
1. 과거 4시간봉 백테스트
2. 실시간 페이퍼 트레이딩
3. Binance Futures Testnet
4. 소액 실거래
5. 점진적 비중 확대
```

---

## 17. 백테스트 평가 지표

전략은 최소한 다음 기준을 통과해야 한다.

```text
수익성
- 총 수익률
- 월별 수익률
- 연평균 수익률

위험
- 최대 낙폭, MDD
- 연속 손실 횟수
- 최악의 단일 손실
- 손실 회복 기간

거래 품질
- 승률
- 평균 손익비
- Profit Factor
- 평균 보유 시간
- 거래 횟수

안정성
- 2021 상승장
- 2022 하락장
- 2023 횡보장
- 2024 강세장
- 2025 이후 구간
```

백테스트에서 반드시 확인해야 할 것은 수익률이 아니라 MDD와 연속 손실이다.

---

## 18. 운영 모드

시스템은 다음 운영 모드를 가져야 한다.

```text
OFF
- 모든 자동매매 중지

ALERT_ONLY
- 신호만 생성하고 주문하지 않음

PAPER
- 가상 체결만 수행

TESTNET
- Binance Futures Testnet 주문 실행

LIVE_SMALL
- 소액 실거래

LIVE_FULL
- 검증 완료 후 정상 비중 실거래
```

처음부터 LIVE_FULL로 가면 안 된다.

---

## 19. 최소 구현 버전, MVP

가장 먼저 만들 버전은 다음 기능만 포함하면 된다.

```text
1. BTCUSDT 4시간봉 조회
2. RSI, MACD, EMA, ATR 계산
3. JSON 전략 설정 로드
4. 점수제 진입 판단
5. 리스크 엔진 기본 체크
6. Binance Futures Testnet 주문
7. 포지션 상태 저장
8. 대시보드에서 전략 ON/OFF
9. 주문/신호 로그 확인
```

MVP에서는 너무 많은 기능을 넣지 않는다.

초기 목표는 수익이 아니라 다음을 검증하는 것이다.

```text
데이터가 정확히 들어오는가?
4시간봉 마감 기준으로만 판단하는가?
중복 주문이 발생하지 않는가?
테스트넷 주문이 정상 실행되는가?
포지션 상태가 정확히 저장되는가?
리스크 엔진이 주문을 막을 수 있는가?
```

---

## 20. 최종 아키텍처 요약

```text
Cloudflare Pages
→ 전략 수정 웹 대시보드

Cloudflare Worker
→ Binance 데이터 조회
→ 전략 엔진 실행
→ 주문 API 호출

Cloudflare D1
→ 전략 설정, 버전, 주문 로그, 백테스트 결과 저장

Cloudflare KV
→ 현재 활성 전략, 마지막 처리 캔들, 임시 상태 저장

Durable Object
→ 실시간 대시보드 상태, 포지션 상태 관리

Binance Futures Testnet
→ 실전 전 주문 테스트

Strategy Config
→ JSON 기반으로 조건 수정 가능

Indicator Registry
→ 지표 추가/삭제 가능

Risk Engine
→ 모든 주문의 최종 승인/거부
```

---

## 21. 핵심 결론

전략을 바꾸기 쉬운 자동매매 시스템은 다음 원칙으로 설계해야 한다.

```text
전략 조건은 DB에서 바꾼다.
지표는 플러그인처럼 추가한다.
진입/청산은 룰 엔진이 판단한다.
분할매수/매도는 상태 머신이 관리한다.
리스크 엔진은 주문을 막을 수 있다.
전략은 반드시 버전 관리한다.
기존 포지션은 진입 당시 전략 버전으로 관리한다.
```

이 구조로 설계하면 다음 전략을 쉽게 추가할 수 있다.

```text
BTC 4h 역추세 전략
BTC 1h 추세추종 전략
ETH 4h RSI 다이버전스 전략
알트코인 거래량 돌파 전략
TradingView webhook 전략
직접 계산 인디케이터 전략
AI 점수 기반 전략
```

최종적으로 이 시스템은 단순 자동매매 봇이 아니라, 전략을 실험하고 검증하고 확장할 수 있는 매매 전략 플랫폼이 된다.
