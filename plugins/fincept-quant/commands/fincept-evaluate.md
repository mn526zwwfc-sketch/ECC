---
description: Evaluate an investment decision or strategy idea against the academic evidence with the fincept-quant engine (0-100 score, verdict, net-edge cascade, checks). Delegates backtests to the fincept-backtest-auditor agent.
argument-hint: <decision in plain words, e.g. "momentum, Sharpe 1.2, 8 years monthly, 50 variants, 60% monthly turnover">
---

# Fincept Evaluate

Score a decision with the quant-evidence engine and explain the verdict.

**Input**: $ARGUMENTS

## Workflow

1. **Classify the input.**
   - If `$ARGUMENTS` contains backtest figures (a Sharpe ratio, years of data, number of variants or trials, turnover, costs, skew or kurtosis), delegate to the `fincept-backtest-auditor` agent with the full text of `$ARGUMENTS` and return its report.
   - Otherwise, continue here (a decision without a backtest, such as "invest monthly for retirement in Mexico for 20 years").
   - If `$ARGUMENTS` is empty, ask what decision to evaluate and stop.
2. **Find the strategy id.** Use the `search_strategies` MCP tool (name ending in `__search_strategies`) with a few words from the input. Fallback: `python3 "$FINCEPT_ANALYTICS_DIR/quant_evidence_cli.py" search '{"query": "<words>"}'`, or `strategies` if `search` is not available. Never guess an id.
3. **Extract the profile** from `$ARGUMENTS`: `horizon_years`, `market` (`mx`, `us`, `global`, `other`), `investor` (`retail`, `institutional`), `live_months`, `kelly_multiple`, `uses_leverage`, `long_short`. Pass only what the user gave; if horizon or market are missing, assume 15 years and the user's market and say so in one line.
4. **Evaluate** with `evaluate_decision` (CLI fallback: `evaluate '<json>'`). Build the JSON from validated values only; never paste raw user text into the shell.
5. **Read the evidence** with `get_strategy` for the claim, what survives, the marks and the sources.
6. **Answer** in the user's language (Spanish if they wrote Spanish):
   - Verdict in one sentence with the floored score and verdict label from the tool.
   - 3 to 5 bullets: what survives in the evidence, the `fail` and `warn` checks, the net-edge cascade if there is one, any score cap.
   - Sources by name with their reliability marks.
   - One line: educational material, not personalized financial advice.

## Rules

- Every number must come from a tool result in this session. No market prices, no figures from memory.
- Never recommend a specific security, fund or ETF.
- If the CLI fails or `FINCEPT_ANALYTICS_DIR` is unset, report the error instead of answering from memory.
