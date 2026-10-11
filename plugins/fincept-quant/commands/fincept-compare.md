---
description: Rank the quant-evidence strategies for an investor profile (horizon, market, retail or institutional) with the fincept-quant engine, and show where a named strategy places.
argument-hint: <profile, e.g. "20 years, Mexico, retail" [strategy to locate]>
---

# Fincept Compare

Rank alternatives for one investor profile with the same evaluator and inputs.

**Input**: $ARGUMENTS

## Workflow

1. **Parse the profile** from `$ARGUMENTS`:
   - `horizon_years` (number of years; default 15 if missing)
   - `market`: `mx`, `us`, `global` or `other` (default `global`, or `mx` if the user writes about Mexico)
   - `investor`: `retail` (default) or `institutional`
   - an optional strategy the user wants to locate; resolve it to an id with `search_strategies` (CLI `search`, or `strategies` on older engines)
   - an optional count `top` (the tool returns 10 by default)

   State any default you applied in one line.
2. **Rank** with the `compare_strategies` MCP tool (name ending in `__compare_strategies`), passing the profile, `top` and the optional `strategy_id`. CLI fallback:

   ```bash
   python3 "$FINCEPT_ANALYTICS_DIR/quant_evidence_cli.py" compare '{"horizon_years": 20, "market": "mx", "investor": "retail", "top": 5}'
   ```

   If the engine has no `compare` command, run `strategies` and then `evaluate` with the same profile for each candidate, and sort by `scores.final`.
3. **Explain the top entries** with `get_strategy` for the first two or three: what survives and the main critique.
4. **Answer** in the user's language with a short table (rank, strategy, score, verdict), then 3 to 5 bullets on why the leaders lead and where the named strategy places and why. Cite sources by name with their marks, and close with one line saying this is educational material, not personalized financial advice.

## Rules

- The ranking uses the profile without a backtest: it compares evidence, implementability and context, not anyone's personal results. Say so.
- Every score must come from the tool. Do not re-rank by intuition.
- Never recommend a specific security, fund or ETF; strategies are categories of decisions, not products.
