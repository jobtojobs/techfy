import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { makeDB } from './d1-shim.mjs';
import worker from '../src/index.js';
import { verifySignature, parseOrder } from '../src/kiwify.js';
import { syncMeta } from '../src/meta.js';
import { summary, computeMetrics } from '../src/metrics.js';
import { toLocalDate } from '../src/dates.js';

const NOW = new Date('2026-11-20T15:00:00Z'); // 12:00 em Brasília

test('assinatura Kiwify confere com o vetor de teste da documentação', async () => {
  const body = '{"order_id":"9b1c2d3e-0000-4000-8000-000000000001","order_status":"paid","webhook_event_type":"order_approved"}';
  assert.equal(await verifySignature(body, 'bf18f352a4f981b91dfa3f6d8742a81080ab8c86', 'kiwify-token-de-teste'), true);
  assert.equal(await verifySignature(body + ' ', 'bf18f352a4f981b91dfa3f6d8742a81080ab8c86', 'kiwify-token-de-teste'), false);
  assert.equal(await verifySignature(body, null, 'kiwify-token-de-teste'), false);
});

test('datas no fuso de Brasília', () => {
  assert.equal(toLocalDate('2026-11-20T02:30:00.000Z', -3), '2026-11-19');
  assert.equal(toLocalDate('2026-11-20 01:00', -3), '2026-11-20');
});

test('lê os dois formatos de venda da Kiwify', () => {
  const env = {};
  const a = parseOrder({ order_id: 'A', order_status: 'paid', approved_date: '2026-11-20 10:00', Product: { product_name: '999Boost' }, Commissions: { charge_amount: '9700', my_commission: '8730' }, TrackingParameters: { utm_campaign: '120' } }, env, NOW);
  assert.deepEqual([a.gross, a.net, a.product_name, a.utm_campaign, a.sale_date], [97, 87.3, '999Boost', '120', '2026-11-20']);
  const b = parseOrder({ id: 'B', status: 'paid', approved_date: '2026-11-19T16:34:35.491Z', product: { name: 'Planilha' }, payment: { charge_amount: 2990, net_amount: 2600 }, tracking: { utm_content: '900' } }, env, NOW);
  assert.deepEqual([b.order_id, b.gross, b.net, b.product_name, b.utm_content, b.sale_date], ['B', 29.9, 26, 'Planilha', '900', '2026-11-19']);
});

test('fórmulas das métricas', () => {
  const m = computeMetrics({ spend: 100, impressions: 10000, reach: 0, clicks: 300, linkClicks: 200, sales: 5, gross: 400, net: 350, platformPurchases: 6, platformValue: 480 }, 0.1);
  assert.equal(m.cpm, 10);
  assert.equal(m.cpc, 0.5);
  assert.equal(m.ctr, 2);
  assert.equal(m.cpa, 20);
  assert.equal(m.roas, 4);
  assert.equal(m.profit, 215);   // 350 * 0,9 - 100
  assert.equal(m.roi, 215);      // 215 / 100 = 215%
  assert.equal(m.ticket, 80);
  assert.equal(m.conversionRate, 2.5);
  const z = computeMetrics({ spend: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0, sales: 0, gross: 0, net: 0, platformPurchases: 0, platformValue: 0 });
  assert.equal(z.cpa, null); assert.equal(z.roas, null); assert.equal(z.roi, null);
});

function fakeMeta(calls) {
  const page2 = { data: [
    { date_start: '2026-11-20', campaign_id: '200', campaign_name: 'Planilha · Lookalike', adset_id: '21', adset_name: 'LAL', ad_id: '901', ad_name: 'Calc', spend: '50.00', impressions: '5000', reach: '4000', clicks: '120', inline_link_clicks: '80' }
  ] };
  const page1 = { data: [
    { date_start: '2026-11-19', campaign_id: '100', campaign_name: '999Boost · Gamers', adset_id: '11', adset_name: 'Gamers', ad_id: '900', ad_name: 'FPS', spend: '100.00', impressions: '10000', reach: '8000', clicks: '300', inline_link_clicks: '200', actions: [{ action_type: 'purchase', value: '3' }, { action_type: 'omni_purchase', value: '4' }], action_values: [{ action_type: 'omni_purchase', value: '388' }] },
    { date_start: '2026-11-20', campaign_id: '100', campaign_name: '999Boost · Gamers', adset_id: '11', adset_name: 'Gamers', ad_id: '900', ad_name: 'FPS', spend: '60.00', impressions: '6000', reach: '5000', clicks: '150', inline_link_clicks: '100' }
  ], paging: { next: 'https://graph.facebook.com/next-page' } };
  return async (url) => {
    calls.push(url);
    const body = url.includes('next-page') ? page2 : page1;
    return { ok: true, status: 200, json: async () => body };
  };
}

async function sendSale(env, payload) {
  const raw = JSON.stringify(payload);
  const sig = createHmac('sha1', env.KIWIFY_WEBHOOK_TOKEN).update(raw).digest('hex');
  return worker.fetch(new Request('https://techfy.test/webhooks/kiwify?signature=' + sig, { method: 'POST', body: raw }), env, {});
}

test('fluxo completo: Meta + Kiwify → métricas atribuídas', async () => {
  const env = { DB: makeDB(), META_ACCESS_TOKEN: 'tok', META_AD_ACCOUNT_IDS: '123', KIWIFY_WEBHOOK_TOKEN: 'segredo', ADMIN_PASSWORD: 'senha', TAX_RATE: '0', TZ_OFFSET_HOURS: '-3' };
  const calls = [];
  const res = await syncMeta(env, 3, fakeMeta(calls), NOW);
  assert.equal(res.rows, 3);
  assert.equal(calls.length, 2, 'seguiu a paginação');
  assert.match(calls[0], /\/v26\.0\/act_123\/insights\?/);
  assert.match(decodeURIComponent(calls[0]), /"since":"2026-11-18","until":"2026-11-20"/);

  // rodar de novo não duplica
  await syncMeta(env, 3, fakeMeta([]), NOW);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM ad_insights').get().n, 3);

  // vendas: por ID de campanha, por nome|id, por ID de anúncio, e uma sem origem
  const ok = await sendSale(env, { order_id: 's1', order_status: 'paid', webhook_event_type: 'order_approved', approved_date: '2026-11-19 20:00', Product: { product_name: '999Boost' }, Commissions: { charge_amount: '9700', my_commission: '8500' }, TrackingParameters: { utm_campaign: '100' } });
  assert.equal(ok.status, 200);
  await sendSale(env, { order_id: 's2', order_status: 'paid', approved_date: '2026-11-20 09:00', Product: { product_name: '999Boost' }, Commissions: { charge_amount: '9700', my_commission: '8500' }, TrackingParameters: { utm_campaign: '999Boost · Gamers|100' } });
  await sendSale(env, { order_id: 's3', order_status: 'paid', approved_date: '2026-11-20 10:00', Product: { product_name: 'Planilha' }, Commissions: { charge_amount: '2990', my_commission: '2500' }, TrackingParameters: { utm_content: '901' } });
  await sendSale(env, { order_id: 's4', order_status: 'paid', approved_date: '2026-11-20 11:00', Product: { product_name: 'Planilha' }, Commissions: { charge_amount: '2990', my_commission: '2500' }, TrackingParameters: {} });

  // assinatura errada é recusada
  const bad = await worker.fetch(new Request('https://techfy.test/webhooks/kiwify?signature=abc', { method: 'POST', body: '{"order_id":"x"}' }), env, {});
  assert.equal(bad.status, 401);

  // reembolso de s2: sai do faturamento, entra em reembolsos, mantém valores
  await sendSale(env, { order_id: 's2', order_status: 'refunded', webhook_event_type: 'order_refunded' });
  const s2 = env.DB.raw.prepare("SELECT status, gross, utm_campaign, sale_date FROM sales WHERE order_id = 's2'").get();
  assert.deepEqual({ ...s2 }, { status: 'refunded', gross: 97, utm_campaign: '999Boost · Gamers|100', sale_date: '2026-11-20' });

  const sum = await summary(env, 3, NOW);
  assert.equal(sum.totals.spend, 210);
  assert.equal(sum.totals.sales, 3);
  assert.equal(sum.totals.gross, 156.8);     // 97 + 29,90 + 29,90
  assert.equal(sum.totals.net, 135);         // 85 + 25 + 25
  assert.equal(sum.totals.profit, -75);
  assert.equal(sum.totals.cpa, 70);
  assert.equal(sum.totals.refunds, 1);
  assert.equal(sum.totals.platformPurchases, 4, 'usa omni_purchase sem somar duas vezes');
  assert.deepEqual(sum.unattributed, { sales: 1, gross: 29.9 });

  const boost = sum.campaigns.find((c) => c.id === '100');
  assert.deepEqual([boost.spend, boost.sales, boost.gross, boost.cpa, boost.roas], [160, 1, 97, 160, 0.61]);
  const plan = sum.campaigns.find((c) => c.id === '200');
  assert.deepEqual([plan.spend, plan.sales, plan.gross, plan.cpa, plan.roas], [50, 1, 29.9, 50, 0.6]);

  const d20 = sum.daily.find((d) => d.date === '2026-11-20');
  assert.deepEqual(d20, { date: '2026-11-20', spend: 110, gross: 59.8, sales: 2 });
  assert.equal(sum.daily.length, 3);
});

test('painel e API exigem senha; webhook e health não', async () => {
  const env = { DB: makeDB(), ADMIN_PASSWORD: 'senha', KIWIFY_WEBHOOK_TOKEN: 't' };
  assert.equal((await worker.fetch(new Request('https://x.test/'), env, {})).status, 401);
  assert.equal((await worker.fetch(new Request('https://x.test/api/summary'), env, {})).status, 401);
  const auth = { authorization: 'Basic ' + btoa('reuber:senha') };
  const page = await worker.fetch(new Request('https://x.test/', { headers: auth }), env, {});
  assert.equal(page.status, 200);
  assert.match(await page.text(), /TechFy/);
  const api = await worker.fetch(new Request('https://x.test/api/summary?days=7', { headers: auth }), env, {});
  assert.equal(api.status, 200);
  assert.equal((await api.json()).period.days, 7);
  const wrong = { authorization: 'Basic ' + btoa('reuber:errada') };
  assert.equal((await worker.fetch(new Request('https://x.test/', { headers: wrong }), env, {})).status, 401);
  assert.equal((await worker.fetch(new Request('https://x.test/health'), env, {})).status, 200);
});

test('erro da Meta fica registrado e aparece na resposta', async () => {
  const env = { DB: makeDB(), META_ACCESS_TOKEN: 'tok', META_AD_ACCOUNT_IDS: 'act_9' };
  const failing = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'Invalid OAuth access token' } }) });
  await assert.rejects(() => syncMeta(env, 3, failing, NOW), /Invalid OAuth access token/);
  const run = env.DB.raw.prepare('SELECT ok, error FROM sync_runs').get();
  assert.equal(run.ok, 0);
  assert.match(run.error, /Invalid OAuth/);
});
