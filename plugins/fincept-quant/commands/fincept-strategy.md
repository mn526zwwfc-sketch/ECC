---
description: Show what the academic evidence says about one strategy from the fincept-quant knowledge base - claim, key figure, critique, what survives, reliability marks, sources and related FinceptTerminal modules.
argument-hint: <strategy id or name, e.g. "momentum" or "dollar cost averaging">
---

# Fincept Strategy

Present the evidence record of one strategy.

**Input**: $ARGUMENTS

## Workflow

1. **Resolve the id.** If `$ARGUMENTS` is exactly a known id (lowercase with underscores, such as `momentum`, `cape_timing`, `periodic_contributions`), use it. Otherwise search first with `search_strategies` (name ending in `__search_strategies`; CLI `search '{"query": "<words>"}'`, or `strategies` and match by name on older engines). If several match, list them with id, name and family and ask which one. If `$ARGUMENTS` is empty, list the families (`base`, `factores`, `machine learning`, `timing`, `cartera`, `comportamiento`, `calendario`) and ask.
2. **Read the record** with `get_strategy` (CLI fallback):

   ```bash
   python3 "$FINCEPT_ANALYTICS_DIR/quant_evidence_cli.py" strategy '{"id": "momentum"}'
   ```

3. **Optionally add the code view** when the user works on the repository: `repo_modules` (CLI `repo_modules '{"strategy_id": "<id>"}'`, or `categories` on older engines) for the FinceptTerminal modules and known gaps in the strategy's categories.
4. **Answer** in the user's language, in this order:
   - Name, id, family and the synthetic evidence rating `prior.score` (state that it is a synthetic 0-100 rating, not a published figure).
   - What survives (lead with it).
   - The claim and the key figure, keeping the reliability marks (`WP`, `ext.`, `sec.`, `1p`) and explaining any mark that appears.
   - The main critique.
   - Sources by label.
   - Related modules and gaps, if requested.
   - One line: educational material, not personalized financial advice.
5. Offer `/fincept-evaluate` to score a concrete decision with this strategy, or `/fincept-breakeven` if it has a measurable edge.

## Rules

- Quote the knowledge base; do not add figures from memory or current market data.
- Never turn the record into a recommendation to buy a specific security.
