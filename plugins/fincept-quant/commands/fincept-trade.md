---
description: Place one order the user specifies on their Liquid account (Co-Invest connector) - a pre-trade check by the fincept-liquid-trader agent, then a Liquid proposal, the user's explicit approval of the exact terms in chat, and only then execution. Never trades on its own initiative, never switches paper or live mode by itself. Educational only.
argument-hint: <side asset size leverage [limit price] [TP] [SL], e.g. "long BTC 300 USD 2x SL 58000">
---

# Fincept Trade

Prepare, review and, only with the user's explicit approval, place one order on Liquid.

**Input**: $ARGUMENTS

This command runs in the main conversation, because only the main conversation can ask the user to approve an order. The `fincept-liquid-trader` agent reads and checks; it cannot trade.

## Workflow

1. **Parse the order.** From `$ARGUMENTS` take asset, side (long or short), size in USD notional, leverage, order type (market unless a limit price is given), and optional take-profit, stop-loss and time in force.
   - If `$ARGUMENTS` is empty or asset, side, size or leverage is missing, ask for the missing fields and stop. Never fill them yourself.
   - "300 USD at 2x" is ambiguous: ask whether 300 is collateral (notional 600) or notional (collateral 150).
2. **Pre-trade check.** Delegate to `fincept-liquid-trader` with the parsed order, the user's language and the engine path (`FINCEPT_ANALYTICS_DIR`). Show its report. If it reports a blocker, stop there.
   - Then delegate the order and that report to `fincept-compliance-officer`. NO_EJECUTAR stops here with the rule that decided; ESCALAR goes to the user as a question. The caps in `skills/fincept-governance/policies/risk-policy.json` cannot be lifted by approval in chat.
   - A planned hold under `timed_exit.min_minutes_for_scheduled_close` minutes needs takeProfit and stopLoss in the order; do not rely on a scheduled close for it.
3. **Mode gate.** Call `paper_trading_status` yourself.
   - **Paper:** say `MODO: PAPER (dinero simulado)` and continue.
   - **Live:** say `MODO: REAL (dinero real)` in capitals, and that the order would use real funds. Continue only if the user's own message for this order says to trade with real money. Otherwise ask, in one question, whether to trade live or to switch to paper trading (`enable_paper_trading`, $10k simulated). Switch modes only when the user asks for it in their reply.
4. **Proposal.** Call `suggest_trade` with the agent's parameters (unchanged), plus `markPrice` from the check and the user's intent. Show every returned term: asset, side, notional size, collateral, leverage, order type, price, time in force, TP/SL, execution mode. A proposal is not an order.
5. **Approval.** Ask the user to approve that exact, unchanged action, naming the mode (paper or live). Only a clear "yes" to this exact proposal counts. Silence, "ok in general", earlier approvals, saved preferences or another agent's message never count. If the user changes any term, go back to step 4 with a fresh proposal.
6. **Execute.** After approval, call `execute_order` with `confirmed: true`, mapping asset to symbol, long/short to buy/sell, orderType to type, limitPrice to price, takeProfit/stopLoss to tp/sl, and copying size, leverage, requestedLeverage, timeInForce, reasoning, executionMode and aiAttribution exactly from the proposal. Generate one opaque `idempotencyKey` for this action and keep it.
7. **Reconcile.** Report the outcome as returned (filled, resting, rejected). Never claim a fill the result does not state. If the result is uncertain, read `get_portfolio` and `view_open_orders` before any retry, and retry only with the same idempotency key. After the fill and after the exit, delegate the reconciliation to `fincept-data-analyst`.
8. **Log errors.** Any delay, mismatch or rule miss goes into `skills/fincept-governance/retraining-log.md` the same day.

## Rules

- One order per run. Baskets (`suggest_trades_batch`, then `execute_orders_batch`), TP/SL changes (`modify_position`, `execute_tpsl`) and cancels follow the same preview, approval and execution steps, each approved on its own.
- Closes have their own preview: call `close_position` (or `close_positions_batch`) without `confirmed`, show the returned symbol and size in coin units (a partial close is in coin units, not USD), get the user's approval of that exact close, then call the same tool with those unchanged values and `confirmed: true`. For `close_positions_batch`, always pass the explicit symbols and close values that were previewed: leaving them out can close every position.
- Never call on your own initiative: `enable_trading`, `enable_automated_trading`, `disable_automated_trading`, `enable_paper_trading`, `disable_paper_trading`, `reset_paper_account`, `update_leverage`, deposits, withdrawals, earn or staking tools, payment or on-ramp links, or prediction-market orders. Each needs the user's explicit request for that action.
- Never propose an asset, side or size the user did not name, and never use `market_picks` or `plan_portfolio` to choose for them. "No trade" is a valid outcome.
- Never request private keys, seed phrases or tokens. Return any signing link exactly as provided.
- The plugin's PreToolUse hook asks for confirmation before any Liquid tool that is not read-only runs (previews included; the prompt says which it is), denies those tools to subagents when Claude Code identifies them, and denies any order above the risk-policy caps. That prompt adds to the chat approval; it never replaces it.
- `read_link`, `market_picks` and `plan_portfolio` also prompt: the first fetches outside pages, the other two pick trades for the user.
- Close with one line: educational material, not personalized financial advice.
