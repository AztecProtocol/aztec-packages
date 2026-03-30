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

    # Stacked chart: polynomial memory by category (peak circuit)
    peak_circuit = data.get("peak_circuit")
    if peak_circuit:
        for category, stats in peak_circuit.get("categories", {}).items():
            entries.append({
                "name": f"{name_path}/memory/{category}_MB",
                "unit": "MB",
                "value": round(stats["actual_mb"], 2),
                "extra": f"stacked:{name_path}/memory/polynomial_categories"
            })

        # Total polynomial memory (peak circuit)
        entries.append({
            "name": f"{name_path}/memory/total_polynomial_MB",
            "unit": "MB",
            "value": round(peak_circuit.get("total_polynomial_mb", 0), 2)
        })

    # CRS memory
    crs_mb = data.get("crs_mb", 0)
    if crs_mb > 0:
        entries.append({
            "name": f"{name_path}/memory/crs_MB",
            "unit": "MB",
            "value": round(crs_mb, 2)
        })

    # Peak RSS from checkpoints
    peak_rss = data.get("peak_rss", {})
    if peak_rss.get("rss_mb", 0) > 0:
        entries.append({
            "name": f"{name_path}/memory/peak_rss_MB",
            "unit": "MB",
            "value": peak_rss["rss_mb"]
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
