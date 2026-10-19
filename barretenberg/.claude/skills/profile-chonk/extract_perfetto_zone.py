#!/usr/bin/env python3
"""Extract multi-threading insights for a named zone from a BB_BENCH Perfetto trace.

Usage: extract_perfetto_zone.py <trace.perfetto.json> <zone_name> [--top N]
"""
import json
import sys
from collections import defaultdict


def load_events(path):
    with open(path) as f:
        data = json.load(f)
    evs = data["traceEvents"] if isinstance(data, dict) else data
    return [e for e in evs if e.get("ph") == "X" and "ts" in e and "dur" in e]


def union_coverage(intervals):
    if not intervals:
        return 0
    intervals.sort()
    total = 0
    cur_s, cur_e = intervals[0]
    for s, e in intervals[1:]:
        if s <= cur_e:
            cur_e = max(cur_e, e)
        else:
            total += cur_e - cur_s
            cur_s, cur_e = s, e
    total += cur_e - cur_s
    return total


def analyze(events, target, top_n=5):
    targets = [e for e in events if e.get("name") == target]
    if not targets:
        print(f"No events named '{target}' in trace.", file=sys.stderr)
        sys.exit(1)

    by_thread = defaultdict(list)
    for e in events:
        by_thread[(e.get("pid", 0), e.get("tid", 0))].append(e)
    for k in by_thread:
        by_thread[k].sort(key=lambda e: e["ts"])

    print(f"=== {target}: {len(targets)} invocation(s) ===\n")

    agg_wall = 0
    agg_cpu = 0
    agg_threads = set()

    for idx, win in enumerate(targets):
        ws = win["ts"]
        we = ws + win["dur"]
        wall = win["dur"]

        busy_per_tid = {}
        for (_pid, tid), thread_events in by_thread.items():
            intervals = []
            for e in thread_events:
                es, ee = e["ts"], e["ts"] + e["dur"]
                if ee <= ws or es >= we:
                    continue
                intervals.append((max(es, ws), min(ee, we)))
            if not intervals:
                continue
            busy = union_coverage(intervals)
            if busy > 0:
                busy_per_tid[tid] = busy

        threads_busy = len(busy_per_tid)
        cpu_sum = sum(busy_per_tid.values())
        util = cpu_sum / (wall * threads_busy) if threads_busy and wall else 0.0

        children_stats = defaultdict(lambda: {"cpu": 0, "count": 0, "tids": set()})
        for e in events:
            if e["ts"] < ws or e["ts"] + e["dur"] > we:
                continue
            if e.get("args", {}).get("parent") != target:
                continue
            s = children_stats[e["name"]]
            s["cpu"] += e["dur"]
            s["count"] += 1
            s["tids"].add(e.get("tid", 0))

        agg_wall += wall
        agg_cpu += cpu_sum
        agg_threads |= set(busy_per_tid.keys())

        print(
            f"[{idx:3d}] wall={wall/1000:9.2f} ms  "
            f"threads_busy={threads_busy:<3} "
            f"cpu_sum={cpu_sum/1000:10.2f} ms  util={util*100:5.1f}%"
        )
        top_tids = sorted(busy_per_tid.items(), key=lambda x: -x[1])[:8]
        tid_str = "  ".join(f"t{tid}:{b/1000:.1f}ms" for tid, b in top_tids)
        print(f"      per-thread (top 8): {tid_str}")

        if children_stats:
            top = sorted(children_stats.items(), key=lambda x: -x[1]["cpu"])[:top_n]
            print(f"      top {len(top)} direct children by CPU:")
            for name, st in top:
                print(
                    f"         {st['cpu']/1000:9.2f} ms  "
                    f"count={st['count']:<5} "
                    f"threads={len(st['tids']):<3} {name}"
                )
        print()

    if len(targets) > 1:
        n = len(agg_threads)
        util = agg_cpu / (agg_wall * n) if agg_wall and n else 0.0
        print(f"--- Aggregate over {len(targets)} invocations ---")
        print(f"  total wall : {agg_wall/1000:.2f} ms")
        print(f"  total cpu  : {agg_cpu/1000:.2f} ms")
        print(f"  threads    : {n}")
        print(f"  utilization: {util*100:.1f}% (of {n}-thread ideal)")


def main():
    args = sys.argv[1:]
    top_n = 5
    if "--top" in args:
        i = args.index("--top")
        top_n = int(args[i + 1])
        del args[i : i + 2]
    if len(args) != 2:
        print("Usage: extract_perfetto_zone.py <trace.perfetto.json> <zone> [--top N]", file=sys.stderr)
        sys.exit(2)
    events = load_events(args[0])
    analyze(events, args[1], top_n=top_n)


if __name__ == "__main__":
    main()
