"""TSMOM backtest on the Liquid instrument list, from yahoo_sync monthly files.

Usage: python3 -I tsmom_build.py <firm_dir>

Data sources (all produced by quant_evidence.app.yahoo_sync parse/sync):
  prices/          default run (range=max, interval=1mo)
  refetch/         range=25y interval=1mo  -> AAPL MSFT ^GSPC ^N225 ^NDX
                   (range=max came back quarterly for these five)
  refetch_daily/   range=25y interval=1d, last close per month -> all =F futures
                   (monthly bars for =F skip roughly 1 month in 7)

Rule per asset and lookback L: position for month t = sign(P[t-1] / P[t-1-L] - 1).
Portfolio: equal weight over assets with a position and a return in month t.
Cost: 10 bps charged on an asset's slice each time its position changes
(entry from flat, or a sign flip). Sensitivity: 10 bps x |delta position|
(a flip costs 20 bps) is reported separately, not used for the audit CSV.
"""
import csv
import json
import math
import os
import sys

FIRM = sys.argv[1]
SYMS = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'GC=F', 'SI=F', 'CL=F', 'BZ=F', 'NG=F', 'HG=F',
        '^GSPC', '^NDX', '^DJI', '^N225', 'EURUSD=X', 'JPY=X', 'GBPUSD=X',
        'NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMZN', 'META', 'GOOGL', 'ASML']
REFETCH = {'AAPL', 'MSFT', '^GSPC', '^N225', '^NDX'}
LOOKBACKS = [3, 6, 9, 12]
COST = 0.0010
MIN_ASSETS = 5


def doc_id(s):
    return s.replace('^', '~').replace('=', ':')


def mi(s):
    y, m = s.split('-')
    return int(y) * 12 + int(m) - 1


def ms(i):
    return f'{i // 12:04d}-{i % 12 + 1:02d}'


def load(sym):
    if sym.endswith('=F'):
        sub = 'refetch_daily'
    elif sym in REFETCH:
        sub = 'refetch'
    else:
        sub = 'prices'
    path = os.path.join(FIRM, sub, 'prices', doc_id(sym) + '.json')
    d = json.load(open(path))
    px = {mi(a): float(b) for a, b in zip(d['dates'], d['closes'])}
    ks = sorted(px)
    gaps = sum(1 for a, b in zip(ks, ks[1:]) if b - a != 1)
    return px, sub, gaps, d


prices, meta = {}, {}
for s in SYMS:
    px, sub, gaps, d = load(s)
    prices[s] = px
    meta[s] = {'source_dir': sub, 'first': ms(min(px)), 'last': ms(max(px)), 'months': len(px),
               'gaps': gaps, 'currency': d.get('currency'), 'adjusted': d.get('adjusted')}

as_of = max(max(p) for p in prices.values())


def ret(s, t):
    p = prices[s]
    if t in p and t - 1 in p:
        return p[t] / p[t - 1] - 1
    return None


def sig(s, t, L):
    """Sign of the L-month return ending at month t (known at end of t)."""
    p = prices[s]
    if t in p and t - L in p:
        r = p[t] / p[t - L] - 1
        return (r > 0) - (r < 0)
    return None


lo = min(min(p) for p in prices.values())
# Common start: first month where >= MIN_ASSETS assets have a valid position under
# the longest lookback (so all four variants share the same sample).
start = None
for t in range(lo + 1, as_of + 1):
    n = sum(1 for s in SYMS if sig(s, t - 1, max(LOOKBACKS)) is not None and ret(s, t) is not None)
    if n >= MIN_ASSETS:
        start = t
        break

rows, alt_cost, gross, nassets = {}, {L: [] for L in LOOKBACKS}, {L: [] for L in LOOKBACKS}, []
turn = {L: [] for L in LOOKBACKS}  # share of the book whose position changed (|delta|/2 per asset, weight 1/n)
prev = {L: {} for L in LOOKBACKS}
# warm prev positions so entry costs before `start` are not charged twice
for L in LOOKBACKS:
    for s in SYMS:
        prev[L][s] = sig(s, start - 2, L) if sig(s, start - 2, L) is not None else 0
for t in range(start, as_of + 1):
    row = {}
    for L in LOOKBACKS:
        tot, tot_alt, tot_g, n, tv = 0.0, 0.0, 0.0, 0, 0.0
        for s in SYMS:
            pos, r = sig(s, t - 1, L), ret(s, t)
            if pos is None or r is None:
                continue
            p0 = prev[L].get(s, 0) or 0
            c = COST if pos != p0 else 0.0
            c_alt = COST * abs(pos - p0)
            tot += pos * r - c
            tot_alt += pos * r - c_alt
            tot_g += pos * r
            tv += abs(pos - p0) / 2
            n += 1
            prev[L][s] = pos
        row[f'L{L}'] = tot / n
        alt_cost[L].append(tot_alt / n)
        gross[L].append(tot_g / n)
        turn[L].append(tv / n)
        if L == LOOKBACKS[0]:
            nassets.append(n)
    rows[ms(t)] = row

out_csv = os.path.join(FIRM, 'tsmom_returns.csv')
with open(out_csv, 'w', newline='') as f:
    w = csv.writer(f)
    w.writerow(['date'] + [f'L{L}' for L in LOOKBACKS])
    for d, r in rows.items():
        w.writerow([d] + [f'{r[f"L{L}"]:.8f}' for L in LOOKBACKS])


def sharpe(x):
    m = sum(x) / len(x)
    sd = math.sqrt(sum((v - m) ** 2 for v in x) / (len(x) - 1))
    return m / sd * math.sqrt(12)


net = {L: [rows[d][f'L{L}'] for d in rows] for L in LOOKBACKS}
side = {
    'start': ms(start), 'end': ms(as_of), 'months': len(rows),
    'assets_per_month_min': min(nassets), 'assets_per_month_max': max(nassets),
    'assets_first_month': nassets[0], 'assets_last_month': nassets[-1],
    'first_month_with_24_assets': next((d for d, n in zip(rows, nassets) if n == len(SYMS)), None),
    'sharpe_gross': {f'L{L}': round(sharpe(gross[L]), 4) for L in LOOKBACKS},
    'sharpe_net_10bps_per_change': {f'L{L}': round(sharpe(net[L]), 4) for L in LOOKBACKS},
    'sharpe_net_10bps_x_abs_delta': {f'L{L}': round(sharpe(alt_cost[L]), 4) for L in LOOKBACKS},
    'turnover_monthly_avg': {f'L{L}': round(sum(turn[L]) / len(turn[L]), 4) for L in LOOKBACKS},
    'ann_mean_net': {f'L{L}': round(12 * sum(net[L]) / len(net[L]), 5) for L in LOOKBACKS},
}

# Current signals as of the last complete month.
signals = []
for s in SYMS:
    p = prices[s]
    rec = {'yahoo': s}
    vals = []
    for L in LOOKBACKS:
        v = sig(s, as_of, L) if as_of in p else None
        rec[f'L{L}'] = v
        vals.append(v)
    pos = sum(1 for v in vals if v == 1)
    neg = sum(1 for v in vals if v == -1)
    rec['consensus'] = 1 if pos >= 3 else (-1 if neg >= 3 else 0)
    rr = [ret(s, t) for t in range(as_of - 11, as_of + 1)]
    if all(r is not None for r in rr):
        m = sum(rr) / 12
        rec['vol_12m_ann'] = round(math.sqrt(sum((r - m) ** 2 for r in rr) / 11) * math.sqrt(12), 4)
    else:
        rec['vol_12m_ann'] = None
    rec['last_price_month'] = ms(max(p))
    signals.append(rec)

json.dump({'as_of_month': ms(as_of), 'csv': out_csv, 'sample': side, 'signals': signals, 'data_meta': meta},
          open(os.path.join(FIRM, 'tsmom_build_out.json'), 'w'), indent=1)
print(json.dumps({'as_of': ms(as_of), 'sample': side}, indent=1))
