monitoring_app/
├── app.py
├── config/
│   └── config.py
├── models/
│   └── ohlcv.py
├── services/
│   ├── data_provider.py       # IDataProvider / BinanceDataProvider
│   ├── strategy.py            # IStrategy 인터페이스
│   ├── bollinger.py           # BollingerStrategy
│   ├── rsi.py                 # RsiStrategy (예시)
│   └── monitor.py             # Monitor → 여러 전략을 순회 실행
├── api/
│   ├── views.py
│   └── events.py
└── utils/
    ├── logger.py
    └── helpers.py
