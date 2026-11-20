// Sincronização das métricas da Meta Ads (Marketing API, endpoint /insights)
import { addDays, localDate, offsetHours } from './dates.js';

const FIELDS = [
  'campaign_id', 'campaign_name', 'adset_id', 'adset_name', 'ad_id', 'ad_name',
  'spend', 'impressions', 'reach', 'clicks', 'inline_link_clicks', 'actions', 'action_values'
];

// Ordem de preferência: omni_purchase já soma site + app sem contar duas vezes
const PURCHASE_TYPES = ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase'];

export function accountIds(env) {
  return String(env.META_AD_ACCOUNT_IDS || '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith('act_') ? s : 'act_' + s));
}

export function pickPurchase(list) {
  if (!Array.isArray(list)) return 0;
  for (const type of PURCHASE_TYPES) {
    const item = list.find((a) => a.action_type === type);
    if (item) return Number(item.value) || 0;
  }
  return 0;
}

export function normalizeRow(accountId, row, nowIso) {
  return {
    date: row.date_start,
    account_id: accountId,
    campaign_id: String(row.campaign_id || ''),
    campaign_name: row.campaign_name || null,
    adset_id: row.adset_id ? String(row.adset_id) : null,
    adset_name: row.adset_name || null,
    ad_id: String(row.ad_id || ''),
    ad_name: row.ad_name || null,
    spend: Number(row.spend) || 0,
    impressions: parseInt(row.impressions, 10) || 0,
    reach: parseInt(row.reach, 10) || 0,
    clicks: parseInt(row.clicks, 10) || 0,
    link_clicks: parseInt(row.inline_link_clicks, 10) || 0,
    platform_purchases: pickPurchase(row.actions),
    platform_purchase_value: pickPurchase(row.action_values),
    updated_at: nowIso
  };
}

export async function fetchInsights(env, accountId, since, until, fetchImpl = fetch) {
  const version = env.META_API_VERSION || 'v26.0';
  const params = new URLSearchParams({
    level: 'ad',
    time_increment: '1',
    time_range: JSON.stringify({ since, until }),
    fields: FIELDS.join(','),
    limit: '500',
    access_token: env.META_ACCESS_TOKEN
  });
  let url = `https://graph.facebook.com/${version}/${accountId}/insights?${params}`;
  const rows = [];
  let pages = 0;
  while (url && pages < 200) {
    const res = await fetchImpl(url);
    let body;
    try { body = await res.json(); } catch (e) { body = {}; }
    if (!res.ok || body.error) {
      const msg = (body.error && body.error.message) || `HTTP ${res.status}`;
      throw new Error(`Meta (${accountId}): ${msg}`);
    }
    rows.push(...(body.data || []));
    url = (body.paging && body.paging.next) || null;
    pages++;
  }
  return rows;
}

const UPSERT = `INSERT INTO ad_insights
  (platform, date, account_id, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name,
   spend, impressions, reach, clicks, link_clicks, platform_purchases, platform_purchase_value, updated_at)
  VALUES ('meta', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(platform, ad_id, date) DO UPDATE SET
    account_id = excluded.account_id, campaign_id = excluded.campaign_id, campaign_name = excluded.campaign_name,
    adset_id = excluded.adset_id, adset_name = excluded.adset_name, ad_name = excluded.ad_name,
    spend = excluded.spend, impressions = excluded.impressions, reach = excluded.reach,
    clicks = excluded.clicks, link_clicks = excluded.link_clicks,
    platform_purchases = excluded.platform_purchases,
    platform_purchase_value = excluded.platform_purchase_value, updated_at = excluded.updated_at`;

// Puxa os últimos `days` dias (a Meta ainda ajusta os números dos dias recentes)
export async function syncMeta(env, days = 3, fetchImpl = fetch, now = new Date()) {
  const ids = accountIds(env);
  if (!env.META_ACCESS_TOKEN || ids.length === 0) {
    throw new Error('Meta não configurada: defina META_ACCESS_TOKEN e META_AD_ACCOUNT_IDS');
  }
  const startedAt = now.toISOString();
  const run = await env.DB.prepare(
    "INSERT INTO sync_runs (platform, started_at) VALUES ('meta', ?) RETURNING id"
  ).bind(startedAt).first();

  const until = localDate(now, offsetHours(env));
  const since = addDays(until, -(Math.max(1, Math.min(days, 90)) - 1));
  let total = 0;
  try {
    for (const id of ids) {
      const rows = await fetchInsights(env, id, since, until, fetchImpl);
      const stmts = rows
        .map((r) => normalizeRow(id, r, startedAt))
        .filter((r) => r.ad_id && r.date)
        .map((r) => env.DB.prepare(UPSERT).bind(
          r.date, r.account_id, r.campaign_id, r.campaign_name, r.adset_id, r.adset_name,
          r.ad_id, r.ad_name, r.spend, r.impressions, r.reach, r.clicks, r.link_clicks,
          r.platform_purchases, r.platform_purchase_value, r.updated_at
        ));
      for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
      total += stmts.length;
    }
    await env.DB.prepare('UPDATE sync_runs SET finished_at = ?, ok = 1, rows = ? WHERE id = ?')
      .bind(new Date().toISOString(), total, run.id).run();
    return { ok: true, rows: total, since, until };
  } catch (err) {
    await env.DB.prepare('UPDATE sync_runs SET finished_at = ?, ok = 0, rows = ?, error = ? WHERE id = ?')
      .bind(new Date().toISOString(), total, String(err.message || err).slice(0, 500), run.id).run();
    throw err;
  }
}
