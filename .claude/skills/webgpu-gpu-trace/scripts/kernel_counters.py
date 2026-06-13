#!/usr/bin/env python3
"""
Per-kernel HW-counter averages for a device WITH native render-stage labels
(Mali, and any driver whose perfetto producer relays debug-utils labels — i.e.
whenever label_trace.py renamed slices). Averages each GPU counter over the time
windows of each kernel's native-labeled render-stage slices. The driver records
the REAL per-slice GPU times, so this needs no clock-fit and no app timestamps.

USE THIS (not join_passtimes.py) whenever label_trace.py found labels.
join_passtimes.py is the ADRENO fallback for when the driver will NOT relay labels;
it relies on the app's WebGPU passTimes, whose pass-BEGINS Mali coalesces — so on
Mali those windows are garbage and join_passtimes produces nonsense (a wildly wrong
delta that can still self-report ~100% overlap by aliasing periodic bursts).

Usage: python3 kernel_counters.py LABELED.perfetto
  LABELED.perfetto: the output of label_trace.py (slices already renamed to kernels).
Requires: a `trace_processor` binary next to this script, on PATH, or in $TRACE_PROCESSOR.
"""
import sys, os, csv, shutil, subprocess
from collections import defaultdict

# Generic HW stage names (not your kernels) + Dawn/queue housekeeping slices.
SKIP = {"compute", "vertex", "fragment", "copy buffer", "fill buffer", "vkQueueSubmit"}


def find_tp():
    here = os.path.dirname(os.path.abspath(__file__))
    for cand in (os.path.join(here, "trace_processor"), os.environ.get("TRACE_PROCESSOR", ""),
                 shutil.which("trace_processor") or ""):
        if cand and os.path.exists(cand):
            return cand
    sys.exit("missing trace_processor: put the binary next to this script, on PATH, or set $TRACE_PROCESSOR "
             "(get it from https://get.perfetto.dev/trace_processor)")


def q(tp, trace, sql):
    out = subprocess.run([tp, trace, "-q", "/dev/stdin"], input=sql,
                         capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(f"trace_processor failed:\n{out.stderr[:500]}")
    return list(csv.reader(out.stdout.splitlines()))[1:]  # drop header


def main():
    if len(sys.argv) != 2:
        sys.exit("usage: python3 kernel_counters.py LABELED.perfetto")
    trace = sys.argv[1]
    tp = find_tp()

    # per-kernel GPU time (no counter join -> no fan-out double counting)
    trows = q(tp, trace, "SELECT name, count(*), sum(dur) FROM gpu_slice GROUP BY name")
    gpu_ms = {r[0]: int(r[2]) / 1e6 for r in trows if r[2]}
    cnt = {r[0]: int(r[1]) for r in trows}

    # (kernel, counter) -> avg value, averaged over counter samples inside the
    # kernel's labeled slice windows.
    rows = q(tp, trace, """
        SELECT s.name, ct.name, AVG(c.value), COUNT(DISTINCT c.ts)
        FROM gpu_slice s
        JOIN counter c ON c.ts >= s.ts AND c.ts < (s.ts + s.dur)
        JOIN counter_track ct ON ct.id = c.track_id
        GROUP BY s.name, ct.name
    """)
    vals = defaultdict(dict)
    samples = defaultdict(int)
    counters = []
    for k, ctr, avg, n in rows:
        if k in SKIP or int(n) <= 20:
            continue
        vals[k][ctr] = float(avg)
        samples[k] = max(samples[k], int(n))
        if ctr not in counters:
            counters.append(ctr)

    kernels = sorted(vals, key=lambda k: gpu_ms.get(k, 0), reverse=True)
    if not kernels:
        sys.exit("no labeled kernel slices with counters found — did you run label_trace.py first, "
                 "and does the trace have a gpu.counters source?")

    # short, stable column headers
    def short(c):
        return c.replace(" utilization", "_util").replace(" cycles", "").replace(" ", "_")[:14]

    w = max(14, max(len(k) for k in kernels) + 1)
    hdr = f"{'kernel':{w}}{'gpu_ms':>9}{'%':>4} | " + " ".join(f"{short(c):>14}" for c in counters)
    print(hdr)
    print("-" * len(hdr))
    total = sum(gpu_ms.get(k, 0) for k in kernels) or 1
    for k in kernels:
        ms = gpu_ms.get(k, 0)
        cells = " ".join(f"{int(vals[k].get(c, 0)):>14}" for c in counters)
        print(f"{k:{w}}{ms:>9.1f}{100*ms/total:>3.0f}% | {cells}")
    print(f"\n(counters averaged within each kernel's native-labeled render-stage slices; "
          f"{len(kernels)} kernels)")


if __name__ == "__main__":
    main()
