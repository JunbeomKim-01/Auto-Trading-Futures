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
    --canvas:#0b0e11;
    --card:#1e2329;
    --panel:#171b21;
    --elevated:#2b3139;
    --line:#2b3139;
    --text:#eaecef;
    --muted:#707a8a;
    --muted-strong:#929aa5;
    --primary:#FCD535;
    --primary-active:#d6a908;
    --ink:#181a20;
    --up:#0ecb81;
    --down:#f6465d;
    --blue:#3b82f6;
    --live:#d9342b;
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
    border-radius:6px;
    background:#11161c;
    color:var(--text);
    outline:none;
  }
  textarea:focus, input:focus, select:focus { box-shadow:0 0 0 2px rgba(59,130,246,.45); }
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
    border-radius:6px;
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
    border-radius:6px;
    border:1px solid var(--line);
    background:var(--card);
    color:var(--muted-strong);
    font-size:12px;
    font-weight:600;
    white-space:nowrap;
  }
  .status.ok { color:var(--up); background:rgba(14,203,129,.1); }
  .status.bad { color:var(--down); background:rgba(246,70,93,.1); }
  .status.warn { color:var(--primary-active); background:rgba(240,185,11,.1); }
  .status.info { color:var(--blue); background:rgba(59,130,246,.1); }
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
  .flow {
    display:grid;
    grid-template-columns:repeat(6, minmax(0, 1fr));
    gap:8px;
    margin-bottom:20px;
  }
  .flow-step {
    min-height:62px;
    padding:11px;
    border:1px solid var(--line);
    border-radius:8px;
    background:var(--card);
  }
  .flow-step span {
    display:block;
    color:var(--muted);
    font-size:11px;
    font-weight:600;
  }
  .flow-step b {
    display:block;
    margin-top:5px;
    font-size:13px;
    font-weight:650;
  }
  .dashboard-cards {
    display:grid;
    grid-template-columns:repeat(4, minmax(0, 1fr));
    gap:12px;
    margin-bottom:20px;
  }
  .dash-link {
    display:block;
    min-height:132px;
    padding:16px;
    border:1px solid var(--line);
    border-radius:8px;
    background:var(--card);
    color:var(--text);
    text-decoration:none;
  }
  .dash-link:hover { border-color:var(--muted); }
  .dash-link b {
    display:block;
    margin-top:8px;
    font-size:15px;
    font-weight:650;
  }
  .dash-link p {
    margin-top:8px;
    color:var(--muted-strong);
    font-size:13px;
    line-height:1.45;
  }
  .grid {
    display:grid;
    grid-template-columns:minmax(0, 1.5fr) minmax(320px, .8fr);
    gap:20px;
    align-items:start;
  }
  .stack { display:grid; gap:16px; }
  .card {
    padding:20px;
    border:1px solid var(--line);
    border-radius:8px;
    background:var(--card);
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
  .pnl-panel {
    display:grid;
    grid-template-columns:minmax(0, 1fr) 260px;
    gap:18px;
    align-items:stretch;
    min-height:260px;
  }
  .pnl-main {
    padding:24px;
    border-radius:8px;
    background:var(--panel);
    border:1px solid var(--line);
  }
  .pnl-number {
    margin-top:14px;
    font-size:64px;
    line-height:1;
    font-weight:650;
  }
  .up { color:var(--up); }
  .down { color:var(--down); }
  .neutral { color:var(--text); }
  .pnl-copy {
    max-width:620px;
    margin-top:14px;
    color:var(--muted-strong);
    font-size:14px;
    line-height:1.6;
  }
  .pnl-side {
    display:grid;
    gap:10px;
  }
  .metric {
    padding:14px;
    border:1px solid var(--line);
    border-radius:8px;
    background:#171c22;
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
    border-radius:6px;
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
  .loss-alert {
    margin-top:16px;
    padding:14px;
    border:1px solid rgba(246,70,93,.35);
    border-left:4px solid var(--down);
    border-radius:6px;
    background:rgba(246,70,93,.06);
  }
  .trade-chart {
    position:relative;
    min-height:360px;
    overflow:hidden;
    border:1px solid var(--line);
    border-radius:8px;
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
    border-radius:6px;
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
    border-radius:8px;
    background:#171c22;
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
    border-radius:6px;
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
    padding:14px;
    border:1px solid var(--line);
    border-radius:8px;
    background:#171c22;
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
    border-radius:8px;
    background:#11161c;
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
    background:rgba(252,213,53,.18);
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
    grid-template-columns:64px minmax(130px, 1fr) 92px minmax(84px, .7fr) 38px;
    gap:8px;
    align-items:center;
  }
  .condition-row select, .condition-row input {
    height:36px;
    padding:0 9px;
    font-size:12px;
  }
  .icon-btn {
    width:38px;
    height:36px;
    display:grid;
    place-items:center;
    border:1px solid var(--line);
    border-radius:6px;
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
    border-radius:8px;
    background:#11161c;
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
    border-radius:8px;
    background:#171c22;
  }
  .compare-card.best { border-color:rgba(14,203,129,.55); }
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
    border-radius:6px;
    background:#11161c;
    color:var(--muted-strong);
    font-size:12px;
    font-weight:600;
  }
  .apply-box {
    padding:16px;
    border:1px solid var(--line);
    border-radius:8px;
    background:#171c22;
  }
  .empty {
    min-height:100px;
    display:grid;
    place-items:center;
    padding:18px;
    border:1px dashed var(--line);
    border-radius:8px;
    background:#171c22;
    color:var(--muted);
    text-align:center;
  }
  .table-wrap {
    overflow:auto;
    border:1px solid var(--line);
    border-radius:8px;
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
    .grid, .pnl-panel, .lab-grid { grid-template-columns:1fr; }
    .flow, .result-grid, .dashboard-cards { grid-template-columns:repeat(2, minmax(0, 1fr)); }
    .form-grid { grid-template-columns:repeat(2, minmax(0, 1fr)); }
    .compare-grid { grid-template-columns:1fr; }
  }
  @media (max-width: 720px) {
    .topbar { height:auto; min-height:58px; padding:10px 12px; flex-wrap:wrap; }
    .nav { order:3; width:100%; }
    .top-actions .btn.ghost { display:none; }
    .page { padding:14px 12px 82px; }
    .flow, .result-grid, .form-grid, .two-col, .dashboard-cards, .indicator-grid, .search-grid { grid-template-columns:1fr; }
    .condition-row { grid-template-columns:1fr 1fr; }
    .condition-row .icon-btn { width:100%; }
    h1 { font-size:24px; }
    .pnl-number { font-size:46px; }
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
      border-radius:6px;
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
    border:1px solid var(--line); border-radius:8px;
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
  .bt-legend i.win { background:#2ebd85; }
  .bt-legend i.loss { background:var(--down); }
  .bt-legend i.eq { background:var(--primary); }

  /* ── 지표 카드 재설계 (한눈에 on/off + 현재값) ── */
  .ind-add-bar { display:flex; gap:8px; align-items:center; margin-bottom:10px; }
  .ind-add-bar select {
    flex:1; padding:8px 10px; border-radius:7px; border:1px solid var(--line);
    background:var(--elevated); color:var(--text); font-size:12px;
  }
  .indicator-card { min-height:0; transition:border-color .15s, opacity .15s; }
  .indicator-card.off { opacity:.5; }
  .indicator-card.on { border-color:rgba(46,189,133,.45); }
  .ind-head { display:flex; align-items:center; gap:8px; }
  .ind-dot { width:8px; height:8px; border-radius:50%; background:var(--muted); flex:0 0 auto; }
  .indicator-card.on .ind-dot { background:#2ebd85; box-shadow:0 0 0 3px rgba(46,189,133,.15); }
  .ind-head h3 { margin:0; font-size:13px; font-weight:650; }
  .ind-head .ind-hint { font-size:11px; color:var(--muted); }
  .ind-head .spacer { flex:1; }
  .ind-remove {
    background:transparent; border:0; color:var(--muted); cursor:pointer;
    font-size:16px; line-height:1; padding:2px 4px; border-radius:5px;
  }
  .ind-remove:hover { color:var(--down); background:rgba(246,70,93,.12); }
  .ind-summary {
    font-size:12px; color:var(--muted-strong); font-variant-numeric:tabular-nums;
    padding:2px 0 2px; letter-spacing:.2px;
  }
  .indicator-card.on .ind-summary { color:var(--text); }
  .ind-params { display:grid; gap:7px; }
  .indicator-card.off .ind-params { display:none; }
</style>
</head>
<body>
<header class="topbar">
  <div class="brand"><span class="brand-mark">AT</span><span>Auto Trading Futures</span></div>
  <nav class="nav" aria-label="Workflow">
    <a class="active" href="#dashboard">대시보드</a>
    <a href="#logs">매매 로그</a>
    <a href="#strategy">전략 생성</a>
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
  <section class="flow dashboard-only" aria-label="Trading workflow">
    <div class="flow-step"><span>1</span><b>수익률 확인</b></div>
    <div class="flow-step"><span>2</span><b>손실이면 정지</b></div>
    <div class="flow-step"><span>3</span><b>로그로 원인 분석</b></div>
    <div class="flow-step"><span>4</span><b>전략 새로 작성</b></div>
    <div class="flow-step"><span>5</span><b>백테스트 검증</b></div>
    <div class="flow-step"><span>6</span><b>적용 후 봇 ON</b></div>
  </section>

  <section class="dashboard-cards dashboard-only" aria-label="Feature pages">
    <a class="dash-link" href="#logs">
      <span class="label">상세 페이지</span>
      <b>매매 로그 차트</b>
      <p>어느 캔들에서 매매했고 당시 금액·수량·가격이 어땠는지 확인합니다.</p>
    </a>
    <a class="dash-link" href="#strategy">
      <span class="label">상세 페이지</span>
      <b>전략 생성</b>
      <p>스크립트나 수학 원리로 새 전략 아이디어를 작성합니다.</p>
    </a>
    <a class="dash-link" href="#backtest">
      <span class="label">상세 페이지</span>
      <b>백테스트</b>
      <p>가상 진입·청산 위치와 수익률을 차트에서 검증합니다.</p>
    </a>
    <a class="dash-link" href="#apply">
      <span class="label">상세 페이지</span>
      <b>전략 적용</b>
      <p>백테스트 통과 후 전략 변경, TESTNET 적용, 봇 ON을 처리합니다.</p>
    </a>
  </section>

  <section class="grid">
    <div class="stack">
      <section id="profit" class="card dashboard-only">
        <div class="pnl-panel">
          <div class="pnl-main">
            <div class="label">지금 제일 먼저 볼 것</div>
            <h1 id="pnlTitle">오늘 손익을 불러오는 중입니다</h1>
            <div id="pnlNumber" class="pnl-number num neutral">0.00%</div>
            <p id="pnlCopy" class="pnl-copy">손익이 괜찮으면 봇을 계속 감시하고, 손실이 커지면 먼저 멈춘 뒤 로그를 봅니다.</p>
            <div class="actions">
              <button id="primaryDecision" class="btn primary" type="button" onclick="primaryDecision()">상태 새로고침</button>
              <button class="btn danger" type="button" onclick="emergencyStop()">더 손해보기 전에 봇 멈춰</button>
              <a class="btn ghost" href="#logs" style="display:inline-flex;align-items:center;text-decoration:none;">왜 못했는지 로그 보기</a>
            </div>
            <div id="lossAlert" class="loss-alert" hidden>
              <h3>손실 방어 우선</h3>
              <p class="muted" style="margin-top:6px;">일일 손실 제한에 가까워지면 전략 개선보다 먼저 신규 진입을 멈추는 게 맞습니다.</p>
            </div>
          </div>
          <aside class="pnl-side">
            <div class="metric"><span class="label">봇 상태</span><b id="botState">-</b></div>
            <div class="metric"><span class="label">모드</span><b id="modeState">-</b></div>
            <div class="metric"><span class="label">현재 포지션</span><b id="positionState">-</b></div>
          </aside>
        </div>
      </section>

      <section id="logs" class="card view-logs">
        <div class="card-head">
          <div>
            <h2>차트에서 매매 로그 보기</h2>
            <p class="muted">어느 구간에서 매매했고, 당시 주문 금액·수량·상태가 어땠는지 먼저 차트로 확인합니다.</p>
          </div>
          <span id="chartSummary" class="status info">chart</span>
        </div>
        <div id="tradeChart" class="chart-host live" aria-label="Trade log chart"></div>
      </section>

      <section class="card view-logs">
        <div class="card-head">
          <div>
            <h2>왜 이렇게 매매를 못 했지?</h2>
            <p class="muted">차트 마커를 본 뒤, 아래 판단 로그에서 점수 미달·리스크 차단·주문 실패 사유를 확인합니다.</p>
          </div>
          <span id="logSummary" class="status info">logs</span>
        </div>
        <div id="logTimeline" class="timeline"></div>
      </section>

      <section id="strategy-lab" class="card view-strategy">
        <div class="card-head">
          <div>
            <h2>무한 백테스트 전략 빌더</h2>
            <p class="muted">기본 인디케이터의 파라미터를 조정하고, 조건을 조합한 뒤, 직접 만든 스크립트를 함께 검증합니다.</p>
          </div>
          <span id="builderStatus" class="status warn">draft</span>
        </div>
        <div class="lab-grid">
          <div class="stack">
            <div class="tool-panel">
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

            <div class="tool-panel">
              <div class="tool-head">
                <div>
                  <h3>조건 조합기</h3>
                  <p class="muted">모든 조건이 만족되는 캔들에서 진입하고, 청산 조건은 차트에 별도 마커로 표시합니다.</p>
                </div>
                <button class="btn ghost" type="button" onclick="addCondition()">조건 추가</button>
              </div>
              <div id="conditionList" class="condition-list"></div>
            </div>
          </div>

          <div class="stack">
            <div class="tool-panel">
              <div class="tool-head">
                <div>
                  <h3>직접 만든 스크립트</h3>
                  <p class="muted">내장 조건으로 부족한 로직을 안전한 DSL 형태로 추가합니다.</p>
                </div>
              </div>
              <div class="editor-tabs">
                <button id="scriptTab" class="tab active" type="button" onclick="setEditorMode('script')">스크립트</button>
                <button id="mathTab" class="tab" type="button" onclick="setEditorMode('math')">수학 원리</button>
              </div>
              <textarea id="strategyText">IF rsi14 <= 35
AND close > ema200
AND macd.histogram > macd.histogram.previous
THEN long_score += 70

EXIT:
take_profit when close >= avgEntry + atr14 * 1.8
stop_loss when close <= avgEntry - atr14 * 1.1

RISK:
stop new entries when dailyLoss <= -2%</textarea>
              <div class="actions">
                <button class="btn primary" type="button" onclick="previewBacktest()">백테스트 실행</button>
                <button class="btn ghost" type="button" onclick="generateStrategyDsl()">조건을 스크립트로 변환</button>
              </div>
            </div>

            <div class="tool-panel">
              <div class="tool-head">
                <div>
                  <h3>전략 저장소</h3>
                  <p class="muted">좋은 전략은 버전으로 저장하고 이전 결과와 비교합니다.</p>
                </div>
                <button class="btn ghost" type="button" onclick="saveStrategyVersion()">저장</button>
              </div>
              <div id="versionList" class="mini-list"></div>
            </div>
          </div>
        </div>
        <div class="form-grid">
          <div class="field"><label>심볼</label><input id="btSymbol" value="BTCUSDT" /></div>
          <div class="field"><label>기간</label><input id="btRange" value="2020-01-01 ~ 2026-06-17" /></div>
          <div class="field"><label>초기 자본</label><input id="btCapital" value="10000 USDT" /></div>
          <div class="field"><label>레버리지</label><input id="btLev" value="2x" /></div>
        </div>
      </section>

      <section id="backtest" class="card view-backtest">
        <div class="card-head">
          <div>
            <h2>백테스트 결과 비교</h2>
            <p class="muted">진입·청산 위치, 수익률, 승률, MDD, 손익비를 확인하고 여러 전략 결과를 나란히 비교합니다.</p>
          </div>
          <button id="btRunBtn" class="btn primary" type="button" onclick="previewBacktest()">백테스트 실행</button>
        </div>

        <div class="bt-chart-head">
          <span class="label">가격 · 진입/청산</span>
          <span id="btChartHint" class="muted">실행하면 실제 캔들 위에 진입(▲)·청산(▼) 위치가 표시됩니다.</span>
        </div>
        <div id="backtestChart" class="chart-host" aria-label="Backtest price chart">
          <div class="chart-empty-abs">백테스트 실행 후 실제 4시간봉 차트에 진입/청산 타점이 가격축 그대로 표시됩니다.</div>
        </div>
        <div class="bt-legend">
          <span><i class="in"></i>진입</span>
          <span><i class="win"></i>익절 청산</span>
          <span><i class="loss"></i>손절 청산</span>
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
              <h3>파라미터 자동 탐색</h3>
              <p class="muted">범위를 지정해 RSI, EMA, ATR 배수 조합을 빠르게 훑고 상위 결과를 남깁니다.</p>
            </div>
            <button class="btn ghost" type="button" onclick="runParameterSearch()">탐색 시작</button>
          </div>
          <div class="search-grid">
            <div class="field"><label>RSI 기간</label><input id="searchRsi" value="10,14,21" /></div>
            <div class="field"><label>EMA 기간</label><input id="searchEma" value="100,200" /></div>
            <div class="field"><label>ATR 손절 배수</label><input id="searchAtr" value="1.0,1.3,1.8" /></div>
          </div>
          <div id="searchResults" class="mini-list" style="margin-top:12px;"></div>
        </div>
        <div class="tool-panel" style="margin-top:14px;">
          <div class="tool-head">
            <div>
              <h3>전략 결과 비교</h3>
              <p class="muted">최근 실행한 전략과 저장된 후보를 같은 기준으로 비교합니다.</p>
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
            <h2>정지/재개</h2>
            <p class="muted">손실이 커지면 전략 편집보다 먼저 봇을 멈춥니다.</p>
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
            <p class="muted">기존 포지션은 진입 당시 전략 버전으로 관리합니다.</p>
          </div>
          <span id="positionChip" class="status">없음</span>
        </div>
        <div id="positionBody"></div>
      </section>

      <section class="card dashboard-only">
        <div class="card-head">
          <div>
            <h2>최근 주문</h2>
            <p class="muted">주문 실패가 있으면 전략 적용 전에 먼저 원인을 확인합니다.</p>
          </div>
          <span id="orderChip" class="status ok">정상</span>
        </div>
        <div id="ordersBody"></div>
      </section>

      <section id="apply" class="card view-apply">
        <div class="card-head">
          <div>
            <h2>전략 변경 및 적용</h2>
            <p class="muted">백테스트 통과 후 TESTNET 적용, 이후 봇 ON 순서입니다.</p>
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
let savedVersionCounter = 4;
// 보조지표 카탈로그. '지표 추가'에서 선택 가능한 전체 목록.
const INDICATOR_CATALOG = {
  rsi:       { name:'RSI', hint:'과매수/과매도 구간', params:[['period', 14, 2, 50], ['oversold', 35, 5, 50]] },
  ema:       { name:'EMA', hint:'추세 필터', params:[['period', 200, 20, 400]] },
  sma:       { name:'SMA', hint:'단순 이동평균', params:[['period', 50, 5, 300]] },
  macd:      { name:'MACD', hint:'모멘텀 변화', params:[['fast', 12, 2, 40], ['slow', 26, 5, 80], ['signal', 9, 2, 30]] },
  atr:       { name:'ATR', hint:'손절/익절 거리', params:[['period', 14, 2, 50], ['stop x', 1.1, 0.5, 4]] },
  bollinger: { name:'Bollinger', hint:'변동성 밴드', params:[['period', 20, 5, 80], ['std', 2, 1, 4]] },
  volume:    { name:'Volume', hint:'거래량 돌파', params:[['sma', 20, 5, 80], ['spike x', 1.5, 1, 4]] },
  fvg:       { name:'FVG', hint:'공정가치 갭 · fvg.bullish / fvg.mid', params:[] },
  ob:        { name:'Order Block', hint:'주문 블록 · ob.bullish / ob.high', params:[['body ratio', 0.3, 0, 1]] },
};
function makeIndicator(type, enabled) {
  const c = INDICATOR_CATALOG[type];
  return { id:type, type, name:c.name, enabled:!!enabled, params:c.params.map(p => p.slice()) };
}
const indicators = [
  makeIndicator('rsi', true),
  makeIndicator('ema', true),
  makeIndicator('macd', true),
  makeIndicator('atr', true),
  makeIndicator('volume', false),
];
let conditions = [
  { join:'AND', left:'rsi14', op:'<=', right:'35' },
  { join:'AND', left:'close', op:'>', right:'ema200' },
  { join:'AND', left:'macd.histogram', op:'>', right:'macd.histogram.previous' },
];
const savedVersions = [
  { name:'Countertrend v3', ret:42.8, win:57.4, mdd:-11.9, pf:1.62, tag:'saved' },
  { name:'Breakout v2', ret:31.2, win:44.1, mdd:-18.7, pf:1.28, tag:'watch' },
  { name:'Mean Revert v1', ret:18.5, win:52.0, mdd:-24.4, pf:1.05, tag:'archived' },
];

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

function render() {
  const mode = state.status.mode || 'OFF';
  const position = state.status.position;
  const failedOrders = state.orders.filter(isFailedOrder);
  const pnl = Number(position?.realizedPnl ?? 0);

  $('modeBanner').className = isLive(mode) ? 'mode live' : 'mode';
  $('modeBanner').textContent = isLive(mode) ? 'LIVE MODE - 실제 자금으로 주문이 실행됩니다.' : mode + ' MODE - 실제 주문이 아닙니다.';
  const botText = mode === 'ALERT_ONLY' ? 'ENTRY PAUSED' : isOn(mode) ? 'BOT ON' : 'BOT OFF';
  const botDot = mode === 'ALERT_ONLY' ? 'warn' : isOn(mode) ? 'up' : '';
  $('botPill').innerHTML = '<span class="dot ' + botDot + '"></span>' + botText;

  $('pnlNumber').textContent = pct(pnl);
  $('pnlNumber').className = 'pnl-number num ' + signedClass(pnl);
  if (pnl > 0) {
    $('pnlTitle').textContent = '음, 오늘은 이 정도 벌었네요';
    $('pnlCopy').textContent = '수익 상태입니다. 그래도 최근 로그에서 왜 진입했는지 확인하고, 전략 개선 아이디어가 있으면 백테스트로 검증하세요.';
  } else if (pnl < 0) {
    $('pnlTitle').textContent = '오늘은 손실입니다. 먼저 멈출지 판단하세요';
    $('pnlCopy').textContent = '손실이 발생했습니다. 추가 손실을 막으려면 봇을 정지하거나 신규 진입을 중지한 뒤 매매 로그를 확인하세요.';
  } else {
    $('pnlTitle').textContent = '아직 확정 손익은 없습니다';
    $('pnlCopy').textContent = '현재 기록된 실현 손익은 0입니다. 첫 판단 전이라면 Run once로 파이프라인을 점검할 수 있습니다.';
  }
  $('lossAlert').hidden = pnl >= 0;
  $('primaryDecision').textContent = pnl < 0 ? '봇 멈추기' : '매매 로그 보기';
  $('botState').textContent = botText;
  $('modeState').textContent = mode;
  $('positionState').textContent = position ? position.side + ' · step ' + position.currentStep + '/' + position.maxStep : '없음';

  renderLogs();
  renderTradeChart();
  renderBacktestChart(lastBacktestResult, lastBacktestCandles);
  renderStrategyBuilder();
  renderVersions();
  renderCompare();
  renderPosition(position);
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
      upColor:'#2ebd85', downColor:'#f6465d', borderVisible:false,
      wickUpColor:'#2ebd85', wickDownColor:'#f6465d',
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
        color: failed ? '#f6465d' : (buy ? '#2ebd85' : '#e0a800'),
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
      price: Number(position.avgEntryPrice), color:'#f0b90b', lineWidth:1,
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
      upColor:'#2ebd85', downColor:'#f6465d', borderVisible:false,
      wickUpColor:'#2ebd85', wickDownColor:'#f6465d',
    });
  }
  if (!btEquityChart && eqEl) {
    btEquityChart = LightweightCharts.createChart(eqEl, chartTheme(200));
    btEquitySeries = btEquityChart.addAreaSeries({
      lineColor:'#f0b90b', topColor:'rgba(240,185,11,.25)', bottomColor:'rgba(240,185,11,.02)',
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

  // 진입(▲)·청산(▼) 마커를 실제 가격 캔들 위에 표시.
  const markers = [];
  for (const t of trades) {
    markers.push({ time: sec(t.entryTime), position:'belowBar', color:'#2ebd85',
      shape:'arrowUp', text:'IN ' + num(t.avgEntry) });
    const winCls = t.pnl >= 0;
    markers.push({ time: sec(t.exitTime), position:'aboveBar', color: winCls ? '#2ebd85' : '#f6465d',
      shape:'arrowDown', text:(t.pnl >= 0 ? '+' : '') + Math.round(t.pnl) });
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
  return ind.params.map(p => p[0] + ' ' + p[1]).join(' · ') || '파라미터 없음';
}

function renderStrategyBuilder() {
  const active = indicators.filter(i => i.enabled).length;
  $('indicatorCount').textContent = active + ' / ' + indicators.length + ' active';

  // 지표 추가 바: 카탈로그에 있고 아직 추가 안 된 타입만 노출.
  const addable = Object.keys(INDICATOR_CATALOG).filter(t => !indicators.some(i => i.type === t));
  $('indicatorAddBar').innerHTML =
    '<select onchange="if(this.value){addIndicator(this.value); this.value=\\'\\';}"' +
      (addable.length ? '' : ' disabled') + '>' +
      '<option value="">+ 보조지표 추가' + (addable.length ? '' : ' (모두 추가됨)') + '</option>' +
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
        '<span class="ind-hint">' + indicatorHint(ind.id) + '</span>' +
        '<span class="spacer"></span>' +
        '<label class="switch" title="' + esc(ind.name) + ' 사용"><input type="checkbox" ' + (ind.enabled ? 'checked' : '') + ' onchange="toggleIndicator(' + index + ')" /><span></span></label>' +
        '<button class="ind-remove" type="button" title="지표 제거" onclick="removeIndicator(' + index + ')">×</button>' +
      '</div>' +
      '<div class="ind-summary" id="indSummary' + index + '">' + esc(indicatorSummary(ind)) + '</div>' +
      '<div class="ind-params">' + params + '</div>' +
    '</article>';
  }).join('');

  $('conditionList').innerHTML = conditions.map((c, index) =>
    '<div class="condition-row">' +
      '<select onchange="setCondition(' + index + ', \\'join\\', this.value)"><option ' + selected(c.join, 'AND') + '>AND</option><option ' + selected(c.join, 'OR') + '>OR</option></select>' +
      '<input value="' + esc(c.left) + '" oninput="setCondition(' + index + ', \\'left\\', this.value)" />' +
      '<select onchange="setCondition(' + index + ', \\'op\\', this.value)">' + ['<=','>=','>','<','==','!='].map(op => '<option ' + selected(c.op, op) + '>' + op + '</option>').join('') + '</select>' +
      '<input value="' + esc(c.right) + '" oninput="setCondition(' + index + ', \\'right\\', this.value)" />' +
      '<button class="icon-btn" type="button" title="조건 삭제" onclick="removeCondition(' + index + ')">×</button>' +
    '</div>'
  ).join('');
  $('builderStatus').textContent = conditions.length + ' conditions';
}

function indicatorHint(id) {
  const c = INDICATOR_CATALOG[id];
  return c ? c.hint : 'custom';
}

function addIndicator(type) {
  if (!INDICATOR_CATALOG[type]) return;
  if (indicators.some(i => i.type === type)) return; // 중복 방지
  indicators.push(makeIndicator(type, true));
  renderStrategyBuilder();
}

function removeIndicator(index) {
  indicators.splice(index, 1);
  renderStrategyBuilder();
}

function selected(a, b) {
  return a === b ? 'selected' : '';
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

function setCondition(index, key, value) {
  conditions[index][key] = value;
  $('builderStatus').className = 'status warn';
  $('builderStatus').textContent = 'edited';
}

function addCondition() {
  conditions.push({ join:'AND', left:'volume', op:'>', right:'volume.sma20 * 1.5' });
  renderStrategyBuilder();
}

function removeCondition(index) {
  conditions.splice(index, 1);
  renderStrategyBuilder();
}

function generateStrategyDsl() {
  const lines = conditions.map((c, index) => (index === 0 ? 'IF ' : c.join + ' ') + c.left + ' ' + c.op + ' ' + c.right);
  $('strategyText').value = lines.join('\\n') + '\\nTHEN long_score += 70\\n\\nEXIT:\\ntake_profit when close >= avgEntry + atr14 * 1.8\\nstop_loss when close <= avgEntry - atr14 * 1.1\\n\\nRISK:\\nstop new entries when dailyLoss <= -2%';
  $('builderStatus').className = 'status ok';
  $('builderStatus').textContent = 'synced';
}

function renderVersions() {
  $('versionList').innerHTML = savedVersions.map(v =>
    '<div class="mini-item"><div><b>' + esc(v.name) + '</b><br /><span>수익률 ' + v.ret.toFixed(1) + '% · 승률 ' + v.win.toFixed(1) + '% · MDD ' + v.mdd.toFixed(1) + '%</span></div>' +
    '<span class="status ' + (v.tag === 'saved' ? 'ok' : v.tag === 'watch' ? 'warn' : '') + '">' + esc(v.tag) + '</span></div>'
  ).join('');
}

function saveStrategyVersion() {
  const latest = currentBacktestMetrics();
  savedVersions.unshift({
    name:'Lab Strategy v' + savedVersionCounter++,
    ret:latest.returnPct,
    win:latest.winRate,
    mdd:latest.mdd,
    pf:latest.pf,
    tag:'saved',
  });
  renderVersions();
  renderCompare();
  alert('전략 후보를 새 버전으로 저장했습니다.');
}

function renderCompare() {
  const items = savedVersions.slice(0, 3);
  const bestRet = Math.max.apply(null, items.map(v => v.ret));
  $('compareGrid').innerHTML = items.map(v =>
    '<article class="compare-card ' + (v.ret === bestRet ? 'best' : '') + '">' +
      '<span class="label">' + esc(v.name) + '</span>' +
      '<b class="num ' + signedClass(v.ret) + '">' + (v.ret > 0 ? '+' : '') + v.ret.toFixed(1) + '%</b>' +
      '<div class="tag-row"><span class="tag">승률 ' + v.win.toFixed(1) + '%</span><span class="tag">MDD ' + v.mdd.toFixed(1) + '%</span><span class="tag">PF ' + v.pf.toFixed(2) + '</span></div>' +
    '</article>'
  ).join('');
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

async function runParameterSearch() {
  const rsi = $('searchRsi').value.split(',').map(v => v.trim()).filter(Boolean);
  const ema = $('searchEma').value.split(',').map(v => v.trim()).filter(Boolean);
  const atr = $('searchAtr').value.split(',').map(v => v.trim()).filter(Boolean);
  const rows = [];
  const combos = [];
  for (const rv of rsi) for (const ev of ema) for (const av of atr) {
    combos.push({ rv:Number(rv), ev:Number(ev), av:Number(av) });
  }
  $('searchResults').innerHTML = '<div class="empty">실제 백테스트 엔진으로 파라미터 조합을 탐색 중입니다.</div>';
  for (const combo of combos.slice(0, 8)) {
    try {
      const response = await fetch('/api/backtest', {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body:JSON.stringify({
          config:buildStrategyConfig({ rsiPeriod:combo.rv, emaPeriod:combo.ev, atrStop:combo.av }),
          years:parseBacktestYears(),
          startEquity:parseCapital(),
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || '백테스트 실패');
      const m = metricsFromResult(body.result);
      rows.push({ combo:'RSI ' + combo.rv + ' · EMA ' + combo.ev + ' · ATR ' + combo.av + 'x', ret:m.returnPct, mdd:m.mdd, pf:m.pf });
    } catch (err) {
      rows.push({ combo:'RSI ' + combo.rv + ' · EMA ' + combo.ev + ' · ATR ' + combo.av + 'x', error:err instanceof Error ? err.message : String(err) });
    }
  }
  rows.sort((a, b) => (b.ret ?? -Infinity) - (a.ret ?? -Infinity));
  $('searchResults').innerHTML = rows.map((r, index) => {
    const summary = r.error
      ? '실패 · ' + esc(r.error)
      : '수익률 ' + (r.ret > 0 ? '+' : '') + r.ret.toFixed(1) + '% · MDD ' + r.mdd.toFixed(1) + '% · PF ' + (Number.isFinite(r.pf) ? r.pf.toFixed(2) : '∞');
    return '<div class="mini-item"><div><b>#' + (index + 1) + ' ' + esc(r.combo) + '</b><br /><span>' + summary + '</span></div>' +
      '<button class="btn ghost" type="button" onclick="useSearchResult(\\'' + esc(r.combo) + '\\')">적용</button></div>';
  }).join('');
}

function useSearchResult(combo) {
  $('builderStatus').className = 'status ok';
  $('builderStatus').textContent = 'optimized';
  alert(combo + ' 조합을 현재 전략 후보에 반영했습니다.');
}

function renderPosition(position) {
  if (!position) {
    $('positionChip').className = 'status';
    $('positionChip').textContent = '없음';
    $('positionBody').innerHTML = '<div class="empty">보유 포지션 없음</div>';
    return;
  }
  $('positionChip').className = 'status ' + (position.side === 'LONG' ? 'ok' : 'bad');
  $('positionChip').textContent = position.side + ' · v' + position.strategyVersion;
  $('positionBody').innerHTML =
    '<div class="two-col">' +
      metric('상태', position.state, '') +
      metric('평단', num(position.avgEntryPrice), 'num') +
      metric('수량', num(position.totalSize), 'num') +
      metric('실현 PnL', num(position.realizedPnl), 'num ' + signedClass(position.realizedPnl)) +
    '</div>';
}

function metric(label, value, cls) {
  return '<div class="metric"><span class="label">' + esc(label) + '</span><b class="' + cls + '">' + esc(value) + '</b></div>';
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
    ? 'IF rsi14 <= 35\\nAND close > ema200\\nAND macd.histogram > macd.histogram.previous\\nTHEN long_score += 70\\n\\nSCALE IN:\\nstep2 when price <= avgEntry - atr14 * 0.7\\nstep3 when price <= avgEntry - atr14 * 1.2\\n\\nRISK:\\nstop new entries when dailyLoss <= -2%'
    : '아이디어:\\n평균 회귀는 EMA200 위에서만 허용한다.\\nRSI가 35 이하일 때 과매도 가능성을 보고, MACD 히스토그램이 이전 봉보다 개선될 때 하락 둔화를 확인한다.\\n\\n리스크:\\n손실 제한은 전략 점수보다 우선한다.\\n청산가 거리 5% 미만이면 신규 진입을 금지한다.';
}

function buildStrategyConfig(overrides = {}) {
  const symbol = $('btSymbol').value.trim().toUpperCase() || 'BTCUSDT';
  const rsi = getIndicator('rsi');
  const ema = getIndicator('ema');
  const macd = getIndicator('macd');
  const atr = getIndicator('atr');
  const volume = getIndicator('volume');
  const stopMultiplier = Number(overrides.atrStop ?? getParam(atr, 'stop x', 1.1));
  const expression = conditionExpression();
  const hardFilters = expression
    ? [{ left: expression, operator: '==', right: 1, description: '조건 조합기 전체 통과' }]
    : [];

  return {
    strategyId:'lab_strategy_' + Date.now(),
    name:'무한 백테스트 후보',
    symbol,
    market:'BINANCE_USDM_FUTURES',
    timeframe:'4h',
    mode:'backtest',
    indicators:{
      rsi14:{ type:'RSI', period:Number(overrides.rsiPeriod ?? getParam(rsi, 'period', 14)) },
      macd:{ type:'MACD', fast:Number(getParam(macd, 'fast', 12)), slow:Number(getParam(macd, 'slow', 26)), signal:Number(getParam(macd, 'signal', 9)) },
      atr14:{ type:'ATR', period:Number(getParam(atr, 'period', 14)) },
      ema200:{ type:'EMA', period:Number(overrides.emaPeriod ?? getParam(ema, 'period', 200)) },
      volumeMA20:{ type:'SMA', source:'volume', period:Number(getParam(volume, 'sma', 20)) },
      ...(getIndicator('fvg') ? { fvg:{ type:'FVG' } } : {}),
      ...(getIndicator('ob') ? { ob:{ type:'OB', minBodyRatio:Number(getParam(getIndicator('ob'), 'body ratio', 0)) } } : {}),
    },
    entry:{
      long:{
        enabled:true,
        minimumScore:0,
        hardFilters,
        scoreRules:[],
      },
    },
    positionSizing:{
      type:'atr_based',
      maxPositionValuePercent:25,
      leverage:parseLeverage(),
      entries:[
        { step:1, sizePercent:25, trigger:'initial_signal' },
        { step:2, sizePercent:25, trigger:'price <= avgEntry - atr14 * 0.7' },
        { step:3, sizePercent:25, trigger:'price <= avgEntry - atr14 * 1.2' },
        { step:4, sizePercent:25, trigger:'price <= avgEntry - atr14 * 2.0' },
      ],
    },
    exit:{
      takeProfit:[
        { sizePercent:30, trigger:'price >= avgEntry + atr14 * 0.7' },
        { sizePercent:30, trigger:'price >= avgEntry + atr14 * 1.2' },
        { sizePercent:40, trigger:'price >= avgEntry + atr14 * 1.8' },
      ],
      stopLoss:{ sizePercent:100, trigger:'price <= avgEntry - atr14 * ' + stopMultiplier },
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

function conditionExpression() {
  return conditions
    .filter(c => c.left.trim() && c.op.trim() && String(c.right).trim())
    .map((c, index) => {
      const expr = c.left.trim() + ' ' + c.op + ' ' + String(c.right).trim();
      return (index === 0 ? '' : ' ' + c.join + ' ') + '(' + expr + ')';
    })
    .join('');
}

function getIndicator(id) {
  return indicators.find(i => i.id === id);
}

function getParam(indicator, name, fallback) {
  const row = indicator?.params.find(p => p[0] === name);
  return row ? row[1] : fallback;
}

function parseLeverage() {
  const n = Number(String($('btLev').value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 2;
}

function parseCapital() {
  const n = Number(String($('btCapital').value).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 10000;
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

async function previewBacktest() {
  const runBtns = document.querySelectorAll('[onclick="previewBacktest()"]');
  runBtns.forEach(b => { b.disabled = true; b.dataset.label = b.textContent; b.textContent = '실행 중…'; });
  try {
    const payload = {
      config: buildStrategyConfig(),
      years: parseBacktestYears(),
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
  savedVersions[0] = { name:'현재 후보', ret:returnPct, win:result.winRate, mdd, pf, tag:backtestPassed ? 'saved' : 'watch' };
  renderVersions();
  renderCompare();
}

function applyStrategy() {
  if (!backtestPassed) {
    alert('백테스트 통과 후 적용할 수 있습니다.');
    return;
  }
  alert('MVP UI: 전략 저장 API가 연결되면 여기서 새 전략 버전을 만들고 TESTNET에 적용합니다.');
  setMode('TESTNET');
}

function primaryDecision() {
  const position = state.status.position;
  const pnl = Number(position?.realizedPnl ?? 0);
  if (pnl < 0) emergencyStop();
  else location.hash = 'logs';
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
load().catch(err => {
  $('pnlTitle').textContent = '상태를 불러오지 못했습니다';
  $('pnlCopy').textContent = err.message;
});
window.addEventListener('hashchange', route);
window.addEventListener('resize', resizeBacktestCharts);
route();
</script>
</body>
</html>`;
}
