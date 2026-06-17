"""Binance USDM 선물 klines 를 받아 Parquet 으로 저장. 설계서 4장.

엔진과 분리된 데이터 수집기. 로컬/회사 IP 에서 실행(Binance 가 일부 IP 차단).
출력: data/candles/{symbol}/{interval}/candles.parquet

  python -m backtest_engine.fetch_binance --symbol BTCUSDT --interval 4h --years 3
"""
from __future__ import annotations

import argparse
import time
from pathlib import Path

import polars as pl
import requests

BASE = "https://fapi.binance.com"
INTERVAL_MS = {"1h": 3_600_000, "2h": 7_200_000, "4h": 14_400_000, "1d": 86_400_000}


def fetch(symbol: str, interval: str, years: float) -> pl.DataFrame:
    step = INTERVAL_MS.get(interval, 14_400_000)
    end = int(time.time() * 1000)
    cursor = end - int(years * 365 * 86_400_000)
    rows: list[dict] = []
    print(f"klines 수집: {symbol} {interval} ~{years}년...")
    while cursor < end:
        url = f"{BASE}/fapi/v1/klines"
        params = {"symbol": symbol, "interval": interval, "startTime": cursor, "limit": 1500}
        res = requests.get(url, params=params, timeout=30)
        res.raise_for_status()
        raw = res.json()
        if not raw:
            break
        for k in raw:
            rows.append({
                "open_time": int(k[0]), "open": float(k[1]), "high": float(k[2]),
                "low": float(k[3]), "close": float(k[4]), "volume": float(k[5]),
            })
        last_open = int(raw[-1][0])
        cursor = last_open + step
        if len(raw) < 1500:
            break
        time.sleep(0.25)

    df = pl.DataFrame(rows).unique(subset=["open_time"]).sort("open_time")
    print(f"수집 완료: {df.height} 캔들")
    return df


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbol", default="BTCUSDT")
    ap.add_argument("--interval", default="4h")
    ap.add_argument("--years", type=float, default=3)
    ap.add_argument("--outdir", default="data/candles")
    args = ap.parse_args()

    df = fetch(args.symbol, args.interval, args.years)
    out = Path(args.outdir) / args.symbol / args.interval
    out.mkdir(parents=True, exist_ok=True)
    path = out / "candles.parquet"
    df.write_parquet(path)
    print(f"저장: {path}")


if __name__ == "__main__":
    main()
