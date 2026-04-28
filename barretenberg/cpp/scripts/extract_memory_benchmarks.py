#!/usr/bin/env python3
"""Extracts memory profile metrics from a memory profile JSON and appends
them to the benchmark JSON file as dashboard entries.

Usage: extract_memory_benchmarks.py <output_dir> <name_path>

The output_dir must contain:
  - memory_profile.json (memory profile data from bb --memory_profile_out)
  - benchmarks.bench.json (existing benchmark results to append to)

The memory profile JSON format is documented in memory_profile.cpp.
"""
import json
import sys

if len(sys.argv) != 3:
    print(f"Usage: {sys.argv[0]} <output_dir> <name_path>", file=sys.stderr)
    sys.exit(1)

output_dir = sys.argv[1]
name_path = sys.argv[2]

try:
    with open(f"{output_dir}/memory_profile.json", "r") as f:
        data = json.load(f)

    entries = []

    # RSS timeline: each checkpoint becomes a line on the per-commit dashboard chart
    # Stage ordering: prefix with sequence number so alphabetical sort = execution order
    STAGE_ORDER = {
        "after_alloc": "0_alloc",
        "after_trace": "1_trace",
        "after_oink": "2_oink",
        "after_sumcheck": "3_sumcheck",
        "after_accumulate": "4_accumulate",
    }
    # JSON is a flat array of checkpoints (msgpack-serialized from C++)
    for cp in data:
        circuit_name = cp.get("circuit_name", "")
        idx = cp["circuit_index"]
        stage = STAGE_ORDER.get(cp["stage"], cp["stage"])
        label = f"{idx:02d}_{circuit_name}_{stage}" if circuit_name else f"{idx:02d}_{stage}"
        entries.append({
            "name": f"{name_path}/{label}",
            "unit": "MB",
            "value": cp["heap_mb"],
            "extra": f"stacked:{name_path}/heap_over_stages"
        })

    # Append to existing benchmarks file
    with open(f"{output_dir}/benchmarks.bench.json", "r") as f:
        existing = json.load(f)

    existing.extend(entries)

    with open(f"{output_dir}/benchmarks.bench.json", "w") as f:
        json.dump(existing, f, indent=2)

    print(f"Extracted {len(entries)} memory profile metrics")
except Exception as e:
    print(f"Warning: Could not extract memory profile: {e}", file=sys.stderr)
