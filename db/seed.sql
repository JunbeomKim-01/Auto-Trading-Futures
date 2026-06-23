-- MVP 시드 전략: BTC 4H 역추세 분할매수 (문서 5장). status=active.
INSERT OR IGNORE INTO strategy_configs
  (strategy_id, version, name, config_json, status, created_at, activated_at)
VALUES (
  'btc_4h_countertrend_v1',
  1,
  'BTC 4H 역추세 분할매수 전략',
  '{
    "strategyId": "btc_4h_countertrend_v1",
    "name": "BTC 4H 역추세 분할매수 전략",
    "symbol": "BTCUSDT",
    "market": "BINANCE_USDM_FUTURES",
    "timeframe": "4h",
    "mode": "testnet",
    "indicators": {
      "rsi14": { "type": "RSI", "period": 14 },
      "macd": { "type": "MACD", "fast": 12, "slow": 26, "signal": 9 },
      "atr14": { "type": "ATR", "period": 14 },
      "ema200": { "type": "EMA", "period": 200 },
      "volumeMA20": { "type": "SMA", "source": "volume", "period": 20 }
    },
    "entry": {
      "long": {
        "enabled": true,
        "minimumScore": 70,
        "hardFilters": [
          { "left": "close", "operator": ">", "right": "ema", "description": "장기 하락 추세에서는 롱 진입 제한" }
        ],
        "scoreRules": [
          { "name": "RSI 과매도", "left": "rsi", "operator": "<=", "right": 35, "score": 25 },
          { "name": "MACD 하락 둔화", "left": "macd.histogram", "operator": ">", "right": "macd.histogram.previous", "score": 20 },
          { "name": "거래량 증가", "left": "volume", "operator": ">", "right": "volMa * 1.5", "score": 20 },
          { "name": "ATR 기준 과도한 하락", "left": "close", "operator": "<", "right": "previousClose - atr * 1.2", "score": 25 }
        ]
      }
    },
    "positionSizing": {
      "type": "atr_based",
      "maxPositionValuePercent": 25,
      "leverage": 2,
      "entries": [
        { "step": 1, "sizePercent": 25 },
        { "step": 2, "sizePercent": 25, "atrMult": 0.7 },
        { "step": 3, "sizePercent": 25, "atrMult": 1.2 },
        { "step": 4, "sizePercent": 25, "atrMult": 2.0 }
      ]
    },
    "exit": {
      "takeProfit": [
        { "sizePercent": 30, "pnlPercent": 3 },
        { "sizePercent": 30, "pnlPercent": 6 },
        { "sizePercent": 30, "pnlPercent": 10 }
      ],
      "stopLoss": { "sizePercent": 100, "pnlPercent": 4 },
      "trailingStop": { "enabled": true, "sizePercent": 10, "atrMultiplier": 1.5 }
    },
    "risk": {
      "maxDailyLossPercent": 2,
      "maxWeeklyLossPercent": 5,
      "maxConsecutiveLosses": 3,
      "minLiquidationDistancePercent": 5,
      "maxOpenPositions": 1,
      "disableNewEntryWhenOrderPending": true
    }
  }',
  'active',
  '2026-06-17T00:00:00Z',
  '2026-06-17T00:00:00Z'
);

-- SMC 자리선별 전략: 활성 OB/FVG 구역 안에서 거래량·모멘텀 확인 후 진입.
-- 현재 엔진은 4H 기준 활성 구역을 사용한다. 1H/12H MTF 투영은 후속 확장 대상.
INSERT OR IGNORE INTO strategy_configs
  (strategy_id, version, name, config_json, status, created_at, activated_at)
VALUES (
  'btc_4h_smc_ob_fvg_v1',
  2,
  'BTC 4H SMC OB/FVG 자리선별 전략',
  '{
    "strategyId": "btc_4h_smc_ob_fvg_v1",
    "name": "BTC 4H SMC OB/FVG 자리선별 전략",
    "symbol": "BTCUSDT",
    "market": "BINANCE_USDM_FUTURES",
    "timeframe": "4h",
    "mode": "testnet",
    "indicators": {
      "rsi14": { "type": "RSI", "period": 14 },
      "macd": { "type": "MACD", "fast": 12, "slow": 26, "signal": 9 },
      "atr14": { "type": "ATR", "period": 14 },
      "ema200": { "type": "EMA", "period": 200 },
      "volumeMA20": { "type": "SMA", "source": "volume", "period": 20 },
      "ob": { "type": "OB", "minBodyRatio": 0.3 },
      "fvg": { "type": "FVG" }
    },
    "entry": {
      "long": {
        "enabled": true,
        "minimumScore": 70,
        "hardFilters": [
          { "left": "ob.activeBullish == 1 OR fvg.activeBullish == 1", "operator": "==", "right": 1, "description": "활성 Bullish OB 또는 FVG 구역 안에서만 롱 후보" }
        ],
        "scoreRules": [
          { "name": "거래량 반응", "left": "volume", "operator": ">", "right": "volMa * 1.2", "score": 25 },
          { "name": "MACD 하락 둔화", "left": "macd.histogram", "operator": ">", "right": "macd.histogram.previous", "score": 25 },
          { "name": "추가 하락 둔화", "left": "close", "operator": ">=", "right": "previousClose - atr * 0.5", "score": 20 },
          { "name": "OB+FVG Bullish 중첩", "left": "obFvg.bullishConfluence", "operator": "==", "right": 1, "score": 20 }
        ]
      },
      "short": {
        "enabled": true,
        "minimumScore": 70,
        "hardFilters": [
          { "left": "ob.activeBearish == 1 OR fvg.activeBearish == 1", "operator": "==", "right": 1, "description": "활성 Bearish OB 또는 FVG 구역 안에서만 숏 후보" }
        ],
        "scoreRules": [
          { "name": "거래량 반응", "left": "volume", "operator": ">", "right": "volMa * 1.2", "score": 25 },
          { "name": "MACD 상승 둔화", "left": "macd.histogram", "operator": "<", "right": "macd.histogram.previous", "score": 25 },
          { "name": "추가 상승 둔화", "left": "close", "operator": "<=", "right": "previousClose + atr * 0.5", "score": 20 },
          { "name": "OB+FVG Bearish 중첩", "left": "obFvg.bearishConfluence", "operator": "==", "right": 1, "score": 20 }
        ]
      }
    },
    "positionSizing": {
      "type": "atr_based",
      "maxPositionValuePercent": 18,
      "leverage": 2,
      "entries": [
        { "step": 1, "sizePercent": 35 },
        { "step": 2, "sizePercent": 35, "atrMult": 0.7 },
        { "step": 3, "sizePercent": 30, "atrMult": 1.2 }
      ]
    },
    "exit": {
      "takeProfit": [
        { "sizePercent": 35, "pnlPercent": 3 },
        { "sizePercent": 35, "pnlPercent": 6 },
        { "sizePercent": 30, "pnlPercent": 10 }
      ],
      "stopLoss": { "sizePercent": 100, "pnlPercent": 4 },
      "trailingStop": { "enabled": false, "sizePercent": 0, "atrMultiplier": 1.5 }
    },
    "risk": {
      "maxDailyLossPercent": 2,
      "maxWeeklyLossPercent": 5,
      "maxConsecutiveLosses": 3,
      "minLiquidationDistancePercent": 5,
      "maxOpenPositions": 1,
      "disableNewEntryWhenOrderPending": true
    }
  }',
  'active',
  '2026-06-18T00:00:00Z',
  '2026-06-18T00:00:00Z'
);
