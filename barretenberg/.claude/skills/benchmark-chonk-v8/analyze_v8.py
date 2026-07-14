#!/usr/bin/env python3
"""Summarize a bench_v8.sh CSV: per-HC tables of prove time per context, with deltas vs the
first context (the A/B baseline) and a coefficient-of-variation column to gauge noise.

Usage: analyze_v8.py <results.csv> [--metric prove_ms|wall_ms|peak_mb] [--md]
The first context label in the CSV is treated as the baseline for the delta column.
"""
import csv, statistics, sys
from collections import defaultdict

args = sys.argv[1:]
csv_path = args[0]
metric = "prove_ms"
md = False
i = 1
while i < len(args):
    if args[i] == "--metric": metric = args[i + 1]; i += 2
    elif args[i] == "--md": md = True; i += 1
    else: i += 1

rows = defaultdict(list)       # (ctx, hc, flow) -> [values]
ctx_order, flows, hcs = [], [], []
with open(csv_path) as f:
    for r in csv.DictReader(f):
        if r["exit"] != "0" or r.get(metric, "NA") in ("NA", ""):
            continue
        rows[(r["context"], r["hc"], r["flow"])].append(int(r[metric]))
        for seq, v in ((ctx_order, r["context"]), (flows, r["flow"]), (hcs, r["hc"])):
            if v not in seq: seq.append(v)

def med(xs): return statistics.median(xs) if xs else None
def cv(xs): return 100 * statistics.pstdev(xs) / statistics.mean(xs) if len(xs) > 1 and statistics.mean(xs) else 0.0
def short(s): return s.replace("+sponsored_fpc", "+spon").replace("+private_fpc", "+priv")
def pct(new, base): return "n/a" if not base or new is None else f"{100*(new-base)/base:+.2f}%"

base_ctx = ctx_order[0]
out = []
out.append(f"# V8/node wasm sweep — `{metric}` (median of reps; baseline = `{base_ctx}`)\n")
for hc in sorted(hcs, key=int):
    cols = "".join(f" {c} |" for c in ctx_order)
    deltas = "".join(f" Δ {c} |" for c in ctx_order[1:])
    out.append(f"## HC = {hc}\n")
    out.append(f"| flow |{cols}{deltas} {base_ctx} CV |")
    out.append("|---|" + "--:|" * (len(ctx_order) + len(ctx_order) - 1 + 1))
    totals = defaultdict(float)
    for flow in flows:
        vals = {c: med(rows[(c, hc, flow)]) for c in ctx_order}
        for c in ctx_order:
            if vals[c]: totals[c] += vals[c]
        cells = "".join(f" {vals[c]:.0f} |" if vals[c] is not None else " — |" for c in ctx_order)
        dcells = "".join(f" {pct(vals[c], vals[base_ctx])} |" for c in ctx_order[1:])
        out.append(f"| {short(flow)} |{cells}{dcells} {cv(rows[(base_ctx, hc, flow)]):.1f}% |")
    tcells = "".join(f" **{totals[c]:.0f}** |" for c in ctx_order)
    tdelta = "".join(f" **{pct(totals[c], totals[base_ctx])}** |" for c in ctx_order[1:])
    out.append(f"| **TOTAL** |{tcells}{tdelta} |")
    out.append("")

text = "\n".join(out)
print(text)
