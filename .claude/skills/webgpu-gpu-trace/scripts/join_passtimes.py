#!/usr/bin/env python3
"""
ADRENO-ONLY fallback. Label a perfetto GPU counter trace with kernel names when the
DRIVER won't relay the app's debug labels (e.g. Adreno/Qualcomm). The ground truth of
"which kernel ran when" is owned by the app: its WebGPU timestamp queries (passTimes)
give [kernel, gpu_start, gpu_end] per pass. This joins those to the perfetto counters.

DO NOT USE ON MALI (or any device where label_trace.py renamed slices): Mali coalesces
pass-BEGINS (every pass in a submit shares one begin timestamp), so the passTimes
windows are garbage and the clock-fit is nonsense — and it can still self-report ~100%
burst-overlap by aliasing periodic per-rep bursts, so the bogus result looks valid. If
label_trace.py found labels, use kernel_counters.py instead — you do not need passTimes.

The app's timestamp clock and perfetto's clock are the SAME GPU but different
epochs, so we fit ONE offset (delta) by aligning the per-rep compute bursts, and
VALIDATE it: "% Time Compute" must be high inside the labeled windows and low in
the gaps. No guessing — the validation proves the alignment.

Usage: python3 join_passtimes.py TRACE.perfetto PASSTIMES.json [COMPUTE_COUNTER_NAME]
  PASSTIMES.json: the bench results row, with results.samples[].passTimes = [[kernel,beginNs,endNs],...]
  COMPUTE_COUNTER_NAME: the activity counter used to fit delta (default '% Time Compute').
Requires: pip install perfetto ; and a local `trace_processor` binary next to this script
          (or on PATH) for the counter dump.
"""
import json, sys, bisect, csv, subprocess, os
from collections import defaultdict

def dump_counter(tp, trace, where):
    out = subprocess.run([tp, trace, '-q', '/dev/stdin'], input=where,
                         capture_output=True, text=True).stdout
    rows = list(csv.reader(out.splitlines()))
    return rows[1:] if rows else []

def main():
    trace, ptjson = sys.argv[1], sys.argv[2]
    compute_ctr = sys.argv[3] if len(sys.argv) > 3 else '% Time Compute'
    here = os.path.dirname(os.path.abspath(__file__))
    tp = next((p for p in [os.path.join(here,'trace_processor'),'trace_processor'] ), 'trace_processor')

    # app windows (GPU-ts clock)
    r = json.load(open(ptjson))
    wins = []
    for s in r['results']['samples']:
        for k,b,e in s.get('passTimes',[]):
            b,e=int(b),int(e)
            if b>0 and e>b: wins.append((b,e,k))
    wins.sort()

    # per-rep bursts of the app timeline (merge windows with <30ms gaps)
    def bursts(ws, gap):
        out=[]
        for b,e,*_ in ws:
            if out and b-out[-1][1]<=gap: out[-1][1]=max(out[-1][1],e)
            else: out.append([b,e])
        return [x for x in out if x[1]-x[0]>2_000_000]
    pw = bursts(wins, 30_000_000)

    # counter-active bursts (perfetto BOOTTIME) from the compute counter
    crows = dump_counter(tp, trace, f"SELECT c.ts,c.value FROM counter c JOIN track t ON c.track_id=t.id WHERE t.name='{compute_ctr}' ORDER BY c.ts")
    active=[int(ts) for ts,v in crows if float(v)>30]
    cb=[]
    for ts in active:
        if cb and ts-cb[-1][1]<=5_000_000: cb[-1][1]=ts
        else: cb.append([ts,ts])
    cb=[x for x in cb if x[1]-x[0]>2_000_000]
    print(f"app bursts={len(pw)}  counter-active bursts={len(cb)}")

    # fit delta: shift app bursts to maximize overlap with counter bursts
    def overlap(d):
        tot=0
        for s,e in pw:
            s+=d; e+=d
            for cs,ce in cb:
                o=min(e,ce)-max(s,cs)
                if o>0: tot+=o
        return tot
    cands={cs-ps for cs,_ in cb for ps,_ in pw}
    delta=max(cands,key=overlap)
    for d in range(delta-2_000_000,delta+2_000_001,100_000):
        if overlap(d)>overlap(delta): delta=d
    ptot=sum(e-s for s,e in pw)
    print(f"delta={delta} ns ({delta/1e6:.1f} ms)  burst-overlap={overlap(delta)/ptot*100:.0f}%  (want ~100%)")

    # join counters -> kernels with delta applied
    swins=sorted((b+delta,e+delta,k) for b,e,k in wins); begins=[w[0] for w in swins]
    lo,hi=swins[0][0],max(w[1] for w in swins)
    allrows=dump_counter(tp, trace, f"SELECT c.ts,t.name,c.value FROM counter c JOIN track t ON c.track_id=t.id WHERE c.ts BETWEEN {lo} AND {hi}")
    agg=defaultdict(lambda:defaultdict(lambda:[0.0,0])); gap=defaultdict(lambda:[0.0,0])
    for ts,nm,v in allrows:
        ts=int(ts); v=float(v)
        i=bisect.bisect_right(begins,ts)-1; ker=None
        for j in range(max(0,i-1),min(len(swins),i+2)):
            if swins[j][0]<=ts<=swins[j][1]: ker=swins[j][2]; break
        d=agg[ker][nm] if ker else gap[nm]; d[0]+=v; d[1]+=1
    ktime=defaultdict(float)
    for b,e,k in wins: ktime[k]+=e-b
    tot=sum(ktime.values())
    ctrs=sorted({nm for _,nm,_ in allrows})
    print(f"\n{'kernel':16}{'gpu_ms':>8}{'%':>5} | "+" ".join(f"{c[:10]:>10}" for c in ctrs))
    for k in sorted(ktime,key=ktime.get,reverse=True):
        if ktime[k]/tot<0.008: continue
        print(f"{k:16}{ktime[k]/1e6:>8.1f}{100*ktime[k]/tot:>4.0f}% | "+" ".join(f"{(agg[k][c][0]/agg[k][c][1] if agg[k][c][1] else 0):>10.0f}" for c in ctrs))
    gc=gap[compute_ctr]; ka=sum(agg[k][compute_ctr][0] for k in ktime)/max(1,sum(agg[k][compute_ctr][1] for k in ktime))
    print(f"\nVALIDATION '{compute_ctr}': in kernels={ka:.0f}% (want HIGH)  in gaps={(gc[0]/gc[1] if gc[1] else 0):.0f}% (want LOW)")

if __name__=='__main__': main()
