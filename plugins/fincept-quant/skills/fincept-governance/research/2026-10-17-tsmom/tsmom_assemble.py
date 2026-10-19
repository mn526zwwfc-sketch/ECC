"""Assemble tsmom.json from the outputs of tsmom_build.py, series_cli.js and quant_evidence_cli.py.

Usage: python3 -I tsmom_assemble.py <firm_dir>
"""
import json
import os
import sys

F = sys.argv[1]


def j(name):
    with open(os.path.join(F, name)) as f:
        return json.load(f)


build = j('tsmom_build_out.json')
audit = j('series_audit.json')['data']
audit24 = j('series_audit_24assets.json')['data']
strategy = j('strategy.json')['data']
summaries = [j(os.path.join(d, 'summary.json')) for d in ('prices', 'refetch', 'refetch_daily')]


def audit_view(a):
    return {
        'best_variant': a['series'], 'variants': a['variants'], 'n_trials': a['evaluate_inputs']['n_trials'],
        'months': a['summary']['n'], 'years': a['summary']['years'],
        'sharpe_annual': a['summary']['sharpe_annual'], 'vol_annual': a['summary']['vol_annual'],
        'cagr': a['summary']['cagr'], 'max_drawdown': a['summary']['max_drawdown'],
        'skew': a['summary']['skew'], 'kurtosis': a['summary']['kurtosis'],
        'psr': a['psr'], 'min_track_record_years': a['min_track_record_years'],
        'bootstrap_sharpe': a['bootstrap_sharpe'], 'pbo': a.get('pbo'),
        'evaluate_inputs': a['evaluate_inputs'],
    }


def eval_view(name):
    d = j(name)['data']
    return {'inputs': d['inputs'], 'stats': d['stats'], 'cascade': d['cascade'],
            'net_monthly_bps': d['net_monthly_bps'], 'scores': d['scores'], 'caps': d['caps'],
            'verdict': d['verdict'], 'checks': [{k: c[k] for k in ('id', 'status', 'detail')} for c in d['checks']]}


out = {
    'as_of_month': build['as_of_month'],
    'rule': ('Per asset and lookback L in {3,6,9,12}: position = sign(return over past L months), held next month; '
             'equal weight across assets available that month; 10 bps charged on the asset slice per position change '
             '(entry or flip); no volatility scaling, no financing/carry; sample starts at the first month with >=5 assets '
             'under L12 so all variants share one sample.'),
    'sample': build['sample'],
    'audit': {
        'full_sample': audit_view(audit),
        'subsample_all_24_assets': audit_view(audit24),
        'columns_tested': ['L3', 'L6', 'L9', 'L12'],
    },
    'evaluate': {
        'requested': eval_view('evaluate_min.json'),
        'with_series_moments': eval_view('evaluate_full.json'),
        'with_measured_turnover_10bps': eval_view('evaluate_realcost.json'),
        'breakeven_measured_turnover_10bps': j('breakeven_realcost.json')['data'],
        'note': ('The audited series is already net of 10 bps per change. The requested run and the moments run use the '
                 'engine defaults for tsmom_futures (turnover 0.30, 40 bps round trip, 2 legs), so they charge costs a '
                 'second time; the measured-turnover run passes the L6 turnover from the backtest (0.1677) and 10 bps.'),
    },
    'strategy_evidence': {k: strategy[k] for k in ('id', 'name', 'claim', 'key_figure', 'critique', 'survives',
                                                    'evidence', 'prior', 'sources')},
    'signals': [{k: s[k] for k in ('yahoo', 'L3', 'L6', 'L9', 'L12', 'consensus', 'vol_12m_ann')}
                for s in build['signals']],
    'signal_counts': {
        'long': sum(1 for s in build['signals'] if s['consensus'] == 1),
        'short': sum(1 for s in build['signals'] if s['consensus'] == -1),
        'no_consensus': sum(1 for s in build['signals'] if s['consensus'] == 0),
    },
    'failures': [f for s in summaries for f in s['failed']],
    'data_quality': [
        'yahoo_sync default run (range=max, interval=1mo): 24/24 symbols OK, no failures.',
        'AAPL, MSFT, ^GSPC, ^N225, ^NDX came back quarterly from range=max (Yahoo downsampling); re-fetched with the '
        'same yahoo_sync parser at range=25y monthly (2001-11 onward, no gaps).',
        'All =F futures monthly bars skip about 1 month in 7 (e.g. 2024-12, 2025-06, 2026-02/03 missing); re-fetched '
        'as daily (range=25y) and reduced to the last close of each month by the yahoo_sync parser; no gaps.',
        '=F series are Yahoo front-month continuations without roll adjustment: returns include roll jumps.',
        'Equity index proxies (^GSPC, ^NDX, ^DJI, ^N225) are spot price indices, not futures: no dividends, no '
        'financing; ^N225 is in JPY. FX spot (EURUSD=X, GBPUSD=X, JPY=X = USD/JPY) ignores carry.',
        'Crypto history is short: BTC from 2014-10, ETH from 2017-11, SOL from 2020-04; all 24 assets only from '
        + str(build['sample']['first_month_with_24_assets']) + '. The first months of the sample hold only 5 '
        'equity/FX names (^DJI, ASML, JPY=X, AMZN, NVDA); futures enter from 2002-11.',
        'Single stocks (NVDA, AAPL, ...) are not in the classic TSMOM universe; Liquid trades them as perpetuals.',
    ],
    'data_meta': build['data_meta'],
    'files': {
        'csv': os.path.join(F, 'tsmom_returns.csv'),
        'csv_24_assets': os.path.join(F, 'tsmom_returns_24assets.csv'),
        'build_script': os.path.join(F, 'tsmom_build.py'),
        'assemble_script': os.path.join(F, 'tsmom_assemble.py'),
    },
}
with open(os.path.join(F, 'tsmom.json'), 'w') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print(json.dumps({'as_of': out['as_of_month'], 'counts': out['signal_counts'], 'failures': out['failures']}))
