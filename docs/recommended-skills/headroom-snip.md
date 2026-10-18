# headroom-snip (plugin)

Headroom snip plugin source (hooks + types). Tests, `.gitignore` and `tsconfig.json` omitted.

- **Source:** `headroom/plugins/headroom-snip/` (Apache-2.0, see upstream LICENSE)
- **Files:** 6

## `.claude-plugin/plugin.json`

```json
{
  "name": "headroom-snip",
  "version": "0.40.0",
  "description": "Watch Headroom snip tokens off every Claude Code request: an animated band, a /headroom log and a running total.",
  "author": {
    "name": "Headroom Contributors",
    "url": "https://github.com/headroomlabs-ai/headroom"
  },
  "homepage": "https://github.com/headroomlabs-ai/headroom",
  "repository": "https://github.com/headroomlabs-ai/headroom",
  "keywords": [
    "headroom",
    "claude-code",
    "tokens",
    "compression",
    "mod"
  ],
  "types": "./types/index.d.ts"
}
```

## `README.md`

````markdown
# headroom-snip

A Claude Code mod that shows what Headroom does to each request, live. When a
request goes through the proxy, a pair of scissors runs along a bar the size of
the original prompt, cuts it down to what was actually sent, and the token
count drops as it goes:

```
✂ headroom 21k → 16k   tok ━━━━━━━━━━━━━━━━━━━━━━━✂⡀⠄⠂⠁⢀⠈⠐⠠ −81%
✂ headroom 21k → 7.6k  tok ━━━━━━━━━━━✂⠈⠐⠠⡀⠄⠂⠁⢀⠈⠐⠠⡀⠄⠂······ −81%
✂ headroom 21k → 4.1k  tok ━━━━━━·························· −81%
  JSON crush ×2 · Kompress text · cache align   project 184k saved (62%) over 23 req ≈ 307 pages  details  hide
```

## What it shows

- **The band above the prompt.** The latest request: original → sent tokens,
  the snip animation, and the percentage cut. Below that, which compressors did
  the cutting (`JSON crush`, `code AST`, `Kompress text`, `log squash`,
  `cache align`, ...) and the running total since the session started. A request sent unchanged says why,
  for example `kept: user message, recent code` or `nothing worth a snip`.
- **`/headroom`.** Opens a pane with the requests since the session started: one bar per
  request, what was cut and what was protected, how long compression took, the
  biggest snip so far, and an all-time total.
  `/headroom hide` and `/headroom show` toggle the band.
- **The status line.** `✂ 184k tok saved · 62%`.
- **Milestone toasts** at 10k, 50k, 100k, 250k, 500k, 1M and 5M tokens saved.
- **No proxy?** If nothing answers, the band says so and suggests
  `headroom wrap claude`.

## How it works

While a turn runs, the mod polls the proxy's loopback `GET /stats?cached=1`
once a second. It reads the `recent_requests` tail (per-request token counts
and `transforms_applied`), and keeps polling for a few seconds after the turn
ends. Requests stamped before the session started count as history: they
aren't animated or added to the totals, even if the proxy only comes up later.
Nothing leaves your machine.

The proxy can't tell Claude Code sessions apart, so the totals are never
per session. What they cover depends on how Claude Code reaches the proxy:

- **Through `headroom wrap claude`:** each request carries an
  `X-Headroom-Project` header naming the launch directory (its basename, so
  two directories with the same name share a tag). The mod counts every
  request with this session's tag, including other sessions in the same
  project, and leaves other projects out. The proxy only reports tags for its
  last ten requests, so a request it can't attribute is left out rather than
  guessed. The band says "project" and `/headroom` names the project.
- **Any other way:** there is no tag, so the totals cover every client on the
  proxy since this session started. The band says "proxy" and `/headroom` says
  so.

It finds the proxy in this order:

1. `HEADROOM_PROXY_URL`
2. `ANTHROPIC_BASE_URL` (as `headroom wrap claude` sets it)
3. `http://127.0.0.1:8787`

Only loopback URLs are used: `http` or `https` on exactly `localhost`, `127.0.0.1`
or `[::1]`, with no user or password. A value that isn't one (a remote proxy, or a
host like `localhost.example.com`) is skipped, so the mod never polls a remote host.

## Install

```bash
claude plugin marketplace add headroomlabs-ai/headroom
claude plugin install headroom-snip@headroom-marketplace
```

Or, from a checkout: `claude --plugin-dir plugins/headroom-snip`.

## Develop

```bash
claude plugin validate plugins/headroom-snip
claude plugin test plugins/headroom-snip      # tests/snip.test.tsx
tsc -p plugins/headroom-snip                  # after Claude Code has loaded it once
```

`hooks/snip.ts` holds the pure parts (parsing, transform labels, the animation
frames) and `hooks/register.tsx` holds the hooks and drawing.
````

## `hooks/hooks.json`

```json
{ "modules": ["./register.tsx"] }
```

## `hooks/register.tsx`

```tsx
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Anim, Proxy, Snip, Totals } from '../types'
import {
  FRAMES,
  FRAME_MS,
  addToTotals,
  bar,
  counter,
  crossed,
  explain,
  fmt,
  isOwn,
  ownProject,
  pages,
  parseRecent,
  proxyUrl,
} from './snip'
import type { Tone } from './snip'

const PANE = 'headroom-snip'
const POLL_MS = 1000
const TAIL_TICKS = 4

const feed = atom({ plugin: 'headroom-snip', key: 'feed' } as const, [])
const totals = atom({ plugin: 'headroom-snip', key: 'totals' } as const, {
  original: 0,
  optimized: 0,
  saved: 0,
  requests: 0,
  biggest: null,
})
const anim = atom({ plugin: 'headroom-snip', key: 'anim' } as const, null)
const proxy = atom({ plugin: 'headroom-snip', key: 'proxy' } as const, { url: '', isUp: null, project: null })
// When this session started, in $.clock time; requests stamped earlier are history. Kept across reloads.
const startedAt = atom({ plugin: 'headroom-snip', key: 'startedAt' } as const, null)
const isHidden = atom({ plugin: 'headroom-snip', key: 'isHidden' } as const, false)

const TONE: Record<Tone, { color?: string; dimColor?: boolean; bold?: boolean }> = {
  kept: { color: '#4ade80' },
  doomed: { color: '#f59e0b' },
  blade: { color: '#f472b6', bold: true },
  crumb: { color: '#a8a29e' },
  gone: { dimColor: true },
}

const pct = (t: Pick<Totals, 'saved' | 'original'>) =>
  t.original > 0 ? Math.round((t.saved / t.original) * 100) : 0

// The proxy tags requests by project (the launch directory's name), not by session, so the totals are
// the project's traffic since this session started, or the whole proxy's when there is no tag.
const scope = (project: string | null) => (project ? 'project' : 'proxy')

// The module's own bookkeeping; a reload starts it over while $.state keeps the drawing's values.
const live = {
  seen: new Set<string>(),
  url: proxyUrl(),
  project: null as string | null,
  poller: undefined as Timer | undefined,
  animTimer: undefined as Timer | undefined,
  tail: 0,
  // Set once a poll has succeeded: a request with no usable timestamp counts only if it shows up after that.
  isBaselined: false,
  isPolling: false,
}

async function setProxy($: EngineInterface, next: Proxy) {
  const now = await read($, proxy)
  if (now.isUp !== next.isUp || now.url !== next.url || now.project !== next.project) {
    await update($, proxy, () => next)
  }
}

async function snipAnimation($: EngineInterface, id: string) {
  live.animTimer?.cancel()
  let frame = 0
  await update($, anim, (): Anim => ({ id, frame }))
  live.animTimer = $.clock.every(FRAME_MS, () => {
    frame += 1
    if (frame >= FRAMES) live.animTimer?.cancel()
    void update($, anim, (): Anim => ({ id, frame }))
  })
}

async function land($: EngineInterface, fresh: Snip[]) {
  const before = (await read($, totals)).saved
  await update($, feed, list => [...list, ...fresh].slice(-50))
  const after = await update($, totals, t => addToTotals(t, fresh))
  $.ui.status(`✂ ${fmt(after.saved)} tok saved · ${pct(after)}%`)

  const where = live.project
    ? `in ${live.project} since this session started`
    : 'on this proxy since this session started'
  for (const milestone of crossed(before, after.saved)) {
    $.ui.toast(`✂ ${fmt(milestone)} tokens snipped ${where}: ${pages(milestone)} Claude didn't have to reread`)
  }

  const added = fresh.reduce((n, s) => n + s.saved, 0)
  const lifetime = Number((await $.store.get('lifetimeSaved')) ?? 0)
  await $.store.set('lifetimeSaved', lifetime + added)

  const showcase = [...fresh].reverse().find(s => s.saved > 0) ?? fresh[fresh.length - 1]
  if (showcase && showcase.saved > 0) await snipAnimation($, showcase.id)
}

async function poll($: EngineInterface) {
  if (live.isPolling) return
  live.isPolling = true
  try {
    const res = await $.http.fetch(`${live.url}/stats?cached=1`)
    if (!res.ok) {
      await setProxy($, { url: live.url, isUp: false, project: live.project })
      return
    }
    await setProxy($, { url: live.url, isUp: true, project: live.project })
    for (const s of await read($, feed)) live.seen.add(s.id)
    const since = (await read($, startedAt)) ?? 0
    const unseen = parseRecent(res.text).filter(s => !live.seen.has(s.id))
    unseen.forEach(s => live.seen.add(s.id))
    // A request stamped before the session started is history, however late the first poll lands.
    const fresh = unseen.filter(s => isOwn(s, since, live.project) ?? live.isBaselined)
    live.isBaselined = true
    if (fresh.length > 0) await land($, fresh)
  } catch {
    await setProxy($, { url: live.url, isUp: false, project: live.project })
  } finally {
    live.isPolling = false
  }
}

function keepPolling($: EngineInterface) {
  live.tail = Number.POSITIVE_INFINITY
  live.poller ??= $.clock.every(POLL_MS, () => {
    live.tail -= 1
    if (live.tail <= 0) {
      live.poller?.cancel()
      live.poller = undefined
    }
    void poll($)
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    live.url = proxyUrl(await $.env.get('HEADROOM_PROXY_URL'), await $.env.get('ANTHROPIC_BASE_URL'))
    live.project = ownProject(await $.env.get('ANTHROPIC_CUSTOM_HEADERS'))
    const now = await $.clock.now()
    await update($, startedAt, at => at ?? now)
    await $.command.register({
      name: 'headroom',
      description: 'Show what Headroom snipped from each request (add "hide" or "show" for the band)',
    })
    void poll($)

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    keepPolling($)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    live.tail = TAIL_TICKS
    void poll($)

    return next(e)
  })

  on('command.run', { command: 'headroom' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'hide' || arg === 'show') {
      await update($, isHidden, () => arg === 'hide')
      return { text: `Headroom snip band ${arg === 'hide' ? 'hidden' : 'shown'}.` }
    }
    await poll($)
    await $.ui.open({ id: PANE, title: '✂ Headroom' })

    return { text: 'Opened the Headroom snip log.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const [list, sum, now, px, hidden] = await Promise.all([
      read($, feed),
      read($, totals),
      read($, anim),
      read($, proxy),
      read($, isHidden),
    ])
    if (e.props.hasSurvey || hidden) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const columns = e.props.bodyColumns ?? e.viewport?.columns ?? 80
    const hide = <Button key="hide" label="hide" plain onPress={() => update($, isHidden, () => true)} />

    if (px.isUp === false) {
      return (
        <Box>
          <Text color="#f472b6">✂ </Text>
          <Text dimColor wrap="truncate-end">
            headroom isn't in the loop: nothing at {px.url}. Run `headroom wrap claude` to start snipping.{' '}
          </Text>
          {hide}
        </Box>
      )
    }

    const last = list[list.length - 1]
    if (!last) return next(e)

    const frame = now && now.id === last.id ? now.frame : FRAMES
    const width = Math.max(10, Math.min(40, columns - 46))
    const { cuts, kept } = explain(last.transforms)
    const isPassThrough = last.saved <= 0

    return (
      <Box flexDirection="column">
        <Box>
          <Text color="#f472b6" bold>
            ✂ headroom{' '}
          </Text>
          {isPassThrough ? (
            <Text dimColor wrap="truncate-end">
              {fmt(last.original)} tok sent as-is ({kept.length > 0 ? `kept: ${kept.join(', ')}` : 'nothing worth a snip'})
            </Text>
          ) : (
            <Box>
              <Text>
                {fmt(last.original)} → <Text bold>{fmt(counter(last.original, last.optimized, frame))}</Text> tok{' '}
              </Text>
              {bar(width, last.original, last.optimized, frame).map((seg, i) => (
                <Text key={`b${i}`} {...TONE[seg.tone]}>
                  {seg.text}
                </Text>
              ))}
              <Text color="#4ade80" bold>
                {' '}
                −{Math.round(last.percent)}%
              </Text>
            </Box>
          )}
        </Box>
        <Box>
          <Text dimColor wrap="truncate-end">
            {'  '}
            {cuts.length > 0 ? `${cuts.slice(0, 3).join(' · ')}   ` : ''}{scope(px.project)} {fmt(sum.saved)} saved ({pct(sum)}%) over{' '}
            {sum.requests} req ≈ {pages(sum.saved)}{' '}
          </Text>
          <Button key="details" label="details" plain onPress={() => $.ui.open({ id: PANE, title: '✂ Headroom' })} />
          <Text dimColor> </Text>
          {hide}
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const [list, sum, px, hidden] = await Promise.all([read($, feed), read($, totals), read($, proxy), read($, isHidden)])
    const lifetime = Number((await $.store.get('lifetimeSaved')) ?? 0)
    const { Box, Button, Text } = $.ui.resolve(e)
    const columns = e.props.bodyColumns ?? e.viewport?.columns ?? 60
    const room = Math.max(1, Math.floor(((e.viewport?.rows ?? 24) - 9) / 2))
    const width = Math.max(8, Math.min(24, columns - 34))

    return (
      <Box flexDirection="column">
        <Text>
          <Text color="#f472b6" bold>
            ✂ {fmt(sum.saved)}
          </Text>{' '}
          tokens snipped {px.project ? `in ${px.project}` : 'on this proxy'} since this session started ({pct(sum)}% of {fmt(sum.original)}) over{' '}
          {sum.requests} requests
        </Text>
        <Text dimColor>
          ≈ {pages(sum.saved)} Claude didn't have to reread · {fmt(lifetime)} all-time
        </Text>
        {sum.biggest && (
          <Text dimColor wrap="truncate-end">
            biggest snip: {fmt(sum.biggest.saved)} tok (−{Math.round(sum.biggest.percent)}%)
            {explain(sum.biggest.transforms).cuts.length > 0 ? ` by ${explain(sum.biggest.transforms).cuts.join(', ')}` : ''}
          </Text>
        )}
        <Text dimColor>{px.isUp === false ? `proxy unreachable at ${px.url}` : `proxy ${px.url}`}</Text>
        <Text dimColor wrap="truncate-end">
          {px.project
            ? `counting every request tagged ${px.project}, other sessions in that project included`
            : 'counting every client on this proxy (`headroom wrap claude` tags requests by project)'}
        </Text>
        <Text> </Text>
        {list.length === 0 && <Text dimColor>No requests through Headroom yet. Send a prompt.</Text>}
        {list
          .slice(-room)
          .reverse()
          .map(s => {
            const { cuts, kept } = explain(s.transforms)
            return (
              <Box key={s.id} flexDirection="column">
                <Box>
                  <Text dimColor>{(s.at.split('T')[1] ?? s.at).slice(0, 8).padEnd(9)}</Text>
                  {bar(width, s.original, s.optimized, FRAMES).map((seg, i) => (
                    <Text key={`b${i}`} {...TONE[seg.tone]}>
                      {seg.text}
                    </Text>
                  ))}
                  <Text>
                    {' '}
                    {fmt(s.original)}→{fmt(s.optimized)}
                  </Text>
                  <Text color={s.saved > 0 ? '#4ade80' : undefined} dimColor={s.saved <= 0}>
                    {' '}
                    −{Math.round(s.percent)}%
                  </Text>
                </Box>
                <Text dimColor wrap="truncate-end">
                  {'         '}
                  {cuts.length > 0 ? cuts.join(' · ') : 'sent as-is'}
                  {kept.length > 0 ? `  (kept: ${kept.join(', ')})` : ''}
                  {s.latencyMs !== null ? `  ${Math.round(s.latencyMs)}ms` : ''}
                </Text>
              </Box>
            )
          })}
        <Text> </Text>
        <Box>
          <Button
            key="band"
            label={hidden ? 'show band' : 'hide band'}
            onPress={() => update($, isHidden, h => !h)}
          />
        </Box>
      </Box>
    )
  })
}
```

## `hooks/snip.ts`

```ts
import type { Snip, Totals } from '../types'

export const FRAMES = 24
export const FRAME_MS = 45
export const TOKENS_PER_PAGE = 600
export const MILESTONES = [10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 5_000_000]

const DEFAULT_PROXY = 'http://127.0.0.1:8787'
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** The origin of `raw` when it is an http(s) URL on a loopback host with no userinfo, else undefined. */
export function loopbackOrigin(raw?: string): string | undefined {
  if (!raw) return undefined
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return undefined
  }
  const isHttp = url.protocol === 'http:' || url.protocol === 'https:'
  if (!isHttp || url.username || url.password || !LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
    return undefined
  }

  return url.origin
}

/**
 * Where the Headroom proxy listens: the override, then the wrapped base URL, then the default port.
 * Each candidate must be a loopback URL; one that is not is skipped, so the mod never polls a remote host.
 */
export function proxyUrl(override?: string, baseUrl?: string): string {
  return loopbackOrigin(override) ?? loopbackOrigin(baseUrl) ?? DEFAULT_PROXY
}

type RawRequest = {
  request_id?: string | null
  timestamp?: string | null
  model?: string | null
  input_tokens_original?: number | null
  input_tokens_optimized?: number | null
  tokens_saved?: number | null
  savings_percent?: number | null
  transforms_applied?: string[] | null
  optimization_latency_ms?: number | null
}

type RawLog = { request_id?: string | null; tags?: Record<string, unknown> | null }

/** Request id → the proxy's project tag, from the raw `request_logs` tail a loopback `/stats` carries. */
function projectsById(logs: unknown): Map<string, string | null> {
  const byId = new Map<string, string | null>()
  if (!Array.isArray(logs)) return byId
  for (const log of logs as RawLog[]) {
    if (!log?.request_id) continue
    const project = log.tags?.project
    byId.set(String(log.request_id), typeof project === 'string' && project.trim() ? project.trim() : null)
  }

  return byId
}

/** The per-request rows of a loopback `/stats` payload, oldest first. */
export function parseRecent(text: string): Snip[] {
  let body: { recent_requests?: RawRequest[]; request_logs?: unknown }
  try {
    body = JSON.parse(text)
  } catch {
    return []
  }
  // The proxy lists recent_requests newest first.
  const rows = Array.isArray(body?.recent_requests) ? [...body.recent_requests].reverse() : []
  const projects = projectsById(body?.request_logs)

  return rows.flatMap(row => {
    const original = row.input_tokens_original
    const optimized = row.input_tokens_optimized
    if (typeof original !== 'number' || typeof optimized !== 'number' || !row.request_id) {
      return []
    }
    const saved = Math.max(0, row.tokens_saved ?? original - optimized)
    const percent = original > 0 ? (saved / original) * 100 : 0

    return [
      {
        id: String(row.request_id),
        at: row.timestamp ?? '',
        model: row.model ?? '',
        original,
        optimized,
        saved,
        percent,
        transforms: Array.isArray(row.transforms_applied) ? row.transforms_applied : [],
        latencyMs: typeof row.optimization_latency_ms === 'number' ? row.optimization_latency_ms : null,
        ...(projects.has(String(row.request_id)) ? { project: projects.get(String(row.request_id)) ?? null } : {}),
      },
    ]
  })
}

type Kind = 'cut' | 'kept'

function describe(transform: string): { kind: Kind; label: string } | null {
  const t = transform.toLowerCase()
  if (t.startsWith('router:protected:')) {
    return { kind: 'kept', label: t.slice('router:protected:'.length).replace(/_/g, ' ') }
  }
  if (t.startsWith('router:excluded')) return { kind: 'kept', label: 'excluded tool' }
  if (t.startsWith('netcost:skip')) return { kind: 'kept', label: 'not worth a cut' }
  if (t.startsWith('router:netcost')) return null
  if (t.startsWith('smart:') || t.includes('smart_crush') || t.includes('json')) return { kind: 'cut', label: 'JSON crush' }
  if (t.startsWith('kompress') || t.includes('kompress')) return { kind: 'cut', label: 'Kompress text' }
  if (t.includes('cache_breakpoint') || t.includes('cache_align') || t.includes('dynamic_elements')) {
    return { kind: 'cut', label: 'cache align' }
  }
  if (t.startsWith('read_maturation')) return { kind: 'cut', label: 'stale reads' }
  if (t.includes('whitespace')) return { kind: 'cut', label: 'whitespace' }
  if (t.includes('code')) return { kind: 'cut', label: 'code AST' }
  if (t.includes('log')) return { kind: 'cut', label: 'log squash' }
  if (t.includes('search') || t.includes('grep')) return { kind: 'cut', label: 'search trim' }
  if (t.includes('diff')) return { kind: 'cut', label: 'diff trim' }
  if (t.includes('html')) return { kind: 'cut', label: 'HTML strip' }
  if (t.includes('text')) return { kind: 'cut', label: 'text trim' }
  if (t === 'processed_content_blocks') return null

  return { kind: 'cut', label: (t.split(':')[0] ?? t).replace(/_/g, ' ') }
}

/** Friendly names for what Headroom did ("JSON crush ×2") and what it left alone on purpose. */
export function explain(transforms: readonly string[]): { cuts: string[]; kept: string[] } {
  const counts = { cut: new Map<string, number>(), kept: new Map<string, number>() }
  for (const one of transforms) {
    const d = describe(one)
    if (d) counts[d.kind].set(d.label, (counts[d.kind].get(d.label) ?? 0) + 1)
  }
  const list = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, n]) => (n > 1 ? `${label} ×${n}` : label))

  return { cuts: list(counts.cut), kept: list(counts.kept) }
}

export function fmt(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`
  if (abs >= 10_000) return `${Math.round(n / 1000)}k`
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`

  return String(Math.round(n))
}

export function pages(tokens: number): string {
  const p = tokens / TOKENS_PER_PAGE
  if (p < 1) return 'less than a page'

  return `${p < 10 ? p.toFixed(1) : Math.round(p)} pages`
}

export function addToTotals(totals: Totals, snips: readonly Snip[]): Totals {
  return snips.reduce<Totals>(
    (t, s) => ({
      original: t.original + s.original,
      optimized: t.optimized + s.optimized,
      saved: t.saved + s.saved,
      requests: t.requests + 1,
      biggest: !t.biggest || s.saved > t.biggest.saved ? s : t.biggest,
    }),
    totals,
  )
}

/** Every milestone a step from `before` to `after` saved tokens crosses, lowest first. */
export function crossed(before: number, after: number): number[] {
  return MILESTONES.filter(m => before < m && after >= m)
}

/** The X-Headroom-Project this session sends, read from ANTHROPIC_CUSTOM_HEADERS as `headroom wrap claude` sets it. */
export function ownProject(customHeaders?: string): string | null {
  for (const line of (customHeaders ?? '').split(/\r?\n/)) {
    const colon = line.indexOf(':')
    if (colon < 0 || line.slice(0, colon).trim().toLowerCase() !== 'x-headroom-project') continue
    const raw = line.slice(colon + 1).trim()
    let name = raw
    try {
      name = decodeURIComponent(raw)
    } catch {
      // A value that is not percent-encoded is used as written.
    }

    return name.trim() || null
  }

  return null
}

/**
 * Whether a request belongs to this session: stamped at or after `startedAt` and, when the session
 * sends a project, tagged with exactly that project. A row whose tag is unknown (outside the proxy's
 * tagged log tail) is not counted then. Undefined when the request carries no usable timestamp.
 */
export function isOwn(snip: Snip, startedAt: number, project: string | null): boolean | undefined {
  if (project !== null && snip.project !== project) return false
  const at = Date.parse(snip.at)
  if (!Number.isFinite(at)) return undefined

  return at >= startedAt
}

export type Tone = 'kept' | 'doomed' | 'blade' | 'crumb' | 'gone'
export type Segment = { tone: Tone; text: string }

const CRUMBS = ['⠁', '⠂', '⠄', '⡀', '⠠', '⠐', '⠈', '⢀']

const ease = (x: number) => 1 - Math.pow(1 - x, 3)

/**
 * One frame of the snip: the bar is the request as it arrived, `width` cells;
 * the blade travels from the right end to where the kept part ends, the cut
 * part crumbles behind it, and at `frame >= FRAMES` only dust is left.
 */
export function bar(width: number, original: number, optimized: number, frame: number): Segment[] {
  const w = Math.max(4, Math.floor(width))
  const ratio = original > 0 ? Math.min(1, Math.max(0, optimized / original)) : 1
  const kept = Math.max(original > 0 && optimized > 0 ? 1 : 0, Math.round(w * ratio))
  const p = ease(Math.min(1, Math.max(0, frame / FRAMES)))
  const done = frame >= FRAMES
  const blade = done ? -1 : Math.min(w - 1, Math.round(w - (w - kept) * p))
  const cells: Segment[] = []

  for (let i = 0; i < w; i++) {
    if (i < kept) cells.push({ tone: 'kept', text: '━' })
    else if (done) cells.push({ tone: 'gone', text: '·' })
    else if (i < blade) cells.push({ tone: 'doomed', text: '━' })
    else if (i === blade) cells.push({ tone: 'blade', text: '✂' })
    else {
      const fallen = frame - Math.round(((w - i) / Math.max(1, w - kept)) * FRAMES * 0.6)
      cells.push(fallen > 6 ? { tone: 'gone', text: '·' } : { tone: 'crumb', text: CRUMBS[(i * 7 + frame) % CRUMBS.length] ?? '·' })
    }
  }

  return cells.reduce<Segment[]>((runs, c) => {
    const last = runs[runs.length - 1]
    if (last && last.tone === c.tone) last.text += c.text
    else runs.push({ ...c })

    return runs
  }, [])
}

/** The token count shown while the blade travels: from the original down to what was sent. */
export function counter(original: number, optimized: number, frame: number): number {
  const p = ease(Math.min(1, Math.max(0, frame / FRAMES)))

  return Math.round(original - (original - optimized) * p)
}
```

## `types/index.d.ts`

```ts
export type Snip = {
  id: string
  at: string
  model: string
  original: number
  optimized: number
  saved: number
  percent: number
  transforms: string[]
  latencyMs: number | null
  /** The proxy's project tag for the request: a name, null when logged without one, absent when unknown. */
  project?: string | null
}

export type Totals = {
  original: number
  optimized: number
  saved: number
  requests: number
  biggest: Snip | null
}

export type Anim = { id: string; frame: number }

/** `project` is the X-Headroom-Project this session sends; null means the counts are proxy-wide. */
export type Proxy = { url: string; isUp: boolean | null; project: string | null }

declare module 'claude-code' {
  interface PluginState {
    'headroom-snip': {
      feed: Snip[]
      totals: Totals
      anim: Anim | null
      proxy: Proxy
      isHidden: boolean
      startedAt: number | null
    }
  }
}
```
