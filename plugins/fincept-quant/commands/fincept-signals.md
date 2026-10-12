---
description: Alternative signals for one US stock ticker - Congress trades, SEC Form 4 insider trades, lobbying and federal contracts - read by the fincept-signals-analyst agent, followed by what the academic evidence says about copying them. Educational only.
argument-hint: <one US stock ticker, e.g. "NVDA">
---

# Fincept Signals

Show what members of Congress, insiders, lobbyists and federal agencies have done around one US stock, and what the evidence says about following them.

**Input**: $ARGUMENTS

## Workflow

1. **Validate the ticker.** Take the first word of `$ARGUMENTS`, upper-case it and check it against `^[A-Z][A-Z0-9.\-]{0,9}$`.
   - If `$ARGUMENTS` is empty, ask for one US stock ticker and stop.
   - If it is a BMV symbol (`.MX`), an index (`^`), a currency (`=X`) or several tickers, explain that congressional and Form 4 disclosures exist only for individual US-listed companies, offer `/fincept-committee` for the broader question, and stop.
2. **Delegate** to the `fincept-signals-analyst` agent with the validated ticker and the user's language. Ask it for:
   - Congress (Quiver `get_congress_trades`): purchases and sales in the last 12 months, estimated amounts from range midpoints, distinct members, median disclosure lag;
   - insiders (Quiver `get_insider_trading`): purchases and sales in the last 12 months, value, routine versus opportunistic (Cohen, Malloy and Pomorski);
   - lobbying and federal contracts (Quiver `get_lobbying`, `get_gov_contracts`);
   - the evidence: `congress_copy` and `insider_purchases` from the engine, the `alt_signals` papers and the NANC and GOP live record.
3. **Return its report** in the user's language without adding figures of your own. Keep its source and date labels and any "no subscription" or "no records" notes exactly as reported.

## Rules

- "No records" in a source is not "no trades": keep the distinction.
- Quiver Quant is the only source for these signals, and its data tools need at least the Hobbyist subscription. The user's account currently has none, so the tools answer "no active subscription": report the signals as unavailable until the user subscribes (Hobbyist tier), not empty, and never fill the gap with another source or invented data. The evidence part (`congress_copy`, `insider_purchases`, the NANC and GOP live record from Yahoo prices) still works without Quiver.
- Make connector calls one at a time and respect Quiver's rate limits.
- Never recommend buying or selling the stock. Close with one line: educational material, not personalized financial advice.
