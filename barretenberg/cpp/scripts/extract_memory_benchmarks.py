#!/usr/bin/env python3
"""Extracts memory breakdown metrics from a memory profile JSON and appends
them to the benchmark JSON file as dashboard entries.

Usage: extract_memory_benchmarks.py <output_dir> <name_path>

The output_dir must contain:
  - memory_breakdown.json (memory profile data from bb --memory_profile_out)
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
    with open(f"{output_dir}/memory_breakdown.json", "r") as f:
        data = json.load(f)

    entries = []

    # RSS timeline: each checkpoint becomes a line on the per-commit dashboard chart
    for cp in data.get("rss_checkpoints", []):
        circuit_name = cp.get("circuit_name", "")
        idx = cp["circuit_index"]
        stage = cp["stage"]
        # Build a stable label like "07_EcdsaRAccount:entrypoint/after_accumulate"
        label = f"{idx:02d}_{circuit_name}/{stage}" if circuit_name else f"{idx:02d}/{stage}"
        entries.append({
            "name": f"{name_path}/memory/rss/{label}",
            "unit": "MB",
            "value": cp["rss_mb"],
            "extra": f"stacked:{name_path}/memory/rss_timeline"
        })

    # Append to existing benchmarks file
    with open(f"{output_dir}/benchmarks.bench.json", "r") as f:
        existing = json.load(f)

    existing.extend(entries)

    with open(f"{output_dir}/benchmarks.bench.json", "w") as f:
        json.dump(existing, f, indent=2)

    print(f"Extracted {len(entries)} memory breakdown metrics")
except Exception as e:
    print(f"Warning: Could not extract memory breakdown: {e}", file=sys.stderr)
