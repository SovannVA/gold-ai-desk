# Gold AI Desk

A trading desk for short-term gold (XAU/USD) that runs in your browser and is hosted free on GitHub Pages. It has live prices, a live signal, world markets, the economic calendar, an AI team led by Claude, chart-picture analysis, a data explorer, a backtester, a journal and tools. Dark and light themes. Works on desktop and phone. Protected by Sign in with Google.

> Educational tool. Signals and AI analysis are not predictions and can be wrong. Test on a demo account first. Not financial advice.

## Files

```
index.html      page layout
styles.css      design (dark and light themes)
config.js       YOUR Google sign-in settings (edit once, keep it when you update)
js/core.js      settings, helpers, theme, navigation
js/ind.js       indicators: EMA, RSI, ATR, MACD, Bollinger, Stochastic, ADX, pivots, swings, Fibonacci
js/data.js      prices: rate limit, streaming, price checks, refresh loop
js/analysis.js  conditions, signal, levels, multi-timeframe, best hours, backtest
js/charts.js    charts and TradingView widgets
js/ai.js        news brief, AI team, picture analysis
js/views.js     page rendering
js/main.js      wiring and sign-in
smc.js          Smart Money Concepts chart
```

## Pages

| Page | What you get |
|---|---|
| Dashboard | Big live price with tick flash, today's open, high, low and previous close, range bar (with previous-day high and low), "used X% of usual daily range", sparkline, conditions ring (Good / Caution / Avoid), live signal, multi-timeframe table (15 min, 1 h, 4 h, 1 day: trend, RSI, MACD, ADX, EMA 200), key levels nearest to price, market conditions, other markets, next economic events, session bars, active plan |
| Chart | Three tabs. **Live chart**: TradingView, real-time with Pepperstone prices and full drawing tools. **Analysis chart**: the app's data with EMA 20/50/200, Bollinger, pivots, support and resistance, Fibonacci, your plan, signal arrows, RSI and MACD panes. Move over any candle to read the date, time, open, high, low, close, change, range, RSI and EMA. **Analysis chart + Tags**: the same chart with alert tags for past trades, the trade now and the plan ahead (where to close at TP or SL, when to move SL to entry, close time). Turn Past, Now and Future on or off. Tap a tag for the AI team check |
| Signals and alerts | 5-check live signal with grade A, B or C, "Use as alert plan", trade plan with entry, MODIFY and exit alerts, custom price alerts, alert log, TradingView technical summary |
| World markets | Intermarket table (silver, EUR/USD, USD/JPY, dollar, bonds, S&P 500) with each one's effect on gold, global market overview, forex heat map |
| News and economy | AI news brief (Claude web search, Gemini backup): economic events in Cambodia time, what moves gold, fundamental bias, sources. TradingView economic calendar and gold news |
| AI desk | Up to 4 chart pictures (drag, paste or choose). "Analyze pictures only" (Claude and Gemini read your screenshots) or "Run team analysis" (3 rounds, Claude decides) |
| Data explorer | Load any range (1 min to 1 week candles). See the highest and lowest price with exact date and time, change, biggest candle and more. Search by date or time, filter by high, low, range or colour, sort columns, export CSV. Best-hours heat map by weekday and hour |
| Backtest | Tests the live-signal rules on up to 2 months of 15 min data: win rate, net result, average R, profit factor, drawdown, equity curve, every trade |
| Journal | Every trade with R and $, win rate, profit factor, equity curve, CSV export. Finished alert trades can be saved with one click |
| Tools | Position size calculator, profit and loss calculator, session clock |
| Settings | Keys, models, risk, trading window, news buffer, price feed, theme, alerts |

## SMC chart (Smart Money Concepts)

Fourth tab on the Chart page. Draws BOS and CHoCH, order blocks, fair value gaps, liquidity ($$$ above highs and below lows) and sweeps, premium and discount, and SMC trade boxes (green TP, red SL). Rules for a setup: structure trend from BOS/CHoCH, price comes back into a fresh order block in premium (sells) or discount (buys), a confirmation candle closes back out of it, and the target is the liquidity at the end of the leg with at least 1:1.5 reward to risk. Grade A when liquidity was swept first. New setups sound an alert while live. Uses the app's 15 min or 1 hour candles; computed only from closed candles.

## AI team check (Analysis chart + Tags)

Each point can be checked by the AI team. Round 1: Claude, Gemini and DeepSeek check it on their own. Round 2: Gemini and DeepSeek discuss the answers. Round 3: Claude, the leader, decides: CONFIRM, ADJUST or REJECT, with what to do now. New signals and open trades are checked automatically (Settings: "AI team checks new signals and open trades automatically"); past trades are checked when you tap a tag and press Ask AI team (they only see data up to that moment).

All prices and levels come from the app's code. Each AI must copy the levels back; if one reads them wrong, its vote is not counted and the panel shows a data warning. Agreement lowers mistakes but cannot remove market risk. A check uses about 7 AI answers.

## How live data works

1. **Live chart (Chart page)**: TradingView widget, truly real-time, free.
2. **App price feed** (drives the hero price, alerts and signals):
   - **Streaming**: the app opens a Twelve Data WebSocket. On the free Basic plan streaming is only a trial for some symbols; if gold is not allowed, the app says so and switches to price checks automatically. A paid Twelve Data plan streams every tick.
   - **Price checks**: every 15, 20, 30 or 60 seconds (Settings).
3. Candles, other markets and indicators refresh automatically in the background.

**Free plan budget (800 credits per day, 8 per minute):** streaming about 29 credits per hour; price checks every 30 s about 150 per hour (about 5 hours a day). Settings shows the estimate and today's use.

## Set up on GitHub (first time)

1. Create a **public** repository, for example `gold-ai-desk`.
2. **Add file → Upload files**, drag in everything: `index.html`, `styles.css`, `config.js`, `README.md` and the whole `js` folder. Commit.
3. **Settings → Pages** → Deploy from a branch → `main`, `/ (root)` → Save. Your site: `https://<username>.github.io/gold-ai-desk/`
4. **Google sign-in**: console.cloud.google.com → new project → OAuth consent screen (External, add your Gmail as test user) → Credentials → OAuth client ID → Web application → Authorized JavaScript origin `https://<username>.github.io` → copy the Client ID.
5. In GitHub, edit **config.js** only: paste the Client ID and your Gmail. Commit.
6. Open the site, sign in, go to **Settings**, paste your API keys, Save.

## Updating later

Upload the new files over the old ones, **but do not upload config.js again**. Your sign-in settings stay safe there.

## API keys (Settings page only, never in GitHub)

| Service | Used for | Where |
|---|---|---|
| Twelve Data | Prices, candles, other markets, explorer, backtest | twelvedata.com (free plan available) |
| Claude | Team lead, news brief with web search, picture reading | console.anthropic.com (needs API credit; web search may need enabling by your org admin) |
| Gemini | Analyst, reviewer, picture reading, backup news search | aistudio.google.com |
| DeepSeek | Analyst and reviewer (text only) | platform.deepseek.com |

Default models: `claude-sonnet-5-5`, `gemini-3.8-flash`, `deepseek-v4-flash`. Change them in Settings if a provider renames them.

## Safety rules the app enforces

- No alerts for plans whose stop risk is above your % limit.
- No alerts for AI plans while conditions are Avoid (news within your buffer, weekend, extreme volatility).
- News warnings before high-impact events while live.
- Trades are flagged to close at your closing time.

## Security

Keys are stored only in your browser. Use Sign out and Clear keys on shared devices. Set spending limits with each AI provider, and restrict the Gemini key to `https://<username>.github.io/*`.

## Troubleshooting

- **TradingView panels empty**: network or ad blocker. Everything else still works.
- **"does not stream XAU/USD"**: normal on the free Twelve Data plan. The app uses price checks instead.
- **Daily price-data limit reached**: resets at 07:00 Cambodia time. Use streaming or slower price checks.
- **AI shows a CORS error**: that provider blocks browser calls. Turn it off in Settings.
- **Google button missing**: the authorized origin must be exactly `https://<username>.github.io`.
- **Alerts stop on phone**: keep the page open and the screen on. Real SL and TP orders in MT5 always protect you.
