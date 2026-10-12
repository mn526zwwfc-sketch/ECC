# fincept-quant

A Claude Code plugin for the quant-evidence engine in
[FinceptTerminal](https://github.com/mn526zwwfc-sketch/FinceptTerminal)
(`fincept-qt/scripts/Analytics/quant_evidence`).

The engine turns the literature review "La academia quant desinfla sus propias
estrategias" into code. It holds the evidence on 44 quant strategies (claim,
critique, what survives, sources). It scores a proposed decision from 0 to 100
once multiple testing, decay, microcaps and trading costs are counted, and it
computes the Deflated Sharpe Ratio, the Harvey-Liu haircut, the minimum
backtest length, cost drag and break-evens, the Bodie shortfall put and Kelly
sizing.

This plugin brings the engine into Claude Code, using the ECC formats.

Everything it produces is educational. It is not personalized financial
advice, it makes no market predictions and it never recommends specific
securities.

## What is included

| Piece | Contents |
|-------|----------|
| MCP server `fincept-quant` | `search_strategies`, `get_strategy`, `evaluate_decision`, `compare_strategies`, `breakeven_points`, `deflated_sharpe`, `haircut_sharpe`, `min_backtest_length`, `cost_drag`, `horizon_risk`, `kelly`, `repo_modules` |
| Agents | `fincept-strategy-analyst` (what the evidence says, what fits a profile), `fincept-backtest-auditor` (overfitting, costs and decay in a backtest claim, including PBO and MinTRL on the user's data), `fincept-market-data` (prices from Yahoo Finance or the user's files, as clean return tables), `fincept-signals-analyst` (Congress and insider trades, lobbying, contracts, and what the evidence says about following them), `fincept-research-curator` (verified updates to the evidence base), `fincept-engine-developer` (changing the engine safely), `fincept-liquid-trader` (read-only pre-trade check of an order you name on your Liquid account) |
| Skills | `fincept-investment-playbook` (shared by every agent: product map, data sources and limits, evidence, thresholds, guardrails, lessons learned), `quant-evidence-method`, `quant-stats-toolkit`, `fincept-engine-development` |
| Commands | `/fincept-committee` (runs the agents in parallel and writes one memo), `/fincept-signals`, `/fincept-evaluate`, `/fincept-compare`, `/fincept-breakeven`, `/fincept-strategy`, `/fincept-trade` (one Liquid order: check, proposal, your approval, execution) |
| Hooks | SessionStart checks the engine path; PostToolUse reminds about the Python/JavaScript parity rule after engine edits; PreToolUse asks you before any Liquid tool that moves money or changes the account, and denies those tools to subagents |

The MCP server is part of FinceptTerminal (`quant_evidence/mcp_server.py`).
It uses only the Python standard library, so it needs no `pip install`.

## Data sources

| Source | Used for | Notes |
|--------|----------|-------|
| Yahoo Finance | Monthly adjusted prices (US, BMV `.MX`, indices `^MXX`, currencies `USDMXN=X`) | `quant_evidence/app/yahoo_sync.py`; a scheduled task stores them in the Laboratorio Fincept page database on weekdays (currently paused, so agents run `yahoo_sync.py` for fresher data). Unofficial endpoint, personal use |
| Quiver Quant connector | Congress and insider trades, lobbying, federal contracts | Only source for these signals. Needs at least the Hobbyist subscription; without it the agents report the signals as unavailable |
| Liquid (Co-Invest connector) | Your trading account: mode, balances, positions, market data; orders only through `/fincept-trade` | Live account unless paper trading is enabled; every order needs your approval of its exact terms |
| The user's files | Backtests and variant tables | `node quant_evidence/web/series_cli.js file.csv` |

The MCP tool names in the agents' `tools` lists follow how these connectors
appear in claude.ai sessions (`mcp__Quiver_Quant__*`). Google Finance history
and Apple Stocks have no API the agents can use.

## Trading on Liquid

The `fincept-liquid-trader` agent only reads: account mode, balances,
positions, the market, and the Fincept evidence for the order you describe.
It cannot trade. Orders go through `/fincept-trade` in the main conversation:

1. You name the order (asset, side, size, leverage, optional TP/SL).
2. The agent checks it: collateral, liquidation distance, leverage against
   Kelly, funding, and the evidence behind the strategy.
3. The command says whether the account is in PAPER or LIVE mode. On a live
   account it asks whether you want real money or paper trading.
4. Liquid prepares a proposal and Claude shows its exact terms.
5. Only after you approve that exact proposal is it sent, and the plugin hook
   asks you once more before the tool runs.

Nothing trades on a schedule, from another agent's message or from a general
"go ahead". The plugin never enables automated trading or moves funds.

## Setup

1. Clone FinceptTerminal (the branch with `quant_evidence/mcp_server.py`).
2. Point `FINCEPT_ANALYTICS_DIR` at its Analytics directory, for example in
   the `env` block of `~/.claude/settings.json`:

   ```json
   {
     "env": {
       "FINCEPT_ANALYTICS_DIR": "/path/to/FinceptTerminal/fincept-qt/scripts/Analytics"
     }
   }
   ```

3. Install the plugin from this marketplace:

   ```bash
   claude plugin marketplace add https://github.com/mn526zwwfc-sketch/ECC
   claude plugin install fincept-quant@ecc
   ```

4. Restart Claude Code. If the path is missing or wrong, the SessionStart hook
   says so at the start of the session.

Python 3.10 or newer must be on the `PATH` as `python3`.

## Usage

```text
/fincept-strategy momentum
/fincept-evaluate momentum, Sharpe 1.2 over 8 years, 50 variants tried, monthly data
/fincept-compare 25 years old, retail, Mexico, 30-year horizon
/fincept-breakeven value long-short, 60% monthly turnover
/fincept-signals NVDA
/fincept-trade long BTC 600 USD notional 2x SL 58000
/fincept-committee my momentum backtest in /tmp/backtest.csv, 40 variants tried
```

You can also ask in plain language. The agents pick the right tools, and every
figure they quote comes from the engine.

Without the MCP server, the agents fall back to the CLI:

```bash
python3 "$FINCEPT_ANALYTICS_DIR/quant_evidence_cli.py" evaluate '{"strategy_id": "momentum", "sharpe_annual": 1.2, "years": 8, "n_trials": 50}'
```

## Tests

From the ECC root, `node tests/plugins/fincept-quant.test.js` checks the
manifest, the Markdown formats and the hooks. The engine and the MCP server
are tested in FinceptTerminal:

```bash
cd fincept-qt/scripts/Analytics
python3 -m unittest discover -s quant_evidence/tests -t .
```
