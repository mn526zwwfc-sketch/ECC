# headroom-agent-hooks (plugin)

Headroom Claude Code plugin: hooks that route agent traffic through Headroom context compression. Not a skill — a hooks plugin.

- **Source:** `headroom/plugins/headroom-agent-hooks/` (Apache-2.0, see upstream LICENSE)
- **Files:** 5

## `.claude-plugin/plugin.json`

```json
{
  "name": "headroom",
  "version": "0.40.0",
  "description": "Headroom startup hooks for Claude Code and GitHub Copilot CLI.",
  "author": {
    "name": "Headroom Contributors",
    "url": "https://github.com/headroomlabs-ai/headroom"
  },
  "homepage": "https://github.com/headroomlabs-ai/headroom",
  "repository": "https://github.com/headroomlabs-ai/headroom",
  "keywords": [
    "headroom",
    "hooks",
    "claude-code",
    "copilot-cli"
  ]
}
```

## `.github/plugin/plugin.json`

```json
{
  "name": "headroom",
  "version": "0.40.0",
  "description": "Headroom startup hooks for Claude Code and GitHub Copilot CLI.",
  "author": {
    "name": "Headroom Contributors",
    "url": "https://github.com/headroomlabs-ai/headroom"
  },
  "homepage": "https://github.com/headroomlabs-ai/headroom",
  "repository": "https://github.com/headroomlabs-ai/headroom",
  "keywords": [
    "headroom",
    "hooks",
    "claude-code",
    "copilot-cli"
  ],
  "hooks": "./hooks"
}
```

## `README.md`

````markdown
# Headroom agent hooks

This plugin exposes lightweight startup hooks for Claude Code and GitHub Copilot CLI.

The hooks resolve and call:

```bash
headroom init hook ensure
```

That hidden helper checks for a matching durable `headroom init` deployment and starts it if needed.

When `CLAUDE_PLUGIN_ROOT` points to a readable launcher, resolution order is
`HEADROOM_BIN`, `headroom` on `PATH`, then `headroom` and
`headroom.exe` in `$HOME/.local/bin`, `$HOME/.local/share/uv/tools/headroom-ai/bin`,
`${PIPX_HOME:-$HOME/.local/pipx}/venvs/headroom-ai/bin`, `/opt/homebrew/bin`, and
`/usr/local/bin`. If no executable is found, `HEADROOM_PYTHON`, `python3`, and
`python` are checked for an importable `headroom` module and invoked as
`python -m headroom.cli init hook ensure`.

Set `HEADROOM_BIN` or `HEADROOM_PYTHON` to override discovery. An absent CLI emits
one actionable diagnostic and exits successfully, so the host hook remains
nonblocking. Without a readable launcher, the hook runs bare
`headroom init hook ensure` from `PATH` with none of the discovery above. Copilot
CLI on Windows uses the manifest's `powershell` entry, which does the same.
````

## `bin/headroom-hook.sh`

```bash
#!/bin/sh
set -u

if [ -n "${HEADROOM_BIN:-}" ] && [ -x "$HEADROOM_BIN" ]; then
    exec "$HEADROOM_BIN" init hook ensure
fi

if command -v headroom >/dev/null 2>&1; then
    exec headroom init hook ensure
fi

home=${HOME:-}
for prefix in \
    "$home/.local/bin" \
    "$home/.local/share/uv/tools/headroom-ai/bin" \
    "${PIPX_HOME:-$home/.local/pipx}/venvs/headroom-ai/bin" \
    "/opt/homebrew/bin" \
    "/usr/local/bin"
do
    for executable in headroom headroom.exe
    do
        candidate="$prefix/$executable"
        if [ -x "$candidate" ]; then
            exec "$candidate" init hook ensure
        fi
    done
done

try_python() {
    candidate=$1
    if command -v "$candidate" >/dev/null 2>&1; then
        candidate=$(command -v "$candidate")
    elif [ ! -x "$candidate" ]; then
        return
    fi
    if "$candidate" -c 'import headroom' >/dev/null 2>&1; then
        exec "$candidate" -m headroom.cli init hook ensure
    fi
}

try_python "${HEADROOM_PYTHON:-}"
try_python python3
try_python python

printf '%s\n' "headroom: CLI not found; install with 'uv tool install headroom-ai' or set HEADROOM_BIN; compression hooks are inactive." >&2
exit 0
```

## `hooks/hooks.json`

```json
{
  "description": "Headroom plugin hooks — ensure the local Headroom runtime is available for initialized agents.",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "sh -c '[ -n \"${CLAUDE_PLUGIN_ROOT:-}\" ] && launcher=\"${CLAUDE_PLUGIN_ROOT}/bin/headroom-hook.sh\" && [ -r \"$launcher\" ] && exec sh \"$launcher\"; exec headroom init hook ensure'",
            "powershell": "headroom init hook ensure",
            "timeout": 60
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell",
        "hooks": [
          {
            "type": "command",
            "command": "sh -c '[ -n \"${CLAUDE_PLUGIN_ROOT:-}\" ] && launcher=\"${CLAUDE_PLUGIN_ROOT}/bin/headroom-hook.sh\" && [ -r \"$launcher\" ] && exec sh \"$launcher\"; exec headroom init hook ensure'",
            "powershell": "headroom init hook ensure",
            "timeout": 60
          }
        ]
      }
    ]
  }
}
```
