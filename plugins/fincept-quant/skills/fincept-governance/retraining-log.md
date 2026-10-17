# Retraining log (bitácora de reentrenamiento)

Every error by an agent or by the main conversation, recorded the same day.
Each entry names the evidence, the root cause, the change made and the
casebook case that now tests it. Newest first. Times in CDMX (UTC-6).

## Entry template

```text
### YYYY-MM-DD - <short title>
- Agent: <name or "main conversation">
- What happened: <facts>
- Evidence: <tool and fields>
- Root cause: <why>
- Change: <prompt / policy / SOP / hook change, with file>
- Test: <casebook case id>
- Status: open | fixed
```

### 2026-10-17 - Stale account-mode statement in prompts

- Agent: fincept-liquid-trader (prompt), fincept-investment-playbook
- What happened: during the universe scan the desk found its prompt saying "the account is LIVE" while the tools reported PAPER; it trusted the tools and flagged the contradiction.
- Evidence: `paper_trading_status` ENABLED at 06:42 UTC against the agent file line 38 and playbook section 2.
- Root cause: a dated fact about account state was written into prompts.
- Change: both files now say to check the mode on every task and never rely on a remembered value.
- Test: none yet (add a casebook case where the prompt and the tool disagree)
- Status: fixed

### 2026-10-17 - Firm session 1 (paper)

- Agent: whole firm (operations, desk, research, compliance, main conversation)
- What happened: operations opened the book with `fincept-journal.js` (closed trades net -1.238 USD); the desk read 6 markets; the mandate rule gave 5 signals and ASML none; `fincept-precheck.js` passed 4 legs and dropped SP500 at the 5-position cap; compliance approved with a concentration warning (three correlated crypto shorts) and a weekend-liquidity warning. The owner approved the basket: BTC, ETH and SOL short and Brent long, 100 USD at 1x each, TP and SL inside the orders (orders 127079, 127085, 127082, 127088, all filled at 00:12 CDMX). The owner also approved TP 4152.7 and SL 4173.1 on the GOLD short, which had been unprotected since 2026-10-11.
- Evidence: `execute_orders_batch` all_executed; `view_open_orders` shows 100% TP/SL coverage on all 5 positions.
- Root cause and change, stale quotes: the approval arrived about 97 minutes after the market read, so TP/SL distances were measured from older prices (BTC entry 81549 against a ticket mark of 81495; its stop ended 0.42% away instead of 0.48%). New rule `ticket.max_quote_age_minutes = 15` in the risk policy, checked by `fincept-precheck.js` and the firm-cycle SOP.
- Root cause and change, journal code: operations found that the totals left out open-position entry fees, counted a flat trade as a loser, had no gross total and summed fees in any token. All four fixed in `scripts/fincept-journal.js`.
- Test: precheck test (stale quote), journal test
- Status: fixed; the session's trades are still open and will be reconciled when they exit

### 2026-10-16 - Training round 1 results

- Agent: fincept-data-analyst, fincept-compliance-officer, fincept-liquid-trader, fincept-client-communicator, fincept-signals-analyst
- What happened: 22 answers on 13 cases, run offline with the expected answers hidden. First grading: 20 passed, 2 failed (C1 for the data analyst and the compliance officer). After the fixes below: 22 of 22 passed. Phase 1: data analyst 4/4, compliance 2/2. Phase 3: compliance 7/7, liquid trader 5/5, data analyst 1/1, signals 1/1. Phase 2: communicator 2/2 on the grader's pre-filter; the blind audit by the user is pending.
- Evidence: graded answers in the session scratchpad (`round1.json`, `graded1.json`, `round1b.json`, `graded1b.json`).
- Root cause and change, C1: a grader defect, not an agent error. Both agents wrote "no lleva TP ni SL" and "no tiene take-profit ni stop-loss", which the phrase check did not accept. The accepted phrasings were widened in `casebook/cases.json`; the agents' prompts did not change.
- Root cause and change, intake: the communicator reported that its five intake questions never ask the age band the engine profile needs. A sixth question was added to `agents/fincept-client-communicator.md` and `sops/communication.md`, and P2 now checks for it. The retest of P2 passed.
- Test: C1-gold-short-open, P2-needs-intake
- Status: fixed (phase 2 blind audit open)

### 2026-10-16 - Training round 1 set up

- Agent: all
- What happened: the governance skill, risk policy, SOPs and casebook were created and the first graded round was run.
- Evidence: results are recorded in the entries that follow this one when they exist.
- Root cause: n/a
- Change: `skills/fincept-governance/`, `scripts/fincept-grade.js`, PreToolUse cap enforcement.
- Test: all cases
- Status: fixed

### 2026-10-14 - ASML scheduled close executed 47 minutes late

- Agent: main conversation
- What happened: the 10-minute close of the paper ASML short was scheduled for 07:03; the reminder arrived at 07:19 and a session restart between the preview and the execution moved the fill to 07:49. Unrealized PnL at 07:19 was +1.12 USD; the realized net result was -1.44 USD.
- Evidence: `get_position_history` xyz:ASML, exit fill 13:49:54Z oid 121249; `get_portfolio` at 13:19Z.
- Root cause: short timed exits depended on a scheduled message in a session that can restart; no TP/SL in the order.
- Change: `timed_exit.min_minutes_for_scheduled_close = 60` in the risk policy; trade SOP step 4 requires TP/SL for shorter holds.
- Test: C3-asml-short-closed, S1-restart-mid-close
- Status: fixed

### 2026-10-14 - Evidence step skipped silently

- Agent: fincept-liquid-trader
- What happened: the ASML pre-trade check could not run the Fincept engine because `FINCEPT_ANALYTICS_DIR` was empty in the subagent's shell.
- Evidence: the agent's report ("el motor Fincept no está disponible en esta sesión").
- Root cause: the environment variable is not set in cloud sessions.
- Change: the main conversation passes the engine path explicitly when it delegates; the agent must list the missing evidence as an alert (it did).
- Test: none yet (environment issue)
- Status: open

### 2026-10-13 - Brent scheduled close executed 73 minutes late

- Agent: main conversation
- What happened: the 10-minute close planned for 08:35 executed at 09:48 after a session restart between the preview and the confirmation; the later retry found no position.
- Evidence: `get_position_history` xyz:BRENTOIL, exit fill 15:48:04Z oid 119147; `close_position` error "No open BRENTOIL position".
- Root cause: same as the ASML entry above; the reconciliation before the retry worked and prevented a second close.
- Change: trade SOP "Closes" step 4 (reconcile before any retry after a restart).
- Test: C2-brent-long-closed, S1-restart-mid-close
- Status: fixed

### 2026-10-12 - GOLD paper short left open without protection

- Agent: main conversation
- What happened: the user approved a 10-minute close, then rejected the close tool call; the short stayed open with no TP/SL for days.
- Evidence: `get_portfolio` shows xyz:GOLD-PERP short 0.0238 at 4205.6, `tp: null`, `sl: null`.
- Root cause: no rule asked what to do with a position whose planned exit was refused.
- Change: compliance post-trade monitoring flags positions held longer than planned and positions without TP/SL, and escalates to the user.
- Test: C1-gold-short-open
- Status: fixed
