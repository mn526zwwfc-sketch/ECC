---
description: Find the round-trip trading cost and monthly turnover at which a strategy's net edge disappears, using the fincept-quant engine's net-edge cascade.
argument-hint: <strategy and its parameters, e.g. "momentum, 60% monthly turnover, long-short, retail in Mexico">
---

# Fincept Break-Even

Show how much trading cost and turnover a strategy can absorb before its expected net edge reaches zero.

**Input**: $ARGUMENTS

## Workflow

1. **Resolve the strategy** with `search_strategies` (CLI `search`, or `strategies` on older engines). Ask if nothing fits.
2. **Extract the decision fields** the user gave: `sharpe_annual`, `years`, `n_trials`, `periods_per_year`, `gross_alpha_monthly_bps`, `volatility_annual`, `turnover_monthly` (fraction, 0.6 = 60%), `roundtrip_cost_bps`, `long_short`, `microcap_share`, `published`, `out_of_sample`, `investor`, `market`. Pass only what was given.
3. **Compute break-even points** with the `breakeven_points` MCP tool (name ending in `__breakeven_points`). CLI fallback:

   ```bash
   python3 "$FINCEPT_ANALYTICS_DIR/quant_evidence_cli.py" breakeven '{"strategy_id": "momentum", "market": "mx"}'
   ```

   On engines without `breakeven`: run `evaluate` with the same fields, take the `monthly_bps` of the last cascade stage before "Neto de costos" as the pre-cost edge, and call `cost_drag` with it as `gross_monthly_bps` plus the user's turnover and `long_short`; `breakeven_roundtrip_cost_bps` is the break-even cost.
   Then run `evaluate_decision` (CLI `evaluate`) with the same fields: its `cascade` is the gross-to-net path used in the answer.
4. **Handle the no-edge case.** If the tool says the strategy has no measurable edge in bps (buy and hold, contributions, rebalancing), explain that it is judged on evidence and context, not on a cost break-even, and stop.
5. **Answer** in the user's language:
   - Current round-trip cost and turnover (from the tool's resolved inputs) next to the break-even values.
   - The cascade from gross to net (from `evaluate_decision`), so the user sees where the edge goes before costs.
   - Practical reading: the margin between current and break-even cost, the 50% monthly turnover frontier, two legs for long-short, the 1.5x default cost in Mexico.
   - One line: educational material, not personalized financial advice.

## Rules

- A break-even of 0 means there is no edge even without costs; a null break-even means the edge does not disappear inside the range the tool searched. Say which.
- Every number must come from a tool result. Never estimate broker costs or spreads from memory; ask the user for theirs.
- Never recommend a specific security or broker.
