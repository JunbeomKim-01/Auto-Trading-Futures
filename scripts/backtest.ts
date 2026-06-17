// 백테스트 CLI. 로컬에서 실행 (로컬 IP는 Binance 비차단).
//   npx tsx scripts/backtest.ts [--symbol BTCUSDT] [--interval 4h] [--years 3]
//                               [--config db/strategies/btc_4h_countertrend_v1.json]
// 라이브와 동일한 전략 코드를 과거 4시간봉에 적용한다. 문서 16/17장.
import { readFileSync } from 'node:fs';
import type { Candle, StrategyConfig } from '../src/types';
import { runBacktest } from '../src/backtest/backtester';

const args = parseArgs(process.argv.slice(2));
const symbol = args.symbol ?? 'BTCUSDT';
const interval = args.interval ?? '4h';
const years = Number(args.years ?? 3);
const configPath = args.config ?? 'db/strategies/btc_4h_countertrend_v1.json';
const base = 'https://fapi.binance.com'; // 과거 데이터는 prod kline 사용 (로컬 IP 비차단)

const config = JSON.parse(readFileSync(configPath, 'utf8')) as StrategyConfig;

const INTERVAL_MS: Record<string, number> = {
  '1h': 3600_000, '2h': 7200_000, '4h': 14400_000, '1d': 86400_000,
};

async function fetchHistorical(): Promise<Candle[]> {
  const stepMs = INTERVAL_MS[interval] ?? 14400_000;
  const endTime = Date.now();
  const startTime = endTime - years * 365 * 86400_000;
  const out: Candle[] = [];
  let cursor = startTime;
  process.stderr.write(`klines 수집: ${symbol} ${interval} ~${years}년...\n`);
  while (cursor < endTime) {
    const url = `${base}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&startTime=${cursor}&limit=1500`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`klines ${res.status}: ${await res.text()}`);
    const raw = (await res.json()) as number[][];
    if (raw.length === 0) break;
    for (const k of raw) {
      out.push({
        openTime: Number(k[0]), open: Number(k[1]), high: Number(k[2]),
        low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]),
        closeTime: Number(k[6]), closed: true,
      });
    }
    const lastOpen = Number(raw[raw.length - 1][0]);
    cursor = lastOpen + stepMs;
    if (raw.length < 1500) break;
    await sleep(250); // rate limit 여유
  }
  // 중복 제거 + 정렬.
  const map = new Map<number, Candle>();
  for (const c of out) map.set(c.openTime, c);
  return [...map.values()].sort((a, b) => a.openTime - b.openTime);
}

function report(): void {
  fetchHistorical().then((candles) => {
    process.stderr.write(`수집 완료: ${candles.length} 캔들\n\n`);
    const r = runBacktest(config, candles);
    const fmt = (n: number) => n.toFixed(2);
    const d = (ms: number) => new Date(ms).toISOString().slice(0, 10);
    console.log('='.repeat(52));
    console.log(`백테스트: ${config.name} (${symbol} ${interval})`);
    console.log(`기간: ${d(r.firstCandle)} ~ ${d(r.lastCandle)}`);
    console.log('='.repeat(52));
    console.log(`시작 자본          ${fmt(r.startEquity)} USDT`);
    console.log(`종료 자본          ${fmt(r.endEquity)} USDT`);
    console.log(`총 수익률          ${fmt(r.totalReturnPercent)} %`);
    console.log('-'.repeat(52));
    console.log(`거래 횟수          ${r.trades}`);
    console.log(`승 / 패            ${r.wins} / ${r.losses}`);
    console.log(`승률               ${fmt(r.winRatePercent)} %`);
    console.log(`Profit Factor      ${r.profitFactor === Infinity ? '∞' : fmt(r.profitFactor)}`);
    console.log('-'.repeat(52));
    console.log(`최대 낙폭 (MDD)    ${fmt(r.maxDrawdownPercent)} %   ← 핵심`);
    console.log(`최대 연속 손실     ${r.maxConsecutiveLosses} 회       ← 핵심`);
    console.log(`최악 단일 손익     ${fmt(r.worstTradePnl)} USDT`);
    console.log(`최고 단일 손익     ${fmt(r.bestTradePnl)} USDT`);
    console.log(`평균 보유          ${fmt(r.avgHoldingBars)} 봉 (${fmt(r.avgHoldingBars * 4)}h)`);
    console.log(`종료 시 미청산     ${r.openAtEnd ? '예 (포지션 잔존)' : '아니오'}`);
    console.log('='.repeat(52));
    if (r.trades === 0) {
      console.log('⚠️  체결된 거래 없음 — 진입 조건이 너무 빡빡하거나 데이터 부족.');
    }
  }).catch((e) => {
    console.error('백테스트 실패:', e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

function parseArgs(argv: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      o[key] = val;
    }
  }
  return o;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

report();
