#!/usr/bin/env python3
"""Extracts component timings from a hierarchical benchmark breakdown and appends
them to the benchmark JSON file as stacked chart entries.

Usage: extract_component_benchmarks.py <output_dir> <name_path>

The output_dir must contain:
  - benchmark_breakdown.json (hierarchical timing data from bb --bench_out_hierarchical)
  - benchmarks.bench.json (existing benchmark results to append to)

The breakdown JSON format is:
  { "operation_name": [{"parent": "...", "time": nanoseconds, ...}], ... }

Component entries are added with extra: "stacked:<name_path>/components" so the
benchmark dashboard renders them as a single multi-line chart.
"""
import json
import sys

if len(sys.argv) != 3:
    print(f"Usage: {sys.argv[0]} <output_dir> <name_path>", file=sys.stderr)
    sys.exit(1)

output_dir = sys.argv[1]
name_path = sys.argv[2]

try:
    with open(f"{output_dir}/benchmark_breakdown.json", "r") as f:
        data = json.load(f)

    benchmarks = []

    # Key components to track (case-insensitive matching)
    key_components = ["sumcheck", "pcs", "pippenger", "commitment", "circuit", "oink", "compute", "decider", "BatchMergeProver", "BatchMergeVerifier"]

    for op_name, entries in data.items():
        # Check if this is a key component we want to track
        if any(comp.lower() in op_name.lower() for comp in key_components):
            # Sum up all timings for this operation (there may be multiple entries with different parents)
            total_time_ns = sum(entry.get("time", 0) for entry in entries)
            time_ms = total_time_ns / 1_000_000

            # Create a safe benchmark name (replace special chars)
            safe_name = op_name.replace("::", "_").replace(" ", "_")

            benchmarks.append({
                "name": f"{name_path}/{safe_name}_ms",
                "unit": "ms",
                "value": round(time_ms, 2),
                "extra": f"stacked:{name_path}/components"
            })

    # Append to existing benchmarks file
    with open(f"{output_dir}/benchmarks.bench.json", "r") as f:
        existing = json.load(f)

    existing.extend(benchmarks)

    with open(f"{output_dir}/benchmarks.bench.json", "w") as f:
        json.dump(existing, f, indent=2)

    print(f"Extracted {len(benchmarks)} component timings")
except Exception as e:
    print(f"Warning: Could not extract component timings: {e}", file=sys.stderr)
