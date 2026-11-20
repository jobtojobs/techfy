// Webhook de vendas da Kiwify
// Verificação (docs.kiwify.com.br/api-reference/webhooks/receiving): a Kiwify envia
// ?signature=<HMAC-SHA1 hex do corpo cru, com o token do webhook como chave>.
import { offsetHours, toLocalDate } from './dates.js';

const enc = new TextEncoder();

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifySignature(rawBody, signature, token) {
  if (!signature || !token) return false;
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(token), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  return safeEqual(toHex(mac), String(signature).toLowerCase());
}

function first(...values) {
  return values.find((v) => v !== undefined && v !== null && v !== '');
}

// Valores da Kiwify vêm em centavos (ex.: 9700 = R$ 97,00)
function cents(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) / 100 : 0;
}

// Aceita o formato do webhook (Commissions / TrackingParameters / Product)
// e o formato da API (payment / tracking / product).
export function parseOrder(p, env, now = new Date()) {
  const tracking = p.TrackingParameters || p.tracking || {};
  const money = p.Commissions || p.payment || {};
  const product = p.Product || p.product || {};
  const gross = cents(first(money.charge_amount, p.charge_amount));
  let net = cents(first(money.my_commission, money.net_amount, p.net_amount));
  if (!net) net = gross;
  const when = first(p.approved_date, p.created_at);
  return {
    order_id: String(first(p.order_id, p.id, '')),
    status: String(first(p.order_status, p.status, 'unknown')),
    last_event: p.webhook_event_type || null,
    product_name: first(product.product_name, product.name) || null,
    gross,
    net,
    utm_source: tracking.utm_source || null,
    utm_medium: tracking.utm_medium || null,
    utm_campaign: tracking.utm_campaign || null,
    utm_content: tracking.utm_content || null,
    utm_term: tracking.utm_term || null,
    sale_date: toLocalDate(when, offsetHours(env), now),
    raw: JSON.stringify(p).slice(0, 20000)
  };
}

// Status muda (paid → refunded), valores e origem só são gravados se ainda não existirem
const UPSERT = `INSERT INTO sales
  (order_id, status, last_event, product_name, gross, net, utm_source, utm_medium, utm_campaign,
   utm_content, utm_term, sale_date, created_at, updated_at, raw)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(order_id) DO UPDATE SET
    status = excluded.status,
    last_event = excluded.last_event,
    product_name = COALESCE(sales.product_name, excluded.product_name),
    gross = CASE WHEN sales.gross > 0 THEN sales.gross ELSE excluded.gross END,
    net = CASE WHEN sales.net > 0 THEN sales.net ELSE excluded.net END,
    utm_source = COALESCE(sales.utm_source, excluded.utm_source),
    utm_medium = COALESCE(sales.utm_medium, excluded.utm_medium),
    utm_campaign = COALESCE(sales.utm_campaign, excluded.utm_campaign),
    utm_content = COALESCE(sales.utm_content, excluded.utm_content),
    utm_term = COALESCE(sales.utm_term, excluded.utm_term),
    sale_date = CASE WHEN excluded.status = 'paid' AND sales.status <> 'paid' THEN excluded.sale_date ELSE sales.sale_date END,
    updated_at = excluded.updated_at,
    raw = excluded.raw`;

export async function handleKiwify(request, env, url) {
  const raw = await request.text();
  const ok = await verifySignature(raw, url.searchParams.get('signature'), env.KIWIFY_WEBHOOK_TOKEN);
  if (!ok) return new Response('assinatura inválida', { status: 401 });

  let payload;
  try { payload = JSON.parse(raw); } catch (e) {
    return new Response('JSON inválido', { status: 400 });
  }
  const order = parseOrder(payload, env);
  if (!order.order_id) return new Response('sem order_id', { status: 400 });

  const nowIso = new Date().toISOString();
  await env.DB.prepare(UPSERT).bind(
    order.order_id, order.status, order.last_event, order.product_name, order.gross, order.net,
    order.utm_source, order.utm_medium, order.utm_campaign, order.utm_content, order.utm_term,
    order.sale_date, nowIso, nowIso, order.raw
  ).run();
  return new Response('ok');
}
