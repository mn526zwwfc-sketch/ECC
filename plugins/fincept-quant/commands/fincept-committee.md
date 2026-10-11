---
description: Investment committee for one idea, ticker or backtest - the main conversation runs the fincept-quant agents in parallel (market data, backtest auditor or strategy analyst, alternative signals) and writes a single memo with verdict, data with source and date, evidence, signals, risks and what would be needed to believe it. Educational only.
argument-hint: <idea, ticker or backtest, e.g. "NVDA", "momentum in Mexico, Sharpe 1.1, 10 years, 30 variants" or "compare EWW and ^MXX">
---

# Fincept Committee

Put one idea in front of a small committee of fincept-quant agents and write one memo from their reports.

**Input**: $ARGUMENTS

Subagents cannot launch other subagents, so this orchestration happens here, in the main conversation: you launch the agents, collect their reports and write the memo yourself. Read the `fincept-investment-playbook` skill first; its guardrails apply to the memo.

## Step 1: Classify the Input

If `$ARGUMENTS` is empty, ask for an idea, a ticker or a backtest and stop. Otherwise decide which case applies (more than one can):

| Input | Example | Agents |
|-------|---------|--------|
| Backtest figures (Sharpe, years, variants, turnover, costs) or a return table | "momentum, Sharpe 1.2, 8 years, 50 variants" | `fincept-backtest-auditor` |
| A strategy or decision without a backtest | "DCA for 20 years in Mexico" | `fincept-strategy-analyst` |
| Tickers whose prices are needed (comparison, live record such as NANC or GOP) | "EWW vs ^MXX", "NANC" | `fincept-market-data`, then `fincept-backtest-auditor` |
| One US stock ticker | "NVDA" | `fincept-signals-analyst`, plus `fincept-market-data` and `fincept-strategy-analyst` for context |

`fincept-signals-analyst` runs only for a single US stock ticker (not an index, ETF list, currency or `.MX` symbol). Never paste raw user text into a shell; pass it to agents as the task description.

## Step 2: Launch the Agents in Parallel

Send **one message with several Agent calls** so the agents work at the same time. Give each one:

- the full `$ARGUMENTS` text and the language the user wrote in;
- what you need back: figures with source and date, the verdict or reading in one line, and anything it could not obtain;
- the instruction to follow the `fincept-investment-playbook` skill.

Typical first round:

- `fincept-market-data` - when prices are needed: fetch monthly prices, align them and write a CSV; report the path and the data card.
- `fincept-backtest-auditor` - when there are backtest figures or a table: run the audit (series CLI when a table exists, then `evaluate`).
- `fincept-strategy-analyst` - when there is a strategy or decision without a backtest: evidence, score, alternatives.
- `fincept-signals-analyst` - only for one US stock ticker: Congress, insiders, lobbying and contracts, then the evidence on copying them.

If the auditor needs the CSV that `fincept-market-data` produces, run a second round: when the first round returns, send the CSV path to `fincept-backtest-auditor` (with the number of variants and whether the record is live). Do not wait for agents whose work does not depend on each other.

## Step 3: Write the Memo

Write one memo in the user's language. For a Spanish-speaking user use these section headings, in this order:

1. **Veredicto** - one or two sentences: the engine's verdict and score (from the agents' tool results), or "sin veredicto" when the data was not enough.
2. **Datos** - every number with its source and date (Yahoo Finance, Alpha Vantage, Quiver Quant, user file, knowledge base). Note symbols that could not be obtained.
3. **Evidencia** - what the knowledge base and the papers say, with reliability marks (`WP`, `ext.`, `sec.`, `1p`).
4. **Señales alternativas** - the signals report, or why it does not apply (not a single US stock, no subscription, no records).
5. **Riesgos** - overfitting (DSR, PBO, MinTRL against the years available), costs and turnover, microcaps, short live record, currency, data-source limits.
6. **Qué haría falta para creerle** - the concrete missing inputs or tests that would change the verdict (number of variants, real round-trip cost, a longer live record, out-of-sample data).

For other languages, translate the headings and keep the order.

## Rules

- **Disagreements are stated, not averaged away.** If one agent's reading conflicts with another's (for example DSR passes but PBO fails, or the signals look active but the evidence scores 29/100), write both, say which agent and which tool produced each, and explain why they differ. Never blend two scores into a new number.
- Every figure in the memo comes from an agent's tool result in this session. Do not add numbers of your own, and do not compute new statistics while writing.
- No recommendation to buy or sell a specific security, fund or broker. Describe what the evidence and the data say.
- If an agent failed or returned nothing, say so in the relevant section rather than filling the gap.
- End with one line: educational material, not personalized financial advice.
