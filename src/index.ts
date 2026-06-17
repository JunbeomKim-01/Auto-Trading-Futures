// Worker 엔트리: cron 전략 실행 + 대시보드 API. 문서 13/14장.
import type { Env, RunMode } from './types';
import { runStrategyTick } from './runner';
import { D1Repository } from './storage/d1Repository';
import { KvRepository } from './storage/kvRepository';
import { dashboardHtml } from './dashboard/page';

const VALID_MODES: RunMode[] = ['OFF', 'ALERT_ONLY', 'PAPER', 'TESTNET', 'LIVE_SMALL', 'LIVE_FULL'];

export default {
  // 매분 실행되지만 4시간봉 마감 + 미처리일 때만 실제 판단. 문서 13장.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      runStrategyTick(env).then(
        (s) => console.log('tick', JSON.stringify(s)),
        (e) => console.error('tick error', e),
      ),
    );
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === '/' ) return html(dashboardHtml());

    if (path === '/api/status') return json(await status(env));
    if (path === '/api/signals') return json(await new D1Repository(env).recentSignals(30));
    if (path === '/api/orders') return json(await new D1Repository(env).recentOrders(30));

    if (path === '/api/mode' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as { mode?: string };
      const mode = body.mode as RunMode;
      if (!VALID_MODES.includes(mode)) {
        return json({ error: `mode는 ${VALID_MODES.join(', ')} 중 하나` }, 400);
      }
      await new KvRepository(env).setMode(mode);
      return json({ ok: true, mode });
    }

    // 수동 트리거 (검증용). 문서 19장.
    if (path === '/api/run' && req.method === 'POST') {
      return json(await runStrategyTick(env));
    }

    return json({ error: 'not found' }, 404);
  },
};

async function status(env: Env) {
  const kv = new KvRepository(env);
  const d1 = new D1Repository(env);
  const mode = await kv.getMode();
  const position = await d1.getOpenPosition('BTCUSDT');
  const lastCandle = await kv.getLastProcessedCandle('BTCUSDT');
  return { mode, symbol: 'BTCUSDT', lastProcessedCandle: lastCandle, position };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function html(body: string): Response {
  return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
