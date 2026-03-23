#!/usr/bin/env python3
"""Merge per-preset fuzzer manifests into a unified manifest.

Derives category, noasm, and has_coverage fields from which presets
contain each fuzzer.
"""

import argparse
import json
import os
import sys


def main():
    parser = argparse.ArgumentParser(description="Merge per-preset fuzzer manifests")
    parser.add_argument("manifests", nargs="+", help="Per-preset manifest JSON files")
    parser.add_argument("--output", required=True, help="Output merged manifest path")
    args = parser.parse_args()

    # Collect fuzzers per preset
    preset_fuzzers: dict[str, dict[str, str]] = {}  # preset -> {name: source_path}
    for path in args.manifests:
        if not os.path.exists(path):
            print(f"Warning: {path} not found, skipping", file=sys.stderr)
            continue
        with open(path) as f:
            manifest = json.load(f)
        preset = manifest.get("preset", "unknown")
        for fuzzer in manifest.get("fuzzers", []):
            preset_fuzzers.setdefault(preset, {})[fuzzer["name"]] = fuzzer["source_path"]

    # Build unified list
    all_names: dict[str, str] = {}  # name -> source_path (first seen wins)
    for fuzzers in preset_fuzzers.values():
        for name, source_path in fuzzers.items():
            if name not in all_names:
                all_names[name] = source_path

    bb_names = set(preset_fuzzers.get("fuzzing", {}).keys())
    avm_names = set(preset_fuzzers.get("fuzzing-avm", {}).keys())
    noasm_names = set(preset_fuzzers.get("fuzzing-noasm", {}).keys())
    cov_names = set(preset_fuzzers.get("fuzzing-cov", {}).keys())

    merged = []
    for name, source_path in sorted(all_names.items()):
        merged.append({
            "name": name,
            "source_path": source_path,
            "category": "avm" if name in avm_names and name not in bb_names else "bb",
            "noasm": name in noasm_names,
            "has_coverage": name in cov_names,
        })

    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    with open(args.output, "w") as f:
        json.dump({"version": 1, "fuzzers": merged}, f, indent=2)

    print(f"Merged {len(merged)} fuzzers into {args.output}")


if __name__ == "__main__":
    main()
