# gs-quant-overview

Quick-start skill for the `gs_quant` library. Requires Goldman Sachs API credentials to be useful.

- **Source:** `gs-quant/gs_quant/skills/gs-quant-overview/` (Apache-2.0, see upstream LICENSE)
- **Files:** 7

## `SKILL.md`

````markdown
---
name: gs-quant-overview
description: "Quick-start guide for gs_quant: session setup with GsSession, constructing portfolios, resolving instruments. Start here for any coding task that uses the gs_quant library"
---

# gs_quant Quick Start

## 1. Creating a Session with `GsSession.use`

All API communication in `gs_quant` flows through an authenticated `GsSession`. Before making any pricing or data calls you must initialise a session with `GsSession.use()`.

### OAuth2 (Application Credentials)

```python
from gs_quant.session import GsSession, Environment

GsSession.use(
    environment_or_domain=Environment.PROD,
    client_id='my_client_id',
    client_secret='my_client_secret',
    scopes=('run_analytics',),
)
```

- **`environment_or_domain`** — `Environment.PROD` (default), `Environment.QA`, or `Environment.DEV`. You can also pass a raw URL string.
- **`client_id` / `client_secret`** — OAuth2 application credentials. When both are provided the library creates an `OAuth2Session`.
- **`scopes`** — Optional iterable of `GsSession.Scopes` values. Usually when pricing trade you will need `run_analytics`.

### Kerberos / SSO (Internal GS)

If no `client_id` is supplied, the library will attempt Kerberos or pass-through authentication automatically:
This is for internal GS users only and requires appropriate network access and installation of gs-quant-internal.

```python
GsSession.use(Environment.PROD)
```

### Using as a Context Manager

```python
with GsSession.get(Environment.PROD, client_id='...', client_secret='...') as session:
    # session is active inside this block
    ...
```

### Verifying the Session

```python
GsSession.current  # the currently active GsSession instance
```

---

## 2. Resolving an Instrument

When you construct an instrument you typically only specify a subset of its parameters. **Resolving** fills in all remaining fields by sending the instrument to the GS pricing service.

```python
from gs_quant.instrument import IRSwap

swap = IRSwap('Pay', '10y', 'USD')

# Before resolve: swap.fixed_rate is None
swap.resolve()
# After resolve: swap.fixed_rate is now populated with the current par rate

print(swap.fixed_rate)  # e.g. 0.0345
```

### What `resolve()` Does

1. Sends the instrument to the GS analytics service along with the current `PricingContext`.
2. The service computes any missing parameters — par rate, premium, forward points, etc.
3. By default (`in_place=True`), the instrument is updated in place. Pass `in_place=False` to receive a new resolved copy.

---

## 3. Combining Instruments in Portfolios

The `Portfolio` class groups instruments for pricing, resolution, and analysis as a single unit.

### Creating a Portfolio

```python
from gs_quant.instrument import IRSwap, IRSwaption
from gs_quant.markets.portfolio import Portfolio

swap = IRSwap('Pay', '10y', 'USD', name='USD 10y Payer')
swaption = IRSwaption('Receive', '10y', 'EUR', expiration_date='1y', name='EUR 1y10y Receiver')

portfolio = Portfolio([swap, swaption], name='My Portfolio')
```

From a dictionary (keys become instrument names):

```python
portfolio = Portfolio(
    {
        'USD 10y Payer': IRSwap('Pay', '10y', 'USD'),
        'EUR 5y Receiver': IRSwap('Receive', '5y', 'EUR'),
    }
)
```

### Nesting Portfolios

```python
usd_book = Portfolio([IRSwap('Pay', '5y', 'USD'), IRSwap('Receive', '10y', 'USD')], name='USD Book')
eur_book = Portfolio([IRSwap('Pay', '5y', 'EUR')], name='EUR Book')
master = Portfolio([usd_book, eur_book], name='Master Book')
```

### Portfolio Operations

```python
portfolio.append(IRSwap('Pay', '2y', 'GBP'))  # add instruments
first = portfolio[0]  # access by index
usd_swap = portfolio['USD 10y Payer']  # access by name
len(portfolio)  # top-level count
portfolio.all_instruments  # all instruments across nested portfolios
```

### Resolving and Pricing

```python
from gs_quant.risk import DollarPrice, IRDelta

portfolio.resolve()  # resolves all instruments in place
prices = portfolio.calc(DollarPrice)  # single risk measure
results = portfolio.calc([DollarPrice, IRDelta])  # multiple risk measures
```

---

## See Also

For detailed guidance on specific topics, see these focused files.

- `instruments.md` — Constructing all instrument types (IRSwap, XCcy swaps, FXOption, EqOption, etc.) and FX pitfalls
- `pricing.md` — Pricing instruments and portfolios in gs_quant: PricingContext, HistoricalPricingContext for historical pricing over date ranges, and LiveMarket for real-time pricing. Covers pricing dates, market data location, batch mode, and async patterns.
- `datasets.md` — Accessing market and reference data via the gs_quant Dataset class: get_data, get_data_series, get_data_last, get_coverage, uploading data, batching large queries. Covers TREOD for equities, FXIVOL_STANDARD, symbol dimensions, and common pitfalls.
- `backtesting.md` — Guide to the gs_quant backtesting framework: Strategy, triggers, actions, GenericEngine, EquityVolEngine, transaction costs, and result extraction.
- `measure.md` — writing custom measures with `@plot_measure` and `@risk_measure` decorators
````

## `backtesting.md`

````markdown
# gs_quant Backtesting Guide

## 1. Architecture Overview

| Concept | Description |
|---|---|
| **Strategy** | Combines an optional initial portfolio with one or more `Trigger` objects. |
| **Trigger** | Defines *when* to act — on a schedule, risk threshold, market data level, etc. Each trigger holds one or more `Action` objects. |
| **Action** | Defines *what* to do when the trigger fires — add a trade, hedge, exit, rebalance. |

A backtest **Engine** runs the strategy over a date range, resolving instruments, computing risks, and building the P&L time series.

### Import Map

```python
from gs_quant.backtests.strategy import Strategy
from gs_quant.backtests.triggers import (
    PeriodicTrigger,
    PeriodicTriggerRequirements,
    StrategyRiskTrigger,
    RiskTriggerRequirements,
    MktTrigger,
    MktTriggerRequirements,
    AggregateTrigger,
    AggregateTriggerRequirements,
    DateTrigger,
    DateTriggerRequirements,
    MeanReversionTrigger,
    MeanReversionTriggerRequirements,
    PortfolioTrigger,
    PortfolioTriggerRequirements,
    NotTrigger,
    NotTriggerRequirements,
    TriggerDirection,
    AggType,
)
from gs_quant.backtests.actions import (
    AddTradeAction,
    AddScaledTradeAction,
    HedgeAction,
    ExitTradeAction,
    ExitAllPositionsAction,
    EnterPositionQuantityScaledAction,
    RebalanceAction,
)
from gs_quant.backtests.generic_engine import GenericEngine
from gs_quant.backtests.equity_vol_engine import EquityVolEngine
from gs_quant.backtests.data_sources import GenericDataSource, GsDataSource, MissingDataStrategy
```

---

## 2. Engines

| Engine | Best For | Instruments |
|---|---|---|
| **GenericEngine** | Multi-asset OTC strategies | IRSwap, IRSwaption, FXOption, FXForward, FXBinary, EqOption, etc. |
| **EquityVolEngine** | Equity vol strategies (server-side) | EqOption, EqVarianceSwap |
| **PredefinedAssetEngine** | Custom order-based backtests | Predefined assets |

Use `GenericEngine` unless you specifically need `EquityVolEngine` performance for equity options.

---

## 3. Strategy Construction

```python
strategy = Strategy(None, trigger)  # empty starting portfolio
strategy = Strategy(initial_instrument, trigger)  # start with an instrument
strategy = Strategy(None, [trigger_add, trigger_hedge])  # multiple triggers
```

---

## 4. Triggers

### 4.1 PeriodicTrigger — Trade on a Schedule

```python
from gs_quant.backtests.triggers import PeriodicTrigger, PeriodicTriggerRequirements

trig_req = PeriodicTriggerRequirements(
    start_date=start_date,
    end_date=end_date,
    frequency='1m',  # '1b' (daily), '1w', '1m', '3m', '1y'
)
trigger = PeriodicTrigger(trig_req, action)
```

### 4.2 StrategyRiskTrigger — Trigger on Risk Breach

```python
from gs_quant.backtests.triggers import StrategyRiskTrigger, RiskTriggerRequirements, TriggerDirection
from gs_quant.risk import FXDelta
from gs_quant.common import AggregationLevel

hedge_risk = FXDelta(aggregation_level=AggregationLevel.Type, currency='USD')
trig_req = RiskTriggerRequirements(
    risk=hedge_risk,
    trigger_level=50_000,
    direction=TriggerDirection.ABOVE,
)
trigger = StrategyRiskTrigger(trig_req, hedge_action)
```

### 4.3 MktTrigger — Trigger on Market Data

```python
from gs_quant.backtests.triggers import MktTrigger, MktTriggerRequirements
from gs_quant.backtests.data_sources import GenericDataSource, MissingDataStrategy

data_source = GenericDataSource(pandas_series, MissingDataStrategy.fill_forward)
trig_req = MktTriggerRequirements(
    data_source=data_source,
    trigger_level=100.0,
    direction=TriggerDirection.BELOW,
)
trigger = MktTrigger(trig_req, action)
```

### 4.4 DateTrigger — Trigger on Specific Dates

```python
from gs_quant.backtests.triggers import DateTrigger, DateTriggerRequirements

trig_req = DateTriggerRequirements(
    dates=[date(2024, 3, 15), date(2024, 6, 15), date(2024, 9, 15)],
)
trigger = DateTrigger(trig_req, action)
```

### 4.5 AggregateTrigger — Combine with AND/OR

```python
from gs_quant.backtests.triggers import AggregateTrigger, AggregateTriggerRequirements, AggType

agg_req = AggregateTriggerRequirements(
    triggers=[periodic_trigger, risk_trigger],
    aggregate_type=AggType.ALL_OF,  # ALL_OF (AND) or ANY_OF (OR)
)
trigger = AggregateTrigger(agg_req, action)
```

### 4.6 NotTrigger — Invert a Trigger

```python
from gs_quant.backtests.triggers import NotTrigger, NotTriggerRequirements

not_req = NotTriggerRequirements(trigger=some_trigger_requirements)
trigger = NotTrigger(not_req, action)
```

---

## 5. Actions

### 5.1 AddTradeAction — Add a Trade

```python
action = AddTradeAction(
    priceables=instrument,
    trade_duration='1m',  # tenor, date, 'expiration_date', 'next schedule', or None (forever)
    name='my_trade',
)
```

**`trade_duration` options:** `None` (hold forever), tenor string (`'1m'`, `'3m'`), `'expiration_date'` (hold until expiry), `'next schedule'` (auto-rolling), explicit `datetime.date`, or `datetime.timedelta`.

### 5.2 HedgeAction — Delta Hedge

```python
from gs_quant.backtests.actions import HedgeAction
from gs_quant.risk import FXDelta

hedge_risk = FXDelta(aggregation_level='Type', currency='USD')
action = HedgeAction(
    risk=hedge_risk,
    priceables=FXForward(pair='EURUSD', settlement_date='1y', name='hedge_fwd'),
    trade_duration='1m',
)
```

### 5.3 AddScaledTradeAction — Scale a Trade

```python
from gs_quant.backtests.actions import AddScaledTradeAction, ScalingActionType

action = AddScaledTradeAction(
    priceables=instrument,
    trade_duration='1m',
    scaling_type=ScalingActionType.size,
    scaling_level=1_000_000,
)
```

### 5.4 EnterPositionQuantityScaledAction — Quantity-Based Entry

```python
from gs_quant.backtests.actions import EnterPositionQuantityScaledAction
from gs_quant.target.backtests import BacktestTradingQuantityType

action = EnterPositionQuantityScaledAction(
    priceables=eq_option,
    trade_duration='1m',
    trade_quantity=1000,
    trade_quantity_type=BacktestTradingQuantityType.quantity,
)
```

### 5.5 ExitTradeAction / ExitAllPositionsAction

```python
exit_named = ExitTradeAction(priceable_names='my_trade')
exit_all = ExitAllPositionsAction()
```

### 5.6 Multiple Actions on a Single Trigger

Order matters — they execute in sequence:

```python
trigger = StrategyRiskTrigger(trig_req, [exit_action, add_action])
```

---

## 6. GenericEngine Parameters

| Parameter | Description | Default |
|---|---|---|
| `strategy` | The Strategy object | *required* |
| `start` / `end` | Backtest date range | None |
| `frequency` | Evaluation frequency: `'1b'`, `'1w'`, `'1m'` | `'1m'` |
| `states` | Explicit date list (overrides start/end/frequency) | None |
| `risks` | Additional risk measures to compute | None |
| `show_progress` | Show progress bar | True |
| `initial_value` | Starting cash value | 0 |
| `result_ccy` | Currency for results | None |
| `market_data_location` | `'LDN'`, `'NYC'`, `'HKG'` | None |
| `is_batch` | Use websocket batching | True |

---

## 7. Extracting Results

### result_summary — Main P&L DataFrame

```python
summary = backtest.result_summary
```

Columns: `Price` (MTM of live instruments), `Cumulative Cash` (from unwound trades), `Transaction Costs`, `Total` (Price + Cash + Costs), plus any additional risk columns.

```python
backtest.result_summary['Total'].plot(title='Strategy Performance')
```

### trade_ledger — Trade History

```python
ledger = backtest.trade_ledger()
```

### summary_stats — Performance Statistics

```python
stats = backtest.summary_stats()
```

Returns: Start/End Date, Duration, Total PnL, Total Transaction Costs, Total Trades, Peak PnL, Annualised Return/Volatility, Sharpe Ratio, Sortino Ratio, Max Drawdown, Max Drawdown Duration, Calmar Ratio, Current Drawdown, Average/Std Daily PnL, Best/Worst Day, % Positive Days, Skewness, Kurtosis.

```python
# Compare two backtests
import pandas as pd

pd.DataFrame({'A': backtest_a.summary_stats(), 'B': backtest_b.summary_stats()})
```

### Additional Risks

```python
from gs_quant.risk import Price, FXDelta
from gs_quant.common import AggregationLevel

backtest = GE.run_backtest(
    strategy,
    start=start_date,
    end=end_date,
    frequency='1b',
    risks=[Price, FXDelta(aggregation_level=AggregationLevel.Type, currency='USD')],
)
delta_series = backtest.result_summary[FXDelta(aggregation_level=AggregationLevel.Type, currency='USD')]
```

---

## 8. Transaction Costs

Actions accept `transaction_cost` and `transaction_cost_exit` parameters.

### ConstantTransactionModel — Fixed Cost

```python
from gs_quant.backtests.backtest_objects import ConstantTransactionModel

action = AddTradeAction(
    instrument,
    trade_duration='1m',
    transaction_cost=ConstantTransactionModel(500),
    transaction_cost_exit=ConstantTransactionModel(250),
)
```

### ScaledTransactionModel — Proportional Cost

Scale by instrument attribute or risk measure:

```python
from gs_quant.backtests.backtest_objects import ScaledTransactionModel
from gs_quant.risk import Price

# By notional: cost = notional_amount x 0.0001 (1bp)
action = AddTradeAction(
    instrument,
    trade_duration='1m',
    transaction_cost=ScaledTransactionModel(scaling_type='notional_amount', scaling_level=0.0001),
)

# By risk measure: cost = |Price| x 0.01 (1% of premium)
action = AddTradeAction(
    instrument,
    trade_duration='1m',
    transaction_cost=ScaledTransactionModel(scaling_type=Price, scaling_level=0.01),
)
```

### AggregateTransactionModel — Combine Models

```python
from gs_quant.backtests.backtest_objects import (
    AggregateTransactionModel,
    ConstantTransactionModel,
    ScaledTransactionModel,
)

# Total cost = fixed $100 + 0.5bp of notional
combined = AggregateTransactionModel(
    transaction_models=(
        ConstantTransactionModel(100),
        ScaledTransactionModel('notional_amount', 0.00005),
    ),
    # aggregate_type defaults to TransactionAggType.SUM; also supports MAX, MIN
)
action = AddTradeAction(instrument, trade_duration='1m', transaction_cost=combined)
```

Transaction costs appear in `backtest.result_summary` as the `'Transaction Costs'` column (cumulative) and are included in `'Total'`.

---

## 9. Best Practices

- **Always set `premium=0` on FX options** — see `gs-quant-instruments` for details
- **Match trade_duration to trigger frequency** for roll strategies (e.g. `'1m'` + `'1m'`)
- **Use `'expiration_date'`** to hold options until expiry
- **Order triggers correctly** — entry before hedge: `Strategy(None, [entry_trigger, hedge_trigger])`
- **Order actions within a trigger** — exit before add: `PeriodicTrigger(trig_req, [exit_action, add_action])`
- **Name your instruments** — names appear in trade_ledger and aid debugging
- **`frequency='1b'`** for daily P&L; trigger frequency and evaluation frequency are independent

---

## 10. EquityVolEngine

Server-side execution for equity option and variance swap backtests:

```python
from gs_quant.instrument import EqOption, OptionType, OptionStyle
from gs_quant.backtests.equity_vol_engine import EquityVolEngine

option = EqOption(
    '.STOXX50E',
    expiration_date='3m',
    strike_price='ATM',
    option_type=OptionType.Call,
    option_style=OptionStyle.European,
)

action = EnterPositionQuantityScaledAction(
    priceables=option,
    trade_duration='1m',
    trade_quantity=1000,
    trade_quantity_type=BacktestTradingQuantityType.quantity,
)
trig_req = PeriodicTriggerRequirements(start_date=start_date, end_date=end_date, frequency='1m')
trigger = PeriodicTrigger(trig_req, action)

engine = EquityVolEngine()
backtest = engine.run_backtest(Strategy(None, trigger), start=start_date, end=end_date)
```

---

## 11. Quick Reference Template

```python
from datetime import date
from gs_quant.session import GsSession
from gs_quant.instrument import IRSwaption
from gs_quant.common import Currency
from gs_quant.backtests.triggers import PeriodicTrigger, PeriodicTriggerRequirements
from gs_quant.backtests.actions import AddTradeAction
from gs_quant.backtests.generic_engine import GenericEngine
from gs_quant.backtests.strategy import Strategy
from gs_quant.risk import Price

GsSession.use()

start_date = date(2023, 1, 3)
end_date = date(2024, 12, 31)

# 1. Define the instrument
instrument = IRSwaption('Pay', '10y', Currency.USD, expiration_date='6m', name='6m10y')

# 2. Define trigger + action
trig_req = PeriodicTriggerRequirements(start_date=start_date, end_date=end_date, frequency='6m')
action = AddTradeAction(instrument, trade_duration='6m')
trigger = PeriodicTrigger(trig_req, action)

# 3. Build strategy
strategy = Strategy(None, trigger)

# 4. Run
GE = GenericEngine()
backtest = GE.run_backtest(strategy, start=start_date, end=end_date, frequency='1b', show_progress=True)

# 5. View results
backtest.result_summary['Total'].plot(title='Performance')
backtest.trade_ledger()
backtest.summary_stats()
```
````

## `datasets.md`

````markdown
# Accessing Data with `Dataset`

The `Dataset` class in `gs_quant.data` provides access to Marquee datasets — structured,
time-series collections of market and reference data.

```python
from gs_quant.data import Dataset
import datetime as dt
```

## Constructing a Dataset

Pass the dataset ID string (visible in the Marquee catalog URL):

```python
ds = Dataset('FXIVOL_STANDARD')
```

You can also use the built-in vendor enums:

```python
ds = Dataset(Dataset.GS.HOLIDAY)
ds = Dataset(Dataset.TR.TREOD)
```

> **Equities and listed instruments:** For equities and most listed instruments
> (equity indices, ETFs, futures, etc.) the correct dataset is almost always `TREOD`
> (Thomson Reuters End-of-Day). Use `bbid` as the symbol dimension.
>
> ```python
> ds = Dataset('TREOD')
> df = ds.get_data(dt.date(2025, 1, 2), dt.date(2026, 3, 19), bbid=['GS UN', 'AAPL UW'])
> ```

## `get_data` — Fetch a DataFrame

The primary method. Returns a `pandas.DataFrame` with one row per data point.

```python
df = ds.get_data(
    start=dt.date(2025, 1, 2),
    end=dt.date(2025, 3, 19),
    bbid=['EURUSD', 'USDJPY'],  # filter by symbol dimension — passed as kwargs
)
```

**Key parameters:**

| Parameter | Description |
|---|---|
| `start` | Start date or datetime of the query |
| `end` | End date or datetime (inclusive) |
| `as_of` | Return data as it existed at this point in time |
| `since` | Return data updated since this datetime |
| `fields` | List of field names to return; omit for all fields |
| `**kwargs` | Symbol dimension filters, e.g. `bbid=['EURUSD']`, `ticker='SPX'`, `assetId='...'` |

Filter kwargs match the dataset's symbol dimensions exactly — check the Marquee catalog
page for the correct dimension name. Multiple values are passed as a list.

```python
# Filter by a single value
df = ds.get_data(dt.date(2025, 1, 2), dt.date(2025, 3, 19), bbid='EURUSD')

# Filter by multiple values
df = ds.get_data(dt.date(2025, 1, 2), dt.date(2025, 3, 19), bbid=['EURUSD', 'GBPUSD'])

# Restrict to specific fields
df = ds.get_data(dt.date(2025, 1, 2), dt.date(2025, 3, 19), bbid=['EURUSD'], fields=['impliedVolatility', 'tenor'])

# Query specific dates rather than a range
df = ds.get_data(dates=[dt.date(2025, 1, 15), dt.date(2025, 3, 19)], bbid=['EURUSD'])
```

## `get_data_series` — Fetch a Single-Field Time Series

Returns a `pandas.Series` indexed by date/time:

```python
series = ds.get_data_series(
    field='impliedVolatility',
    start=dt.date(2025, 1, 2),
    end=dt.date(2025, 3, 19),
    bbid='EURUSD',
)
```

## `get_data_last` — Most Recent Data Point

Returns the latest available row at or before `as_of`:

```python
latest = ds.get_data_last(
    as_of=dt.datetime.now(),
    bbid=['EURUSD', 'USDJPY'],
)
```

## `get_coverage` — What Assets Are Available

```python
coverage = ds.get_coverage()
print(coverage.head())

# Include the history start date for each asset
coverage = ds.get_coverage(include_history=True)
coverage = coverage.sort_values('historyStartDate')
```

## Iterating Over Large Queries

For datasets with many assets or long date ranges, break queries into smaller chunks:

```python
import pandas as pd


def query_in_batches(dataset, ids, start, end, id_field='bbid', time_delta=dt.timedelta(days=30)):
    """Fetch data in time batches for a list of symbol IDs."""
    frames = []
    batch_start = start
    while batch_start < end:
        batch_end = min(batch_start + time_delta, end)
        df = dataset.get_data(batch_start, batch_end, **{id_field: ids})
        frames.append(df)
        batch_start = batch_end
    return pd.concat(frames) if frames else pd.DataFrame()


ds = Dataset('EDRVOL_PERCENT_V1_STANDARD')
coverage = ds.get_coverage()
ids = coverage['assetId'].tolist()[:10]

df = query_in_batches(ds, ids, dt.date(2024, 1, 1), dt.date(2025, 3, 19), id_field='assetId')
```

## Uploading Data
D
```python
import pandas as pd

data = [
    {'date': '2025-03-19', 'city': 'London', 'maxTemperature': 14.0, 'minTemperature': 7.0},
    {'date': '2025-03-19', 'city': 'New York', 'maxTemperature': 18.0, 'minTemperature': 9.0},
]
ds = Dataset('MY_CUSTOM_DATASET')
ds.upload_data(data)  # accepts list of dicts or a DataFrame
```

## Common Pitfalls

- **Wrong dimension name** — each dataset has its own symbol dimension (`bbid`, `assetId`,
  `ticker`, `ric`, etc.). Check the Marquee catalog page. Passing the wrong kwarg silently
  returns an empty DataFrame.
- **Query size limits** — very wide queries (many assets x long date range) will time out
  or be rejected. Iterate in batches as shown above.
- **Entitlements** — if `get_data` returns an empty DataFrame unexpectedly, your session
  may not have the required entitlement scope (e.g. `read_product_data`).
- **Intraday vs daily** — some datasets are indexed by `datetime` (intraday); others by
  `date` (EOD). Pass `dt.datetime` objects for intraday datasets and `dt.date` for EOD.
````

## `instruments.md`

````markdown
# Constructing Trades with `gs_quant.instrument`

Instruments are the building blocks of gs_quant. Every tradeable product is represented as a dataclass in `gs_quant.instrument`. Construct an instrument by importing its class and supplying the key economic parameters — any parameter you omit will be resolved by the server later.

## Interest Rate Swap

```python
from gs_quant.instrument import IRSwap

swap = IRSwap(
    pay_or_receive='Pay',  # 'Pay' or 'Receive' the fixed leg
    termination_date='10y',  # tenor or explicit date
    notional_currency='USD',  # currency
    fixed_rate=0.03,  # optional — leave None to resolve at market
)
```

## Cross-Currency Swap — Fix / Fix (`IRXccySwapFixFix`)

Both legs pay a fixed coupon. Each leg has its own notional, set independently to encode
the agreed FX rate at inception.

```python
from gs_quant.instrument import IRXccySwapFixFix
from gs_quant.common import Currency, PrincipalExchange

swap = IRXccySwapFixFix(
    termination_date='5y',
    effective_date='0b',  # spot start
    payer_currency=Currency.USD,
    payer_rate=0.04,  # 4.00% fixed USD coupon
    receiver_currency=Currency.EUR,
    receiver_rate=0.025,  # 2.50% fixed EUR coupon
    notional_amount=10e6,
    principal_exchange=PrincipalExchange.Both,
)
swap.resolve()
```

Key parameters: `payer_rate`, `receiver_rate`, `notional_amount` (payer leg),
`receiver_notional_amount` (receiver leg — set explicitly to encode the agreed FX rate),
`payer_frequency`, `receiver_frequency`, `payer_day_count_fraction`,
`receiver_day_count_fraction`, `payer_business_day_convention`,
`receiver_business_day_convention`.

## Cross-Currency Swap — Fix / Float (`IRXccySwapFixFlt`)

One leg pays a fixed rate; the other pays a floating rate (LIBOR/RFR + spread).
`pay_or_receive` controls which side you pay. Currencies are specified via
`fixed_rate_currency` and `floating_rate_currency` (not payer/receiver).

```python
from gs_quant.instrument import IRXccySwapFixFlt
from gs_quant.common import Currency, PrincipalExchange, PayReceive

swap = IRXccySwapFixFlt(
    pay_or_receive=PayReceive.Pay,  # pay fixed USD, receive floating EUR
    termination_date='5y',
    effective_date='0b',
    fixed_rate_currency=Currency.USD,
    fixed_rate=0.04,  # 4.00% fixed USD rate
    floating_rate_currency=Currency.EUR,
    floating_rate_spread=0.0,
    notional_amount=10000,
    principal_exchange=PrincipalExchange.Both,
)
swap.resolve()
```

Key parameters: `pay_or_receive`, `fixed_rate_currency`, `fixed_rate`,
`fixed_rate_frequency`, `fixed_rate_day_count_fraction`,
`fixed_rate_business_day_convention`, `fixed_first_stub`, `fixed_last_stub`,
`fixed_holidays`, `floating_rate_currency`, `floating_rate_option`,
`floating_rate_designated_maturity`, `floating_rate_spread`, `floating_rate_frequency`,
`floating_rate_day_count_fraction`, `floating_rate_business_day_convention`,
`floating_first_stub`, `floating_last_stub`, `floating_holidays`,
`floating_rate_for_the_initial_calculation_period`.

## Cross-Currency Swap — Float / Float non-MTM (`IRXccySwapFltFlt`)

Both legs pay a floating rate in different currencies. The notional is **fixed for the
life of the trade** — the FX rate does not reset. Set `receiver_amount` to encode the
agreed FX rate. The XCcy basis spread is typically applied as `receiver_spread`.

```python
from gs_quant.instrument import IRXccySwapFltFlt
from gs_quant.common import Currency, PrincipalExchange

swap = IRXccySwapFltFlt(
    termination_date='5y',
    effective_date='0b',
    payer_currency=Currency.USD,
    payer_spread=0.0,
    receiver_currency=Currency.EUR,
    receiver_spread=0.0,  # XCcy basis spread — resolve at par if omitted
    notional_amount=10000,
    principal_exchange=PrincipalExchange.Both,
)
swap.resolve()
```

Key parameters: `payer_rate_option`, `payer_designated_maturity`, `payer_spread`,
`payer_frequency`, `payer_day_count_fraction`, `payer_business_day_convention`,
`payer_first_stub`, `payer_last_stub`, `payer_holidays`, and the equivalent `receiver_*`
fields. `receiver_amount` encodes the agreed FX rate and is fixed at inception.

## Cross-Currency Swap — Float / Float MTM (`IRXccySwap`)

Same structure as `IRXccySwapFltFlt` but the receiver notional **resets to FX spot at
each period start**, eliminating FX credit exposure. This is the standard interbank
product. Note: `receiver_amount` is **not** a field — the receiver notional is computed
automatically each period.

```python
from gs_quant.instrument import IRXccySwap
from gs_quant.common import Currency, PrincipalExchange, PayReceive

swap = IRXccySwap(
    termination_date='5y',
    effective_date='0b',
    payer_currency=Currency.USD,
    payer_spread=0.0,
    receiver_currency=Currency.EUR,
    receiver_spread=0.0,  # XCcy basis — resolve at par if omitted
    notional_amount=10000,  # payer notional only; receiver resets to FX spot
    principal_exchange=PrincipalExchange.Both,
    # initial_fx_rate=1.10,             # optional: pin the opening FX rate
)
swap.resolve()
```

Key additional parameters vs `IRXccySwapFltFlt`: `initial_fx_rate` (optional, pins the
opening FX rate), `notional_reset_side`.

**MTM vs non-MTM at a glance:**

| | `IRXccySwap` (MTM) | `IRXccySwapFltFlt` (non-MTM) |
|---|---|---|
| Receiver notional | Resets to FX spot each period | Fixed at inception |
| FX credit exposure | Eliminated | Builds up over trade life |
| `receiver_amount` field | Not present | Required — encodes the agreed FX rate |
| `initial_fx_rate` field | Available | Not available |
| `notional_reset_side` field | Available | Not available |

All four XCcy swap types accept `principal_exchange` (`PrincipalExchange.Both` is
standard — notionals exchanged at start and maturity) and an optional `fee` /
`fee_currency` / `fee_payment_date`. Note if you have a principal exchange which is
in the past this cash flow will not be ignored by the Price measure. So in general
only have exchanges which are in the past relative to the PricingContext.

Relevant risk measures:

```python
from gs_quant.risk import IRDeltaParallel, IRXccyDeltaParallel, IRDelta, IRXccyDelta
# IRDeltaParallel      — total rate DV01 (1bp parallel shift in discount/fwd curve, USD)
# IRXccyDeltaParallel  — total XCcy basis DV01 (1bp shift in cross-ccy basis, USD)
# IRDelta              — bucketed rate delta ladder (per tenor)
# IRXccyDelta          — bucketed XCcy basis delta ladder (per tenor)
```

---

## Interest Rate Swaption

```python
from gs_quant.instrument import IRSwaption

swaption = IRSwaption(
    pay_or_receive='Receive',
    termination_date='10y',
    notional_currency='EUR',
    expiration_date='1y',
    strike='ATM',
)
```

## Interest Rate Cap

```python
from gs_quant.instrument import IRCap

cap = IRCap(
    termination_date='1y',
    notional_currency='USD',
)
```

## FX Option

```python
from gs_quant.instrument import FXOption

option = FXOption(
    pair='EURUSD',
    expiration_date='3m',
    option_type='Call',
    strike_price='ATMF',
    notional_amount=10e6,
)
```

## FX Forward

```python
from gs_quant.instrument import FXForward

fwd = FXForward(
    pair='USDJPY',
    settlement_date='6m',
    notional_amount=10e6,
)
```

## Important: FX Instrument Pitfalls

### 1. Always Set `premium=0` on FX Options

When constructing FX options (FXOption, FXBinary, FXMultiCrossBinary, etc.), if you don't specify a `premium`, the instrument resolution will automatically set a premium such that the `DollarPrice` becomes zero. This is by design — it represents a "fair value" trade where the premium exactly offsets the option value.

**Problem:** If you want to know the cost/value of the option, you'll always get 0.

**Solution:** Either set `premium=0` explicitly when you want `DollarPrice` to return the actual option present value, or use the risk measure `FairPremium`, `FairPremiumInPercent` which will ignore any premium specified on the instrument.

```python
from gs_quant import risk
from gs_quant.instrument import FXOption, FXBinary

# WRONG - DollarPrice will be ~0 after resolution
option = FXOption(
    pair='EURUSD',
    expiration_date='3m',
    option_type='Call',
    strike_price='ATMF',
    notional_amount=10e6,
)
option.calc(risk.DollarPrice)

# CORRECT - DollarPrice will be the option value
# Same applies to FXBinary, FXEuropeanKnockout etc
option = FXOption(
    pair='EURUSD',
    expiration_date='3m',
    option_type='Call',
    strike_price='ATMF',
    notional_amount=10e6,
    premium=0,  # <-- Important!
)
option.calc(risk.DollarPrice)

# OR make sure to use FairPremium instead of DollarPrice
# This will also respect the premium settlement date of the option.
option.calc(risk.FairPremium)
```

### 2. FXMultiCrossBinaryLeg Uses Different OptionType Values

When constructing `FXMultiCrossBinaryLeg` objects (used within `FXMultiCrossBinary` for dual digital options), you must use `OptionType.Binary_Call` or `OptionType.Binary_Put` — **not** `OptionType.Call` or `OptionType.Put`.

This is different from `FXBinary` which uses `OptionType.Call` / `OptionType.Put`.

```python
from gs_quant.instrument import FXBinary, FXMultiCrossBinary, FXMultiCrossBinaryLeg
from gs_quant.common import BuySell, OptionType, Currency

# FXBinary uses OptionType.Call / OptionType.Put
single_digital = FXBinary(
    pair='EURUSD',
    buy_sell=BuySell.Buy,
    option_type=OptionType.Call,  # <-- Call or Put
    strike_price='s',
    notional_amount=1e6,
    notional_currency=Currency.USD,
    expiration_date='3m',
    premium=0,
)

# FXMultiCrossBinaryLeg uses OptionType.Binary_Call / OptionType.Binary_Put
dual_digital = FXMultiCrossBinary(
    legs=(
        FXMultiCrossBinaryLeg(
            pair='EURUSD',
            option_type=OptionType.Binary_Call,  # <-- Binary_Call or Binary_Put
            strike_price='s',
        ),
        FXMultiCrossBinaryLeg(
            pair='USDJPY',
            option_type=OptionType.Binary_Call,  # <-- Binary_Call or Binary_Put
            strike_price='s',
        ),
    ),
    buy_sell=BuySell.Buy,
    notional_amount=1e6,
    notional_currency=Currency.USD,
    expiration_date='3m',
    premium=0,  # <-- Don't forget this too!
)
```

## Equity Option

```python
from gs_quant.instrument import EqOption

eq_opt = EqOption(
    underlier='.SPX',
    expiration_date='3m',
    strike_price='ATMF',
    option_type='Call',
    option_style='European',
)
```

## Naming Instruments

Set the instrument `name` property for easy identification in portfolios and results:

```python
swap.name = 'USD 10y Payer'
```
See `pricing.md` for pricing.
````

## `measure.md`

````markdown
# Writing a Measure and Its Test

Guide for adding a new measure function in `gs_quant/timeseries/` and its corresponding test in `gs_quant/test/timeseries/`.

---

## 1. Create or Add to a Measure File

Place your measure in an existing `measures_*.py` file or create a new one (e.g., `measures_custom.py`).

### File Structure

```python
"""
Copyright 2020 Goldman Sachs.
Licensed under the Apache License, Version 2.0 (the "License");
...
"""

import datetime as dt
import logging
from typing import Optional, Union

import pandas as pd

from gs_quant.api.gs.data import QueryType, GsDataApi
from gs_quant.common import AssetClass, AssetType, PricingLocation
from gs_quant.data import DataContext, Dataset
from gs_quant.errors import MqValueError
from gs_quant.markets.securities import Asset, AssetIdentifier
from gs_quant.timeseries.helper import plot_measure, check_forward_looking, _to_offset
from gs_quant.timeseries.measures import (
    _market_data_timed,
    _range_from_pricing_date,
    ExtendedSeries,
    GENERIC_DATE,
    ASSET_SPEC,
    _asset_from_spec,
)

_logger = logging.getLogger(__name__)
```

### Import Conventions (enforced by ruff)

- `import pandas as pd` — never `from pandas import ...`
- `import numpy as np`
- `import datetime as dt`
- Do NOT import from `gs_quant.target.common` — use `gs_quant.common`
- Do NOT use `pytz` — use `zoneinfo` or `datetime.timezone`
- Max line length: 120 characters

### PEP 8 Standards (mandatory)

All new measure code **must** comply with PEP 8. Key requirements:

#### Naming

- **Functions and variables:** `snake_case` (e.g., `swap_rate`, `implied_volatility_fwd`)
- **Classes and Enums:** `CamelCase` (e.g., `EventType`, `RateType`)
- **Constants:** `UPPER_SNAKE_CASE` (e.g., `CENTRAL_BANK_WATCH_START_DATE`)
- **Private/internal helpers:** prefix with underscore (e.g., `_extract_series_from_df`)

#### Formatting

- **Indentation:** 4 spaces, never tabs.
- **Blank lines:** 2 blank lines before and after top-level function/class definitions; 1 blank line between methods inside a class.
- **Trailing whitespace:** none.
- **Imports:** grouped in order — stdlib → third-party → local — each group separated by a blank line. Alphabetize within each group.

#### Docstrings

- Use triple double-quotes (`"""`).
- First line is a concise summary ending with a period.
- Include `:param`, `:return:`, `**Usage**`, and `**Examples**` sections.

#### Type Annotations

- All public function parameters and return types must be annotated.
- Use `Optional[X]` for parameters that can be `None`.
- Use `Union[X, Y]` when multiple types are accepted.

#### Expressions and Statements

- Surround top-level operators with spaces: `x = 1`, `a + b`.
- No spaces inside brackets: `func(arg)`, `list[0]`.
- Use `is` / `is not` for `None` comparisons: `if x is None:`.
- Avoid bare `except:`; always catch a specific exception.
- Keep functions focused — if a function exceeds ~50 lines, consider extracting helpers.

#### Test Naming

- Test functions: `test_<function_name>` or `test_<function_name>_<scenario>`.
- Test classes (if used): `TestMyMeasure`.
- Each test should have a descriptive docstring explaining what is verified.

#### Enforcement

Run before every commit:

```bash
ruff check --fix
ruff format
```

---

### Writing the Measure Function

```python
@plot_measure((AssetClass.Rates,), (AssetType.Swap,), [QueryType.SWAP_RATE])
def my_measure(
    asset: Asset,
    tenor: str,
    pricing_date: Optional[GENERIC_DATE] = None,
    *,
    real_time: bool = False,
) -> pd.Series:
    """Short description of what this measure returns.

    :param asset: asset object loaded from security master
    :param tenor: e.g. '10y'
    :param pricing_date: specific date or relative date string
    :param real_time: whether to retrieve intraday data (default: False)
    :return: time series of the measure values

    **Usage**

    Explain what the measure does and when to use it.

    **Examples**

    >>> from gs_quant.timeseries.measures_custom import my_measure
    >>> my_measure(Asset('MA...', AssetClass.Rates, 'USD'), '10y')
    """
    # 1. Validate inputs
    if real_time:
        raise MqValueError('real-time not supported for this measure')

    # 2. Resolve the asset (if using ASSET_SPEC)
    asset = _asset_from_spec(asset)

    # 3. Build query parameters
    query_params = dict(tenor=tenor)

    # 4. Fetch data via _market_data_timed or Dataset
    q = GsDataApi.build_market_data_query([asset.get_marquee_id()], QueryType.SWAP_RATE, where=query_params)
    df = _market_data_timed(q)

    # 5. Extract and return a pd.Series
    return _extract_series_from_df(df, QueryType.SWAP_RATE, True)
```

### Key Patterns

| Pattern | Description |
|---------|-------------|
| `@plot_measure(asset_classes, asset_types, query_types)` | Decorator that registers the function in the Plot Service and handles entitlement/logging |
| `_market_data_timed(query)` | Fetches market data with timing/logging |
| `_range_from_pricing_date(exchange, pricing_date)` | Returns (start, end) date range from a pricing date |
| `check_forward_looking(...)` | Validates forward-looking date inputs |
| `ExtendedSeries` | A `pd.Series` subclass used for returning results with metadata |
| `MqValueError` | Raise for invalid user inputs |

### Registering Your Module

If you create a new file, make sure it is imported in `gs_quant/timeseries/__init__.py` so the measures are discoverable.

---

## 2. Write the Corresponding Test

Place your test in `gs_quant/test/timeseries/test_measures_custom.py` (matching the source file name).

### Test File Structure

```python
"""
Copyright 2020 Goldman Sachs.
Licensed under the Apache License, Version 2.0 (the "License");
...
"""

import datetime as dt

import pandas as pd
import pytest
from testfixtures import Replacer
from testfixtures.mock import Mock

import gs_quant.timeseries.measures_custom as tm_custom
from gs_quant.api.gs.data import MarketDataResponseFrame, QueryType
from gs_quant.errors import MqValueError
from gs_quant.markets.securities import Currency
from gs_quant.session import GsSession, Environment
from gs_quant.test.timeseries.utils import mock_request

_index = [pd.Timestamp('2021-01-04')]


def test_my_measure(mocker):
    # 1. Mock the GsSession
    replace = Replacer()
    mock_session = Mock(spec=GsSession)
    mock_session.current = mock_session
    mock_session._get = Mock()
    mock_session.domain = 'https://marquee.gs.com'
    replace('gs_quant.timeseries.measures.GsSession', mock_session)

    # 2. Build mock response data
    mock_df = MarketDataResponseFrame(
        data={'swapRate': [0.025]},
        index=_index,
    )

    # 3. Patch the data-fetching function
    mocker.patch.object(
        tm_custom,
        '_market_data_timed',
        return_value=mock_df,
    )

    # 4. Create a mock asset
    mock_asset = Currency('MA_TEST', 'USD')

    # 5. Call the measure and assert
    result = tm_custom.my_measure(mock_asset, '10y')
    assert isinstance(result, pd.Series)
    assert len(result) == 1
    assert result.iloc[0] == 0.025

    # 6. Cleanup
    replace.restore()


def test_my_measure_invalid_input():
    mock_asset = Currency('MA_TEST', 'USD')
    with pytest.raises(MqValueError):
        tm_custom.my_measure(mock_asset, '10y', real_time=True)
```

### Testing Patterns

| Pattern | When to Use |
|---------|-------------|
| `Replacer` + `Mock(spec=GsSession)` | Mock the HTTP session to avoid real API calls |
| `mocker.patch.object(module, 'func', return_value=...)` | Replace data-fetching internals |
| `MarketDataResponseFrame` | Construct fake API response DataFrames |
| `pytest.raises(MqValueError)` | Assert that invalid inputs raise proper errors |
| `mock_request` (from `utils.py`) | Helper to mock `GsSession._get` with canned JSON |

### Running Tests

```bash
# Single test file
uv run pytest gs_quant/test/timeseries/test_measures_custom.py

# Single test function
uv run pytest gs_quant/test/timeseries/test_measures_custom.py::test_my_measure

# All timeseries tests
uv run pytest gs_quant/test/timeseries/
```

---

## 3. Checklist Before Committing

- [ ] Function has `@plot_measure` decorator with correct asset classes/types
- [ ] Docstring with `:param`, `:return:`, `**Usage**`, and `**Examples**` sections
- [ ] All public parameters and return types have type annotations
- [ ] Input validation raises `MqValueError` with a clear message
- [ ] `real_time` parameter handled (raise if unsupported)
- [ ] PEP 8 naming: `snake_case` functions/variables, `CamelCase` classes, `UPPER_SNAKE_CASE` constants
- [ ] Imports ordered: stdlib → third-party → local, alphabetized within groups
- [ ] No unused imports or variables
- [ ] New module imported in `__init__.py` (if new file)
- [ ] Test covers happy path and error cases; test names are descriptive
- [ ] Run `ruff format` and `ruff check --fix` — zero warnings
- [ ] All tests pass: `uv run pytest gs_quant/test/timeseries/`
````

## `pricing.md`

````markdown
# Pricing in gs_quant

Pricing instruments and portfolios in gs_quant: PricingContext, HistoricalPricingContext for historical pricing over date ranges, and LiveMarket for real-time FX pricing. Covers pricing dates, market data location, batch mode, and async patterns.

## PricingContext Basics

All pricing in gs_quant happens within a `PricingContext`. The default context uses today's close-of-business market data.

```python
from gs_quant.markets import PricingContext
from gs_quant.risk import DollarPrice, IRDelta

# Implicit default context — uses today's close
price = swap.dollar_price()

# Explicit context with parameters
with PricingContext(pricing_date=dt.date(2025, 1, 15), market_data_location='LDN'):
    price_f = swap.dollar_price()
    delta_f = swap.calc(IRDelta)

price = price_f.result()
delta = delta_f.result()
```

**Key parameters:**

| Parameter | Description |
|---|---|
| `pricing_date` | Date for pricing (default: today) |
| `market_data_location` | `'NYC'`, `'LDN'`, or `'HKG'` (default: `'LDN'`) |
| `market` | Market object (e.g. `CloseMarket()`, `LiveMarket()`) |
| `csa_term` | CSA term for discounting |
| `is_batch` | Use batch mode for long-running calculations |
| `is_async` | Return immediately without blocking |
| `show_progress` | Display a tqdm progress bar |

Inside an entered `PricingContext`, calculations return `PricingFuture` objects. Call `.result()` after exiting the context.

---

## Resolving Under a Pricing Context

Resolution can be targeted to a specific date or market:

```python
from gs_quant.markets import PricingContext
import datetime as dt

with PricingContext(pricing_date=dt.date(2025, 1, 15)):
    resolved = swap.resolve(in_place=False)
    resolved_swap = resolved.result()
```

Historical resolution across multiple dates (must use `in_place=False`):

```python
from gs_quant.markets import HistoricalPricingContext

with HistoricalPricingContext(dt.date(2025, 1, 1), dt.date(2025, 1, 31)):
    resolved_by_date = swap.resolve(in_place=False)

# resolved_by_date is a dict of {date: resolved_instrument}
```

---

## Historical Pricing with `HistoricalPricingContext`

Compute risk measures across a range of dates using the close-of-business market for each date.

### Basic Usage

```python
import datetime as dt
from gs_quant.instrument import IRSwap
from gs_quant.markets import HistoricalPricingContext
from gs_quant.risk import DollarPrice

swap = IRSwap('Pay', '10y', 'USD')

with HistoricalPricingContext(dt.date(2025, 1, 2), dt.date(2025, 1, 31)):
    price_f = swap.price()

price_series = price_f.result()  # a pandas Series indexed by date
```

### By Number of Business Days

```python
with HistoricalPricingContext(10):
    price_f = swap.price()

price_series = price_f.result()
```

### With Custom Date List

```python
dates = [dt.date(2025, 1, 2), dt.date(2025, 3, 15), dt.date(2025, 6, 30)]

with HistoricalPricingContext(dates=dates):
    price_f = swap.price()
```

### Key Parameters

| Parameter | Description |
|---|---|
| `start` | Start date (or number of business days back from today) |
| `end` | End date (defaults to today) |
| `calendars` | Holiday calendar(s) for date generation |
| `dates` | Explicit iterable of dates (mutually exclusive with `start`) |
| `is_batch` | Use batch mode for long-running calculations (avoids timeouts) |
| `is_async` | Return immediately without blocking |
| `show_progress` | Display a tqdm progress bar |
| `market_data_location` | `'NYC'`, `'LDN'`, or `'HKG'` (defaults to `'LDN'`) |
| `csa_term` | CSA term for discounting |

### Historical Pricing with Portfolios

```python
with HistoricalPricingContext(dt.date(2025, 1, 2), dt.date(2025, 1, 31)):
    result = portfolio.calc(DollarPrice)

# result is a PortfolioRiskResult with a date dimension
```

---

## Live Market Pricing with `LiveMarket`

By default, `PricingContext` uses close-of-business market data. To price against **real-time, live market data**, set `market=LiveMarket()`. This uses a market snapshot captured at the moment the calculation runs.

> **Note:** Live market pricing is currently only available for **FX instruments** (e.g. `FXOption`, `FXForward`, `FXBinary`, `FXMultiCrossBinary`).

### Basic Usage

```python
from gs_quant.instrument import FXOption
from gs_quant.markets import PricingContext, LiveMarket
from gs_quant.risk import DollarPrice

option = FXOption(
    pair='EURUSD',
    expiration_date='3m',
    option_type='Call',
    strike_price='ATMF',
    notional_amount=10e6,
    premium=0,
)

with PricingContext(market=LiveMarket()):
    price_f = option.dollar_price()

price = price_f.result()  # priced against the live market
```

### Live Market with Portfolios

```python
from gs_quant.instrument import FXOption, FXForward
from gs_quant.markets import PricingContext, LiveMarket
from gs_quant.markets.portfolio import Portfolio
from gs_quant.risk import DollarPrice

portfolio = Portfolio(
    [
        FXOption(
            pair='EURUSD',
            expiration_date='3m',
            option_type='Call',
            strike_price='ATMF',
            notional_amount=10e6,
            premium=0,
            name='EUR Call',
        ),
        FXForward(pair='USDJPY', settlement_date='6m', notional_amount=10e6, name='JPY Fwd'),
    ]
)

with PricingContext(market=LiveMarket()):
    result = portfolio.calc(DollarPrice)

prices = result[DollarPrice]
```

### Key Points

- **No caching** — results are not cached since the market state changes continuously.
- **Combines with other parameters** — you can still set `csa_term`, `is_async`, `is_batch`, etc. alongside `market=LiveMarket()`.

See `results.md` for more information on extracting results from pricing calculation (FloatWithInfo, DataFrameWithInfo, PortfolioRiskResult, etc.)
````

## `results.md`

````markdown
# Result Extraction

Extracting and working with gs_quant calculation results: FloatWithInfo, SeriesWithInfo, DataFrameWithInfo, ErrorValue, MultipleRiskMeasureResult, PortfolioRiskResult. Covers futures, slicing portfolio results by instrument/measure/date, historical results, to_frame(), error handling, and arithmetic."

Calculation results in gs_quant are rich typed objects that carry metadata (risk key, unit, error info) alongside the actual values.

## Result Types

| Type | Description |
|---|---|
| `FloatWithInfo` | Scalar result (e.g. present value). Behaves like a `float` but carries a `risk_key` and `unit`. |
| `SeriesWithInfo` | Time series result (historical pricing). A `pandas.Series` with metadata. |
| `DataFrameWithInfo` | Structured/bucketed result (e.g. delta ladder). A `pandas.DataFrame` with metadata. |
| `ErrorValue` | Indicates a calculation error. Check `.error` for the message. |
| `MultipleRiskMeasureResult` | Dict-like mapping of `RiskMeasure -> result` when multiple measures are requested on a single instrument. |
| `PortfolioRiskResult` | Result for a portfolio — can be sliced by instrument, risk measure, or date. |

## Single Instrument Results

```python
from gs_quant.instrument import IRSwap
from gs_quant.risk import DollarPrice, IRDelta

swap = IRSwap('Pay', '10y', 'USD')

# Scalar result
price = swap.dollar_price()  # FloatWithInfo
print(float(price))  # the numeric value

# Local currency price
local_price = swap.price()  # FloatWithInfo

# Structured result
delta = swap.calc(IRDelta)  # DataFrameWithInfo — a bucketed delta ladder
print(delta)  # displays as a DataFrame with columns like mkt_type, mkt_asset, etc.
```

## Using Futures (Async / Batched)

Inside an entered `PricingContext`, calculations return `PricingFuture` objects. Call `.result()` after exiting the context:

```python
from gs_quant.markets import PricingContext

with PricingContext():
    price_f = swap.dollar_price()
    delta_f = swap.calc(IRDelta)

price = price_f.result()  # FloatWithInfo
delta = delta_f.result()  # DataFrameWithInfo
```

## Multiple Risk Measures on a Single Instrument

```python
from gs_quant.risk import DollarPrice, IRDelta, IRVega

result = swap.calc([DollarPrice, IRDelta, IRVega])  # MultipleRiskMeasureResult

price = result[DollarPrice]  # FloatWithInfo
delta = result[IRDelta]  # DataFrameWithInfo
vega = result[IRVega]  # DataFrameWithInfo
```

## Portfolio Results

`portfolio.calc()` returns a `PortfolioRiskResult` which supports flexible slicing:

```python
from gs_quant.risk import DollarPrice, IRDelta

result = portfolio.calc([DollarPrice, IRDelta])

# Slice by risk measure
prices = result[DollarPrice]  # PortfolioRiskResult for DollarPrice only

# Slice by instrument (name or object)
swap_result = result['USD 10y Payer']  # MultipleRiskMeasureResult for that instrument
swap_price = swap_result[DollarPrice]  # FloatWithInfo

# Slice by index
first_result = result[0]

# Iterate over instruments
for instrument_result in result:
    print(instrument_result)

# Aggregate across all instruments
total_price = result[DollarPrice].aggregate()  # sums all instrument prices
```

## Historical Results

When using `HistoricalPricingContext`, scalar results become time series:

```python
import datetime as dt
from gs_quant.markets import HistoricalPricingContext

with HistoricalPricingContext(dt.date(2025, 1, 2), dt.date(2025, 1, 31)):
    price_f = swap.price()

price_series = price_f.result()  # SeriesWithInfo indexed by date
print(price_series)

# Access value for a specific date
jan_15_price = price_series[dt.date(2025, 1, 15)]
```

Historical portfolio results can also be sliced by date:

```python
with HistoricalPricingContext(dt.date(2025, 1, 2), dt.date(2025, 1, 31)):
    result = portfolio.calc(DollarPrice)

# Slice by date
jan_15 = result[dt.date(2025, 1, 15)]  # PortfolioRiskResult for that single date

# Available dates
result.dates  # tuple of dt.date
```

## Converting to DataFrames

All result types support conversion to pandas DataFrames:

```python
# Portfolio result to DataFrame (pivoted)
df = result.to_frame()

# Unpivoted (raw records)
df_raw = result.to_frame(values=None, index=None, columns=None)

# Custom pivoting
df_custom = result.to_frame(values='value', index='dates', columns='instrument_name')
```

`MultipleRiskMeasureResult` also supports `.to_frame()`:

```python
multi_result = swap.calc([DollarPrice, IRDelta])
df = multi_result.to_frame()
```

## Checking for Errors

```python
from gs_quant.risk import ErrorValue

price = swap.dollar_price()
if isinstance(price, ErrorValue):
    print(f'Calculation failed: {price.error}')
else:
    print(f'Price: {float(price)}')
```

## Arithmetic on Results

Results support arithmetic operations, useful for computing P&L or scaling:

```python
# Multiply portfolio result by a scalar
scaled = result * 1000

# Add results from different portfolios
combined = result_a + result_b
```

## Common Risk Measures

```python
from gs_quant.risk import (
    DollarPrice,  # USD present value
    Price,  # local currency present value
    IRDelta,  # bucketed rate delta ladder
    IRDeltaParallel,  # total rate DV01 (1bp parallel shift)
    IRVega,  # bucketed IR vol sensitivity
    FXDelta,  # FX delta
    IRXccyDelta,  # bucketed cross-currency basis delta
    IRXccyDeltaParallel,  # total cross-currency basis DV01
)
```
````
