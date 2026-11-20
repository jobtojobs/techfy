// Painel web servido pelo Worker. Todos os textos vindos dos dados entram via textContent.
export const DASHBOARD_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TechFy — campanhas</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;background:#0A0E14;color:#E8EDF5;font:14px Inter,system-ui,sans-serif}
h1,h2,p{margin:0}
.wrap{max-width:1360px;margin:0 auto;padding:28px 24px 64px;display:flex;flex-direction:column;gap:22px}
.top{display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:12px}
.brand b{font:700 22px 'Space Grotesk',Inter,sans-serif}
.muted{color:#9AA6B9}
.card{background:#111722;border:1px solid #1F2A3A;border-radius:16px;padding:20px}
.h2{font:600 17px 'Space Grotesk',Inter,sans-serif}
.seg{display:inline-flex;padding:4px;gap:4px;background:#111722;border:1px solid #1F2A3A;border-radius:12px}
.seg button{min-height:36px;padding:0 14px;border:0;border-radius:8px;background:transparent;color:#9AA6B9;font:600 13px Inter,sans-serif;cursor:pointer}
.seg button.on{background:#222C3F;color:#E8EDF5}
.btn{min-height:44px;padding:0 18px;border-radius:10px;border:1px solid #C5F04A;background:#C5F04A;color:#0A0E14;font:600 14px Inter,sans-serif;cursor:pointer}
.btn:disabled{opacity:.6;cursor:wait}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px}
.kpi{display:flex;flex-direction:column;gap:8px;padding:16px 18px}
.kpi .v{font:700 24px 'Space Grotesk',Inter,sans-serif;font-variant-numeric:tabular-nums}
.kpi .l{font-size:13px;color:#9AA6B9;font-weight:500}
.kpi .s{font-size:12px;color:#9AA6B9}
.good{color:#C5F04A}.bad{color:#FFB680}
.row{display:flex;flex-wrap:wrap;gap:18px}
.grow2{flex:2 1 520px;min-width:0}.grow1{flex:1 1 300px;min-width:0}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%}
th{text-align:left;font:600 12px Inter,sans-serif;color:#9AA6B9;text-transform:uppercase;letter-spacing:.04em;padding:10px 12px;border-bottom:1px solid #1F2A3A;white-space:nowrap}
td{padding:12px;border-bottom:1px solid #182130;white-space:nowrap;font-variant-numeric:tabular-nums}
th.n,td.n{text-align:right}
.alert{padding:14px 16px;border-radius:12px;background:#35210F;color:#FFD2AE;font-size:14px;line-height:1.5}
.ok{padding:14px 16px;border-radius:12px;background:#16200F;color:#D9F59A;font-size:14px;line-height:1.5}
.list{display:flex;flex-direction:column;gap:10px}
.item{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:10px;background:#0E141D}
.legend{display:flex;gap:16px;font-size:13px}.legend i{display:inline-block;width:12px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div class="brand">
      <svg width="36" height="36" viewBox="0 0 34 34" aria-hidden="true"><rect width="34" height="34" rx="9" fill="#C5F04A"/><path d="M19 7 L10 19 H16 L14 27 L24 14 H18 Z" fill="#0A0E14"/></svg>
      <div><b>TechFy</b><div class="muted" id="sync">carregando…</div></div>
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
      <div class="seg" role="group" aria-label="Período">
        <button data-d="1">Hoje</button><button data-d="7">7 dias</button><button data-d="14" class="on">14 dias</button><button data-d="30">30 dias</button>
      </div>
      <button class="btn" id="syncBtn">Atualizar agora</button>
    </div>
  </div>
  <div id="notices" class="list"></div>
  <div class="kpis" id="kpis"></div>
  <div class="row">
    <div class="card grow2" style="display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <div><h2 class="h2">Investimento x faturamento</h2><p class="muted" style="font-size:13px">Faturamento = vendas aprovadas na Kiwify</p></div>
        <div class="legend"><span><i style="background:#C5F04A"></i>Faturamento</span><span><i style="background:#6E8BC4"></i>Investimento</span></div>
      </div>
      <svg id="chart" viewBox="0 0 800 220" preserveAspectRatio="none" style="width:100%;height:220px" role="img" aria-label="Gráfico diário"></svg>
      <div class="muted" style="display:flex;justify-content:space-between;font-size:12px"><span id="c0"></span><span id="c1"></span></div>
    </div>
    <div class="card grow1" style="display:flex;flex-direction:column;gap:14px">
      <h2 class="h2">Vendas por produto</h2>
      <div class="list" id="products"></div>
      <div id="unattr"></div>
    </div>
  </div>
  <div class="card">
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:8px">
      <h2 class="h2">Campanhas</h2><span class="muted" style="font-size:13px">Vendas e faturamento reais, atribuídos pelas UTMs</span>
    </div>
    <div class="scroll"><table>
      <thead><tr><th>Campanha</th><th class="n">Investido</th><th class="n">Vendas</th><th class="n">Faturamento</th><th class="n">CPA</th><th class="n">ROAS</th><th class="n">ROI</th><th class="n">CPM</th><th class="n">CPC</th><th class="n">CTR</th><th class="n">Conv.</th><th class="n">Compras (Meta)</th></tr></thead>
      <tbody id="rows"></tbody>
    </table></div>
  </div>
</div>
<script>
var days = 14;
var brl = function (v) { return v === null || v === undefined ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
var num = function (v, d) { return v === null || v === undefined ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); };
var pct = function (v) { return v === null || v === undefined ? '—' : num(v, 1) + '%'; };
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

function kpi(label, value, sub, cls) {
  var c = el('div', 'card kpi');
  c.appendChild(el('span', 'l', label));
  c.appendChild(el('span', 'v ' + (cls || ''), value));
  if (sub) c.appendChild(el('span', 's', sub));
  return c;
}

function render(data, status) {
  var t = data.totals;
  var s = data.lastSync;
  document.getElementById('sync').textContent = s && s.finished_at
    ? 'Meta atualizada em ' + new Date(s.finished_at).toLocaleString('pt-BR') + (s.ok ? '' : ' (com erro)')
    : 'Meta ainda não sincronizada';

  var notices = document.getElementById('notices'); notices.textContent = '';
  if (!status.meta.configured) notices.appendChild(el('div', 'alert', 'Meta não conectada: defina META_ACCESS_TOKEN e META_AD_ACCOUNT_IDS (veja o README).'));
  if (s && !s.ok && s.error) notices.appendChild(el('div', 'alert', 'Erro na última sincronização da Meta: ' + s.error));
  if (!status.kiwify.configured) notices.appendChild(el('div', 'alert', 'Kiwify não conectada: defina KIWIFY_WEBHOOK_TOKEN e cadastre o webhook.'));
  else if (!status.kiwify.sales) notices.appendChild(el('div', 'alert', 'Nenhuma venda recebida da Kiwify ainda. Use "Testar webhook" no painel da Kiwify.'));

  var k = document.getElementById('kpis'); k.textContent = '';
  k.appendChild(kpi('Investimento', brl(t.spend), num(t.impressions) + ' impressões'));
  k.appendChild(kpi('Faturamento', brl(t.gross), 'Líquido: ' + brl(t.net)));
  k.appendChild(kpi('Lucro', brl(t.profit), data.taxRate ? 'após taxas e ' + num(data.taxRate * 100, 1) + '% de imposto' : 'após taxas da Kiwify', t.profit >= 0 ? 'good' : 'bad'));
  k.appendChild(kpi('ROAS', num(t.roas, 2), 'faturamento ÷ investimento'));
  k.appendChild(kpi('ROI', pct(t.roi), 'lucro ÷ investimento', t.roi >= 0 ? 'good' : 'bad'));
  k.appendChild(kpi('Vendas', num(t.sales), 'Ticket médio: ' + brl(t.ticket)));
  k.appendChild(kpi('CPA', brl(t.cpa), 'custo por venda'));
  k.appendChild(kpi('CPM', brl(t.cpm), 'custo por mil impressões'));
  k.appendChild(kpi('CPC', brl(t.cpc), 'custo por clique no link'));
  k.appendChild(kpi('CTR', pct(t.ctr), num(t.linkClicks) + ' cliques no link'));
  k.appendChild(kpi('Conversão', pct(t.conversionRate), 'cliques que viraram venda'));
  k.appendChild(kpi('Reembolsos', num(t.refunds), t.refundRate === null ? 'sem vendas no período' : pct(t.refundRate) + ' das vendas', t.refunds ? 'bad' : ''));

  // gráfico
  var d = data.daily, n = d.length, W = 800, H = 220, P = 10;
  var max = 1; d.forEach(function (p) { max = Math.max(max, p.gross, p.spend); }); max *= 1.12;
  var x = function (i) { return n === 1 ? W / 2 : P + i * (W - 2 * P) / (n - 1); };
  var y = function (v) { return H - P - (v / max) * (H - 2 * P); };
  var line = function (key) { return d.map(function (p, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p[key]).toFixed(1); }).join(' '); };
  var svg = document.getElementById('chart');
  var g = line('gross');
  svg.innerHTML = '<line x1="0" y1="55" x2="800" y2="55" stroke="#1A2332"/><line x1="0" y1="110" x2="800" y2="110" stroke="#1A2332"/><line x1="0" y1="165" x2="800" y2="165" stroke="#1A2332"/>'
    + '<path d="' + g + ' L ' + x(n - 1).toFixed(1) + ' ' + (H - P) + ' L ' + x(0).toFixed(1) + ' ' + (H - P) + ' Z" fill="#C5F04A" fill-opacity="0.08"/>'
    + '<path d="' + line('spend') + '" fill="none" stroke="#6E8BC4" stroke-width="2.5" vector-effect="non-scaling-stroke"/>'
    + '<path d="' + g + '" fill="none" stroke="#C5F04A" stroke-width="3" vector-effect="non-scaling-stroke"/>';
  var fmtD = function (s) { return s.slice(8, 10) + '/' + s.slice(5, 7); };
  document.getElementById('c0').textContent = fmtD(data.period.since);
  document.getElementById('c1').textContent = fmtD(data.period.until);

  var pr = document.getElementById('products'); pr.textContent = '';
  if (!data.products.length) pr.appendChild(el('p', 'muted', 'Sem vendas no período.'));
  data.products.forEach(function (p) {
    var it = el('div', 'item'); it.appendChild(el('span', '', p.name));
    it.appendChild(el('span', 'muted', num(p.sales) + ' · ' + brl(p.gross))); pr.appendChild(it);
  });
  var un = document.getElementById('unattr'); un.textContent = '';
  if (data.unattributed.sales) un.appendChild(el('div', 'alert', data.unattributed.sales + ' venda(s) sem campanha identificada (' + brl(data.unattributed.gross) + '). Confira as UTMs nos anúncios.'));
  else if (t.sales) un.appendChild(el('div', 'ok', 'Todas as vendas do período têm campanha identificada.'));

  var rows = document.getElementById('rows'); rows.textContent = '';
  if (!data.campaigns.length) {
    var tr0 = el('tr'); var td0 = el('td', 'muted', 'Nenhuma campanha com dados no período.'); td0.colSpan = 12; tr0.appendChild(td0); rows.appendChild(tr0);
  }
  data.campaigns.forEach(function (c) {
    var tr = el('tr');
    var name = el('td'); name.appendChild(el('div', '', c.name)); name.lastChild.style.fontWeight = '600';
    tr.appendChild(name);
    [[brl(c.spend)], [num(c.sales)], [brl(c.gross)], [brl(c.cpa)], [num(c.roas, 2), c.roas === null ? '' : (c.roas >= 2 ? 'good' : (c.roas < 1 ? 'bad' : ''))],
     [pct(c.roi), c.roi === null ? '' : (c.roi >= 0 ? 'good' : 'bad')], [brl(c.cpm)], [brl(c.cpc)], [pct(c.ctr)], [pct(c.conversionRate)], [num(c.platformPurchases)]]
      .forEach(function (v) { tr.appendChild(el('td', 'n ' + (v[1] || ''), v[0])); });
    rows.appendChild(tr);
  });
}

function load() {
  Promise.all([fetch('/api/summary?days=' + days).then(function (r) { return r.json(); }), fetch('/api/status').then(function (r) { return r.json(); })])
    .then(function (res) {
      if (res[0].error) throw new Error(res[0].error);
      render(res[0], res[1]);
    })
    .catch(function (e) { var n = document.getElementById('notices'); n.textContent = ''; n.appendChild(el('div', 'alert', 'Erro ao carregar: ' + e.message)); });
}

document.querySelectorAll('.seg button').forEach(function (b) {
  b.addEventListener('click', function () {
    days = Number(b.dataset.d);
    document.querySelectorAll('.seg button').forEach(function (o) { o.classList.toggle('on', o === b); });
    load();
  });
});
document.getElementById('syncBtn').addEventListener('click', function () {
  var b = this; b.disabled = true; b.textContent = 'Atualizando…';
  fetch('/api/sync?days=' + Math.max(days, 3), { method: 'POST' }).then(function (r) { return r.json(); })
    .then(function (r) { if (r.error) throw new Error(r.error); load(); })
    .catch(function (e) { var n = document.getElementById('notices'); n.prepend(el('div', 'alert', 'Falha ao atualizar: ' + e.message)); })
    .finally(function () { b.disabled = false; b.textContent = 'Atualizar agora'; });
});
load();
setInterval(load, 5 * 60 * 1000);
</script>
</body>
</html>`;
