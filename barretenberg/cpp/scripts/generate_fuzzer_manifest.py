#!/usr/bin/env python3
"""Generate a per-preset fuzzer manifest from CMake-collected entries."""

import json
import os
import sys


def main():
    entries_file = sys.argv[1]
    output_file = sys.argv[2]
    preset = sys.argv[3] if len(sys.argv) > 3 else "unknown"

    fuzzers = []
    if os.path.exists(entries_file):
        with open(entries_file) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                name, source_path = line.split("|", 1)
                fuzzers.append({"name": name, "source_path": source_path})

    # Derive binary suffix from preset name (e.g. fuzzing-noasm -> _noasm)
    suffix = ""
    if preset and preset != "fuzzing":
        tag = preset.removeprefix("fuzzing-").replace("coverage", "cov")
        suffix = f"_{tag}"

    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    with open(output_file, "w") as f:
        json.dump({"version": 1, "preset": preset, "suffix": suffix, "fuzzers": fuzzers}, f, indent=2)

    print(f"Wrote {len(fuzzers)} fuzzers to {output_file} (preset: {preset})")


if __name__ == "__main__":
    main()
