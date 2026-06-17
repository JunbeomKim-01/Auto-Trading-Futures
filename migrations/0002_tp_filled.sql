-- 분할익절 레벨 추적 컬럼. 각 TP 레벨 1회 체결 + 마지막 레벨 전량청산용.
ALTER TABLE positions ADD COLUMN tp_filled INTEGER NOT NULL DEFAULT 0;
