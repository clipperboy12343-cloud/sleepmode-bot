require("dotenv").config();
const fs = require("fs");
const { Telegraf, Markup } = require("telegraf");
const chain = require("./chain");
const { trending } = require("./trends");
const { decide } = require("./analytics");

const bot = new Telegraf(process.env.BOT_TOKEN);
const SOL_PRICE_USD = 109, SCALE_AT_USD = 1000, GAS = 0.05;
const STATE = fs.existsSync("state.json") ? JSON.parse(fs.readFileSync("state.json"))
  : { wallet: null, coins: [], budget: 0.5, mode: "STARTER", spam: false };
const save = () => fs.writeFileSync("state.json", JSON.stringify(STATE, null, 2));
let pending = null, lastTrends = [];

const menu = () => Markup.inlineKeyboard([
  [Markup.button.callback("💼 Add Wallet","add"), Markup.button.callback("🪙 See Coins","coins")],
  [Markup.button.callback("🔥 Make Coin","make"), Markup.button.callback("📈 Trending","trend")],
  [Markup.button.callback("😴 Spam Mode","spam"), Markup.button.callback("💰 Balance","bal")],
  [Markup.button.callback("❓ Help","help")]]);
const yesno = () => Markup.inlineKeyboard([
  [Markup.button.callback("✅ Fire it","fire"), Markup.button.callback("🔁 Reroll","reroll")]]);
const live = () => Markup.inlineKeyboard([
  [Markup.button.callback("💰 Pull Money","pull")], [Markup.button.callback("🏠 Menu","home")]]);

async function refreshBudget() {
  const sol = await chain.walletBalanceSol(), usd = sol * SOL_PRICE_USD;
  STATE.mode = usd >= SCALE_AT_USD ? "SCALED" : "STARTER";
  STATE.budget = Math.min(usd >= SCALE_AT_USD ? 3.0 : 0.5, Math.max(0, sol - GAS) * 0.35);
  save();
}
function ideaFromTrend(t) {
  return { ticker: t.symbol.slice(0,6).replace(/[^A-Z0-9]/g,"") || "MEME",
           name: t.name.slice(0,24), desc: `Copying the ${t.symbol} trend. 100% vibes 🚀` };
}
async function newIdea() {
  const tr = await trending(5);
  if (tr.length) return ideaFromTrend(tr[Math.floor(Math.random()*tr.length)]);
  const t = ["Elon","Cat","AI","Frog"][Math.floor(Math.random()*4)];
  return { ticker: t.toUpperCase().slice(0,4)+Math.floor(10+Math.random()*89),
           name: t+" Goblin", desc: "Pure vibes 🚀" };
}
async function monitor(chatId, coin) {
  const tokens = await chain.tokenBalance(coin.mint);
  const p0 = await chain.priceUsd(coin.mint) || 0, entry = tokens * p0, samples = [p0];
  for (let i = 0; i < 180; i++) {
    await new Promise(r => setTimeout(r, 20000));
    const p = await chain.priceUsd(coin.mint); if (!p) continue;
    samples.push(p);
    const [should, why] = decide(samples, entry, tokens * p);
    if (should) {
      await bot.telegram.sendMessage(chatId, `📉 ${why} — pulling $${coin.ticker}`);
      await chain.sellAll(coin.mint);
      await bot.telegram.sendMessage(chatId, `💰 $${coin.ticker} sold. Money's back. 🦾`);
      return;
    }
  }
}
async function launch(chatId, idea) {
  const img = await chain.makeImage(idea.ticker);
  const r = await chain.createCoin({ name: idea.name, symbol: idea.ticker,
    description: idea.desc, imagePath: img, devBuySol: 0.05 });
  if (!r.ok) return bot.telegram.sendMessage(chatId, "❌ launch failed.");
  const coin = { ...idea, mint: r.mint }; STATE.coins.push(coin); save();
  await bot.telegram.sendMessage(chatId,
    `✅ *$${idea.ticker}* LIVE 🚀\nhttps://dexscreener.com/solana/${r.mint}`, { parse_mode: "Markdown", ...live() });
  await bot.telegram.sendMessage(chatId,
    `👉 *Promote it now (2 taps):* promotememes.fun\nPaste this: \`${r.mint}\``, { parse_mode: "Markdown" });
  monitor(chatId, coin);
}

bot.start(ctx => ctx.reply("Yo boss! 🔥 What's the move?", menu()));
bot.action("home", ctx => ctx.editMessageText("🏠 Menu", menu()));
bot.action("help", ctx => ctx.editMessageText(
  "🔥 Make Coin — I pitch, you yes/no\n📈 Trending — copy a real trending coin\n" +
  "😴 Spam Mode — auto-fires while you sleep\n💰 Pull Money — sell now\n/stop /status", menu()));
bot.action("bal", async ctx => { await refreshBudget();
  ctx.editMessageText(`💰 Mode: ${STATE.mode}\nBudget: ${STATE.budget.toFixed(3)} SOL\nCoins: ${STATE.coins.length}`, menu()); });
bot.action("add", ctx => ctx.editMessageText("Paste your wallet private key:"));
bot.action("coins", ctx => ctx.editMessageText(STATE.coins.length
  ? "🪙 " + STATE.coins.slice(-10).map(c=>`$${c.ticker}`).join(", ") : "Empty, boss.", menu()));

bot.action("trend", async ctx => {
  await ctx.editMessageText("📈 Grabbing live trends…");
  lastTrends = await trending(5);
  if (!lastTrends.length) return ctx.editMessageText("Couldn't load trends. Try Make Coin.", menu());
  const rows = lastTrends.map((t, i) => [Markup.button.callback(`${i+1}. $${t.symbol} — ${t.name}`, `pick:${i}`)]);
  rows.push([Markup.button.callback("🏠 Menu","home")]);
  ctx.editMessageText("📈 *Trending right now* — tap one to copy:", { parse_mode: "Markdown", ...Markup.inlineKeyboard(rows) });
});
bot.action(/^pick:(\d+)$/, ctx => {
  const t = lastTrends[+ctx.match[1]]; if (!t) return ctx.answerCbQuery("gone");
  pending = ideaFromTrend(t);
  ctx.editMessageText(`Copying trend:\n\n*$${pending.ticker}* — ${pending.name}\n${pending.desc}\n\nFire it?`,
    { parse_mode: "Markdown", ...yesno() });
});
bot.action(["make","reroll"], async ctx => {
  pending = await newIdea();
  ctx.editMessageText(`🍳 Cooking…\n\n*$${pending.ticker}* — ${pending.name}\n${pending.desc}\n\nFire it?`,
    { parse_mode: "Markdown", ...yesno() });
});
bot.action("fire", async ctx => {
  await ctx.editMessageText(`🚀 Firing *$${pending.ticker}*…`, { parse_mode: "Markdown" });
  launch(ctx.chat.id, pending);
});
bot.action("pull", async ctx => { const c = STATE.coins.at(-1);
  await ctx.editMessageText("💰 Pulling…"); if (c) { await chain.sellAll(c.mint); ctx.reply(`Done — $${c.ticker} sold. 🦾`, menu()); } });
bot.action("spam", async ctx => {
  STATE.spam = !STATE.spam; save();
  if (!STATE.spam) return ctx.editMessageText("😴 Spam OFF.", menu());
  await refreshBudget();
  ctx.editMessageText(`😴 Spam ON — auto-firing real trending coins. Budget ${STATE.budget.toFixed(3)} SOL.`, menu());
  (async () => { while (STATE.spam) { await launch(ctx.chat.id, await newIdea()); await new Promise(r=>setTimeout(r,30000)); } })();
});
bot.command("stop", ctx => { STATE.spam = false; save(); ctx.reply("Stopped. 😴"); });
bot.command("status", ctx => ctx.reply(`mode=${STATE.mode} spam=${STATE.spam} coins=${STATE.COINS||STATE.coins.length}`));
bot.on("text", ctx => { const t = ctx.message.text.trim();
  if (t.length > 40) { STATE.wallet = t.slice(0,6)+"…"+t.slice(-4); save(); ctx.reply("Wallet saved 💼", menu()); } });

bot.launch();
console.log("running");
