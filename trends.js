async function trending(limit = 5) {
  try {
    const r = await fetch("https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?page=1");
    const j = await r.json();
    return (j.data || []).slice(0, limit).map(p => {
      const a = p.attributes || {};
      const sym = (a.base_token_symbol || a.name || "?").slice(0, 8).toUpperCase();
      return { symbol: sym, name: a.name || sym, price: a.base_token_price_usd };
    });
  } catch { return []; }
}
module.exports = { trending };
