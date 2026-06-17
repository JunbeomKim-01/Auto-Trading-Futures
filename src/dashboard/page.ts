// 최소 대시보드. 모드 ON/OFF + 상태/신호/주문 확인. 문서 14/19장.
// MVP는 Worker가 직접 서빙. 추후 Cloudflare Pages로 분리 가능.
export function dashboardHtml(): string {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Auto Trading Futures</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background:#0b0e14; color:#d7dce5; }
  header { padding:16px 20px; background:#11151f; border-bottom:1px solid #1e2430; }
  h1 { font-size:18px; margin:0; }
  main { padding:20px; max-width:960px; margin:0 auto; }
  .card { background:#11151f; border:1px solid #1e2430; border-radius:8px; padding:16px; margin-bottom:16px; }
  button { background:#2b3650; color:#fff; border:0; border-radius:6px; padding:8px 12px; margin:2px; cursor:pointer; }
  button.active { background:#3b82f6; }
  pre { white-space:pre-wrap; word-break:break-all; font-size:12px; color:#9aa4b2; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  td,th { border-bottom:1px solid #1e2430; padding:6px 8px; text-align:left; }
  .muted { color:#6b7280; font-size:12px; }
</style>
</head>
<body>
<header><h1>BTCUSDT 4H 자동매매 — MVP</h1></header>
<main>
  <div class="card">
    <h3>운영 모드</h3>
    <div id="modes"></div>
    <p class="muted">OFF=중지, ALERT_ONLY=신호만, PAPER=가상체결, TESTNET=테스트넷 주문, LIVE_*=실거래</p>
    <button onclick="runNow()">지금 1회 실행 (검증용)</button>
  </div>
  <div class="card"><h3>상태</h3><pre id="status">로딩…</pre></div>
  <div class="card"><h3>최근 신호</h3><div id="signals"></div></div>
  <div class="card"><h3>최근 주문</h3><div id="orders"></div></div>
</main>
<script>
const MODES = ['OFF','ALERT_ONLY','PAPER','TESTNET','LIVE_SMALL','LIVE_FULL'];
let current = null;
async function load() {
  const s = await (await fetch('/api/status')).json();
  current = s.mode;
  document.getElementById('status').textContent = JSON.stringify(s, null, 2);
  document.getElementById('modes').innerHTML = MODES.map(m =>
    '<button class="'+(m===s.mode?'active':'')+'" onclick="setMode(\\''+m+'\\')">'+m+'</button>').join('');
  renderTable('signals', await (await fetch('/api/signals')).json(),
    ['created_at','decision','score','passed','risk_passed']);
  renderTable('orders', await (await fetch('/api/orders')).json(),
    ['created_at','side','reason','qty','price','status','mode']);
}
function renderTable(id, rows, cols) {
  if (!rows.length) { document.getElementById(id).innerHTML = '<p class="muted">없음</p>'; return; }
  const head = '<tr>'+cols.map(c=>'<th>'+c+'</th>').join('')+'</tr>';
  const body = rows.map(r=>'<tr>'+cols.map(c=>'<td>'+(r[c]??'')+'</td>').join('')+'</tr>').join('');
  document.getElementById(id).innerHTML = '<table>'+head+body+'</table>';
}
async function setMode(m) {
  await fetch('/api/mode', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({mode:m})});
  load();
}
async function runNow() {
  const r = await (await fetch('/api/run', {method:'POST'})).json();
  alert(JSON.stringify(r)); load();
}
load();
</script>
</body>
</html>`;
}
