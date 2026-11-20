// Cálculo das métricas: junta o gasto (Meta) com as vendas reais (Kiwify)
import { addDays, localDate, offsetHours } from './dates.js';

const ratio = (a, b) => (b ? a / b : null);
const round = (n, d = 2) => (n === null || n === undefined ? null : Math.round(n * 10 ** d) / 10 ** d);

// Calcula o conjunto padrão de métricas a partir das somas
export function computeMetrics(t, taxRate = 0) {
  const profit = t.net * (1 - taxRate) - t.spend;
  return {
    spend: round(t.spend),
    impressions: t.impressions,
    reach: t.reach,
    clicks: t.clicks,
    linkClicks: t.linkClicks,
    sales: t.sales,
    gross: round(t.gross),
    net: round(t.net),
    profit: round(profit),
    cpm: round(ratio(t.spend * 1000, t.impressions)),
    cpc: round(ratio(t.spend, t.linkClicks)),
    ctr: round(ratio(t.linkClicks * 100, t.impressions)),
    cpa: round(ratio(t.spend, t.sales)),
    roas: round(ratio(t.gross, t.spend)),
    roi: t.spend ? round((profit / t.spend) * 100, 1) : null,
    ticket: round(ratio(t.gross, t.sales)),
    conversionRate: round(ratio(t.sales * 100, t.linkClicks)),
    platformPurchases: round(t.platformPurchases, 0),
    platformValue: round(t.platformValue)
  };
}

function emptyTotals() {
  return { spend: 0, impressions: 0, reach: 0, clicks: 0, linkClicks: 0, sales: 0, gross: 0, net: 0, platformPurchases: 0, platformValue: 0 };
}

// Descobre a campanha de uma venda pelas UTMs.
// Aceita ID ou nome da campanha em utm_campaign (inclusive "nome|id"),
// ID do anúncio em utm_content e ID do conjunto em utm_term.
export function attribute(sale, maps) {
  const parts = (v) => String(v || '').split('|').map((s) => s.trim()).filter(Boolean);
  for (const p of parts(sale.utm_campaign)) {
    if (maps.campaignById.has(p)) return p;
    const byName = maps.campaignByName.get(p.toLowerCase());
    if (byName) return byName;
  }
  for (const p of parts(sale.utm_content)) if (maps.campaignByAd.has(p)) return maps.campaignByAd.get(p);
  for (const p of parts(sale.utm_term)) if (maps.campaignByAdset.has(p)) return maps.campaignByAdset.get(p);
  return null;
}

export async function summary(env, days = 14, now = new Date()) {
  const db = env.DB;
  const taxRate = Math.min(Math.max(Number(env.TAX_RATE) || 0, 0), 0.9);
  const span = Math.max(1, Math.min(Number(days) || 14, 365));
  const until = localDate(now, offsetHours(env));
  const since = addDays(until, -(span - 1));

  const [insightRows, idRows, saleRows, refundRow, lastSync] = await Promise.all([
    db.prepare(`SELECT date, campaign_id, MAX(campaign_name) AS campaign_name,
        SUM(spend) AS spend, SUM(impressions) AS impressions, SUM(reach) AS reach,
        SUM(clicks) AS clicks, SUM(link_clicks) AS link_clicks,
        SUM(platform_purchases) AS pp, SUM(platform_purchase_value) AS pv
      FROM ad_insights WHERE date BETWEEN ? AND ?
      GROUP BY date, campaign_id`).bind(since, until).all(),
    db.prepare('SELECT DISTINCT campaign_id, campaign_name, adset_id, ad_id FROM ad_insights').all(),
    db.prepare(`SELECT order_id, product_name, gross, net, utm_campaign, utm_content, utm_term, sale_date
      FROM sales WHERE status = 'paid' AND sale_date BETWEEN ? AND ?`).bind(since, until).all(),
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(gross), 0) AS v FROM sales
      WHERE status IN ('refunded', 'chargedback') AND sale_date BETWEEN ? AND ?`).bind(since, until).first(),
    db.prepare("SELECT finished_at, ok, rows, error FROM sync_runs WHERE platform = 'meta' ORDER BY id DESC LIMIT 1").first()
  ]);

  const maps = { campaignById: new Map(), campaignByName: new Map(), campaignByAd: new Map(), campaignByAdset: new Map() };
  for (const r of idRows.results || []) {
    maps.campaignById.set(r.campaign_id, r.campaign_name);
    if (r.campaign_name) maps.campaignByName.set(r.campaign_name.toLowerCase(), r.campaign_id);
    if (r.ad_id) maps.campaignByAd.set(r.ad_id, r.campaign_id);
    if (r.adset_id) maps.campaignByAdset.set(r.adset_id, r.campaign_id);
  }

  const totals = emptyTotals();
  const byCampaign = new Map();
  const daily = new Map();
  for (let d = since; d <= until; d = addDays(d, 1)) daily.set(d, { date: d, spend: 0, gross: 0, sales: 0 });

  const campaignOf = (id, name) => {
    if (!byCampaign.has(id)) byCampaign.set(id, { id, name: name || maps.campaignById.get(id) || id, platform: 'meta', t: emptyTotals() });
    return byCampaign.get(id);
  };

  for (const r of insightRows.results || []) {
    const c = campaignOf(r.campaign_id, r.campaign_name);
    for (const t of [totals, c.t]) {
      t.spend += r.spend || 0; t.impressions += r.impressions || 0; t.reach += r.reach || 0;
      t.clicks += r.clicks || 0; t.linkClicks += r.link_clicks || 0;
      t.platformPurchases += r.pp || 0; t.platformValue += r.pv || 0;
    }
    if (daily.has(r.date)) daily.get(r.date).spend += r.spend || 0;
  }

  const unattributed = { sales: 0, gross: 0 };
  const products = new Map();
  for (const s of saleRows.results || []) {
    totals.sales += 1; totals.gross += s.gross || 0; totals.net += s.net || 0;
    if (daily.has(s.sale_date)) { const d = daily.get(s.sale_date); d.gross += s.gross || 0; d.sales += 1; }
    const pname = s.product_name || 'Sem nome';
    const p = products.get(pname) || { name: pname, sales: 0, gross: 0 };
    p.sales += 1; p.gross += s.gross || 0; products.set(pname, p);

    const cid = attribute(s, maps);
    if (cid) {
      const c = campaignOf(cid);
      c.t.sales += 1; c.t.gross += s.gross || 0; c.t.net += s.net || 0;
    } else {
      unattributed.sales += 1; unattributed.gross += s.gross || 0;
    }
  }

  const campaigns = [...byCampaign.values()]
    .map((c) => Object.assign({ id: c.id, name: c.name, platform: c.platform }, computeMetrics(c.t, taxRate)))
    .sort((a, b) => (b.spend || 0) - (a.spend || 0));

  const refunds = { count: refundRow ? refundRow.n : 0, gross: round(refundRow ? refundRow.v : 0) };
  const refundBase = totals.sales + refunds.count;

  return {
    period: { since, until, days: span },
    taxRate,
    totals: Object.assign(computeMetrics(totals, taxRate), {
      refunds: refunds.count,
      refundRate: refundBase ? round((refunds.count / refundBase) * 100, 1) : null
    }),
    daily: [...daily.values()].map((d) => ({ date: d.date, spend: round(d.spend), gross: round(d.gross), sales: d.sales })),
    campaigns,
    products: [...products.values()].map((p) => ({ name: p.name, sales: p.sales, gross: round(p.gross) })).sort((a, b) => b.gross - a.gross),
    unattributed: { sales: unattributed.sales, gross: round(unattributed.gross) },
    lastSync: lastSync || null
  };
}
