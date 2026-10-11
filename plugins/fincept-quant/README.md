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
| Agents | `fincept-strategy-analyst` (what the evidence says, what fits a profile), `fincept-backtest-auditor` (overfitting, costs and decay in a backtest claim), `fincept-engine-developer` (changing the engine safely) |
| Skills | `quant-evidence-method`, `quant-stats-toolkit`, `fincept-engine-development` |
| Commands | `/fincept-evaluate`, `/fincept-compare`, `/fincept-breakeven`, `/fincept-strategy` |
| Hooks | SessionStart checks the engine path; PostToolUse reminds about the Python/JavaScript parity rule after engine edits |

The MCP server is part of FinceptTerminal (`quant_evidence/mcp_server.py`).
It uses only the Python standard library, so it needs no `pip install`.

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
