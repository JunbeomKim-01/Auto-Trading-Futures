# Binance Executor (VPS 프록시)

Cloudflare Workers는 Binance에 직접 접근하면 **403(CloudFront 차단)** 됩니다.
이 Executor를 **차단되지 않는 IP를 가진 서버**(VPS 등)에서 실행하면,
워커가 Binance 대신 이 서버를 호출해 우회합니다.
Binance API 키는 워커가 아니라 **여기(허용 IP)**에 둡니다.

의존성 없음 — Node 18+ 만 있으면 됩니다 (`node:http` + `fetch` + `node:crypto`).

## 환경변수

| 변수 | 설명 |
|---|---|
| `PORT` | 리스닝 포트 (기본 8080) |
| `BINANCE_BASE` | `https://testnet.binancefuture.com` (실거래 시 `https://fapi.binance.com`) |
| `BINANCE_API_KEY` | Binance Futures 키 |
| `BINANCE_API_SECRET` | Binance Futures 시크릿 |
| `PROXY_TOKEN` | 워커 ↔ Executor 공유 시크릿 (충분히 긴 랜덤 문자열) |

## 실행 (VPS)

```bash
# 1) 코드 복사 후
export BINANCE_BASE=https://testnet.binancefuture.com
export BINANCE_API_KEY=...                # 테스트넷 키
export BINANCE_API_SECRET=...
export PROXY_TOKEN=$(openssl rand -hex 32)  # 이 값을 워커에도 동일하게 넣는다
export PORT=8080
node server.mjs
```

상시 실행은 pm2 또는 systemd 권장:

```bash
pm2 start server.mjs --name binance-executor \
  --env BINANCE_BASE=... --env BINANCE_API_KEY=... # (또는 ecosystem 파일 사용)
```

> ⚠️ TLS: 워커가 HTTPS로 호출하도록 리버스 프록시(Caddy/Nginx)나 Cloudflare Tunnel로
> Executor 앞단에 HTTPS를 두는 것을 권장합니다. `PROXY_TOKEN`이 평문으로 오가지 않게.

## 워커 연결

VPS에 Executor를 띄운 뒤, 워커 쪽에 주소와 토큰을 주입:

```bash
# 워커 settings (대시보드/wrangler vars 또는 secret)
wrangler secret put EXECUTOR_URL     # 예) https://executor.example.com
wrangler secret put PROXY_TOKEN      # Executor와 동일 값

# Binance 키는 이제 워커에서 제거 가능 (Executor가 보유):
wrangler secret delete BINANCE_API_KEY
wrangler secret delete BINANCE_API_SECRET
```

`EXECUTOR_URL`이 설정되면 워커는 모든 Binance 호출을 Executor로 보냅니다.
미설정이면 (로컬 dev) Binance에 직접 호출합니다.

## 엔드포인트

| 메서드 | 경로 | 인증 | 용도 |
|---|---|---|---|
| GET | `/health` | 불필요 | 헬스체크 |
| GET | `/klines?symbol=&interval=&limit=&startTime=&endTime=` | Bearer | 캔들 조회 |
| POST | `/account` | Bearer | 계정/잔고 |
| POST | `/leverage` `{symbol,leverage}` | Bearer | 레버리지 설정 |
| POST | `/order` `{symbol,side,quantity,reduceOnly}` | Bearer | 시장가 주문 |

로컬 검증 완료: 테스트넷 klines/account 정상, Bearer 미인증 시 401.

> 백테스트는 과거 구간을 페이지 단위로 조회하므로 `startTime` / `endTime`
> 파라미터를 Executor가 Binance로 그대로 전달해야 합니다.
