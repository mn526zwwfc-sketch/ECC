# Recommended Skills Bundle

Curated skills and plugins from the connected repositories (ECC, Agent-Reach, gs-quant, headroom), each exported with its full source into one Markdown file. None of these files were modified in this session; they are verbatim copies of the upstream sources.

| File | Repo | Description |
|------|------|-------------|
| [strategic-compact](strategic-compact.md) | ECC | ECC skill — category: Efficiency. |
| [context-budget](context-budget.md) | ECC | ECC skill — category: Efficiency. |
| [search-first](search-first.md) | ECC | ECC skill — category: Efficiency. |
| [verification-loop](verification-loop.md) | ECC | ECC skill — category: Efficiency. |
| [tdd-workflow](tdd-workflow.md) | ECC | ECC skill — category: Efficiency. |
| [git-workflow](git-workflow.md) | ECC | ECC skill — category: Efficiency. |
| [skill-stocktake](skill-stocktake.md) | ECC | ECC skill — category: Efficiency. |
| [python-patterns](python-patterns.md) | ECC | ECC skill — category: Stack (Python). |
| [python-testing](python-testing.md) | ECC | ECC skill — category: Stack (Python). |
| [cpp-coding-standards](cpp-coding-standards.md) | ECC | ECC skill — category: Stack (C++). |
| [cpp-testing](cpp-testing.md) | ECC | ECC skill — category: Stack (C++). |
| [llm-trading-agent-security](llm-trading-agent-security.md) | ECC | ECC skill — category: Finance / research. |
| [deep-research](deep-research.md) | ECC | ECC skill — category: Finance / research. |
| [agent-reach](agent-reach.md) | Agent-Reach | Internet/social-platform research router (Agent-Reach). Includes the Chinese `SKILL.md`, the English `SKILL_en.md` and the per-category references. |
| [gs-quant-overview](gs-quant-overview.md) | gs-quant | Quick-start skill for the `gs_quant` library. Requires Goldman Sachs API credentials to be useful. |
| [headroom-agent-hooks (plugin)](headroom-agent-hooks.md) | headroom | Headroom Claude Code plugin: hooks that route agent traffic through Headroom context compression. Not a skill — a hooks plugin. |
| [headroom-snip (plugin)](headroom-snip.md) | headroom | Headroom snip plugin source (hooks + types). Tests, `.gitignore` and `tsconfig.json` omitted. |

## Install

```bash
# ECC skills (installer also pulls their companion modules)
./install.sh --target claude --dry-run --skills strategic-compact,context-budget,search-first,verification-loop,tdd-workflow,git-workflow,skill-stocktake,python-patterns,python-testing,cpp-coding-standards,cpp-testing,llm-trading-agent-security,deep-research

# Headroom (context compression)
uv tool install --python 3.13 "headroom-ai[all]"
headroom wrap claude

# Agent-Reach (default install only checks the environment)
agent-reach install --env=auto --dry-run

# gs-quant skill (needs GS API access)
python -m gs_quant.skills install --global
```
