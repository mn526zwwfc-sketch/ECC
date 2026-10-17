# SOP: reconciliation

Run by `fincept-data-analyst` after every fill, at every exit and at the end of each session.

1. Read `paper_trading_status`, `get_portfolio` and `get_position_history` (`includeFills: true`) for each symbol in scope.
2. For each closed trade check that entry size equals exit size and that `feesComplete` is true.
3. Compute in `python3`: gross PnL (long: exit minus entry; short: entry minus exit; times size), fees, net PnL, holding minutes, delay against the planned hold, and cost of delay when an earlier check recorded unrealized PnL.
4. Compare with the approved plan (size, side, hold) and with the proposal's reference price (slippage).
5. Report differences between sources instead of choosing one.
6. Append the rows to the trade journal when the user keeps one.
7. Send deposits, withdrawals and transfers to `fincept-compliance-officer`.
