// 자동매매 운영 플로우 UI.
// 사용 흐름: 손익 확인 -> 봇 정지 -> 매매 로그 분석 -> 전략 작성 -> 백테스트 -> 적용 -> 봇 ON.
export function dashboardHtml(): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Auto Trading Futures</title>
<script src="https://unpkg.com/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js"></script>
<style>
  :root {
    --canvas:#131722;
    --card:#1e222d;
    --panel:#1e222d;
    --elevated:#2a2e39;
    --line:#2a2e39;
    --text:#d1d4dc;
    --muted:#787b86;
    --muted-strong:#9598a1;
    --primary:#2962ff;
    --primary-active:#1e53e5;
    --ink:#ffffff;
    --up:#26a69a;
    --down:#ef5350;
    --blue:#2962ff;
    --live:#ef5350;
    --surface:#1e222d;
    --radius:4px;
  }
  * { box-sizing:border-box; }
  html { background:var(--canvas); }
  body {
    margin:0;
    background:var(--canvas);
    color:var(--text);
    font-family: Inter, BinanceNova, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    letter-spacing:0;
  }
  button, textarea, input, select { font:inherit; }
  button { cursor:pointer; }
  textarea, input, select {
    width:100%;
    border:1px solid var(--line);
    border-radius:4px;
    background:#11161c;
    color:var(--text);
    outline:none;
  }
  textarea:focus, input:focus, select:focus { box-shadow:0 0 0 2px rgba(41,98,255,.45); }
  .num {
    font-family:"IBM Plex Sans", BinancePlex, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-variant-numeric:tabular-nums;
  }
  .topbar {
    position:sticky;
    top:0;
    z-index:40;
    height:60px;
    display:flex;
    align-items:center;
    gap:18px;
    padding:0 24px;
    background:rgba(11,14,17,.96);
    border-bottom:1px solid var(--line);
  }
  .brand {
    display:flex;
    align-items:center;
    gap:10px;
    font-weight:650;
    white-space:nowrap;
  }
  .brand-mark {
    width:22px;
    height:22px;
    display:grid;
    place-items:center;
    border-radius:4px;
    background:var(--primary);
    color:var(--ink);
    font-size:11px;
    font-weight:750;
  }
  .nav {
    display:flex;
    gap:16px;
    min-width:0;
    overflow:auto;
    scrollbar-width:none;
  }
  .nav a {
    color:var(--muted-strong);
    font-size:13px;
    font-weight:500;
    text-decoration:none;
    white-space:nowrap;
  }
  .nav a:hover, .nav a.active { color:var(--text); }
  .top-actions {
    margin-left:auto;
    display:flex;
    align-items:center;
    gap:8px;
  }
  .pill, .status {
    display:inline-flex;
    align-items:center;
    gap:7px;
    min-height:28px;
    padding:0 9px;
    border-radius:4px;
    border:1px solid var(--line);
    background:var(--card);
    color:var(--muted-strong);
    font-size:12px;
    font-weight:600;
    white-space:nowrap;
  }
  .status.ok { color:var(--up); background:rgba(38,166,154,.1); }
  .status.bad { color:var(--down); background:rgba(239,83,80,.1); }
  .status.warn { color:var(--primary-active); background:rgba(41,98,255,.1); }
  .status.info { color:var(--blue); background:rgba(41,98,255,.1); }
  .dot { width:8px; height:8px; border-radius:50%; background:var(--muted); }
  .dot.up { background:var(--up); }
  .dot.down { background:var(--down); }
  .dot.warn { background:var(--primary-active); }
  .dot.info { background:var(--blue); }
  .mode {
    min-height:34px;
    display:flex;
    align-items:center;
    justify-content:center;
    padding:7px 16px;
    background:#101820;
    border-bottom:1px dashed #2b6cb0;
    color:#8dbaf0;
    font-size:13px;
    font-weight:600;
  }
  .mode.live {
    background:var(--live);
    border-bottom:0;
    color:#fff;
  }
  .page {
    width:min(1360px, 100%);
    margin:0 auto;
    padding:24px;
  }
  .page[data-view="dashboard"] .view-logs,
  .page[data-view="dashboard"] .view-strategy,
  .page[data-view="dashboard"] .view-backtest,
  .page[data-view="dashboard"] .view-apply { display:none; }
  .page:not([data-view="dashboard"]) .dashboard-only { display:none; }
  .page[data-view="logs"] .view-strategy,
  .page[data-view="logs"] .view-backtest,
  .page[data-view="logs"] .view-apply { display:none; }
  .page[data-view="strategy"] .view-logs,
  .page[data-view="strategy"] .view-backtest,
  .page[data-view="strategy"] .view-apply { display:none; }
  .page[data-view="backtest"] .view-logs,
  .page[data-view="backtest"] .view-strategy,
  .page[data-view="backtest"] .view-apply { display:none; }
  .page[data-view="apply"] .view-logs,
  .page[data-view="apply"] .view-strategy,
  .page[data-view="apply"] .view-backtest { display:none; }
  .page:not([data-view="dashboard"]) .grid { grid-template-columns:1fr; }
  .page:not([data-view="dashboard"]) .view-logs,
  .page:not([data-view="dashboard"]) .view-strategy,
  .page:not([data-view="dashboard"]) .view-backtest,
  .page:not([data-view="dashboard"]) .view-apply { max-width:1040px; }
  .grid {
    display:grid;
    grid-template-columns:minmax(0, 1.5fr) minmax(320px, .8fr);
    gap:20px;
    align-items:start;
  }
  .stack { display:grid; gap:16px; }
  .card {
    padding:clamp(16px, 2.2vw, 22px);
    border:1px solid var(--line);
    border-radius:4px;
    background:var(--surface);
  }
  .card-head {
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:12px;
    margin-bottom:16px;
  }
  h1, h2, h3, p { margin:0; }
  h1 {
    font-size:30px;
    line-height:1.2;
    font-weight:650;
  }
  h2 {
    font-size:17px;
    line-height:1.3;
    font-weight:650;
  }
  h3 {
    font-size:14px;
    line-height:1.35;
    font-weight:650;
  }
  .muted {
    color:var(--muted-strong);
    font-size:13px;
    line-height:1.5;
  }
  .label {
    color:var(--muted);
    font-size:12px;
    font-weight:600;
  }
  .up { color:var(--up); }
  .down { color:var(--down); }
  .neutral { color:var(--text); }
  .metric {
    padding:14px;
    border:1px solid var(--line);
    border-radius:4px;
    background:rgba(255,255,255,.025);
  }
  .metric b {
    display:block;
    margin-top:6px;
    font-size:18px;
    font-weight:650;
  }
  .actions {
    display:flex;
    flex-wrap:wrap;
    gap:10px;
    margin-top:18px;
  }
  .btn {
    min-height:40px;
    border:1px solid var(--line);
    border-radius:4px;
    padding:0 14px;
    background:var(--card);
    color:var(--text);
    font-weight:600;
  }
  .btn.primary {
    border-color:var(--primary);
    background:var(--primary);
    color:var(--ink);
  }
  .btn.danger {
    border:0;
    background:var(--live);
    color:#fff;
  }
  .btn.ghost {
    background:#11161c;
  }
  .trade-chart {
    position:relative;
    min-height:360px;
    overflow:hidden;
    border:1px solid var(--line);
    border-radius:4px;
    background:
      linear-gradient(to right, rgba(234,236,239,.045) 1px, transparent 1px) 0 0 / 72px 100%,
      linear-gradient(to bottom, rgba(234,236,239,.045) 1px, transparent 1px) 0 0 / 100% 58px,
      #11161c;
  }
  .chart-candle {
    position:absolute;
    bottom:64px;
    width:9px;
    border-radius:2px;
    background:var(--up);
  }
  .chart-candle.down { background:var(--down); }
  .chart-candle::before {
    content:"";
    position:absolute;
    left:4px;
    top:-14px;
    bottom:-16px;
    width:1px;
    background:currentColor;
    opacity:.85;
  }
  .chart-volume {
    position:absolute;
    left:16px;
    right:16px;
    bottom:14px;
    height:42px;
    display:flex;
    align-items:end;
    gap:5px;
    opacity:.35;
  }
  .chart-volume span {
    flex:1;
    min-width:4px;
    border-radius:2px 2px 0 0;
    background:var(--muted);
  }
  .trade-marker {
    position:absolute;
    min-width:142px;
    max-width:180px;
    padding:8px 9px;
    border:1px solid var(--line);
    border-left:4px solid var(--up);
    border-radius:4px;
    background:rgba(30,35,41,.96);
    transform:translate(-50%, -50%);
  }
  .trade-marker.sell, .trade-marker.failed { border-left-color:var(--down); }
  .trade-marker.backtest { border-left-color:var(--primary); }
  .trade-marker b {
    display:block;
    font-size:12px;
    font-weight:650;
  }
  .trade-marker span {
    display:block;
    margin-top:4px;
    color:var(--muted-strong);
    font-size:11px;
    line-height:1.35;
  }
  .chart-empty {
    position:absolute;
    inset:0;
    display:grid;
    place-items:center;
    color:var(--muted);
    text-align:center;
    padding:20px;
  }
  .chart-line {
    position:absolute;
    left:0;
    right:0;
    height:1px;
    border-top:1px dashed var(--muted);
    opacity:.8;
  }
  .chart-line-label {
    position:absolute;
    right:10px;
    transform:translateY(-50%);
    min-height:22px;
    display:flex;
    align-items:center;
    padding:0 8px;
    border:1px solid var(--line);
    border-radius:4px;
    background:#11161c;
    color:var(--muted-strong);
    font-size:11px;
    font-weight:600;
  }
  .timeline {
    display:grid;
    gap:10px;
  }
  .log-item {
    padding:14px;
    border:1px solid var(--line);
    border-left:4px solid var(--muted);
    border-radius:var(--radius);
    background:var(--surface);
  }
  .log-item.enter { border-left-color:var(--up); }
  .log-item.block { border-left-color:var(--down); }
  .log-top {
    display:flex;
    justify-content:space-between;
    gap:12px;
    align-items:center;
  }
  .score {
    height:8px;
    margin-top:10px;
    border-radius:999px;
    border:1px solid var(--line);
    background:#11161c;
    overflow:hidden;
  }
  .score span {
    display:block;
    height:100%;
    width:0;
    background:var(--up);
  }
  .two-col {
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:12px;
  }
  .editor-tabs {
    display:flex;
    gap:8px;
    margin-bottom:10px;
  }
  .tab {
    min-height:32px;
    padding:0 12px;
    border:1px solid var(--line);
    border-radius:4px;
    background:#11161c;
    color:var(--muted-strong);
    font-size:13px;
    font-weight:600;
  }
  .tab.active {
    color:var(--text);
    border-color:var(--primary);
  }
  textarea {
    min-height:190px;
    padding:12px;
    resize:vertical;
    font-family:"IBM Plex Sans", Inter, sans-serif;
    font-size:13px;
    line-height:1.5;
  }
  .form-grid {
    display:grid;
    grid-template-columns:repeat(4, minmax(0, 1fr));
    gap:10px;
    margin-top:12px;
  }
  .field label {
    display:block;
    margin-bottom:6px;
    color:var(--muted);
    font-size:12px;
    font-weight:600;
  }
  .field input, .field select {
    height:38px;
    padding:0 10px;
  }
  .result-grid {
    display:grid;
    grid-template-columns:repeat(4, minmax(0, 1fr));
    gap:10px;
  }
  .lab-grid {
    display:grid;
    grid-template-columns:minmax(0, 1.15fr) minmax(300px, .85fr);
    gap:16px;
    align-items:start;
  }
  .tool-panel {
    padding:clamp(14px, 2vw, 18px);
    border:1px solid var(--line);
    border-radius:4px;
    background:#1e222d;
  }
  .tool-head {
    display:flex;
    justify-content:space-between;
    gap:12px;
    align-items:flex-start;
    margin-bottom:12px;
  }
  .indicator-grid {
    display:grid;
    grid-template-columns:repeat(2, minmax(0, 1fr));
    gap:10px;
  }
  .indicator-card {
    display:grid;
    gap:10px;
    min-height:142px;
    padding:12px;
    border:1px solid var(--line);
    border-radius:4px;
    background:rgba(255,255,255,.025);
  }
  .indicator-top {
    display:flex;
    justify-content:space-between;
    gap:8px;
    align-items:center;
  }
  .switch {
    position:relative;
    width:38px;
    height:22px;
    flex:0 0 auto;
  }
  .switch input {
    position:absolute;
    inset:0;
    opacity:0;
  }
  .switch span {
    position:absolute;
    inset:0;
    border-radius:999px;
    background:var(--elevated);
    border:1px solid var(--line);
  }
  .switch span::after {
    content:"";
    position:absolute;
    left:3px;
    top:3px;
    width:14px;
    height:14px;
    border-radius:50%;
    background:var(--muted-strong);
    transition:.18s ease;
  }
  .switch input:checked + span {
    background:rgba(41,98,255,.18);
    border-color:var(--primary);
  }
  .switch input:checked + span::after {
    transform:translateX(16px);
    background:var(--primary);
  }
  .param-row {
    display:grid;
    grid-template-columns:76px minmax(0, 1fr) 58px;
    gap:8px;
    align-items:center;
  }
  .param-row input[type="range"] { height:28px; padding:0; }
  .param-row input[type="number"] {
    height:30px;
    padding:0 7px;
    font-size:12px;
  }
  .condition-list {
    display:grid;
    gap:8px;
  }
  .condition-row {
    display:grid;
    grid-template-columns:62px minmax(120px, .85fr) minmax(150px, 1.1fr) minmax(118px, .75fr) minmax(120px, .85fr) 38px;
    gap:8px;
    align-items:end;
  }
  .condition-row select, .condition-row input {
    height:36px;
    padding:0 9px;
    font-size:12px;
  }
  .condition-field {
    display:grid;
    gap:4px;
  }
  .condition-field span {
    color:var(--muted);
    font-size:11px;
    font-weight:650;
  }
  .exit-row {
    display:grid;
    grid-template-columns:72px minmax(130px, 1fr) minmax(110px, .8fr) 38px;
    gap:8px;
    align-items:end;
    padding:10px;
    border:1px solid var(--line);
    border-radius:4px;
    background:#11161c;
  }
  .exit-row.stop {
    grid-template-columns:72px minmax(130px, 1fr) minmax(130px, 1fr);
  }
  .exit-field {
    display:grid;
    gap:4px;
  }
  .exit-field span {
    color:var(--muted);
    font-size:11px;
    font-weight:650;
  }
  .exit-field input {
    height:36px;
    padding:0 9px;
    font-size:12px;
  }
  .exit-note {
    margin-top:8px;
    color:var(--muted);
    font-size:12px;
    line-height:1.45;
  }
  .sizing-row {
    display:grid;
    grid-template-columns:58px minmax(92px, .8fr) minmax(110px, 1fr) 38px;
    gap:8px;
    align-items:center;
  }
  .sizing-row input {
    height:36px;
    padding:0 9px;
    font-size:12px;
  }
  .sizing-grid {
    display:grid;
    grid-template-columns:repeat(2, minmax(0, 1fr));
    gap:8px;
    margin-bottom:10px;
  }
  .wizard {
    display:grid;
    gap:14px;
  }
  .wizard-steps {
    display:flex;
    gap:4px;
    padding:6px;
    border:1px solid var(--line);
    border-radius:4px;
    background:rgba(255,255,255,.02);
  }
  .wizard-step {
    flex:1; min-width:0;
    display:flex; align-items:center; justify-content:center; gap:8px;
    padding:10px 8px;
    border:0; border-radius:4px;
    background:transparent;
    color:var(--muted);
    text-align:center;
    transition:.15s;
  }
  .wstep-num {
    flex:0 0 auto; width:26px; height:26px; border-radius:50%;
    display:grid; place-items:center;
    border:1px solid var(--line); background:#11161c;
    font-size:12px; font-weight:700;
  }
  .wizard-step b { font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .wizard-step.active { color:var(--ink); background:var(--primary); }
  .wizard-step.active .wstep-num { background:var(--ink); color:var(--primary); border-color:var(--ink); }
  .wizard-step.done { color:var(--text); }
  .wizard-step.done .wstep-num { border-color:var(--up); background:rgba(38,166,154,.16); color:var(--up); }
  @media (max-width: 640px) {
    .wizard-step b { display:none; }
    .wizard-step.active b { display:inline; }
  }
  .wizard-panel { display:none; }
  .wizard-panel.active {
    display:grid;
    gap:12px;
  }
  .wizard-actions {
    display:flex;
    justify-content:space-between;
    gap:10px;
    margin-top:2px;
  }
  .preset-grid {
    display:grid;
    grid-template-columns:repeat(3, minmax(0, 1fr));
    gap:10px;
  }
  .preset-card {
    min-height:132px;
    padding:14px;
    border:1px solid var(--line);
    border-radius:var(--radius);
    background:var(--surface);
    color:var(--text);
    text-align:left;
    transition:border-color .15s, transform .15s;
  }
  .preset-card:hover { border-color:var(--muted); transform:translateY(-2px); }
  .preset-card.active {
    border-color:var(--primary);
    background:rgba(41,98,255,.08);
  }
  .preset-card b {
    display:block;
    margin-bottom:8px;
    font-size:15px;
    font-weight:650;
  }
  .preset-card span {
    color:var(--muted-strong);
    font-size:12px;
    line-height:1.45;
  }
  details.advanced {
    border:1px solid var(--line);
    border-radius:4px;
    background:#171c22;
  }
  details.advanced summary {
    min-height:42px;
    padding:12px 14px;
    cursor:pointer;
    color:var(--text);
    font-size:13px;
    font-weight:650;
  }
  details.advanced > .advanced-body {
    padding:0 14px 14px;
  }
  /* ── 백테스트 판정 카드 ── */
  .verdict {
    margin-bottom:14px;
    padding:clamp(16px, 2.4vw, 22px);
    border:1px solid var(--line);
    border-radius:4px;
    background:#1e222d;
  }
  .verdict.ok   { border-color:rgba(38,166,154,.45); box-shadow:0 0 0 1px rgba(38,166,154,.12) inset; }
  .verdict.warn { border-color:rgba(41,98,255,.45); }
  .verdict-head { display:flex; gap:16px; align-items:flex-start; margin-bottom:16px; }
  .verdict-badge {
    flex:0 0 auto; width:54px; height:54px; border-radius:4px;
    display:grid; place-items:center; font-size:26px;
    background:rgba(255,255,255,.04); border:1px solid var(--line);
  }
  .verdict.ok   .verdict-badge { background:rgba(38,166,154,.12); border-color:rgba(38,166,154,.4); }
  .verdict.warn .verdict-badge { background:rgba(41,98,255,.12); border-color:rgba(41,98,255,.4); }
  .verdict-text { min-width:0; }
  .verdict-tag {
    display:inline-block; margin-bottom:6px; padding:2px 9px; border-radius:999px;
    font-size:11px; font-weight:700; background:var(--elevated); color:var(--muted-strong);
  }
  .verdict.ok   .verdict-tag { background:rgba(38,166,154,.16); color:var(--up); }
  .verdict.warn .verdict-tag { background:rgba(41,98,255,.16); color:var(--primary-active); }
  .verdict-text h3 { margin:0; font-size:clamp(18px, 2.2vw, 22px); font-weight:700; }
  .verdict-text p { margin:7px 0 0; color:var(--muted-strong); font-size:13px; line-height:1.55; }
  .verdict-cta { margin-top:16px; }
  .criteria-row {
    display:grid;
    grid-template-columns:repeat(4, minmax(0, 1fr));
    gap:8px;
  }
  .criteria {
    min-height:62px;
    padding:11px;
    border:1px solid var(--line);
    border-radius:4px;
    background:rgba(255,255,255,.025);
  }
  .criteria span {
    display:flex; align-items:center; gap:5px;
    color:var(--muted); font-size:11px; font-weight:650;
  }
  .criteria b {
    display:block;
    margin-top:6px;
    font-size:15px;
    font-variant-numeric:tabular-nums;
  }
  .criteria-mark { font-size:11px; }
  .criteria.ok   { border-color:rgba(38,166,154,.35); }
  .criteria.ok b { color:var(--up); }
  .criteria.ok .criteria-mark { color:var(--up); }
  .criteria.warn, .criteria.bad { border-color:rgba(41,98,255,.3); }
  .criteria.warn b, .criteria.bad b { color:var(--primary-active); }
  .criteria.warn .criteria-mark, .criteria.bad .criteria-mark { color:var(--primary-active); }
  @media (max-width: 640px) {
    .criteria-row { grid-template-columns:repeat(2, minmax(0, 1fr)); }
  }
  .icon-btn {
    width:38px;
    height:36px;
    display:grid;
    place-items:center;
    border:1px solid var(--line);
    border-radius:4px;
    background:#11161c;
    color:var(--text);
    font-size:18px;
    line-height:1;
  }
  .script-box {
    display:grid;
    gap:10px;
    margin-top:14px;
  }
  .mini-list {
    display:grid;
    gap:8px;
  }
  .mini-item {
    display:flex;
    justify-content:space-between;
    gap:12px;
    align-items:center;
    min-height:42px;
    padding:10px;
    border:1px solid var(--line);
    border-radius:4px;
    background:rgba(255,255,255,.025);
  }
  .mini-item b {
    font-size:13px;
    font-weight:650;
  }
  .mini-item span {
    color:var(--muted-strong);
    font-size:12px;
  }
  .search-grid {
    display:grid;
    grid-template-columns:repeat(3, minmax(0, 1fr));
    gap:10px;
    margin-top:12px;
  }
  .compare-grid {
    display:grid;
    grid-template-columns:repeat(3, minmax(0, 1fr));
    gap:10px;
  }
  .compare-card {
    padding:14px;
    border:1px solid var(--line);
    border-radius:var(--radius);
    background:var(--surface);
  }
  .compare-card.best { border-color:rgba(38,166,154,.55); }
  .compare-card b {
    display:block;
    margin-top:8px;
    font-size:24px;
    font-weight:650;
  }
  .tag-row {
    display:flex;
    flex-wrap:wrap;
    gap:7px;
    margin-top:10px;
  }
  .tag {
    display:inline-flex;
    align-items:center;
    min-height:26px;
    padding:0 8px;
    border:1px solid var(--line);
    border-radius:4px;
    background:#11161c;
    color:var(--muted-strong);
    font-size:12px;
    font-weight:600;
  }
  .apply-box {
    padding:16px;
    border:1px solid var(--line);
    border-radius:var(--radius);
    background:var(--surface);
  }
  .empty {
    min-height:100px;
    display:grid;
    place-items:center;
    padding:18px;
    border:1px dashed var(--line);
    border-radius:var(--radius);
    background:var(--surface);
    color:var(--muted);
    text-align:center;
  }
  .table-wrap {
    overflow:auto;
    border:1px solid var(--line);
    border-radius:4px;
  }
  table {
    width:100%;
    min-width:720px;
    border-collapse:collapse;
  }
  th, td {
    padding:11px 12px;
    border-bottom:1px solid var(--line);
    text-align:left;
    font-size:13px;
  }
  th {
    color:var(--muted);
    font-size:12px;
    font-weight:600;
  }
  tr:last-child td { border-bottom:0; }
  .mobile-actions { display:none; }
  @media (max-width: 1100px) {
    .grid, .lab-grid { grid-template-columns:1fr; }
    .result-grid, .preset-grid, .criteria-row { grid-template-columns:repeat(2, minmax(0, 1fr)); }
    .form-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); }
    .compare-grid { grid-template-columns:1fr; }
  }
  @media (max-width: 720px) {
    .topbar { height:auto; min-height:58px; padding:10px 12px; flex-wrap:wrap; }
    .nav { order:3; width:100%; }
    .top-actions .btn.ghost { display:none; }
    .page { padding:14px 12px 82px; }
    .result-grid, .form-grid, .two-col, .indicator-grid, .search-grid, .wizard-steps, .preset-grid, .criteria-row, .sizing-grid { grid-template-columns:1fr; }
    .condition-row, .exit-row, .exit-row.stop { grid-template-columns:1fr; }
    .sizing-row { grid-template-columns:1fr 1fr; }
    .condition-row .icon-btn, .sizing-row .icon-btn { width:100%; }
    .wizard-actions { flex-direction:column; }
    h1 { font-size:24px; }
    .mobile-actions {
      position:fixed;
      left:0;
      right:0;
      bottom:0;
      z-index:50;
      display:grid;
      grid-template-columns:1fr 1fr 1fr;
      gap:8px;
      padding:10px;
      background:var(--card);
      border-top:1px solid var(--line);
    }
    .mobile-actions button {
      min-height:44px;
      border-radius:4px;
      border:1px solid var(--line);
      background:var(--elevated);
      color:var(--text);
      font-size:12px;
      font-weight:650;
    }
    .mobile-actions .danger { background:var(--live); border:0; color:#fff; }
  }

  /* ── 백테스트 차트 (Lightweight Charts) ── */
  .bt-chart-head {
    display:flex; align-items:baseline; justify-content:space-between;
    gap:12px; margin:4px 0 6px;
  }
  .bt-chart-head .label { font-size:12px; font-weight:650; color:var(--text); }
  .bt-chart-head .muted { font-size:11px; }
  .chart-host {
    position:relative; width:100%; height:340px;
    border:1px solid var(--line); border-radius:4px;
    background:#0e1318; overflow:hidden;
  }
  .chart-host.equity { height:200px; }
  .chart-host.live { height:360px; }
  .chart-empty-abs {
    position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    text-align:center; padding:0 24px; color:var(--muted); font-size:12px; line-height:1.5;
  }
  .bt-legend { display:flex; gap:14px; flex-wrap:wrap; margin-top:8px; font-size:11px; color:var(--muted-strong); }
  .bt-legend span { display:inline-flex; align-items:center; gap:5px; }
  .bt-legend i { width:9px; height:9px; border-radius:2px; display:inline-block; }
  .bt-legend i.in { background:var(--up); }
  .bt-legend i.win { background:#26a69a; }
  .bt-legend i.loss { background:var(--down); }
  .bt-legend i.eq { background:var(--primary); }

  /* ── 지표 카드 재설계 (한눈에 on/off + 현재값) ── */
  .ind-add-bar { display:flex; gap:8px; align-items:center; margin-bottom:10px; }
  .ind-add-bar select {
    flex:1; padding:8px 10px; border-radius:4px; border:1px solid var(--line);
    background:var(--elevated); color:var(--text); font-size:12px;
  }
  .indicator-card { min-height:0; transition:border-color .15s, opacity .15s; }
  .indicator-card.off { opacity:.5; }
  .indicator-card.on { border-color:rgba(38,166,154,.45); }
  .ind-head { display:flex; align-items:center; gap:8px; }
  .ind-dot { width:8px; height:8px; border-radius:50%; background:var(--muted); flex:0 0 auto; }
  .indicator-card.on .ind-dot { background:#26a69a; box-shadow:0 0 0 3px rgba(38,166,154,.15); }
  .ind-head h3 { margin:0; font-size:13px; font-weight:650; }
  .ind-head .ind-hint { font-size:11px; color:var(--muted); }
  .ind-head .spacer { flex:1; }
  .ind-remove {
    background:transparent; border:0; color:var(--muted); cursor:pointer;
    font-size:16px; line-height:1; padding:2px 4px; border-radius:4px;
  }
  .ind-remove:hover { color:var(--down); background:rgba(239,83,80,.12); }
  .ind-summary {
    font-size:12px; color:var(--muted-strong); font-variant-numeric:tabular-nums;
    padding:2px 0 2px; letter-spacing:.2px;
  }
  .indicator-card.on .ind-summary { color:var(--text); }
  .ind-params { display:grid; gap:7px; }
  .indicator-card.off .ind-params { display:none; }
  .ind-tf { width:auto; min-width:64px; height:24px; padding:0 6px; font-size:11px; flex:0 0 auto; }
  .recipe-select {
    width:100%; height:42px; padding:0 12px; border-radius:4px;
    border:1px solid var(--primary); background:rgba(41,98,255,.08);
    color:var(--text); font-size:13px; font-weight:600;
  }

  /* ── 홈 히어로 (신호등 + 1액션 + 신뢰 스트립) ── */
  .btn.lg { min-height:46px; padding:0 20px; border-radius:4px; font-size:14px; }
  /* ── 지표 설명 툴팁 (? 호버) ── */
  .ind-help {
    position:relative; flex:0 0 auto; width:16px; height:16px;
    display:grid; place-items:center; border-radius:50%;
    border:1px solid var(--line); background:#11161c;
    color:var(--muted-strong); font-size:10px; font-weight:700; cursor:help;
  }
  .ind-help:hover { color:var(--text); border-color:var(--primary); }
  .ind-help::after {
    content:attr(data-tip);
    position:absolute; left:0; top:130%; z-index:60;
    width:230px; padding:9px 11px;
    border:1px solid var(--line); border-radius:4px;
    background:#0b0e11; color:var(--text);
    font-size:11px; font-weight:500; line-height:1.5; white-space:normal;
    box-shadow:0 6px 20px rgba(0,0,0,.45);
    opacity:0; visibility:hidden; transform:translateY(-3px); transition:.12s ease;
  }
  .ind-help:hover::after { opacity:1; visibility:visible; transform:translateY(0); }

  /* --- Monitor (메인) --- */
  .monitor { margin-bottom:14px; }
  .statusbar {
    display:flex; align-items:center; gap:10px; flex-wrap:wrap;
    padding:10px 14px; background:var(--panel);
    border:1px solid var(--line); border-radius:4px;
  }
  .sb-grow { flex:1 1 auto; }
  .mpill {
    display:inline-flex; align-items:center; gap:6px;
    padding:4px 9px; border-radius:3px; font-size:12px; font-weight:600;
    background:var(--elevated); color:var(--muted-strong);
    border:1px solid var(--line);
  }
  .mpill .num { color:var(--text); font-weight:680; }
  .mpill.ghost { background:transparent; }
  .mpill .dot { width:7px; height:7px; border-radius:999px; background:var(--muted); }
  .mpill .dot.up { background:var(--up); box-shadow:0 0 0 3px rgba(38,166,154,.18); }
  .mpill .dot.warn { background:#f0a020; }
  .mpill .dot.down { background:var(--down); }
  .mode-pill { letter-spacing:.04em; }
  .mode-pill.live { background:rgba(239,83,80,.14); color:var(--down); border-color:rgba(239,83,80,.4); }
  .mode-pill.test { background:rgba(240,160,32,.14); color:#f0a020; border-color:rgba(240,160,32,.4); }
  .mode-pill.off { background:var(--elevated); color:var(--muted); }
  .sb-pnl { display:flex; align-items:baseline; gap:7px; }
  .sb-pnl .label { font-size:11px; color:var(--muted); }
  .sb-pnl b { font-size:16px; }

  /* position panel */
  .pos-panel { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:1px; background:var(--line); }
  .pos-cell { background:var(--panel); padding:10px 12px; display:flex; flex-direction:column; gap:3px; }
  .pos-cell .k { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.03em; }
  .pos-cell .v { font-size:15px; font-weight:660; }
  .pos-cell.wide { grid-column:1 / -1; }
  .pos-flat { padding:18px 12px; color:var(--muted); text-align:center; font-size:13px; }
  .liq-near { color:var(--down) !important; }
  @media (max-width:720px) { .pos-panel { grid-template-columns:repeat(2,minmax(0,1fr)); } }
</style>
</head>
<body>
<header class="topbar">
  <div class="brand"><span class="brand-mark">AT</span><span>Auto Trading Futures</span></div>
  <nav class="nav" aria-label="Workflow">
    <a class="active" href="#dashboard">모니터</a>
    <a href="#logs">로그</a>
    <a href="#strategy">전략</a>
    <a href="#backtest">백테스트</a>
    <a href="#apply">적용</a>
  </nav>
  <div class="top-actions">
    <span id="botPill" class="pill"><span class="dot"></span>BOT OFF</span>
    <button class="btn ghost" type="button" onclick="runNow()">Run once</button>
    <button class="btn danger" type="button" onclick="emergencyStop()">봇 정지</button>
  </div>
</header>
<div id="modeBanner" class="mode">TESTNET MODE - 실제 주문이 아닙니다.</div>

<main id="appPage" class="page" data-view="dashboard">
  <section class="grid">
    <div class="stack">
      <section id="profit" class="monitor dashboard-only">
        <div class="statusbar">
          <span id="modePill" class="mpill mode-pill off">—</span>
          <span id="botPill2" class="mpill"><span class="dot"></span>BOT —</span>
          <span class="mpill ghost">신호 <b id="lastSignal" class="num">—</b></span>
          <span id="execPill" class="mpill"><span class="dot"></span>exec —</span>
          <span class="sb-grow"></span>
          <div class="sb-pnl">
            <span class="label">실현 PnL</span>
            <b id="pnlNumber" class="num neutral">0.00</b>
          </div>
          <button class="btn danger" type="button" onclick="emergencyStop()">KILL</button>
        </div>
      </section>

      <section id="logs" class="card view-logs">
        <div class="card-head">
          <div>
            <h2>매매 로그</h2>
            <p class="muted">진입·청산 위치, 주문 금액·수량·상태.</p>
          </div>
          <span id="chartSummary" class="status info">chart</span>
        </div>
        <div id="tradeChart" class="chart-host live" aria-label="Trade log chart"></div>
      </section>

      <section class="card view-logs">
        <div class="card-head">
          <div>
            <h2>판단 로그</h2>
            <p class="muted">점수 미달 · 리스크 차단 · 주문 실패 사유.</p>
          </div>
          <span id="logSummary" class="status info">logs</span>
        </div>
        <div id="logTimeline" class="timeline"></div>
      </section>

      <section id="strategy-lab" class="card view-strategy">
        <div class="card-head">
          <div>
            <h2>전략 생성</h2>
            <p class="muted">프리셋 → 진입 · 청산 · 수량 · 백테스트.</p>
          </div>
          <span id="builderStatus" class="status warn">draft</span>
        </div>

        <div class="wizard">
          <div id="wizardSteps" class="wizard-steps"></div>

          <section class="wizard-panel active" data-step="1">
            <div class="tool-panel">
              <div class="tool-head">
                <div>
                  <h3>프리셋 선택</h3>
                  <p class="muted">전략의 출발점을 고르면 조건, 청산, 수량 기본값이 함께 바뀝니다.</p>
                </div>
              </div>
              <div id="presetGrid" class="preset-grid"></div>
            </div>
          </section>

          <section class="wizard-panel" data-step="2">
            <div class="tool-panel">
              <div class="tool-head">
                <div>
                  <h3>매수(롱) 조건</h3>
                  <p class="muted">모든 조건이 만족되는 캔들에서 롱 진입합니다.</p>
                </div>
                <button class="btn ghost" type="button" onclick="addCondition('long')">직접 추가 (고급)</button>
              </div>
              <select id="longRecipe" class="recipe-select" onchange="addRecipe('long', this.value)"></select>
              <p class="muted" style="margin:6px 0 12px;">말로 고르면 조건이 자동 추가됩니다. 추가한 조건이 <b>모두 만족</b>될 때 매수합니다.</p>
              <div id="conditionList" class="condition-list"></div>
              <div class="field" style="margin-top:10px;">
                <label>5분봉 확인 트리거 (MTF · 선택)</label>
                <input id="longConfirmTrigger" placeholder="예: close <= boll.lower (위 조건은 상위봉 게이트, 이 식은 실행봉에서 확인)" />
              </div>
            </div>

            <details class="advanced">
              <summary>숏 조건 설정</summary>
              <div class="advanced-body">
                <div class="tool-head">
                  <div>
                    <h3>매도(숏) 조건</h3>
                    <p class="muted">비우면 숏 진입은 사용하지 않습니다.</p>
                  </div>
                  <button class="btn ghost" type="button" onclick="addCondition('short')">직접 추가 (고급)</button>
                </div>
                <select id="shortRecipe" class="recipe-select" onchange="addRecipe('short', this.value)"></select>
                <p class="muted" style="margin:6px 0 12px;">말로 고르면 조건이 자동 추가됩니다. 비우면 매도(숏)는 사용 안 함.</p>
                <div id="shortConditionList" class="condition-list"></div>
                <div class="field" style="margin-top:10px;">
                  <label>5분봉 확인 트리거 (MTF · 선택)</label>
                  <input id="shortConfirmTrigger" placeholder="예: close >= boll.upper" />
                </div>
              </div>
            </details>

            <details class="advanced">
              <summary>지표 세부 설정</summary>
              <div class="advanced-body">
              <div class="tool-head">
                <div>
                  <h3>기본 인디케이터</h3>
                  <p class="muted">RSI, EMA, MACD, ATR, 거래량을 켜고 기간·임계값을 조정합니다.</p>
                </div>
                <span id="indicatorCount" class="status info">0 active</span>
              </div>
              <div id="indicatorAddBar" class="ind-add-bar"></div>
              <div id="indicatorGrid" class="indicator-grid"></div>
              </div>
            </details>
          </section>

          <section class="wizard-panel" data-step="3">
            <div class="two-col">
            <div class="tool-panel">
              <div class="tool-head">
                <div>
                  <h3>청산 규칙</h3>
                  <p class="muted">PNL/ROE가 몇 %가 되면 몇 %를 팔지, 몇 % 손실이면 정리할지 정합니다.</p>
                </div>
                <button class="btn ghost" type="button" onclick="addExitTp()">직접 추가 (고급)</button>
              </div>
              <select id="exitPreset" class="recipe-select" onchange="applyExitPreset(this.value)"></select>
              <p class="muted" style="margin:6px 0 12px;">말로 고르면 익절/손절이 자동 설정됩니다. 아래서 세부 조정 가능.</p>
              <div id="exitRulesBody" class="condition-list"></div>
            </div>

            <div class="tool-panel">
              <div class="tool-head">
                <div>
                  <h3>매매 수량</h3>
                  <p class="muted">계좌 기준 포지션 한도와 단계별 진입 비중을 조정합니다.</p>
                </div>
                <button class="btn ghost" type="button" onclick="addSizingStep()">단계 추가</button>
              </div>
              <div class="sizing-grid">
                <div class="field"><label>최대 포지션 비중 %</label><input id="maxPositionPercent" type="number" step="1" min="1" max="100" value="25" oninput="setMaxPositionPercent(this.value)" /></div>
                <div class="field"><label>레버리지</label><input id="sizingLeverage" type="number" step="0.1" min="1" value="2" oninput="setSizingLeverage(this.value)" /></div>
              </div>
              <div id="sizingRulesBody" class="condition-list"></div>
            </div>
            </div>
          </section>

          <section class="wizard-panel" data-step="4">
            <div class="tool-panel">
              <div class="tool-head">
                <div>
                  <h3>백테스트 설정</h3>
                  <p class="muted">검증할 종목과 기간, 초기 자본을 확인한 뒤 실행합니다.</p>
                </div>
              </div>
              <div class="form-grid">
                <div class="field"><label>심볼</label><input id="btSymbol" value="BTCUSDT" /></div>
                <div class="field"><label>기간</label><input id="btRange" value="2020-01-01 ~ 2026-06-17" /></div>
                <div class="field"><label>초기 자본</label><input id="btCapital" value="10000 USDT" /></div>
                <div class="field"><label>레버리지</label><input id="btLev" value="2x" oninput="setSizingLeverage(this.value)" /></div>
                <div class="field"><label>실행봉 (MTF)</label><select id="btExecTf"><option value="">단일TF (신호봉)</option><option value="1m">1m</option><option value="3m">3m</option><option value="5m">5m</option><option value="15m">15m</option><option value="1h">1h</option></select></div>
                <div class="field"><label>MTF 기간(일)</label><input id="btDays" value="2" /></div>
              </div>
              <div class="actions" style="margin-top:12px;">
                <button class="btn primary" type="button" onclick="previewBacktest()">백테스트 실행</button>
                <a class="btn ghost" href="#backtest" style="display:inline-flex;align-items:center;text-decoration:none;">결과 보기</a>
              </div>
            </div>

            <details class="advanced">
              <summary>고급 옵션: 직접 만든 스크립트</summary>
              <div class="advanced-body">
              <div class="editor-tabs">
                <button id="scriptTab" class="tab active" type="button" onclick="setEditorMode('script')">스크립트</button>
                <button id="mathTab" class="tab" type="button" onclick="setEditorMode('math')">수학 원리</button>
              </div>
              <textarea id="strategyText">IF rsi <= 35
AND close > ema
AND macd.histogram > macd.histogram.previous
THEN long_score += 70

EXIT:
take_profit when close >= avgEntry + atr * 1.8
stop_loss when close <= avgEntry - atr * 1.1

RISK:
stop new entries when dailyLoss <= -2%</textarea>
              <div class="actions">
                <button class="btn ghost" type="button" onclick="generateStrategyDsl()">조건을 스크립트로 변환</button>
              </div>
              </div>
            </details>

            <div class="tool-panel">
              <div class="tool-head">
                <div>
                  <h3>전략 저장소</h3>
                  <p class="muted">버전 저장 · 이전 결과 비교.</p>
                </div>
                <button class="btn ghost" type="button" onclick="saveStrategyVersion()">저장</button>
              </div>
              <div id="versionList" class="mini-list"></div>
            </div>
          </section>

          <div class="wizard-actions">
            <button id="wizardPrev" class="btn ghost" type="button" onclick="setWizardStep(wizardStep - 1)">이전</button>
            <button id="wizardNext" class="btn primary" type="button" onclick="setWizardStep(wizardStep + 1)">다음</button>
          </div>
        </div>
      </section>

      <section id="backtest" class="card view-backtest">
        <div class="card-head">
          <div>
            <h2>백테스트</h2>
            <p class="muted">수익률 · 승률 · MDD · 손익비, 전략 비교.</p>
          </div>
          <button id="btRunBtn" class="btn primary" type="button" onclick="previewBacktest()">백테스트 실행</button>
        </div>

        <div id="btSummaryBox" class="verdict pending">
          <div class="verdict-head">
            <div id="verdictBadge" class="verdict-badge">···</div>
            <div class="verdict-text">
              <span id="btSummaryStatus" class="verdict-tag">대기</span>
              <h3 id="btSummaryTitle">아직 백테스트 전입니다</h3>
              <p id="btSummaryCopy">마법사 마지막 단계에서 백테스트를 실행하면 통과 여부와 핵심 기준을 먼저 보여줍니다.</p>
            </div>
          </div>
          <div id="btCriteria" class="criteria-row">
            <div class="criteria"><span>수익률</span><b>대기</b></div>
            <div class="criteria"><span>MDD</span><b>대기</b></div>
            <div class="criteria"><span>PF</span><b>대기</b></div>
            <div class="criteria"><span>거래 수</span><b>대기</b></div>
          </div>
          <div id="verdictCta" class="verdict-cta" hidden>
            <button class="btn primary lg" type="button" onclick="location.hash='apply'">이 전략 적용하러 가기 →</button>
          </div>
        </div>

        <div class="bt-chart-head">
          <span class="label">가격 · 진입/청산</span>
          <span id="btChartHint" class="muted">실행하면 실제 캔들 위에 진입(▲)·청산(▼) 위치가 표시됩니다.</span>
        </div>
        <div id="backtestChart" class="chart-host" aria-label="Backtest price chart">
          <div class="chart-empty-abs">백테스트 실행 후 실제 4시간봉 차트에 진입/청산 타점이 가격축 그대로 표시됩니다.</div>
        </div>
        <div class="bt-legend">
          <span><i class="in"></i>롱 진입 ▲</span>
          <span><i class="loss"></i>숏 진입 ▼</span>
          <span><i class="win"></i>이익 청산</span>
          <span><i class="loss"></i>손실 청산</span>
        </div>

        <div class="result-grid" style="margin-top:14px;">
          <div class="metric"><span class="label">총 수익률</span><b id="btReturn" class="num neutral">대기</b></div>
          <div class="metric"><span class="label">승률</span><b id="btWinRate" class="num neutral">대기</b></div>
          <div class="metric"><span class="label">MDD</span><b id="btMdd" class="num neutral">대기</b></div>
          <div class="metric"><span class="label">손익비</span><b id="btPayoff" class="num neutral">대기</b></div>
          <div class="metric"><span class="label">Profit Factor</span><b id="btPf" class="num neutral">대기</b></div>
          <div class="metric"><span class="label">거래 수</span><b id="btTrades" class="num neutral">대기</b></div>
          <div class="metric"><span class="label">판정</span><b id="btVerdict">대기</b></div>
        </div>

        <div class="bt-chart-head" style="margin-top:16px;">
          <span class="label">자산 곡선 (Equity)</span>
          <span class="muted">초기 자본 대비 누적 손익 추이 · MDD 구간 확인</span>
        </div>
        <div id="equityChart" class="chart-host equity" aria-label="Backtest equity curve">
          <div class="chart-empty-abs">자산이 어떻게 불어났는지(또는 줄었는지) 시간순 곡선으로 표시됩니다.</div>
        </div>
        <div class="tool-panel" style="margin-top:14px;">
          <div class="tool-head">
            <div>
              <h3>지표 조합 자동 탐색</h3>
              <p class="muted">켜둔 지표 조합 → 후보 생성 → 백테스트 랭킹.</p>
            </div>
            <button class="btn ghost" type="button" onclick="runParameterSearch()">탐색 시작</button>
          </div>
          <div class="search-grid">
            <div class="field"><label>탐색 성향</label><select id="searchProfile"><option value="balanced">균형형</option><option value="highWin">고승률형</option><option value="highReturn">고수익형</option></select></div>
            <div class="field"><label>손익비 R</label><input id="searchRr" value="1.5" /></div>
            <div class="field"><label>최대 후보 수</label><input id="searchMaxCombos" value="18" /></div>
          </div>
          <div id="searchResults" class="mini-list" style="margin-top:12px;"></div>
        </div>
        <div class="tool-panel" style="margin-top:14px;">
          <div class="tool-head">
            <div>
              <h3>전략 결과 비교</h3>
              <p class="muted">최근 실행 · 저장 후보 동일 기준 비교.</p>
            </div>
          </div>
          <div id="compareGrid" class="compare-grid"></div>
        </div>
      </section>
    </div>

    <aside class="stack">
      <section class="card dashboard-only">
        <div class="card-head">
          <div>
            <h2>봇 제어</h2>
            <p class="muted">OFF · 신규 진입 중지 · ON.</p>
          </div>
        </div>
        <div class="actions" style="margin-top:0;">
          <button class="btn danger" type="button" onclick="emergencyStop()">봇 OFF</button>
          <button class="btn ghost" type="button" onclick="setMode('ALERT_ONLY')">신규 진입 중지</button>
          <button class="btn primary" type="button" onclick="setMode('TESTNET')">봇 ON</button>
        </div>
      </section>

      <section class="card dashboard-only">
        <div class="card-head">
          <div>
            <h2>현재 포지션</h2>
            <p class="muted">진입 당시 전략 버전으로 관리.</p>
          </div>
          <span id="positionChip" class="status">없음</span>
        </div>
        <div id="positionBody"></div>
      </section>

      <section class="card dashboard-only">
        <div class="card-head">
          <div>
            <h2>최근 주문</h2>
            <p class="muted">체결 · 실패 내역.</p>
          </div>
          <span id="orderChip" class="status ok">정상</span>
        </div>
        <div id="ordersBody"></div>
      </section>

      <section id="apply" class="card view-apply">
        <div class="card-head">
          <div>
            <h2>전략 적용</h2>
            <p class="muted">백테스트 통과 → TESTNET 적용 → 봇 ON.</p>
          </div>
          <span id="applyStatus" class="status warn">locked</span>
        </div>
        <div class="apply-box">
          <h3>적용 조건</h3>
          <p class="muted" style="margin-top:8px;">백테스트 판정이 통과되면 전략 변경 버튼이 활성화됩니다. LIVE 전환은 별도 확인 문구가 필요합니다.</p>
          <div class="actions">
            <button id="applyBtn" class="btn primary" type="button" onclick="applyStrategy()" disabled style="opacity:.45;cursor:not-allowed;">전략 변경 및 적용</button>
            <button class="btn ghost" type="button" onclick="setMode('TESTNET')">봇 ON</button>
          </div>
        </div>
      </section>
    </aside>
  </section>
</main>

<div class="mobile-actions">
  <button type="button" onclick="setMode('ALERT_ONLY')">신규 진입 중지</button>
  <button class="danger" type="button" onclick="emergencyStop()">봇 정지</button>
  <button type="button" onclick="location.hash='logs'">로그 보기</button>
</div>

<script>
const MODES = ['OFF','ALERT_ONLY','PAPER','TESTNET','LIVE_SMALL','LIVE_FULL'];
let state = { status:{ mode:'OFF', position:null }, signals:[], orders:[] };
let editorMode = 'script';
let backtestPassed = false;
let lastBacktestResult = null;
let lastBacktestCandles = null;
let wizardStep = 1;
let activePreset = 'rsi_reversion';
const WIZARD_STEPS = [
  { step:1, title:'프리셋' },
  { step:2, title:'진입 조건' },
  { step:3, title:'청산/수량' },
  { step:4, title:'백테스트' },
];
const STRATEGY_PRESETS = [
  {
    id:'rsi_reversion',
    name:'RSI 평균회귀',
    desc:'과매도 반등을 노리고 ATR 기준으로 분할 진입합니다.',
    indicators:['rsi','ema','macd','atr','volume'],
    long:[
      { join:'AND', left:'rsi', op:'<=', right:'35' },
      { join:'AND', left:'close', op:'>', right:'ema' },
      { join:'AND', left:'macd.histogram', op:'>', right:'macd.histogram.previous' },
    ],
    short:[],
    exit:{ tp:[ { pnlPercent:3, sizePercent:30 }, { pnlPercent:6, sizePercent:30 }, { pnlPercent:10, sizePercent:40 } ], slPnlPercent:4 },
    sizing:{ maxPositionValuePercent:25, leverage:2, entries:[ { step:1, sizePercent:25 }, { step:2, sizePercent:25, atrMult:0.7 }, { step:3, sizePercent:25, atrMult:1.2 }, { step:4, sizePercent:25, atrMult:2.0 } ] },
  },
  {
    id:'trend_following',
    name:'추세추종',
    desc:'EMA 위에서 모멘텀과 거래량이 함께 살아날 때 진입합니다.',
    indicators:['ema','macd','atr','volume','rsi'],
    long:[
      { join:'AND', left:'close', op:'>', right:'ema' },
      { join:'AND', left:'macd.histogram', op:'>', right:'0' },
      { join:'AND', left:'volume', op:'>', right:'volMa * 1.2' },
    ],
    short:[
      { join:'AND', left:'close', op:'<', right:'ema' },
      { join:'AND', left:'macd.histogram', op:'<', right:'0' },
    ],
    exit:{ tp:[ { pnlPercent:4, sizePercent:35 }, { pnlPercent:8, sizePercent:35 }, { pnlPercent:14, sizePercent:30 } ], slPnlPercent:5 },
    sizing:{ maxPositionValuePercent:20, leverage:2, entries:[ { step:1, sizePercent:40 }, { step:2, sizePercent:30, atrMult:1.0 }, { step:3, sizePercent:30, atrMult:1.8 } ] },
  },
  {
    id:'vol_breakout',
    name:'변동성 돌파',
    desc:'가격이 이전 고점과 거래량 기준을 함께 돌파할 때 진입합니다.',
    indicators:['atr','volume','ema','rsi'],
    long:[
      { join:'AND', left:'close', op:'>', right:'previousClose + atr * 1.0' },
      { join:'AND', left:'volume', op:'>', right:'volMa * 1.5' },
      { join:'AND', left:'close', op:'>', right:'ema' },
    ],
    short:[],
    exit:{ tp:[ { pnlPercent:5, sizePercent:50 }, { pnlPercent:10, sizePercent:50 } ], slPnlPercent:4 },
    sizing:{ maxPositionValuePercent:18, leverage:2, entries:[ { step:1, sizePercent:60 }, { step:2, sizePercent:40, atrMult:1.2 } ] },
  },
  {
    id:'smc_ob_fvg',
    name:'SMC OB/FVG 자리선별',
    desc:'활성 OB/FVG 구역 안에서 거래량과 모멘텀 확인 후 분할 진입합니다.',
    indicators:['ob','fvg','atr','volume','macd','ema','rsi'],
    long:[
      { join:'AND', left:'(ob.activeBullish == 1 OR fvg.activeBullish == 1)', op:'==', right:'1' },
      { join:'AND', left:'volume', op:'>', right:'volMa * 1.2' },
      { join:'AND', left:'macd.histogram', op:'>', right:'macd.histogram.previous' },
      { join:'AND', left:'close', op:'>=', right:'previousClose - atr * 0.5' },
    ],
    short:[
      { join:'AND', left:'(ob.activeBearish == 1 OR fvg.activeBearish == 1)', op:'==', right:'1' },
      { join:'AND', left:'volume', op:'>', right:'volMa * 1.2' },
      { join:'AND', left:'macd.histogram', op:'<', right:'macd.histogram.previous' },
      { join:'AND', left:'close', op:'<=', right:'previousClose + atr * 0.5' },
    ],
    exit:{ tp:[ { pnlPercent:3, sizePercent:35 }, { pnlPercent:6, sizePercent:35 }, { pnlPercent:10, sizePercent:30 } ], slPnlPercent:4 },
    sizing:{ maxPositionValuePercent:18, leverage:2, entries:[ { step:1, sizePercent:35 }, { step:2, sizePercent:35, atrMult:0.7 }, { step:3, sizePercent:30, atrMult:1.2 } ] },
  },
  {
    id:'ob_x3_mtf',
    name:'OB × 3 MTF',
    desc:'4h/1d/1w Order Block 합류를 5분봉 볼린저 터치로 확인합니다.',
    indicators:[
      { type:'bollinger', key:'boll', tf:'4h', enabled:true },
      { type:'ob', key:'ob4h', tf:'4h', enabled:true },
      { type:'ob', key:'ob1d', tf:'1d', enabled:true },
      { type:'ob', key:'ob1w', tf:'1w', enabled:true },
    ],
    long:[
      { join:'AND', left:'ob4h.activeBullish + ob1d.activeBullish + ob1w.activeBullish', op:'>=', right:'2' },
    ],
    short:[
      { join:'AND', left:'ob4h.activeBearish + ob1d.activeBearish + ob1w.activeBearish', op:'>=', right:'2' },
    ],
    longTrigger:'close <= boll.lower',
    shortTrigger:'close >= boll.upper',
    execTf:'5m',
    days:2,
    exit:{ tp:[ { pnlPercent:3, sizePercent:50 }, { pnlPercent:6, sizePercent:50 } ], slPnlPercent:4 },
    sizing:{ maxPositionValuePercent:20, leverage:5, entries:[ { step:1, sizePercent:100 } ] },
  },
  {
    id:'ob_fvg_htf_timing',
    name:'OB/FVG 12H·4H·1H',
    desc:'상위 OB/FVG는 자리, 5분봉 RSI·거래량·종가 반전은 타이밍으로 씁니다.',
    indicators:[
      { type:'ob', key:'ob12h', tf:'12h', enabled:true },
      { type:'ob', key:'ob4h', tf:'4h', enabled:true },
      { type:'ob', key:'ob1h', tf:'1h', enabled:true },
      { type:'fvg', key:'fvg12h', tf:'12h', enabled:true },
      { type:'fvg', key:'fvg4h', tf:'4h', enabled:true },
      { type:'fvg', key:'fvg1h', tf:'1h', enabled:true },
      { type:'rsi', key:'rsi5m', tf:'5m', enabled:true },
      { type:'volume', key:'vol5m', tf:'5m', enabled:true },
    ],
    long:[
      { join:'AND', left:'ob12h.activeBullish * 3 + fvg12h.activeBullish * 3 + ob4h.activeBullish * 2 + fvg4h.activeBullish * 2 + ob1h.activeBullish + fvg1h.activeBullish', op:'>=', right:'2' },
    ],
    short:[
      { join:'AND', left:'ob12h.activeBearish * 3 + fvg12h.activeBearish * 3 + ob4h.activeBearish * 2 + fvg4h.activeBearish * 2 + ob1h.activeBearish + fvg1h.activeBearish', op:'>=', right:'2' },
    ],
    longTrigger:'close > previousClose AND volume > vol5m * 1.2 AND rsi5m > 30',
    shortTrigger:'close < previousClose AND volume > vol5m * 1.2 AND rsi5m < 70',
    execTf:'5m',
    days:2,
    exit:{ tp:[ { pnlPercent:3, sizePercent:50 }, { pnlPercent:6, sizePercent:50 } ], slPnlPercent:4 },
    sizing:{ maxPositionValuePercent:20, leverage:5, entries:[ { step:1, sizePercent:100 } ] },
  },
];
// 보조지표 카탈로그. '지표 추가'에서 선택 가능한 전체 목록.
const INDICATOR_CATALOG = {
  rsi:       { name:'RSI', hint:'과매수/과매도 구간', desc:'0~100 사이로 상승 압력의 세기를 나타냅니다. 30 아래면 과매도(낙폭 과대 → 반등 가능), 70 위면 과매수입니다. 역추세 매수는 보통 rsi <= 35 같은 조건을 씁니다.', params:[['period', 14, 2, 50], ['oversold', 35, 5, 50]] },
  ema:       { name:'EMA', hint:'추세 필터', desc:'지수이동평균. 최근 가격에 가중치를 더 줍니다. close > ema 면 상승 추세, 아래면 하락 추세로 봅니다. 추세를 거스르는 진입을 막는 필터로 자주 씁니다.', params:[['period', 200, 20, 400]] },
  sma:       { name:'SMA', hint:'단순 이동평균', desc:'정해진 기간의 단순 평균값입니다. EMA보다 느리게 반응해 큰 추세선이나 거래량 평균(volMa) 기준선으로 씁니다.', params:[['period', 50, 5, 300]] },
  macd:      { name:'MACD', hint:'모멘텀 변화', desc:'빠른 EMA−느린 EMA로 모멘텀을 봅니다. 히스토그램(macd.histogram)이 양수면 상승, 음수면 하락 힘입니다. 히스토그램이 직전 봉보다 커지면 하락 둔화/상승 가속 신호입니다.', params:[['fast', 12, 2, 40], ['slow', 26, 5, 80], ['signal', 9, 2, 30]] },
  atr:       { name:'ATR', hint:'손절/익절 거리', desc:'평균 캔들 변동폭(가격 단위)입니다. 방향이 아니라 변동성 크기만 나타냅니다. 손절·익절 거리나 분할매수 간격을 ATR 배수로 잡을 때 씁니다.', params:[['period', 14, 2, 50], ['stop x', 1.1, 0.5, 4]] },
  bollinger: { name:'Bollinger', hint:'변동성 밴드 · boll.upper / boll.lower / boll.percentB', desc:'이동평균을 중심으로 표준편차만큼 위아래 밴드를 그립니다. percentB는 밴드 내 위치로 0=하단, 1=상단입니다. 밴드 이탈/복귀로 변동성 매매를 합니다.', params:[['period', 20, 5, 80], ['std', 2, 1, 4]] },
  volume:    { name:'Volume', hint:'거래량 돌파', desc:'거래량과 그 이동평균(volMa)을 봅니다. volume > volMa * 1.5 처럼 평소보다 거래가 급증하면 움직임에 힘이 실린 것으로 해석합니다.', params:[['sma', 20, 5, 80], ['spike x', 1.5, 1, 4]] },
  fvg:       { name:'FVG', hint:'공정가치 갭 · fvg.bullish / fvg.mid', desc:'Fair Value Gap. 캔들 3개 사이에 메워지지 않은 가격 공백입니다. 가격이 되돌아와 갭을 채우는 경향을 이용합니다. active* 는 아직 안 채워진 살아있는 갭을 뜻합니다.', params:[] },
  ob:        { name:'Order Block', hint:'주문 블록 · ob.bullish / ob.high', desc:'급등·급락 직전의 마지막 반대 방향 캔들 구역입니다. 세력 주문이 쌓인 지지/저항으로 보고 그 구역에서 반응을 노립니다. active* 는 아직 유효한 블록입니다.', params:[['body ratio', 0.3, 0, 1]] },
};
const DEFAULT_INDICATOR_KEYS = {
  rsi:'rsi14',
  ema:'ema200',
  atr:'atr14',
  volume:'volumeMA20',
  bollinger:'boll',
  fvg:'fvg',
  ob:'ob',
};
const MULTI_INSTANCE_TYPES = new Set(['ob','fvg','bollinger']);
const ZONE_FIELDS = ['bullish','bearish','direction','low','high','mid','size','activeBullish','activeBearish','activeDirection','activeLow','activeHigh','activeMid','activeSize'];
const BOLL_FIELDS = ['upper','lower','mid','percentB'];
const MACD_FIELDS = ['histogram','histogram.previous'];

function makeIndicator(input, enabled) {
  const spec = typeof input === 'string' ? { type:input, enabled } : { ...input };
  const type = spec.type;
  const c = INDICATOR_CATALOG[type];
  const key = spec.key || defaultIndicatorKey(type, spec.tf);
  return { id:key, key, type, name:c.name, enabled:spec.enabled ?? !!enabled, tf:spec.tf || '', params:c.params.map(p => p.slice()) };
}
const indicators = [
  makeIndicator('rsi', true),
  makeIndicator('ema', true),
  makeIndicator('macd', true),
  makeIndicator('atr', true),
  makeIndicator('volume', false),
];
// 매수(롱) 진입 조건.
let conditions = [
  { join:'AND', left:'rsi', op:'<=', right:'35' },
  { join:'AND', left:'close', op:'>', right:'ema' },
  { join:'AND', left:'macd.histogram', op:'>', right:'macd.histogram.previous' },
];
// 매도(숏) 진입 조건. 롱의 거울(역추세). 비우면 숏 비활성.
let shortConditions = [
  { join:'AND', left:'rsi', op:'>=', right:'65' },
  { join:'AND', left:'close', op:'<', right:'ema' },
  { join:'AND', left:'macd.histogram', op:'<', right:'macd.histogram.previous' },
];
// 청산 규칙(구조화). TP/SL을 평단 대비 ATR 배수 거리로. 엔진이 롱/숏 방향 자동 적용.
let exitRules = {
  tp: [ { pnlPercent:3, sizePercent:30 }, { pnlPercent:6, sizePercent:30 }, { pnlPercent:10, sizePercent:40 } ],
  slPnlPercent: 4,
};
// 포지션 수량 규칙. maxPositionValuePercent 안에서 entries 비중대로 분할 진입한다.
let positionSizing = {
  maxPositionValuePercent: 25,
  leverage: 2,
  entries: [
    { step:1, sizePercent:25 },
    { step:2, sizePercent:25, atrMult:0.7 },
    { step:3, sizePercent:25, atrMult:1.2 },
    { step:4, sizePercent:25, atrMult:2.0 },
  ],
};
// 조건 조합기에서 쓸 수 있는 기본 신호 변수. 활성 지표 인스턴스 변수는 런타임에 더한다.
const BASE_SIGNAL_VARS = [
  ['가격', ['close','previousClose','high','low','price','avgEntry']],
  ['거래량', ['volume','volMa']],
  ['추세/모멘텀', ['rsi','ema','atr','macd.histogram','macd.histogram.previous']],
  ['볼린저', ['boll.upper','boll.lower','boll.mid','boll.percentB']],
  ['FVG', ['fvg.bullish','fvg.bearish','fvg.direction','fvg.low','fvg.high','fvg.mid','fvg.size']],
  ['활성 FVG', ['fvg.activeBullish','fvg.activeBearish','fvg.activeDirection','fvg.activeLow','fvg.activeHigh','fvg.activeMid','fvg.activeSize']],
  ['Order Block', ['ob.bullish','ob.bearish','ob.direction','ob.low','ob.high','ob.mid','ob.size']],
  ['활성 Order Block', ['ob.activeBullish','ob.activeBearish','ob.activeDirection','ob.activeLow','ob.activeHigh','ob.activeMid','ob.activeSize']],
  ['OB + FVG', ['obFvg.bullishConfluence','obFvg.bearishConfluence']],
];
const SIGNAL_VAR_LABELS = {
  close:'종가', previousClose:'이전 종가', high:'고가', low:'저가', price:'현재가', avgEntry:'평단',
  volume:'거래량', volMa:'평균 거래량',
  rsi:'RSI', ema:'EMA', atr:'ATR', 'macd.histogram':'MACD 히스토그램', 'macd.histogram.previous':'이전 MACD 히스토그램',
  'boll.upper':'볼린저 상단', 'boll.lower':'볼린저 하단', 'boll.mid':'볼린저 중앙', 'boll.percentB':'볼린저 %B',
  'fvg.bullish':'FVG 상승', 'fvg.bearish':'FVG 하락', 'fvg.direction':'FVG 방향', 'fvg.low':'FVG 하단', 'fvg.high':'FVG 상단', 'fvg.mid':'FVG 중앙', 'fvg.size':'FVG 크기',
  'fvg.activeBullish':'활성 Bullish FVG 안', 'fvg.activeBearish':'활성 Bearish FVG 안', 'fvg.activeDirection':'활성 FVG 방향', 'fvg.activeLow':'활성 FVG 하단', 'fvg.activeHigh':'활성 FVG 상단', 'fvg.activeMid':'활성 FVG 중앙', 'fvg.activeSize':'활성 FVG 크기',
  'ob.bullish':'오더블록 상승', 'ob.bearish':'오더블록 하락', 'ob.direction':'오더블록 방향', 'ob.low':'오더블록 하단', 'ob.high':'오더블록 상단', 'ob.mid':'오더블록 중앙', 'ob.size':'오더블록 크기',
  'ob.activeBullish':'활성 Bullish OB 안', 'ob.activeBearish':'활성 Bearish OB 안', 'ob.activeDirection':'활성 OB 방향', 'ob.activeLow':'활성 OB 하단', 'ob.activeHigh':'활성 OB 상단', 'ob.activeMid':'활성 OB 중앙', 'ob.activeSize':'활성 OB 크기',
  'obFvg.bullishConfluence':'Bullish OB+FVG 중첩', 'obFvg.bearishConfluence':'Bearish OB+FVG 중첩',
};
// 저장소: /api/strategies에서 불러온 영속 전략 + 미저장 현재 후보(currentCandidate).
let savedStrategies = [];
let currentCandidate = null;
// 마지막으로 백테스트한 config(빌더에서 만든 것 또는 저장소에서 불러온 것). 저장/적용 시 사용.
let activeBacktestConfig = null;

function $(id) { return document.getElementById(id); }
function currentView() {
  const raw = location.hash.replace('#', '') || 'dashboard';
  if (raw === 'strategy-lab') return 'strategy';
  if (['dashboard','logs','strategy','backtest','apply'].includes(raw)) return raw;
  return 'dashboard';
}
function route() {
  const view = currentView();
  $('appPage').dataset.view = view;
  document.querySelectorAll('.nav a').forEach(a => {
    const href = a.getAttribute('href') || '';
    const target = href.replace('#', '') || 'dashboard';
    const normalized = target === 'strategy-lab' ? 'strategy' : target;
    a.classList.toggle('active', normalized === view);
  });
  if (view === 'backtest') renderBacktestChart(lastBacktestResult, lastBacktestCandles);
  if (view === 'logs') renderTradeChart();
  window.scrollTo({ top:0, behavior:'auto' });
}
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function isLive(mode) { return mode === 'LIVE_SMALL' || mode === 'LIVE_FULL'; }
function isOn(mode) { return ['PAPER','TESTNET','LIVE_SMALL','LIVE_FULL'].includes(mode); }
function isFailedOrder(order) { return ['REJECTED','FAILED','ERROR'].includes(String(order.status || '').toUpperCase()); }
function pct(v, d = 2) { return Number.isFinite(Number(v)) ? Number(v).toFixed(d) + '%' : '-'; }
function num(v) { return Number.isFinite(Number(v)) ? Number(v).toLocaleString('en-US', { maximumFractionDigits:6 }) : '-'; }
function time(v) {
  if (!v) return '-';
  const d = typeof v === 'number' ? new Date(v) : new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('ko-KR', { hour12:false });
}
function dateShort(v) {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 10);
}
function ago(ts) {
  const ms = Date.now() - Number(ts);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const m = Math.floor(ms / 60000);
  if (m < 1) return '방금';
  if (m < 60) return m + 'm 전';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h 전';
  return Math.floor(h / 24) + 'd 전';
}
function signedClass(v) {
  const n = Number(v);
  if (n > 0) return 'up';
  if (n < 0) return 'down';
  return 'neutral';
}

async function load() {
  const [status, signals, orders] = await Promise.all([
    fetch('/api/status').then(r => r.json()),
    fetch('/api/signals').then(r => r.json()),
    fetch('/api/orders').then(r => r.json()),
  ]);
  state = { status, signals, orders };
  render();
}

async function loadHealth() {
  const el = $('execPill');
  if (!el) return;
  try {
    const h = await fetch('/api/health').then(r => r.json());
    const st = h.executor;
    const dot = st === 'ok' ? 'up' : st === 'none' ? '' : 'down';
    const txt = st === 'ok' ? 'exec OK' : st === 'none' ? 'exec 미설정' : 'exec DOWN';
    el.innerHTML = '<span class="dot ' + dot + '"></span>' + txt;
  } catch {
    el.innerHTML = '<span class="dot down"></span>exec DOWN';
  }
}

function render() {
  const mode = state.status.mode || 'OFF';
  const position = state.status.position;
  const live = state.status.live;
  const failedOrders = state.orders.filter(isFailedOrder);
  const pnl = Number(position?.realizedPnl ?? 0);

  $('modeBanner').className = isLive(mode) ? 'mode live' : 'mode';
  $('modeBanner').textContent = isLive(mode) ? 'LIVE MODE — 실제 자금으로 주문이 실행됩니다.' : mode + ' MODE — 모의/테스트 주문.';

  // 상태바: 모드 / 봇 / 마지막 신호 / executor / 실현 PnL.
  const botText = mode === 'ALERT_ONLY' ? 'ENTRY PAUSED' : isOn(mode) ? 'BOT ON' : 'BOT OFF';
  const botDot = mode === 'ALERT_ONLY' ? 'warn' : isOn(mode) ? 'up' : '';
  const botHtml = '<span class="dot ' + botDot + '"></span>' + botText;
  $('botPill').innerHTML = botHtml;
  $('botPill2').innerHTML = botHtml;

  $('modePill').textContent = mode;
  $('modePill').className = 'mpill mode-pill ' + (isLive(mode) ? 'live' : isOn(mode) ? 'test' : 'off');

  $('lastSignal').textContent = state.status.lastProcessedCandle ? ago(state.status.lastProcessedCandle) : '—';

  $('pnlNumber').textContent = (pnl >= 0 ? '+' : '') + num(pnl);
  $('pnlNumber').className = 'num ' + signedClass(pnl);

  renderLogs();
  renderTradeChart();
  renderBacktestChart(lastBacktestResult, lastBacktestCandles);
  renderStrategyBuilder();
  renderVersions();
  renderCompare();
  renderPosition(position, live);
  renderOrders(failedOrders);
}

// 라이브 매매 로그 차트(Lightweight Charts). 실제 4시간봉 + 주문 마커 + 평단선.
let liveChart = null, liveCandleSeries = null, liveCandles = null, liveLoading = false, livePriceLine = null;

function ensureLiveChart() {
  if (typeof LightweightCharts === 'undefined') return false;
  const el = $('tradeChart');
  if (!el || el.clientWidth === 0) return false;
  if (!liveChart) {
    liveChart = LightweightCharts.createChart(el, chartTheme(360));
    liveCandleSeries = liveChart.addCandlestickSeries({
      upColor:'#26a69a', downColor:'#ef5350', borderVisible:false,
      wickUpColor:'#26a69a', wickDownColor:'#ef5350',
    });
  }
  return true;
}

function loadLiveCandles() {
  if (liveLoading || liveCandles) return;
  liveLoading = true;
  fetch('/api/klines?symbol=BTCUSDT&interval=4h&limit=200')
    .then(r => r.json())
    .then(b => { liveCandles = (b && b.ok && b.candles) ? b.candles : []; })
    .catch(() => { liveCandles = []; })
    .finally(() => { liveLoading = false; renderTradeChart(); });
}

function renderTradeChart() {
  const orders = state.orders || [];
  if (!ensureLiveChart()) return; // 라이브러리 미로드 또는 뷰 숨김
  liveChart.applyOptions({ width: $('tradeChart').clientWidth });
  if (liveCandles === null) { $('chartSummary').textContent = 'loading…'; loadLiveCandles(); return; }
  if (!liveCandles.length) { $('chartSummary').textContent = 'no price data'; return; }

  const bars = liveCandles
    .map(c => ({ time: sec(c.t), open:c.o, high:c.h, low:c.l, close:c.c }))
    .filter((b, i, a) => i === 0 || b.time > a[i - 1].time);
  liveCandleSeries.setData(bars);
  const firstT = bars.length ? bars[0].time : 0;

  // 주문 마커: BUY ▲(아래) / SELL ▼(위) / 실패 ●(빨강). 캔들 openTime 축에 정렬.
  const markers = orders
    .filter(o => o.candle_open_time)
    .map(o => {
      const failed = isFailedOrder(o);
      const buy = String(o.side || '').toUpperCase() === 'BUY';
      return {
        time: sec(o.candle_open_time),
        position: buy ? 'belowBar' : 'aboveBar',
        color: failed ? '#ef5350' : (buy ? '#26a69a' : '#1e53e5'),
        shape: failed ? 'circle' : (buy ? 'arrowUp' : 'arrowDown'),
        text: failed ? 'FAIL' : (o.reason || o.side || ''),
      };
    })
    .filter(m => m.time >= firstT)
    .sort((a, b) => a.time - b.time);
  liveCandleSeries.setMarkers(markers);

  // 현재 포지션 평단선.
  if (livePriceLine) { liveCandleSeries.removePriceLine(livePriceLine); livePriceLine = null; }
  const position = state.status.position;
  if (position && position.avgEntryPrice) {
    livePriceLine = liveCandleSeries.createPriceLine({
      price: Number(position.avgEntryPrice), color:'#2962ff', lineWidth:1,
      lineStyle:2, axisLabelVisible:true, title:'평단',
    });
  }

  liveChart.timeScale().fitContent();
  $('chartSummary').textContent = markers.length ? markers.length + ' orders' : 'no orders';
}

// Lightweight Charts 인스턴스(뷰 전환마다 재생성하지 않고 재사용).
let btPriceChart = null, btCandleSeries = null;
let btEquityChart = null, btEquitySeries = null;
const sec = (ms) => Math.floor(Number(ms) / 1000);

function chartTheme(height) {
  return {
    height: height,
    layout: { background:{ color:'transparent' }, textColor:'#8b949e', fontSize:11 },
    grid: { vertLines:{ color:'rgba(255,255,255,.04)' }, horzLines:{ color:'rgba(255,255,255,.04)' } },
    rightPriceScale: { borderColor:'rgba(255,255,255,.08)' },
    timeScale: { borderColor:'rgba(255,255,255,.08)', timeVisible:false },
    crosshair: { mode:0 },
  };
}

function ensureBacktestCharts() {
  if (typeof LightweightCharts === 'undefined') return false;
  const priceEl = $('backtestChart');
  const eqEl = $('equityChart');
  if (!priceEl || priceEl.clientWidth === 0) return false; // 숨겨진 뷰에서는 0폭 → 생성 보류
  if (!btPriceChart) {
    btPriceChart = LightweightCharts.createChart(priceEl, chartTheme(340));
    btCandleSeries = btPriceChart.addCandlestickSeries({
      upColor:'#26a69a', downColor:'#ef5350', borderVisible:false,
      wickUpColor:'#26a69a', wickDownColor:'#ef5350',
    });
  }
  if (!btEquityChart && eqEl) {
    btEquityChart = LightweightCharts.createChart(eqEl, chartTheme(200));
    btEquitySeries = btEquityChart.addAreaSeries({
      lineColor:'#2962ff', topColor:'rgba(41,98,255,.25)', bottomColor:'rgba(41,98,255,.02)',
      lineWidth:2, priceLineVisible:false,
    });
  }
  return true;
}

function resizeBacktestCharts() {
  if (btPriceChart) btPriceChart.applyOptions({ width: $('backtestChart').clientWidth });
  if (btEquityChart) btEquityChart.applyOptions({ width: $('equityChart').clientWidth });
  if (liveChart) liveChart.applyOptions({ width: $('tradeChart').clientWidth });
}

function renderBacktestChart(result, candles) {
  if (!ensureBacktestCharts()) return; // 라이브러리 미로드 또는 뷰 숨김
  resizeBacktestCharts();
  const series = candles || lastBacktestCandles || [];
  const trades = (result && result.tradeList) || [];

  // 가격 캔들 (시간 오름차순, 중복 제거).
  const bars = series
    .map(c => ({ time: sec(c.t), open:c.o, high:c.h, low:c.l, close:c.c }))
    .filter((b, i, a) => i === 0 || b.time > a[i - 1].time);
  btCandleSeries.setData(bars);

  // 진입·청산 마커. 롱은 초록 ▲(아래), 숏은 빨강 ▼(위)로 방향 구분. 청산은 손익색.
  const markers = [];
  for (const t of trades) {
    const isLong = t.side === 'LONG';
    markers.push({
      time: sec(t.entryTime),
      position: isLong ? 'belowBar' : 'aboveBar',
      color: isLong ? '#26a69a' : '#ef5350',
      shape: isLong ? 'arrowUp' : 'arrowDown',
      text: (isLong ? 'LONG' : 'SHORT') + ' IN ' + num(t.avgEntry),
    });
    const winCls = t.pnl >= 0;
    markers.push({
      time: sec(t.exitTime),
      position: isLong ? 'aboveBar' : 'belowBar',
      color: winCls ? '#26a69a' : '#ef5350',
      shape: isLong ? 'arrowDown' : 'arrowUp',
      text: 'OUT ' + (t.pnl >= 0 ? '+' : '') + Math.round(t.pnl),
    });
  }
  markers.sort((a, b) => a.time - b.time);
  btCandleSeries.setMarkers(markers);

  // 자산 곡선.
  const eq = ((result && result.equityCurve) || [])
    .map(p => ({ time: sec(p.time), value: p.equity }))
    .filter((p, i, a) => i === 0 || p.time > a[i - 1].time);
  if (btEquitySeries) btEquitySeries.setData(eq);

  if (bars.length) { btPriceChart.timeScale().fitContent(); if (btEquityChart) btEquityChart.timeScale().fitContent(); }
  $('btChartHint').textContent = trades.length
    ? trades.length + '개 거래 · ▲진입 ▼청산 (숫자는 손익 USDT)'
    : '거래가 없습니다. 진입 조건을 완화해 보세요.';
}

function renderLogs() {
  $('logSummary').textContent = state.signals.length ? state.signals.length + ' logs' : 'empty';
  if (!state.signals.length) {
    $('logTimeline').innerHTML = '<div class="empty">아직 매매 판단 로그가 없습니다. Run once로 신호 평가를 먼저 생성하세요.</div>';
    return;
  }
  $('logTimeline').innerHTML = state.signals.slice(0, 8).map(s => {
    const score = Number(s.score || 0);
    const min = Number(s.min_score || 0);
    const passed = Boolean(s.passed);
    const riskPassed = Boolean(s.risk_passed);
    const width = Math.max(0, Math.min(100, min ? score / min * 100 : score));
    const reason = !riskPassed ? '리스크 엔진이 막았습니다.' : passed ? '점수 기준을 통과했습니다.' : '점수가 최소 기준에 못 미쳤습니다.';
    return '<article class="log-item ' + (!riskPassed ? 'block' : passed ? 'enter' : '') + '">' +
      '<div class="log-top"><div><div class="label num">' + esc(time(s.created_at)) + '</div><h3>' + esc(s.decision) + ' · ' + esc(s.symbol) + '</h3></div>' +
      '<span class="status ' + (!riskPassed ? 'bad' : passed ? 'ok' : 'warn') + '">' + (!riskPassed ? 'risk block' : passed ? 'entered' : 'hold') + '</span></div>' +
      '<div class="score"><span style="width:' + width + '%"></span></div>' +
      '<p class="muted" style="margin-top:8px;">총점 <span class="num">' + score + '</span> / 최소 <span class="num">' + min + '</span>. ' + reason + '</p>' +
    '</article>';
  }).join('');
}

function indicatorSummary(ind) {
  // 한눈에 보이는 현재 설정 요약. 예: "기간 14 · 과매도 35"
  const tf = ind.tf ? 'TF ' + ind.tf : '신호봉';
  const params = ind.params.map(p => p[0] + ' ' + p[1]).join(' · ');
  return tf + (params ? ' · ' + params : ' · 파라미터 없음');
}

function defaultIndicatorKey(type, tf) {
  if (MULTI_INSTANCE_TYPES.has(type) && tf) return typePrefix(type) + tf;
  return DEFAULT_INDICATOR_KEYS[type] || type;
}

function typePrefix(type) {
  return type === 'bollinger' ? 'boll' : type;
}

function uniqueIndicatorKey(base, ignoreIndex = -1) {
  const clean = String(base || 'ind').replace(/[^a-zA-Z0-9_]/g, '') || 'ind';
  if (!indicators.some((i, index) => index !== ignoreIndex && i.key === clean)) return clean;
  let n = 2;
  while (indicators.some((i, index) => index !== ignoreIndex && i.key === clean + n)) n++;
  return clean + n;
}

function nextIndicatorTf(type) {
  if (type === 'ob' || type === 'fvg') {
    return ['12h','4h','1h'].find(tf => !indicators.some(i => i.type === type && i.tf === tf)) || '4h';
  }
  if (type === 'bollinger') return '4h';
  return '';
}

function signalVarGroups() {
  const groups = BASE_SIGNAL_VARS.map(g => [g[0], g[1].slice()]);
  for (const ind of indicators.filter(i => i.enabled)) {
    const key = ind.key;
    if (!key) continue;
    if (['ob','fvg'].includes(ind.type) && key !== ind.type) {
      groups.push([ind.name + ' · ' + key, ZONE_FIELDS.map(f => key + '.' + f)]);
    } else if (ind.type === 'bollinger' && key !== 'boll') {
      groups.push([ind.name + ' · ' + key, BOLL_FIELDS.map(f => key + '.' + f)]);
    } else if (ind.type === 'macd' && key !== 'macd') {
      groups.push([ind.name + ' · ' + key, MACD_FIELDS.map(f => key + '.' + f)]);
    }
  }
  return groups;
}

function signalVarsFlat() {
  return signalVarGroups().reduce((a, g) => a.concat(g[1]), []);
}

function renderWizardShell() {
  const steps = $('wizardSteps');
  if (!steps) return;
  steps.innerHTML = WIZARD_STEPS.map(s => {
    const cls = wizardStep === s.step ? 'active' : wizardStep > s.step ? 'done' : '';
    const num = wizardStep > s.step ? '✓' : String(s.step);
    return '<button class="wizard-step ' + cls + '" type="button" onclick="setWizardStep(' + s.step + ')">' +
      '<span class="wstep-num">' + num + '</span><b>' + esc(s.title) + '</b>' +
    '</button>';
  }).join('');
  document.querySelectorAll('.wizard-panel').forEach(panel => {
    panel.classList.toggle('active', Number(panel.dataset.step) === wizardStep);
  });
  const prev = $('wizardPrev');
  const next = $('wizardNext');
  if (prev) prev.disabled = wizardStep <= 1;
  if (next) {
    next.textContent = wizardStep >= WIZARD_STEPS.length ? '백테스트 실행' : '다음';
    next.onclick = wizardStep >= WIZARD_STEPS.length ? previewBacktest : () => setWizardStep(wizardStep + 1);
  }
}

function setWizardStep(step) {
  wizardStep = Math.max(1, Math.min(WIZARD_STEPS.length, Number(step) || 1));
  renderWizardShell();
}

function renderPresetCards() {
  const host = $('presetGrid');
  if (!host) return;
  host.innerHTML = STRATEGY_PRESETS.map(p =>
    '<button class="preset-card ' + (activePreset === p.id ? 'active' : '') + '" type="button" onclick="applyPreset(\\'' + p.id + '\\')">' +
      '<b>' + esc(p.name) + '</b><span>' + esc(p.desc) + '</span>' +
    '</button>'
  ).join('');
}

function applyPreset(id) {
  const preset = STRATEGY_PRESETS.find(p => p.id === id) || STRATEGY_PRESETS[0];
  activePreset = preset.id;
  indicators.splice(0, indicators.length, ...preset.indicators.map((spec, index) => makeIndicator(spec, typeof spec === 'string' ? index < 4 : spec.enabled)));
  conditions = cloneRows(preset.long);
  shortConditions = cloneRows(preset.short);
  exitRules = {
    tp: preset.exit.tp.map(r => ({ ...r })),
    slPnlPercent: preset.exit.slPnlPercent,
  };
  positionSizing = {
    maxPositionValuePercent: preset.sizing.maxPositionValuePercent,
    leverage: preset.sizing.leverage,
    entries: preset.sizing.entries.map(r => ({ ...r })),
  };
  if ($('btExecTf')) $('btExecTf').value = preset.execTf || '';
  if ($('btDays')) $('btDays').value = String(preset.days || 2);
  if ($('longConfirmTrigger')) $('longConfirmTrigger').value = preset.longTrigger || '';
  if ($('shortConfirmTrigger')) $('shortConfirmTrigger').value = preset.shortTrigger || '';
  markBuilderEdited();
  renderStrategyBuilder();
}

function cloneRows(rows) {
  return rows.map(r => ({ ...r }));
}

function renderStrategyBuilder() {
  renderWizardShell();
  renderPresetCards();
  const active = indicators.filter(i => i.enabled).length;
  $('indicatorCount').textContent = active + ' / ' + indicators.length + ' active';

  // 지표 추가 바: 같은 타입도 여러 인스턴스로 추가할 수 있다.
  const addable = Object.keys(INDICATOR_CATALOG);
  $('indicatorAddBar').innerHTML =
    '<select onchange="if(this.value){addIndicator(this.value); this.value=\\'\\';}"' +
      (addable.length ? '' : ' disabled') + '>' +
      '<option value="">+ 보조지표 추가</option>' +
      addable.map(t => '<option value="' + t + '">' + esc(INDICATOR_CATALOG[t].name) + ' — ' + esc(INDICATOR_CATALOG[t].hint) + '</option>').join('') +
    '</select>';

  $('indicatorGrid').innerHTML = indicators.map((ind, index) => {
    const params = ind.params.map((p, paramIndex) => {
      const step = String(p[1]).includes('.') ? '0.1' : '1';
      return '<div class="param-row">' +
        '<span class="label">' + esc(p[0]) + '</span>' +
        '<input type="range" min="' + p[2] + '" max="' + p[3] + '" step="' + step + '" value="' + p[1] + '" oninput="setIndicatorParam(' + index + ',' + paramIndex + ', this.value, this)" />' +
        '<input type="number" step="' + step + '" value="' + p[1] + '" oninput="setIndicatorParam(' + index + ',' + paramIndex + ', this.value, this)" />' +
      '</div>';
    }).join('');
    return '<article class="indicator-card ' + (ind.enabled ? 'on' : 'off') + '">' +
      '<div class="ind-head">' +
        '<span class="ind-dot"></span>' +
        '<h3>' + esc(ind.name) + '</h3>' +
        '<span class="ind-hint">' + esc(ind.key) + ' · ' + indicatorHint(ind.type) + '</span>' +
        (indicatorDesc(ind.type) ? '<span class="ind-help" data-tip="' + esc(indicatorDesc(ind.type)) + '">?</span>' : '') +
        '<span class="spacer"></span>' +
        '<select class="ind-tf" title="이 지표 타임프레임 (MTF)" onchange="setIndicatorTf(' + index + ', this.value)">' + tfOptions(ind.tf) + '</select>' +
        '<label class="switch" title="' + esc(ind.name) + ' 사용"><input type="checkbox" ' + (ind.enabled ? 'checked' : '') + ' onchange="toggleIndicator(' + index + ')" /><span></span></label>' +
        '<button class="ind-remove" type="button" title="지표 제거" onclick="removeIndicator(' + index + ')">×</button>' +
      '</div>' +
      '<div class="ind-summary" id="indSummary' + index + '">' + esc(indicatorSummary(ind)) + '</div>' +
      '<div class="ind-params">' + params + '</div>' +
    '</article>';
  }).join('');

  const varsFlat = signalVarsFlat();
  $('conditionList').innerHTML = conditionRowsHtml(conditions, 'long') +
    '<datalist id="signalVars">' + varsFlat.map(v => '<option value="' + v + '"></option>').join('') + '</datalist>';
  $('shortConditionList').innerHTML = conditionRowsHtml(shortConditions, 'short') ||
    '<p class="muted" style="padding:4px 0;">숏 조건 없음 → 숏 진입 안 함. 위에서 말로 고르거나 "직접 추가".</p>';
  if ($('longRecipe')) $('longRecipe').innerHTML = recipeOptions('long');
  if ($('shortRecipe')) $('shortRecipe').innerHTML = recipeOptions('short');
  renderExitRules();
  renderSizingRules();
  $('builderStatus').textContent = (conditions.length + shortConditions.length) + ' conditions';
}

// 조건 행 HTML. which='long'|'short' 으로 어느 목록인지 핸들러에 전달.
function conditionRowsHtml(list, which) {
  return list.map((c, index) =>
    '<div class="condition-row">' +
      '<div class="condition-field"><span>연결</span><select onchange="setCondition(\\'' + which + '\\', ' + index + ', \\'join\\', this.value)"><option ' + selected(c.join, 'AND') + '>AND</option><option ' + selected(c.join, 'OR') + '>OR</option></select></div>' +
      '<div class="condition-field"><span>언제</span><select disabled><option>4시간봉 마감 시</option></select></div>' +
      '<div class="condition-field"><span>무슨 지표로</span><select onchange="setCondition(\\'' + which + '\\', ' + index + ', \\'left\\', this.value)">' + varOptions(c.left) + '</select></div>' +
      '<div class="condition-field"><span>지표의 무엇이 될 때</span><select onchange="setCondition(\\'' + which + '\\', ' + index + ', \\'op\\', this.value)">' + opOptions(c.op) + '</select></div>' +
      '<div class="condition-field"><span>기준값 또는 지표</span><input list="signalVars" value="' + esc(c.right) + '" oninput="setCondition(\\'' + which + '\\', ' + index + ', \\'right\\', this.value)" placeholder="예: 35 또는 ema" /></div>' +
      '<button class="icon-btn" type="button" title="조건 삭제" onclick="removeCondition(\\'' + which + '\\', ' + index + ')">×</button>' +
    '</div>'
  ).join('');
}

// 비전공자용 청산 프리셋. 익절 단계 + 손절을 한 번에 채운다 (PnL/ROE % 기준).
const EXIT_PRESETS = [
  { label:'🛡️ 안전 제일 (작게 먹고 빨리 손절)', tp:[{ pnlPercent:2, sizePercent:100 }], sl:1.5 },
  { label:'⚖️ 균형 (나눠 익절, 적당한 손절)',   tp:[{ pnlPercent:3, sizePercent:50 }, { pnlPercent:6, sizePercent:50 }], sl:3 },
  { label:'🚀 공격 (크게 노리고 넓은 손절)',     tp:[{ pnlPercent:6, sizePercent:50 }, { pnlPercent:12, sizePercent:50 }], sl:5 },
];

function exitPresetOptions() {
  return '<option value="">＋ 말로 청산 고르기 (쉬운 설정)</option>' +
    EXIT_PRESETS.map((p, i) => '<option value="' + i + '">' + esc(p.label) + '</option>').join('');
}

function applyExitPreset(idxStr) {
  if (idxStr === '') return;
  const p = EXIT_PRESETS[Number(idxStr)];
  if (!p) return;
  exitRules.tp = p.tp.map(r => ({ ...r }));
  exitRules.slPnlPercent = p.sl;
  $('builderStatus').className = 'status warn';
  $('builderStatus').textContent = 'edited';
  renderExitRules();
}

// 청산 규칙 UI: TP/SL을 PnL(ROE) % 기준으로 설정한다.
function renderExitRules() {
  const host = $('exitRulesBody');
  if (!host) return;
  if ($('exitPreset')) $('exitPreset').innerHTML = exitPresetOptions();
  const tpRows = exitRules.tp.map((r, i) =>
    '<div class="exit-row">' +
      '<div class="exit-field"><span>언제 익절</span><b>익절 ' + (i + 1) + '</b></div>' +
      '<div class="exit-field"><span>PNL/ROE가 +몇 %?</span><input type="number" step="0.1" min="0" value="' + exitPnlValue(r) + '" oninput="setExitTp(' + i + ', \\'pnlPercent\\', this.value)" placeholder="예: 5" /></div>' +
      '<div class="exit-field"><span>그때 팔 수량 %</span><input type="number" step="1" min="0" max="100" value="' + r.sizePercent + '" oninput="setExitTp(' + i + ', \\'sizePercent\\', this.value)" placeholder="예: 30" /></div>' +
      '<button class="icon-btn" type="button" title="TP 삭제" onclick="removeExitTp(' + i + ')">×</button>' +
    '</div>'
  ).join('');
  host.innerHTML = tpRows +
    '<div class="exit-row stop">' +
      '<div class="exit-field"><span>언제 손절</span><b>손절</b></div>' +
      '<div class="exit-field"><span>PNL/ROE가 -몇 %?</span><input type="number" step="0.1" min="0" value="' + exitRules.slPnlPercent + '" oninput="setExitSl(this.value)" placeholder="예: 4" /></div>' +
      '<div class="exit-field"><span>그때 정리 수량</span><b>남은 수량 전부</b></div>' +
    '</div>' +
    '<p class="exit-note">PNL/ROE 기준입니다. 예를 들어 레버리지 2x에서 +6% 익절은 가격이 약 +3% 움직였을 때 실행됩니다. 숏은 방향이 자동으로 반대로 적용됩니다.</p>';
}

function exitPnlValue(rule) {
  return rule.pnlPercent ?? 0;
}

function renderSizingRules() {
  const host = $('sizingRulesBody');
  if (!host) return;
  $('maxPositionPercent').value = positionSizing.maxPositionValuePercent;
  $('sizingLeverage').value = positionSizing.leverage;
  $('btLev').value = positionSizing.leverage + 'x';
  host.innerHTML = positionSizing.entries.map((r, i) =>
    '<div class="sizing-row">' +
      '<span class="muted">Step ' + r.step + '</span>' +
      '<input type="number" step="1" min="0" max="100" value="' + r.sizePercent + '" oninput="setSizingStep(' + i + ', \\'sizePercent\\', this.value)" placeholder="진입 비중%" />' +
      '<input type="number" step="0.1" min="0" value="' + (r.atrMult ?? '') + '" ' + (i === 0 ? 'disabled' : '') + ' oninput="setSizingStep(' + i + ', \\'atrMult\\', this.value)" placeholder="' + (i === 0 ? '첫 진입' : '추가 ATR배수') + '" />' +
      '<button class="icon-btn" type="button" title="단계 삭제" onclick="removeSizingStep(' + i + ')" ' + (positionSizing.entries.length <= 1 ? 'disabled' : '') + '>×</button>' +
    '</div>'
  ).join('');
}

function indicatorHint(id) {
  const c = INDICATOR_CATALOG[id];
  return c ? c.hint : 'custom';
}

function indicatorDesc(id) {
  const c = INDICATOR_CATALOG[id];
  return c ? c.desc : '';
}

function addIndicator(type) {
  if (!INDICATOR_CATALOG[type]) return;
  const tf = MULTI_INSTANCE_TYPES.has(type) ? nextIndicatorTf(type) : '';
  const key = uniqueIndicatorKey(defaultIndicatorKey(type, tf));
  indicators.push(makeIndicator({ type, key, tf, enabled:true }));
  renderStrategyBuilder();
}

function removeIndicator(index) {
  indicators.splice(index, 1);
  renderStrategyBuilder();
}

function selected(a, b) {
  return a === b ? 'selected' : '';
}

function opOptions(current) {
  const labels = {
    '<=':'이하가 될 때',
    '>=':'이상이 될 때',
    '>':'초과할 때',
    '<':'미만일 때',
    '==':'같아질 때',
    '!=':'다를 때',
  };
  return ['<=','>=','>','<','==','!=']
    .map(op => '<option value="' + op + '" ' + selected(current, op) + '>' + labels[op] + '</option>')
    .join('');
}

// left 드롭다운 옵션. 그룹별 optgroup, 목록에 없는 기존값은 살려서 첫 옵션으로.
function varOptions(current) {
  const groups = signalVarGroups();
  const flat = groups.reduce((a, g) => a.concat(g[1]), []);
  const extra = flat.indexOf(current) === -1
    ? '<option selected>' + esc(current) + '</option>'
    : '';
  return extra + groups.map(g =>
    '<optgroup label="' + g[0] + '">' +
    g[1].map(v => '<option value="' + esc(v) + '" ' + selected(current, v) + '>' + esc(signalVarLabel(v)) + '</option>').join('') +
    '</optgroup>'
  ).join('');
}

function signalVarLabel(v) {
  const match = String(v).match(/^([a-zA-Z_][a-zA-Z0-9_]*)\\.(.+)$/);
  if (match && !SIGNAL_VAR_LABELS[v]) {
    const ind = indicators.find(i => i.key === match[1]);
    if (ind) return ind.name + ' ' + match[1] + '.' + match[2] + ' (' + v + ')';
  }
  return (SIGNAL_VAR_LABELS[v] || v) + ' (' + v + ')';
}

// 지표 타임프레임 옵션. 빈값 = 신호봉(config.timeframe) 사용.
function tfOptions(current) {
  return ['', '1m', '3m', '5m', '15m', '1h', '4h', '12h', '1d', '1w']
    .map(tf => '<option value="' + tf + '"' + selected(current, tf) + '>' + (tf || '신호봉') + '</option>')
    .join('');
}

function setIndicatorTf(index, value) {
  const ind = indicators[index];
  const previousAutoKey = defaultIndicatorKey(ind.type, ind.tf);
  indicators[index].tf = value;
  if (MULTI_INSTANCE_TYPES.has(ind.type) && (!ind.key || ind.key === previousAutoKey)) {
    ind.key = uniqueIndicatorKey(defaultIndicatorKey(ind.type, value), index);
    ind.id = ind.key;
  }
  $('builderStatus').className = 'status warn';
  $('builderStatus').textContent = 'edited';
  renderStrategyBuilder();
}

function toggleIndicator(index) {
  indicators[index].enabled = !indicators[index].enabled;
  renderStrategyBuilder();
}

function setIndicatorParam(index, paramIndex, value, el) {
  indicators[index].params[paramIndex][1] = Number(value);
  // 같은 행의 짝(range<->number) 동기화 + 요약만 갱신 → 드래그 중 리렌더 안 함.
  if (el) {
    const row = el.closest('.param-row');
    if (row) row.querySelectorAll('input').forEach(inp => { if (inp !== el) inp.value = value; });
  }
  const sum = $('indSummary' + index);
  if (sum) sum.textContent = indicatorSummary(indicators[index]);
}

function condListOf(which) { return which === 'short' ? shortConditions : conditions; }

// 비전공자용 "말로 고르는" 조건 레시피. 문장 → 기술적 규칙(left/op/right)으로 자동 변환.
// 표준 변수만 사용(단일TF에서 항상 계산됨). side: 어느 방향 목록에 보일지.
const CONDITION_RECIPES = [
  { label:'📉 가격이 과하게 떨어졌을 때 (과매도·반등 노림)', side:'long',  cond:{ left:'rsi', op:'<=', right:'30' } },
  { label:'📈 가격이 과하게 올랐을 때 (과매수·하락 노림)',  side:'short', cond:{ left:'rsi', op:'>=', right:'70' } },
  { label:'🟢 상승 추세일 때 (장기평균선 위)',              side:'long',  cond:{ left:'close', op:'>', right:'ema' } },
  { label:'🔴 하락 추세일 때 (장기평균선 아래)',            side:'short', cond:{ left:'close', op:'<', right:'ema' } },
  { label:'🔊 거래량이 평소보다 많을 때 (관심 급증)',       side:'both',  cond:{ left:'volume', op:'>', right:'volMa * 1.5' } },
  { label:'⚡ 상승 힘이 살아날 때 (MACD 개선)',             side:'long',  cond:{ left:'macd.histogram', op:'>', right:'macd.histogram.previous' } },
  { label:'⚡ 하락 힘이 살아날 때 (MACD 악화)',             side:'short', cond:{ left:'macd.histogram', op:'<', right:'macd.histogram.previous' } },
  { label:'⬇️ 변동성 밴드 하단을 찍을 때 (싸진 신호)',      side:'long',  cond:{ left:'close', op:'<=', right:'boll.lower' } },
  { label:'⬆️ 변동성 밴드 상단을 찍을 때 (비싸진 신호)',    side:'short', cond:{ left:'close', op:'>=', right:'boll.upper' } },
  { label:'🟩 강세 주문블록(세력 매수) 구역에 있을 때',     side:'long',  cond:{ left:'ob.activeBullish', op:'==', right:'1' } },
  { label:'🟥 약세 주문블록(세력 매도) 구역에 있을 때',     side:'short', cond:{ left:'ob.activeBearish', op:'==', right:'1' } },
  { label:'🟦 강세 FVG(가격 공백) 구역에 있을 때',          side:'long',  cond:{ left:'fvg.activeBullish', op:'==', right:'1' } },
  { label:'🟧 약세 FVG(가격 공백) 구역에 있을 때',          side:'short', cond:{ left:'fvg.activeBearish', op:'==', right:'1' } },
];

// which 방향에 맞는 레시피만 옵션으로. (both는 양쪽 다 표시)
function recipeOptions(which) {
  const opts = CONDITION_RECIPES
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.side === 'both' || r.side === which)
    .map(({ r, i }) => '<option value="' + i + '">' + esc(r.label) + '</option>')
    .join('');
  return '<option value="">＋ 말로 조건 고르기 (쉬운 추가)</option>' + opts;
}

function addRecipe(which, idxStr) {
  if (idxStr === '') return;
  const r = CONDITION_RECIPES[Number(idxStr)];
  if (!r) return;
  condListOf(which).push({ join:'AND', left:r.cond.left, op:r.cond.op, right:r.cond.right });
  $('builderStatus').className = 'status warn';
  $('builderStatus').textContent = 'edited';
  renderStrategyBuilder();
}

// 지표(left)별 기본 연산자+기준값. left 선택 시 right를 알아서 채운다.
const COND_DEFAULTS = {
  close:        { op:'>',  right:'ema' },
  previousClose:{ op:'>',  right:'ema' },
  high:         { op:'>',  right:'ema' },
  low:          { op:'<',  right:'ema' },
  price:        { op:'>',  right:'ema' },
  avgEntry:     { op:'>',  right:'ema' },
  volume:       { op:'>',  right:'volMa * 1.5' },
  volMa:        { op:'>',  right:'0' },
  rsi:          { op:'<=', right:'35' },
  ema:          { op:'<',  right:'close' },
  atr:          { op:'>',  right:'0' },
  'macd.histogram':          { op:'>', right:'macd.histogram.previous' },
  'macd.histogram.previous': { op:'<', right:'macd.histogram' },
  'boll.upper': { op:'<', right:'close' },
  'boll.lower': { op:'>', right:'close' },
  'boll.mid':   { op:'>', right:'close' },
  'boll.percentB': { op:'<=', right:'0' },
};

// 맵에 없으면 SMC(FVG/OB) 계열은 이름 패턴으로 추정.
function defaultCondFor(left) {
  if (COND_DEFAULTS[left]) return COND_DEFAULTS[left];
  if (/(bullish|bearish|confluence|direction)$/i.test(left)) return { op:'==', right:'1' };
  if (/(low|high|mid)$/i.test(left)) return { op:'<', right:'close' };
  if (/size$/i.test(left)) return { op:'>', right:'0' };
  return { op:'>', right:'0' };
}

function setCondition(which, index, key, value) {
  const c = condListOf(which)[index];
  c[key] = value;
  // 지표가 바뀌면 연산자+기준값을 그 지표 디폴트로 채우고 다시 그린다.
  if (key === 'left') {
    const d = defaultCondFor(value);
    c.op = d.op;
    c.right = d.right;
    renderStrategyBuilder();
  }
  $('builderStatus').className = 'status warn';
  $('builderStatus').textContent = 'edited';
}

function addCondition(which) {
  const c = which === 'short'
    ? { join:'AND', left:'rsi', op:'>=', right:'65' }
    : { join:'AND', left:'volume', op:'>', right:'volMa * 1.5' };
  condListOf(which).push(c);
  renderStrategyBuilder();
}

function removeCondition(which, index) {
  condListOf(which).splice(index, 1);
  renderStrategyBuilder();
}

function setExitTp(i, key, value) {
  exitRules.tp[i][key] = Number(value);
  $('builderStatus').className = 'status warn';
  $('builderStatus').textContent = 'edited';
}
function removeExitTp(i) {
  exitRules.tp.splice(i, 1);
  renderStrategyBuilder();
}
function addExitTp() {
  exitRules.tp.push({ pnlPercent:5, sizePercent:0 });
  renderStrategyBuilder();
}
function setExitSl(value) {
  exitRules.slPnlPercent = Number(value);
  $('builderStatus').className = 'status warn';
  $('builderStatus').textContent = 'edited';
}

function setMaxPositionPercent(value) {
  const n = Number(value);
  positionSizing.maxPositionValuePercent = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 25;
  markBuilderEdited();
}

function setSizingLeverage(value) {
  const n = Number(String(value).replace(/[^0-9.]/g, ''));
  positionSizing.leverage = Number.isFinite(n) && n > 0 ? n : 1;
  $('btLev').value = positionSizing.leverage + 'x';
  $('sizingLeverage').value = positionSizing.leverage;
  markBuilderEdited();
}

function setSizingStep(i, key, value) {
  const n = Number(value);
  if (!positionSizing.entries[i]) return;
  positionSizing.entries[i][key] = Number.isFinite(n) ? n : 0;
  markBuilderEdited();
}

function addSizingStep() {
  const next = positionSizing.entries.length + 1;
  positionSizing.entries.push({ step:next, sizePercent:25, atrMult:1.5 });
  normalizeSizingSteps();
  renderStrategyBuilder();
}

function removeSizingStep(i) {
  if (positionSizing.entries.length <= 1) return;
  positionSizing.entries.splice(i, 1);
  normalizeSizingSteps();
  renderStrategyBuilder();
}

function normalizeSizingSteps() {
  positionSizing.entries = positionSizing.entries.map((r, i) => {
    const next = { ...r, step:i + 1, sizePercent:Number(r.sizePercent) || 0 };
    if (i === 0) delete next.atrMult;
    else next.atrMult = Number(next.atrMult) || 0;
    return next;
  });
}

function markBuilderEdited() {
  $('builderStatus').className = 'status warn';
  $('builderStatus').textContent = 'edited';
}

function generateStrategyDsl() {
  const lines = conditions.map((c, index) => (index === 0 ? 'IF ' : c.join + ' ') + c.left + ' ' + c.op + ' ' + c.right);
  $('strategyText').value = lines.join('\\n') + '\\nTHEN long_score += 70\\n\\nEXIT:\\ntake_profit when close >= avgEntry + atr * 1.8\\nstop_loss when close <= avgEntry - atr * 1.1\\n\\nRISK:\\nstop new entries when dailyLoss <= -2%';
  $('builderStatus').className = 'status ok';
  $('builderStatus').textContent = 'synced';
}

async function loadStrategies() {
  try {
    const list = await fetch('/api/strategies').then(r => r.json());
    savedStrategies = Array.isArray(list) ? list : [];
  } catch { savedStrategies = []; }
  renderVersions();
  renderCompare();
}

// 저장소 목록: 영속 전략 카드(불러오기/적용/삭제). 활성 전략은 status=active 배지.
function renderVersions() {
  const rows = [];
  if (currentCandidate) {
    rows.push(
      '<div class="mini-item"><div><b>현재 후보 (미저장)</b><br /><span>' + metricsLine(currentCandidate) + '</span></div>' +
      '<span class="status ' + (currentCandidate.passed ? 'ok' : 'warn') + '">' + (currentCandidate.passed ? '통과' : '미통과') + '</span></div>'
    );
  }
  if (!savedStrategies.length && !currentCandidate) {
    $('versionList').innerHTML = '<div class="empty">저장된 전략이 없습니다. 백테스트 후 저장하세요.</div>';
    return;
  }
  for (const s of savedStrategies) {
    const m = s.metrics;
    const badge = s.status === 'active' ? 'ok' : s.status === 'archived' ? '' : 'warn';
    const sid = esc(s.strategyId);
    rows.push(
      '<div class="mini-item"><div><b>' + esc(s.name) + '</b><br /><span>' +
        (m ? metricsLine(m) : '백테스트 지표 없음') + ' · ' + esc(s.symbol) + '</span>' +
        '<div class="actions" style="margin-top:6px;gap:6px;">' +
          '<button class="btn ghost" type="button" onclick="loadStrategy(\\'' + sid + '\\')">불러오기</button>' +
          (s.status === 'active' ? '' : '<button class="btn primary" type="button" onclick="activateStrategy(\\'' + sid + '\\')">적용</button>') +
          (s.status === 'active' ? '' : '<button class="btn ghost" type="button" onclick="deleteStrategy(\\'' + sid + '\\')">삭제</button>') +
        '</div>' +
      '</div>' +
      '<span class="status ' + badge + '">' + esc(s.status) + '</span></div>'
    );
  }
  $('versionList').innerHTML = rows.join('');
}

function metricsLine(m) {
  const ret = Number(m.returnPct ?? m.ret ?? 0);
  const win = Number(m.winRate ?? m.win ?? 0);
  const mdd = Number(m.mdd ?? 0);
  return '수익률 ' + (ret > 0 ? '+' : '') + ret.toFixed(1) + '% · 승률 ' + win.toFixed(1) + '% · MDD ' + mdd.toFixed(1) + '%';
}

async function saveStrategyVersion() {
  if (!lastBacktestResult) { alert('먼저 백테스트를 실행한 뒤 저장하세요.'); return; }
  const name = (prompt('저장할 전략 이름', '내 전략 ' + new Date().toISOString().slice(0, 16).replace('T', ' ')) || '').trim();
  if (!name) return;
  const config = activeBacktestConfig || buildStrategyConfig();
  config.name = name;
  const metrics = currentBacktestMetrics();
  try {
    const res = await fetch('/api/strategies', {
      method:'POST', headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ config, name, metrics }),
    });
    const body = await res.json();
    if (!res.ok || !body.ok) throw new Error(body.error || '저장 실패');
  } catch (err) {
    alert('저장하지 못했습니다.\\n' + (err instanceof Error ? err.message : String(err)));
    return;
  }
  currentCandidate = null;
  await loadStrategies();
  alert('전략을 저장소에 저장했습니다.');
}

// 불러오기: 저장된 config로 바로 백테스트 실행 → 결과/적용 화면으로. 빌더는 안 건드림.
function loadStrategy(strategyId) {
  const s = savedStrategies.find(x => x.strategyId === strategyId);
  if (!s) return;
  previewBacktest(s.config);
}

async function activateStrategy(strategyId) {
  const s = savedStrategies.find(x => x.strategyId === strategyId);
  if (!confirm('"' + (s ? s.name : strategyId) + '"를 봇에 적용할까요? 같은 심볼의 기존 활성 전략은 보관됩니다.')) return;
  try {
    const res = await fetch('/api/strategies/activate', {
      method:'POST', headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ strategyId }),
    });
    const body = await res.json();
    if (!res.ok || !body.ok) throw new Error(body.error || '적용 실패');
  } catch (err) {
    alert('적용하지 못했습니다.\\n' + (err instanceof Error ? err.message : String(err)));
    return;
  }
  await loadStrategies();
  alert('전략을 봇에 적용했습니다. 다음 4시간봉 마감부터 이 전략으로 판단합니다.');
}

async function deleteStrategy(strategyId) {
  const s = savedStrategies.find(x => x.strategyId === strategyId);
  if (!confirm('"' + (s ? s.name : strategyId) + '"를 삭제할까요?')) return;
  try {
    const res = await fetch('/api/strategies/delete', {
      method:'POST', headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ strategyId }),
    });
    const body = await res.json();
    if (!res.ok || !body.ok) throw new Error(body.error || '삭제 실패');
  } catch (err) {
    alert('삭제하지 못했습니다.\\n' + (err instanceof Error ? err.message : String(err)));
    return;
  }
  await loadStrategies();
}

function renderCompare() {
  const items = [];
  if (currentCandidate) items.push({ name:'현재 후보', m:currentCandidate });
  for (const s of savedStrategies) if (s.metrics) items.push({ name:s.name, m:s.metrics });
  const top = items.slice(0, 3);
  if (!top.length) { $('compareGrid').innerHTML = '<div class="empty">비교할 백테스트 결과가 없습니다.</div>'; return; }
  const rets = top.map(v => Number(v.m.returnPct ?? v.m.ret ?? 0));
  const bestRet = Math.max.apply(null, rets);
  $('compareGrid').innerHTML = top.map((v, i) => {
    const ret = rets[i];
    const win = Number(v.m.winRate ?? v.m.win ?? 0);
    const mdd = Number(v.m.mdd ?? 0);
    const pf = Number(v.m.pf ?? 0);
    return '<article class="compare-card ' + (ret === bestRet ? 'best' : '') + '">' +
      '<span class="label">' + esc(v.name) + '</span>' +
      '<b class="num ' + signedClass(ret) + '">' + (ret > 0 ? '+' : '') + ret.toFixed(1) + '%</b>' +
      '<div class="tag-row"><span class="tag">승률 ' + win.toFixed(1) + '%</span><span class="tag">MDD ' + mdd.toFixed(1) + '%</span><span class="tag">PF ' + (Number.isFinite(pf) ? pf.toFixed(2) : '∞') + '</span></div>' +
    '</article>';
  }).join('');
}

function currentBacktestMetrics() {
  if (lastBacktestResult) return metricsFromResult(lastBacktestResult);
  return { returnPct:0, winRate:0, mdd:0, pf:0, payoff:0, trades:0 };
}

function metricsFromResult(result) {
  const wins = result.tradeList.filter(t => t.pnl >= 0);
  const losses = result.tradeList.filter(t => t.pnl < 0);
  const avgWin = wins.length ? wins.reduce((sum, t) => sum + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0) / losses.length) : 0;
  const rawPf = result.profitFactor == null && wins.length && !losses.length ? Infinity : Number(result.profitFactor || 0);
  return {
    returnPct: Number(result.totalReturnPercent || 0),
    winRate: Number(result.winRatePercent || 0),
    mdd: -Number(result.maxDrawdownPercent || 0),
    pf: rawPf,
    payoff: avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0,
    trades: Number(result.trades || 0),
  };
}

function renderBacktestSummary(metrics) {
  const returnOk = metrics.returnPct > 35;
  const mddOk = metrics.mdd > -20;
  const pfOk = metrics.pf >= 1.2;
  const passed = returnOk && mddOk && pfOk;
  const box = $('btSummaryBox');
  if (!box) return;
  box.className = 'verdict ' + (passed ? 'ok' : 'warn');
  $('verdictBadge').textContent = passed ? '✅' : '⚠️';
  $('btSummaryStatus').className = 'verdict-tag';
  $('btSummaryStatus').textContent = passed ? '통과' : '개선 필요';
  $('btSummaryTitle').textContent = passed ? '실거래 적용 가능한 전략입니다' : '아직 개선이 필요합니다';
  $('btSummaryCopy').textContent = passed
    ? '수익률·MDD·손익비(PF) 기준을 모두 통과했습니다. 아래 차트에서 진입/청산 위치를 확인한 뒤 적용하세요.'
    : nextBacktestAdvice(metrics, { returnOk, mddOk, pfOk });
  $('verdictCta').hidden = !passed;
  $('btCriteria').innerHTML =
    criteriaHtml('수익률', (metrics.returnPct > 0 ? '+' : '') + metrics.returnPct.toFixed(1) + '%', returnOk, '+35% 이상') +
    criteriaHtml('최대 낙폭', metrics.mdd.toFixed(1) + '%', mddOk, '-20% 이내') +
    criteriaHtml('손익비(PF)', Number.isFinite(metrics.pf) ? metrics.pf.toFixed(2) : '∞', pfOk, '1.2 이상') +
    criteriaHtml('거래 수', String(metrics.trades), metrics.trades > 0, '1회 이상');
}

function criteriaHtml(label, value, ok, target) {
  return '<div class="criteria ' + (ok ? 'ok' : 'warn') + '">' +
    '<span><span class="criteria-mark">' + (ok ? '✓' : '✗') + '</span>' + esc(label) + ' · ' + esc(target) + '</span>' +
    '<b>' + esc(value) + '</b></div>';
}

function nextBacktestAdvice(metrics, checks) {
  if (!metrics.trades) return '거래가 없습니다. 진입 조건을 완화하거나 백테스트 기간을 늘려 먼저 거래가 발생하는지 확인하세요.';
  if (!checks.returnOk) return '수익률 기준을 넘지 못했습니다. 프리셋을 바꾸거나 진입 조건과 TP 거리를 조정해 보세요.';
  if (!checks.mddOk) return '최대 낙폭이 큽니다. 최대 포지션 비중, 레버리지, 추가 진입 단계를 낮춰 리스크를 줄여보세요.';
  if (!checks.pfOk) return 'Profit Factor가 낮습니다. 손절 거리를 줄이거나 익절 비중과 진입 조건을 다시 점검해 보세요.';
  return '핵심 기준 일부가 부족합니다. 아래 차트에서 손실 구간을 먼저 확인하세요.';
}

async function runParameterSearch() {
  const profile = ($('searchProfile') && $('searchProfile').value) || 'balanced';
  const rr = Math.max(1, Number(($('searchRr') && $('searchRr').value) || 1.5));
  const maxCombos = Math.max(4, Math.min(48, Number(($('searchMaxCombos') && $('searchMaxCombos').value) || 18)));
  const combos = buildIndicatorSearchCombos(maxCombos);
  const rows = [];
  if (!combos.length) {
    $('searchResults').innerHTML = '<div class="empty">탐색할 활성 보조지표가 부족합니다. 지표 세부 설정에서 최소 2개 이상 켜주세요.</div>';
    return;
  }
  $('searchResults').innerHTML = '<div class="empty">현재 활성 보조지표 조합으로 후보 전략을 백테스트 중입니다.</div>';
  for (const combo of combos) {
    try {
      const config = buildSearchConfig(combo, rr);
      const response = await fetch('/api/backtest', {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body:JSON.stringify({
          config,
          years:parseBacktestYears(),
          days:parseSearchBacktestDays(),
          startEquity:parseCapital(),
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || '백테스트 실패');
      const m = metricsFromResult(body.result);
      rows.push({ combo:combo.name, ret:m.returnPct, win:m.winRate, mdd:m.mdd, pf:m.pf, trades:m.trades, config });
    } catch (err) {
      rows.push({ combo:combo.name, error:err instanceof Error ? err.message : String(err) });
    }
  }
  rows.sort((a, b) => searchRank(b, profile) - searchRank(a, profile));
  $('searchResults').innerHTML = rows.map((r, index) => {
    const summary = r.error
      ? '실패 · ' + esc(r.error)
      : '수익률 ' + (r.ret > 0 ? '+' : '') + r.ret.toFixed(1) + '% · 승률 ' + r.win.toFixed(1) + '% · MDD ' + r.mdd.toFixed(1) + '% · PF ' + (Number.isFinite(r.pf) ? r.pf.toFixed(2) : '∞') + ' · 거래 ' + r.trades;
    return '<div class="mini-item"><div><b>#' + (index + 1) + ' ' + esc(r.combo) + '</b><br /><span>' + summary + '</span></div></div>';
  }).join('');
}

function buildIndicatorSearchCombos(limit) {
  const zone = buildZoneSearchTemplate();
  const timing = indicators
    .filter(i => i.enabled)
    .map(indicatorSearchTemplate)
    .filter(Boolean)
    .filter(t => !t.zone && (t.long || t.short));
  const out = [];
  const add = (name, longParts, shortParts) => {
    const long = leftExpr(longParts.filter(Boolean));
    const short = leftExpr(shortParts.filter(Boolean));
    if (!long && !short) return;
    const key = name + '|' + long + '|' + short;
    if (out.some(x => x.key === key)) return;
    out.push({ key, name, long, short });
  };

  if (zone) {
    for (const threshold of [1, 2, 3]) {
      add(zone.label + ' >= ' + threshold, [zone.longScore + ' >= ' + threshold], [zone.shortScore + ' >= ' + threshold]);
      for (let size = 1; size <= Math.min(2, timing.length); size++) {
        for (const group of combinations(timing, size)) {
          add(
            zone.label + '>=' + threshold + ' + ' + group.map(t => t.label).join(' + '),
            [zone.longScore + ' >= ' + threshold, ...group.map(t => t.long)],
            [zone.shortScore + ' >= ' + threshold, ...group.map(t => t.short)],
          );
          if (out.length >= limit) return out;
        }
      }
    }
    return out.slice(0, limit);
  }

  for (let size = 1; size <= Math.min(3, timing.length); size++) {
    for (const group of combinations(timing, size)) {
      add(group.map(t => t.label).join(' + '), group.map(t => t.long), group.map(t => t.short));
      if (out.length >= limit) return out;
    }
  }
  return out.slice(0, limit);
}

function indicatorSearchTemplate(ind) {
  const key = searchVariableKey(ind);
  const label = key || ind.type;
  if (ind.type === 'ob' || ind.type === 'fvg') {
    return { label, zone:true };
  }
  if (ind.type === 'rsi') {
    return { label, long:key + ' > 30', short:key + ' < 70' };
  }
  if (ind.type === 'volume') {
    return { label, long:'volume > ' + key + ' * 1.2', short:'volume > ' + key + ' * 1.2' };
  }
  if (ind.type === 'macd') {
    return { label, long:key + '.histogram > ' + key + '.histogram.previous', short:key + '.histogram < ' + key + '.histogram.previous' };
  }
  if (ind.type === 'ema' || ind.type === 'sma') {
    return { label, long:'close > ' + key, short:'close < ' + key };
  }
  if (ind.type === 'bollinger') {
    return { label, long:'close <= ' + key + '.lower', short:'close >= ' + key + '.upper' };
  }
  return null;
}

function buildZoneSearchTemplate() {
  const zoneIndicators = indicators.filter(i => i.enabled && (i.type === 'ob' || i.type === 'fvg'));
  if (!zoneIndicators.length) return null;
  const longTerms = [];
  const shortTerms = [];
  for (const ind of zoneIndicators) {
    const key = searchVariableKey(ind);
    const weight = zoneWeight(ind);
    longTerms.push(key + '.activeBullish * ' + weight);
    shortTerms.push(key + '.activeBearish * ' + weight);
  }
  return {
    label:'상위 OB/FVG 구역',
    longScore:longTerms.join(' + '),
    shortScore:shortTerms.join(' + '),
  };
}

function zoneWeight(ind) {
  if (ind.tf === '12h' || ind.tf === '1d' || ind.tf === '1w') return 3;
  if (ind.tf === '4h') return 2;
  return 1;
}

function searchUsesMtf() {
  return Boolean(($('btExecTf') && $('btExecTf').value) || indicators.some(i => i.enabled && i.tf));
}

function searchVariableKey(ind) {
  if (searchUsesMtf()) return ind.key;
  if (ind.type === 'rsi') return 'rsi';
  if (ind.type === 'ema') return 'ema';
  if (ind.type === 'atr') return 'atr';
  if (ind.type === 'volume') return 'volMa';
  if (ind.type === 'macd') return 'macd';
  if (ind.type === 'bollinger') return 'boll';
  if (ind.type === 'ob') return 'ob';
  if (ind.type === 'fvg') return 'fvg';
  return ind.key;
}

function leftExpr(parts) {
  return parts.map(p => '(' + p + ')').join(' AND ');
}

function combinations(items, size) {
  const out = [];
  const walk = (start, pick) => {
    if (pick.length === size) { out.push(pick.slice()); return; }
    for (let i = start; i < items.length; i++) {
      pick.push(items[i]);
      walk(i + 1, pick);
      pick.pop();
    }
  };
  walk(0, []);
  return out;
}

function buildSearchConfig(combo, rr) {
  const config = buildStrategyConfig();
  const sl = Number(config.exit.stopLoss?.pct ?? 0.6);
  config.name = 'Auto search · ' + combo.name;
  if (!config.executionTimeframe && searchUsesMtf()) config.executionTimeframe = '5m';
  config.entry.long = {
    enabled:Boolean(combo.long),
    minimumScore:0,
    hardFilters:combo.long ? [{ left:combo.long, operator:'==', right:1, description:'자동 지표 조합 롱' }] : [],
    scoreRules:[],
  };
  config.entry.short = {
    enabled:Boolean(combo.short),
    minimumScore:0,
    hardFilters:combo.short ? [{ left:combo.short, operator:'==', right:1, description:'자동 지표 조합 숏' }] : [],
    scoreRules:[],
  };
  config.exit.stopLoss = { sizePercent:100, pct:sl };
  config.exit.takeProfit = [{ sizePercent:100, pct:Math.round(sl * rr * 100) / 100 }];
  return config;
}

function searchRank(r, profile) {
  if (r.error) return -Infinity;
  const pf = Number.isFinite(r.pf) ? r.pf : 3;
  if (profile === 'highWin') return r.win * 2 + pf * 20 + r.ret - Math.abs(r.mdd) * 1.5 + Math.min(r.trades, 100) * 0.1;
  if (profile === 'highReturn') return r.ret * 2 + pf * 25 - Math.abs(r.mdd) + Math.min(r.trades, 100) * 0.05;
  return r.ret + r.win + pf * 20 - Math.abs(r.mdd) + Math.min(r.trades, 100) * 0.08;
}

function renderPosition(position, live) {
  const body = $('positionBody');
  if (!position) {
    $('positionChip').className = 'status';
    $('positionChip').textContent = 'FLAT';
    body.className = '';
    body.innerHTML = '<div class="pos-flat">보유 포지션 없음</div>';
    return;
  }
  $('positionChip').className = 'status ' + (position.side === 'LONG' ? 'ok' : 'bad');
  $('positionChip').textContent = position.side + ' · v' + position.strategyVersion;

  const cell = (k, v, cls) => '<div class="pos-cell"><span class="k">' + esc(k) + '</span><b class="v ' + (cls || '') + '">' + v + '</b></div>';
  const dash = '<span class="muted">—</span>';

  let cells = '';
  cells += cell('SIDE', '<span class="' + (position.side === 'LONG' ? 'up' : 'down') + '">' + esc(position.side) + '</span>', 'num');
  cells += cell('진입가', num(position.avgEntryPrice), 'num');
  cells += cell('수량', num(position.totalSize) + ' · ' + position.currentStep + '/' + position.maxStep, 'num');

  if (live) {
    const up = Number(live.unrealizedPnl);
    cells += cell('현재가', num(live.markPrice), 'num');
    cells += cell('미실현', (up >= 0 ? '+' : '') + num(up) + ' USDT', 'num ' + signedClass(up));
    cells += cell('노출액', num(live.notional) + ' USDT · ' + num(live.leverage) + 'x', 'num');
    const liq = live.liqDistancePct;
    const liqStr = (liq == null) ? dash
      : num(live.liquidationPrice) + ' (' + liq.toFixed(1) + '%)';
    cells += cell('청산가 (거리)', liqStr, 'num' + (liq != null && liq < 10 ? ' liq-near' : ''));
  } else {
    cells += cell('현재가', dash, 'num');
    cells += cell('미실현', dash, 'num');
    cells += cell('노출액', dash, 'num');
    cells += cell('청산가 (거리)', dash, 'num');
  }
  cells += cell('실현 PnL', (Number(position.realizedPnl) >= 0 ? '+' : '') + num(position.realizedPnl) + ' USDT', 'num ' + signedClass(position.realizedPnl));

  body.className = 'pos-panel';
  body.innerHTML = cells;
}


function renderOrders(failedOrders) {
  $('orderChip').className = 'status ' + (failedOrders.length ? 'bad' : 'ok');
  $('orderChip').textContent = failedOrders.length ? failedOrders.length + ' failed' : '정상';
  if (!state.orders.length) {
    $('ordersBody').innerHTML = '<div class="empty">최근 주문 없음</div>';
    return;
  }
  const rows = state.orders.slice(0, 6).map(o =>
    '<tr><td class="num">' + esc(time(o.created_at)) + '</td><td>' + esc(o.side) + '</td><td class="num">' + esc(num(o.qty)) + '</td><td class="num">' + esc(num(o.price)) + '</td><td><span class="status ' + (isFailedOrder(o) ? 'bad' : 'ok') + '">' + esc(o.status) + '</span></td></tr>'
  ).join('');
  $('ordersBody').innerHTML = '<div class="table-wrap"><table><thead><tr><th>Time</th><th>Side</th><th>Qty</th><th>Price</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function setEditorMode(mode) {
  editorMode = mode;
  $('scriptTab').className = 'tab ' + (mode === 'script' ? 'active' : '');
  $('mathTab').className = 'tab ' + (mode === 'math' ? 'active' : '');
  $('strategyText').value = mode === 'script'
    ? 'IF rsi <= 35\\nAND close > ema\\nAND macd.histogram > macd.histogram.previous\\nTHEN long_score += 70\\n\\nSCALE IN:\\nstep2 when price <= avgEntry - atr * 0.7\\nstep3 when price <= avgEntry - atr * 1.2\\n\\nRISK:\\nstop new entries when dailyLoss <= -2%'
    : '아이디어:\\n평균 회귀는 EMA200 위에서만 허용한다.\\nRSI가 35 이하일 때 과매도 가능성을 보고, MACD 히스토그램이 이전 봉보다 개선될 때 하락 둔화를 확인한다.\\n\\n리스크:\\n손실 제한은 전략 점수보다 우선한다.\\n청산가 거리 5% 미만이면 신규 진입을 금지한다.';
}

function buildStrategyConfig(overrides = {}) {
  const symbol = $('btSymbol').value.trim().toUpperCase() || 'BTCUSDT';
  const longExpr = conditionExpression(conditions);
  const shortExpr = conditionExpression(shortConditions);
  const filtersFrom = (expr) => expr
    ? [{ left: expr, operator: '==', right: 1, description: '조건 조합기 전체 통과' }]
    : [];
  const execTf = ($('btExecTf') && $('btExecTf').value) || '';
  const longTrigger = ($('longConfirmTrigger') && $('longConfirmTrigger').value.trim()) || '';
  const shortTrigger = ($('shortConfirmTrigger') && $('shortConfirmTrigger').value.trim()) || '';
  const indicatorConfig = buildIndicatorConfig(overrides);

  return {
    strategyId:'lab_strategy_' + Date.now(),
    name:'무한 백테스트 후보',
    symbol,
    market:'BINANCE_USDM_FUTURES',
    timeframe:'4h',
    ...(execTf ? { executionTimeframe: execTf } : {}),
    mode:'backtest',
    indicators:indicatorConfig,
    entry:{
      long:{
        enabled:true,
        minimumScore:0,
        hardFilters:filtersFrom(longExpr),
        scoreRules:[],
        ...(longTrigger ? { confirmTrigger: longTrigger } : {}),
      },
      short:{
        enabled:shortConditions.length > 0,
        minimumScore:0,
        hardFilters:filtersFrom(shortExpr),
        scoreRules:[],
        ...(shortTrigger ? { confirmTrigger: shortTrigger } : {}),
      },
    },
    positionSizing:{
      type:'atr_based',
      maxPositionValuePercent:Number(positionSizing.maxPositionValuePercent),
      leverage:parseLeverage(),
      entries:positionSizing.entries.map((r, i) => i === 0
        ? { step:i + 1, sizePercent:Number(r.sizePercent) }
        : { step:i + 1, sizePercent:Number(r.sizePercent), atrMult:Number(r.atrMult) }),
    },
    exit:{
      takeProfit:exitRules.tp.map(r => ({ sizePercent:Number(r.sizePercent), pnlPercent:Number(r.pnlPercent) })),
      stopLoss:{ sizePercent:100, pnlPercent:Number(exitRules.slPnlPercent) },
      trailingStop:{ enabled:false, sizePercent:0, atrMultiplier:1.5 },
    },
    risk:{
      maxDailyLossPercent:2,
      maxWeeklyLossPercent:5,
      maxConsecutiveLosses:3,
      minLiquidationDistancePercent:5,
      maxOpenPositions:1,
      disableNewEntryWhenOrderPending:true,
    },
  };
}

function conditionExpression(list) {
  return list
    .filter(c => c.left.trim() && c.op.trim() && String(c.right).trim())
    .map((c, index) => {
      const expr = c.left.trim() + ' ' + c.op + ' ' + String(c.right).trim();
      return (index === 0 ? '' : ' ' + c.join + ' ') + '(' + expr + ')';
    })
    .join('');
}

function getIndicator(id) {
  return indicators.find(i => i.id === id || i.key === id || i.type === id);
}

function getParam(indicator, name, fallback) {
  const row = indicator?.params.find(p => p[0] === name);
  return row ? row[1] : fallback;
}

function buildIndicatorConfig(overrides = {}) {
  const out = {};
  for (const ind of indicators) {
    if (!ind.enabled) continue;
    out[ind.key] = indicatorConfigSpec(ind, overrides);
  }
  return out;
}

function indicatorConfigSpec(ind, overrides = {}) {
  const tf = ind.tf ? { timeframe:ind.tf } : {};
  if (ind.type === 'rsi') return { type:'RSI', period:Number(overrides.rsiPeriod ?? getParam(ind, 'period', 14)), ...tf };
  if (ind.type === 'ema') return { type:'EMA', period:Number(overrides.emaPeriod ?? getParam(ind, 'period', 200)), ...tf };
  if (ind.type === 'sma') return { type:'SMA', period:Number(getParam(ind, 'period', 50)), ...tf };
  if (ind.type === 'macd') return { type:'MACD', fast:Number(getParam(ind, 'fast', 12)), slow:Number(getParam(ind, 'slow', 26)), signal:Number(getParam(ind, 'signal', 9)), ...tf };
  if (ind.type === 'atr') return { type:'ATR', period:Number(getParam(ind, 'period', 14)), ...tf };
  if (ind.type === 'volume') return { type:'SMA', source:'volume', period:Number(getParam(ind, 'sma', 20)), ...tf };
  if (ind.type === 'bollinger') return { type:'BOLL', period:Number(getParam(ind, 'period', 20)), std:Number(getParam(ind, 'std', 2)), ...tf };
  if (ind.type === 'fvg') return { type:'FVG', ...tf };
  if (ind.type === 'ob') return { type:'OB', minBodyRatio:Number(getParam(ind, 'body ratio', 0)), ...tf };
  return { type:String(ind.type).toUpperCase(), ...tf };
}

function parseLeverage() {
  const n = Number(String($('btLev').value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 2;
}

function parseCapital() {
  const n = Number(String($('btCapital').value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 10000;
}

function parseBacktestDays() {
  const n = Number(String(($('btDays') && $('btDays').value) || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.min(14, n) : 2;
}

function parseSearchBacktestDays() {
  return searchUsesMtf() ? 14 : parseBacktestDays();
}

function parseBacktestYears() {
  const raw = $('btRange').value;
  const dates = raw.match(/\\d{4}-\\d{2}-\\d{2}/g);
  if (dates && dates.length >= 2) {
    const start = new Date(dates[0]).getTime();
    const end = new Date(dates[1]).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return Math.max(0.25, Math.min(8, (end - start) / 365 / 86400_000));
    }
  }
  return 3;
}

async function previewBacktest(configOverride) {
  const config = configOverride || buildStrategyConfig();
  activeBacktestConfig = config;
  const runBtns = document.querySelectorAll('[onclick="previewBacktest()"]');
  runBtns.forEach(b => { b.disabled = true; b.dataset.label = b.textContent; b.textContent = '실행 중…'; });
  try {
    const payload = {
      config,
      years: parseBacktestYears(),
      days: parseBacktestDays(),
      startEquity: parseCapital(),
    };
    const response = await fetch('/api/backtest', {
      method:'POST',
      headers:{ 'content-type':'application/json' },
      body:JSON.stringify(payload),
    });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); }
    catch { throw new Error('서버가 JSON이 아닌 응답을 반환했습니다 (' + response.status + '). 기간이 길어 백테스트가 시간 초과되었을 수 있습니다. ' + text.slice(0, 200)); }
    if (!response.ok || !body.ok) throw new Error(body.error || '백테스트 실패');
    lastBacktestResult = body.result;
    lastBacktestCandles = body.candles || [];
  } catch (err) {
    alert('백테스트를 실행하지 못했습니다.\\n' + (err instanceof Error ? err.message : String(err)));
    return;
  } finally {
    runBtns.forEach(b => { b.disabled = false; if (b.dataset.label) b.textContent = b.dataset.label; });
  }

  const result = metricsFromResult(lastBacktestResult);
  const returnPct = result.returnPct;
  const mdd = result.mdd;
  const pf = result.pf;
  backtestPassed = returnPct > 35 && mdd > -20 && pf >= 1.2;
  renderBacktestSummary(result);
  $('btReturn').textContent = (returnPct > 0 ? '+' : '') + returnPct.toFixed(1) + '%';
  $('btReturn').className = 'num ' + signedClass(returnPct);
  $('btWinRate').textContent = result.winRate.toFixed(1) + '%';
  $('btWinRate').className = 'num ' + (result.winRate >= 50 ? 'up' : 'neutral');
  $('btMdd').textContent = mdd.toFixed(1) + '%';
  $('btMdd').className = 'num ' + (mdd <= -20 ? 'down' : 'neutral');
  $('btPayoff').textContent = Number.isFinite(result.payoff) ? result.payoff.toFixed(2) : '∞';
  $('btPayoff').className = 'num ' + (result.payoff >= 1.2 ? 'up' : 'neutral');
  $('btPf').textContent = Number.isFinite(pf) ? pf.toFixed(2) : '∞';
  $('btPf').className = 'num ' + (pf >= 1.2 ? 'up' : 'down');
  $('btTrades').textContent = String(result.trades);
  $('btTrades').className = 'num neutral';
  $('btVerdict').textContent = backtestPassed ? 'Testnet 적용 가능' : '부적합';
  $('btVerdict').className = backtestPassed ? 'up' : 'down';
  $('applyStatus').className = 'status ' + (backtestPassed ? 'ok' : 'warn');
  $('applyStatus').textContent = backtestPassed ? 'ready' : 'locked';
  $('applyBtn').disabled = !backtestPassed;
  $('applyBtn').style.opacity = backtestPassed ? '1' : '.45';
  $('applyBtn').style.cursor = backtestPassed ? 'pointer' : 'not-allowed';
  location.hash = 'backtest';
  // 뷰가 보인 뒤에 그려야 컨테이너 폭이 잡힌다.
  requestAnimationFrame(() => renderBacktestChart(lastBacktestResult, lastBacktestCandles));
  currentCandidate = { returnPct, winRate:result.winRate, mdd, pf, passed:backtestPassed };
  renderVersions();
  renderCompare();
}

async function applyStrategy() {
  if (!backtestPassed || !activeBacktestConfig) {
    alert('백테스트 통과 후 적용할 수 있습니다.');
    return;
  }
  const name = (prompt('적용할 전략 이름', activeBacktestConfig.name || '적용 전략') || '').trim();
  if (!name) return;
  const config = activeBacktestConfig;
  config.name = name;
  try {
    const saveRes = await fetch('/api/strategies', {
      method:'POST', headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ config, name, metrics: currentBacktestMetrics() }),
    });
    const saveBody = await saveRes.json();
    if (!saveRes.ok || !saveBody.ok) throw new Error(saveBody.error || '저장 실패');
    const actRes = await fetch('/api/strategies/activate', {
      method:'POST', headers:{ 'content-type':'application/json' },
      body:JSON.stringify({ strategyId: saveBody.strategyId }),
    });
    const actBody = await actRes.json();
    if (!actRes.ok || !actBody.ok) throw new Error(actBody.error || '적용 실패');
  } catch (err) {
    alert('전략을 적용하지 못했습니다.\\n' + (err instanceof Error ? err.message : String(err)));
    return;
  }
  currentCandidate = null;
  await loadStrategies();
  await setMode('TESTNET');
  alert('전략을 저장하고 봇에 적용했습니다. 봇이 TESTNET으로 전환됩니다.');
}

async function setMode(mode) {
  if (!MODES.includes(mode)) return;
  if (isLive(mode)) {
    alert('LIVE 전환은 체크리스트와 확인 문구가 연결된 후 가능합니다.');
    return;
  }
  await fetch('/api/mode', { method:'POST', headers:{ 'content-type':'application/json' }, body:JSON.stringify({ mode }) });
  await load();
}

async function emergencyStop() {
  if (!confirm('봇을 OFF로 전환할까요?')) return;
  await setMode('OFF');
}

async function runNow() {
  const result = await fetch('/api/run', { method:'POST' }).then(r => r.json());
  alert(JSON.stringify(result, null, 2));
  await load();
}

renderStrategyBuilder();
renderVersions();
renderCompare();
loadStrategies();
load().catch(err => {
  $('modeBanner').textContent = '상태를 불러오지 못했습니다: ' + err.message;
});
loadHealth();
// 라이브 감시: 주기적으로 상태 + executor 핑 갱신.
setInterval(() => { load().catch(() => {}); }, 15000);
setInterval(() => { loadHealth(); }, 20000);
window.addEventListener('hashchange', route);
window.addEventListener('resize', resizeBacktestCharts);
route();
</script>
</body>
</html>`;
}
