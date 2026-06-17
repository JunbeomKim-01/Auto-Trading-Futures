# Auto-Trading-Futures (MVP)

Binance USDM Futures 자동매매 — Cloudflare Workers 기반.
설계 전문은 [auto_trading_strategy_architecture.md](auto_trading_strategy_architecture.md) 참고.

이 저장소는 설계 문서 **19장 MVP** 범위만 구현한다:
BTCUSDT 4시간봉 조회 → 지표 계산(RSI/MACD/EMA/ATR) → JSON 전략 점수제 진입 판단
→ 리스크 엔진 → 테스트넷 주문 → 포지션/로그 저장 → 대시보드 ON/OFF.

## 구조

```
src/
  indicators/   RSI · MACD · EMA · SMA · ATR + registry
  market/       binanceClient(서명/klines) · candleService(마감 판정)
  strategy/     conditionParser(자체 파서, eval 미사용) · scoreEngine · strategyEngine
  risk/         riskEngine (일/주 손실·연속손실·동시포지션·미체결·청산거리)
  execution/    orderExecutor (PAPER 가상체결 / TESTNET·LIVE 시장가)
  position/     positionStateMachine (평단·단계·상태)
  storage/      d1Repository · kvRepository
  dashboard/    page.ts (Worker 서빙 최소 대시보드)
  runner.ts     4시간봉 마감 기준 실행 오케스트레이터
  index.ts      cron scheduled + 대시보드 API
migrations/      0001_init.sql (스키마)
db/seed.sql      활성 전략 시드
```

## 로컬 실행

```bash
npm install
npm run typecheck

# 로컬 D1 생성 + 마이그레이션 + 시드 전략
npm run db:migrate:local
npm run db:seed:local

npm run dev          # http://localhost:8787  대시보드
```

대시보드에서 모드 버튼으로 OFF/ALERT_ONLY/PAPER/TESTNET 전환, "지금 1회 실행"으로 수동 검증.

## 배포 (Cloudflare)

```bash
# 1) D1 / KV 리소스 생성 후 ID를 wrangler.toml에 기입
wrangler d1 create trading_db
wrangler kv namespace create KV

# 2) 원격 마이그레이션 + 시드
npm run db:migrate
npm run db:seed

# 3) Binance 테스트넷 API 키 주입 (코드/설정에 두지 않음)
wrangler secret put BINANCE_API_KEY
wrangler secret put BINANCE_API_SECRET

npm run deploy
```

## ⚠️ Binance + Cloudflare Workers IP 차단 (필독)

Binance는 Cloudflare Workers의 출구 IP를 **CloudFront 403으로 차단**합니다.
따라서 배포된 워커는 Binance를 **직접 호출할 수 없습니다**.
허용된 IP를 가진 서버에 [executor/](executor/) 프록시를 띄우고,
워커에 `EXECUTOR_URL` + `PROXY_TOKEN`을 주입해 우회합니다. 자세한 건 [executor/README.md](executor/README.md).

- `EXECUTOR_URL` 설정 시 → 워커가 모든 Binance 호출을 Executor 경유.
- 미설정 시 (로컬 dev) → Binance 직접 호출.

## 운영 모드 (문서 18장)

`OFF → ALERT_ONLY → PAPER → TESTNET → LIVE_SMALL → LIVE_FULL` 순서로 검증 후 승격.
런타임 모드는 KV의 `system:mode` 키가 wrangler `DEFAULT_MODE`보다 우선한다.
**처음부터 LIVE로 가지 않는다.**

## MVP 의도적 단순화 (다음 단계 과제)

- 청산가 거리(`liquidationDistancePercent`)는 100 고정 → 미차단. 실거래 전 실제 산출 필요.
- 부분익절 단계 추적 단순화(트리거 충족 시 비중 청산).
- 미체결 주문(`hasPendingOrder`) 개념은 시장가 전제로 false 고정.
- 트레일링 스탑 / 비상 청산 / 백테스트 / 페이퍼 실시간 시세 미구현.
- 심볼 수량 정밀도 BTCUSDT(0.001) 하드코딩 → exchangeInfo 연동 필요.
- 대시보드는 읽기/모드전환만. 전략 JSON 편집 UI는 미구현(문서 14장).

## 안전장치

- 동일 4시간봉 `openTime`은 두 번 주문하지 않는다 (KV 락 + lastProcessedCandle). 문서 13장.
- 리스크 엔진이 진입/추가 주문의 최종 거부권을 가진다. 익절은 차단하지 않는다. 문서 12장.
- 전략 버전을 포지션에 고정 저장 → 전략 변경 중에도 기존 포지션 규칙 유지. 문서 8/9장.
