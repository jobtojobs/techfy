# TechFy — rastreamento de campanhas

Junta o **gasto da Meta Ads** com as **vendas reais da Kiwify** e calcula, por campanha e no total:

| Métrica | Fórmula |
|---|---|
| **CPA** (custo por venda) | investimento ÷ vendas |
| **ROAS** | faturamento ÷ investimento |
| **Lucro** | receita líquida (após taxas da Kiwify) − imposto − investimento |
| **ROI** | lucro ÷ investimento |
| **Ticket médio** | faturamento ÷ vendas |
| **CPM** | investimento ÷ impressões × 1000 |
| **CPC** | investimento ÷ cliques no link |
| **CTR** | cliques no link ÷ impressões |
| **Conversão** | vendas ÷ cliques no link |
| **Reembolsos** | reembolsos e chargebacks no período |

A coluna "Compras (Meta)" mostra o que a Meta *diz* ter vendido, para você comparar com o real.

Roda inteiro na **Cloudflare** (plano grátis): um Worker com o painel e a API, o banco D1 e uma atualização automática a cada 30 minutos.

---

## 1. Instalar e subir (uma vez)

Pré-requisitos: Node.js 20+ e uma conta na Cloudflare.

```bash
npm install
npx wrangler login
npx wrangler d1 create techfy
```

Copie o `database_id` que aparecer e cole em `wrangler.toml` no lugar de `COLE_AQUI_O_ID_DO_BANCO`. Depois:

```bash
npm run db:init
npx wrangler secret put ADMIN_PASSWORD        # senha para entrar no painel
npm run deploy
```

O endereço do painel aparece no final do deploy (algo como `https://techfy.SEU-USUARIO.workers.dev`). Para entrar, use qualquer usuário e a senha que você definiu.

## 2. Conectar a Meta

1. Em **developers.facebook.com** › Meus apps › Criar app › tipo **Empresa**, ligado à sua BM.
2. No app, adicione o produto **API de Marketing**.
3. Na BM (**business.facebook.com** › Configurações › Usuários › **Usuários do sistema**): crie um usuário do sistema **Administrador**. Em "Atribuir ativos", dê acesso às suas contas de anúncio.
4. No mesmo usuário do sistema: **Gerar token** › escolha o app › marque `ads_read` (e `ads_management` para, no futuro, publicar campanhas) › validade **Nunca expira**.
5. Pegue o ID de cada conta de anúncio (no Gerenciador, fica no seletor de contas).

```bash
npx wrangler secret put META_ACCESS_TOKEN       # o token gerado
npx wrangler secret put META_AD_ACCOUNT_IDS     # ex.: act_1234567890,act_9876543210
```

No painel, clique em **Atualizar agora**. Para puxar o histórico de 30 dias uma vez:

```bash
curl -X POST -u x:SUA_SENHA "https://SEU-ENDERECO/api/sync?days=30"
```

> Para ler as métricas das suas próprias contas o app pode ficar em modo de desenvolvimento, sem App Review e sem CNPJ.

## 3. Conectar a Kiwify

1. Invente um token (uma frase longa e aleatória) e salve:
   ```bash
   npx wrangler secret put KIWIFY_WEBHOOK_TOKEN
   ```
2. Na Kiwify: **Apps › Webhooks › Criar webhook**
   - URL: `https://SEU-ENDERECO/webhooks/kiwify`
   - Token: o mesmo do passo anterior
   - Eventos: **Compra aprovada**, **Compra reembolsada**, **Chargeback**
   - Produtos: todos
3. Clique em **Testar webhook**. O aviso "nenhuma venda recebida" some do painel.

O Worker confere a assinatura de cada envio (HMAC-SHA1 com o seu token) e recusa o que não vier da Kiwify.

## 4. UTMs nos anúncios (obrigatório para atribuir as vendas)

Sem UTM, a venda entra no total, mas não aparece em nenhuma campanha. Em **cada anúncio** da Meta › Rastreamento › **Parâmetros de URL**, cole:

```
utm_source=meta&utm_medium=paid&utm_campaign={{campaign.id}}&utm_content={{ad.id}}&utm_term={{adset.id}}
```

A Kiwify repassa as UTMs do link da página de vendas para o checkout, desde que **a página leve o visitante ao checkout com os mesmos parâmetros**. Em página própria (Cloudflare Pages), o botão de compra precisa repassar `location.search` para o link da Kiwify.

O painel avisa quantas vendas ficaram sem campanha identificada.

## 5. Ajustes

Em `wrangler.toml`:
- `TAX_RATE`: imposto sobre a receita líquida para o ROI (ex.: `0.06` para 6%).
- `TZ_OFFSET_HOURS`: fuso das datas (`-3`, Brasília).
- `META_API_VERSION`: versão da API da Meta (`v26.0`).

## Testes

```bash
npm test
```

Simula a Meta e a Kiwify num banco local e confere assinatura, atribuição, reembolsos e todas as fórmulas.

## Próximos passos

- Google Ads (mesma tabela `ad_insights`, `platform = 'google'`)
- Métricas por conjunto e por anúncio, e ranking de criativos
- Analista diário com Claude e alertas no WhatsApp
- Regras automáticas e publicação de campanhas (exige App Review da Meta)
