// TechFy — Worker principal (Cloudflare)
import { handleKiwify } from './kiwify.js';
import { syncMeta, accountIds } from './meta.js';
import { summary } from './metrics.js';
import { DASHBOARD_HTML } from './dashboard.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

function sameString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Login simples: qualquer usuário + a senha ADMIN_PASSWORD
export function isAuthorized(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Basic ')) return false;
  let decoded = '';
  try { decoded = atob(header.slice(6)); } catch (e) { return false; }
  const password = decoded.slice(decoded.indexOf(':') + 1);
  return sameString(password, env.ADMIN_PASSWORD);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/webhooks/kiwify') {
      if (request.method !== 'POST') return new Response('use POST', { status: 405 });
      return handleKiwify(request, env, url);
    }
    if (url.pathname === '/health') return json({ ok: true });

    if (!isAuthorized(request, env)) {
      const msg = env.ADMIN_PASSWORD ? 'Acesso restrito' : 'Configure o segredo ADMIN_PASSWORD';
      return new Response(msg, { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="TechFy", charset="UTF-8"' } });
    }

    try {
      if (url.pathname === '/' && request.method === 'GET') {
        return new Response(DASHBOARD_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      }
      if (url.pathname === '/api/summary') {
        return json(await summary(env, url.searchParams.get('days')));
      }
      if (url.pathname === '/api/status') {
        const sales = await env.DB.prepare('SELECT COUNT(*) AS n, MAX(updated_at) AS last FROM sales').first();
        return json({
          meta: { configured: Boolean(env.META_ACCESS_TOKEN && accountIds(env).length), accounts: accountIds(env).length },
          kiwify: { configured: Boolean(env.KIWIFY_WEBHOOK_TOKEN), sales: sales ? sales.n : 0, lastSale: sales ? sales.last : null }
        });
      }
      if (url.pathname === '/api/sync' && request.method === 'POST') {
        const days = Number(url.searchParams.get('days')) || 3;
        return json(await syncMeta(env, days));
      }
      return json({ error: 'não encontrado' }, 404);
    } catch (err) {
      return json({ error: String(err.message || err) }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    if (env.META_ACCESS_TOKEN && accountIds(env).length) {
      ctx.waitUntil(syncMeta(env, 3).catch(() => {}));
    }
  }
};
