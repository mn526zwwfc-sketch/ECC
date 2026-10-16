# SOP: one Liquid order

Applies to every order, paper or live. The main conversation runs it; subagents only feed it.

1. **Order from the user.** Asset, side, notional size and leverage come from the user. If the user delegates the side, the liquid trader applies the mechanical test rule and labels it as such.
2. **Pre-trade check** by `fincept-liquid-trader`: mode, balance, market, book, funding, liquidation distance, evidence.
3. **Compliance check** by `fincept-compliance-officer` against `policies/risk-policy.json`. NO_EJECUTAR stops here.
4. **Timed exits.** A planned hold under `timed_exit.min_minutes_for_scheduled_close` minutes needs take-profit and stop-loss inside the order. Do not rely on a scheduled close for short holds.
5. **Proposal** with `suggest_trade`; show every returned term and the mode in capitals.
6. **Approval** of that exact proposal by the user in chat. Changed terms need a new proposal.
7. **Execute** once with `confirmed: true`, the proposal's fields unchanged and one idempotency key.
8. **Reconcile** with `fincept-data-analyst` right after the fill and again after the exit.

## Closes

1. Check mode (`paper_trading_status`) and position (`get_portfolio`); if either changed, stop and ask.
2. Preview with `close_position` (no `confirmed`).
3. Execute once with `confirmed: true`.
4. After a session restart or an uncertain result, read `get_position_history` and `get_portfolio` before any retry. Never send a second close without that check.
