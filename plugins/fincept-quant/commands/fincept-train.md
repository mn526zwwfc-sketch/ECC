---
description: Train and test the fincept subagents on the governance casebook - phase 1 strict simulation (cross-validated against real fills), phase 2 blind audit packet for the user, phase 3 stress tests - grade the answers with scripts/fincept-grade.js and record every failure in the retraining log. Uses only casebook data; never calls trading tools.
argument-hint: "[phase 1|2|3|all] [agent name]"
---

# Fincept Train

Run a graded training round for the fincept subagents.

**Input**: $ARGUMENTS (default: all phases, every agent named in the casebook)

## Workflow

1. **Load** `skills/fincept-governance/casebook/cases.json` and pick the cases for the requested phase and agent.
2. **Run** each agent on its cases, in parallel where the cases are independent. Give each agent only the case `id`, `task` and `input` (never `expected`), its own agent file, the `fincept-governance` skill and the risk policy, and ask for one JSON answer per case in the casebook answer format. Tell agents that this is an offline exercise: no Co-Invest, Quiver or other connector calls.
3. **Collect** the answers into one JSON array in the scratchpad and grade them:

   ```bash
   node "$CLAUDE_PLUGIN_ROOT/scripts/fincept-grade.js" answers.json
   ```

4. **Phase 2 (blind audit).** Strip agent names from the P-case drafts, shuffle them and show them to the user with a 1-to-5 score for clarity, accuracy and tone. A draft passes the audit only with the user's scores of 4 or more; the grader's phrase checks are a pre-filter, not the audit.
5. **Record.** For every failure append an entry to `skills/fincept-governance/retraining-log.md` (template at its top): the failed checks, the root cause, and the prompt, SOP or policy change that fixes it. Then make the change and rerun only the failed cases.
6. **Report** a table: agent, phase, cases passed, cases failed, changes made, and which agents may move to the next phase.

## Rules

- Training never touches the account: no trading, closing, mode or funds tools.
- Never show `expected` to the agent under test, and never edit a case to make an answer pass; fix the agent.
- A phase is passed only when every case of it passes; live trading stays off until phases 1 to 3 pass and the user decides.
- Close with one line: educational material, not personalized financial advice.
