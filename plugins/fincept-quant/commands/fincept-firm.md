---
description: Run one session of the Fincept paper-trading firm - opening book, research, desk ticket under the fixed training mandate, code-based risk precheck plus compliance review, the account owner's approval of the exact basket, one batch execution, reconciliation with the journal code, a plain-language client report, and retraining-log entries. Paper only.
argument-hint: "[optional: symbols to restrict the universe]"
---

# Fincept Firm

Run one trading session of the Fincept firm on the paper account, following `skills/fincept-governance/sops/firm-cycle.md`.

**Input**: $ARGUMENTS (default: the universe in `skills/fincept-governance/policies/training-mandate.json`)

## Workflow

1. **Mode gate.** `paper_trading_status` must say paper. If it says live, stop: this command never trades real money.
2. **Opening book and research, in parallel.**
   - `fincept-data-analyst`: account, open positions, journal of past trades (`scripts/fincept-journal.js`).
   - `fincept-liquid-trader`: market read for each symbol (mark, smart-money share, 1-minute EMA20/EMA50/MACD, 1-hour ATR, spread, depth at the touch).
   - `fincept-strategy-analyst`: evidence memo for the mandate (pass the engine path).
3. **Ticket.** Apply the mandate's direction rule and exits to each symbol: size, leverage, side, `tp` and `sl` from the 1-hour ATR. A symbol without a rule signal gets no trade. At most `max_trades_per_session` legs.
4. **Risk.** Run `node "$CLAUDE_PLUGIN_ROOT/scripts/fincept-precheck.js" ticket.json` with the mode, the open positions and every leg; drop the legs that fail and say why. Then `fincept-compliance-officer` reviews the precheck output and the open positions.
5. **Committee.** Call `suggest_trades_batch` with the passing legs unchanged. Show every returned term and the mode in capitals, then ask the account owner to approve that exact basket. No approval, no trade.
6. **Execute.** One `execute_orders_batch` with the proposal's legs and fields unchanged, `confirmed: true` and one idempotency key. On an uncertain result, reconcile before any retry.
7. **Reconcile and report.** `fincept-data-analyst` runs the journal with the plan (target hold and reference price per symbol); `fincept-client-communicator` drafts the client report; record every error in `skills/fincept-governance/retraining-log.md`.

## Rules

- Paper only. Never call `enable_*`, `disable_*`, funds or leverage tools from this command.
- The mandate fixes the universe, size and rules; agents never add symbols or change sizes to "improve" a session.
- Exits live inside the orders (TP/SL). A scheduled check may only read; closing early needs a new approval.
- Close with one line: educational material, not personalized financial advice.
