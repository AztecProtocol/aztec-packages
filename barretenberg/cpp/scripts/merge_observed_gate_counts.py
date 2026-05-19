#!/usr/bin/env python3
"""Merge observed gate counts produced by test binaries into gate-counts.json.

Inputs are the `.jsonl` files produced by the BB_OBSERVE_GATE_COUNT macro
(see barretenberg/cpp/src/barretenberg/dsl/acir_format/gate_count_fixture.{hpp,cpp}).
Each line is `{"key": "<dotted::key>", "value": <int>}`. Later records for the
same key overwrite earlier ones, which matches what we want: a test that runs
multiple iterations of the same fixture key reports the same value, so the
"last write wins" rule is stable.

Keys without a `::` prefix overwrite a top-level integer in the JSON.
Keys of the form `HONK_RECURSION_CONSTANTS::<flavor>::<mode>::<gates|ultra_ops>`
overwrite the corresponding slot in the nested HONK_RECURSION_CONSTANTS map.

Usage:
    barretenberg/cpp/scripts/merge_observed_gate_counts.py <observed_dir>
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
JSON_PATH = SCRIPT_DIR / "gate-counts.json"


def _load_observed(observed_dir: Path) -> dict[str, int]:
    merged: dict[str, int] = {}
    for path in sorted(observed_dir.glob("*.jsonl")):
        for raw in path.read_text(encoding="utf-8").splitlines():
            raw = raw.strip()
            if not raw:
                continue
            try:
                rec = json.loads(raw)
            except json.JSONDecodeError as exc:
                print(f"warn: {path}: skipping bad line: {exc}", file=sys.stderr)
                continue
            key = rec.get("key")
            value = rec.get("value")
            if not isinstance(key, str) or not isinstance(value, int):
                continue
            merged[key] = value
    return merged


def _apply(observed: dict[str, int], target: dict) -> tuple[dict, list[str]]:
    """Return (updated_target, list_of_change_descriptions)."""
    changes: list[str] = []
    for key, value in observed.items():
        if "::" not in key:
            if key not in target:
                changes.append(f"WARN unknown top-level key '{key}' (value {value}); ignoring")
                continue
            if target[key] != value:
                changes.append(f"{key}: {target[key]} -> {value}")
            target[key] = value
            continue
        parts = key.split("::")
        if parts[0] != "HONK_RECURSION_CONSTANTS" or len(parts) != 4:
            changes.append(f"WARN unsupported structured key '{key}'; ignoring")
            continue
        _, flavor, mode, component = parts
        honk = target.setdefault("HONK_RECURSION_CONSTANTS", {})
        flavor_entry = honk.get(flavor)
        if flavor_entry is None:
            changes.append(f"WARN unknown HONK flavor '{flavor}'; ignoring")
            continue
        tuple_entry = flavor_entry.get(mode)
        if tuple_entry is None:
            changes.append(f"WARN unknown HONK mode '{mode}' for flavor '{flavor}'; ignoring")
            continue
        if not isinstance(tuple_entry, list) or len(tuple_entry) != 2:
            changes.append(f"WARN malformed tuple at HONK_RECURSION_CONSTANTS.{flavor}.{mode}; ignoring")
            continue
        idx = 0 if component == "gates" else 1 if component == "ultra_ops" else None
        if idx is None:
            changes.append(f"WARN unknown component '{component}' for HONK key; ignoring")
            continue
        prev = tuple_entry[idx]
        if prev != value:
            changes.append(f"HONK {flavor}.{mode}.{component}: {prev} -> {value}")
        tuple_entry[idx] = value
    return target, changes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("observed_dir", type=Path)
    args = parser.parse_args()
    if not args.observed_dir.is_dir():
        print(f"observed_dir {args.observed_dir} is not a directory", file=sys.stderr)
        return 2

    observed = _load_observed(args.observed_dir)
    if not observed:
        print("No observed gate counts found; nothing to update.")
        return 0

    with JSON_PATH.open("r", encoding="utf-8") as f:
        data = json.load(f)
    data, changes = _apply(observed, data)

    if not changes:
        print(f"gate-counts.json already matches observed values from {args.observed_dir}.")
        return 0

    with JSON_PATH.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

    print(f"Updated {JSON_PATH.relative_to(JSON_PATH.parents[3])}:")
    for change in changes:
        print(f"  {change}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
