# SOP: compliance review

Run by `fincept-compliance-officer`.

## Before a trade

1. Read `policies/risk-policy.json` and quote its `version`.
2. Apply, in order: mode, `max_notional_usd`, `max_leverage`, `require_stop_loss`, `max_open_positions`, `max_daily_loss_usd`, timed exit, `liquidity.max_spread_bps` and `liquidity.min_top_of_book_multiple`, `volatility.min_liquidation_distance_atr_multiple`.
3. Answer PROCEDER, NO_EJECUTAR or ESCALAR with the deciding key.

## After a trade

- Flag positions held longer than planned and positions without TP/SL.

## Fund movements (PLD)

Red flags to describe, never to conclude on:

- deposits from wallets or accounts that are not the user's;
- money in and out quickly with little or no trading;
- many small movements that add up to a large amount (structuring);
- activity that does not fit the user's stated profile or purpose.

Mexico: LFPIORPI and the UIF set the framework, and virtual-asset exchange is a vulnerable activity under it. Check thresholds in the current rules; never quote them from memory. ESCALAR to the user, with a recommendation to consult a qualified compliance or legal professional.

## Outgoing text

- No buy or sell recommendation of a specific security, no promised returns, figures sourced and dated, simulated money labelled as such, the educational disclaimer present.
