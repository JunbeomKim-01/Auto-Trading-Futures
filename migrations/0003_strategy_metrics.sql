-- 저장된 전략에 마지막 백테스트 지표를 같이 보관. 대시보드 저장소 목록에서 비교용.
ALTER TABLE strategy_configs ADD COLUMN metrics_json TEXT;
