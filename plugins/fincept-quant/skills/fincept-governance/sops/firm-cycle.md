# SOP: the firm's trading cycle

One session of the Fincept paper-trading firm, run by `/fincept-firm`. Roles are in the `fincept-governance` skill, section 7.

1. **Opening book (operations).** `fincept-data-analyst` reads the account and runs `scripts/fincept-journal.js` on the position history.
2. **Research.** `fincept-liquid-trader` reads the market for every symbol in `policies/training-mandate.json` (price, positioning, 1-minute technicals, 1-hour ATR, spread and depth); `fincept-strategy-analyst` writes the evidence memo.
3. **Ticket (desk).** The desk applies the mandate's direction rule and exits to each symbol; a symbol with no rule signal gets no trade.
4. **Risk (code, then judgment).** `scripts/fincept-precheck.js` checks every leg against `policies/risk-policy.json`; `fincept-compliance-officer` reviews the result and the open positions.
5. **Committee.** The main conversation shows the basket proposal (`suggest_trades_batch`) and the account owner approves or rejects its exact legs. If the approval arrives later than `ticket.max_quote_age_minutes` after the market read, re-read the market, rebuild the ticket and ask again.
6. **Execution.** One `execute_orders_batch` call with the proposal's fields unchanged and one idempotency key. Reconcile before any retry.
7. **Monitoring.** Exits are TP/SL inside the orders, handled by the venue. A read-only review may be scheduled; closing anything needs a new approval.
8. **Reconciliation (operations).** `scripts/fincept-journal.js` with the plan (target hold and reference price per symbol).
9. **Client report.** `fincept-client-communicator` drafts the plain-language report for human review.
10. **Retraining log.** Every delay, mismatch, rule miss or code defect goes into `retraining-log.md`.
