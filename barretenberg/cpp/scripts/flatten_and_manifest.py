#!/usr/bin/env python3
"""Flatten variant binaries into /targets/ and generate a unified v2 manifest.

Reads per-preset manifests (produced by generate_fuzzer_manifest.py via CMake)
to discover binaries, suffixes, and source paths. No variant knowledge is
hardcoded here — it all comes from the manifests.

Usage (from barretenberg/cpp/ during Docker build):
    python3 scripts/flatten_and_manifest.py /targets /tmp/fuzzer_manifest.json \
        bin-fuzzing/fuzzer_manifest.json \
        bin-fuzzing-noasm/fuzzer_manifest.json \
        bin-fuzzing-avm/fuzzer_manifest.json \
        --copy-only bin-fuzzing-asan/fuzzer_manifest.json \
        --copy-only build-fuzzing-cov/bin/fuzzer_manifest.json \
        --preset-resources fuzzing-avm:1:8

Positional manifests: binaries are copied AND added to the unified manifest.
--copy-only manifests: binaries are copied but NOT added (companion builds
like asan/coverage that the entrypoint discovers by suffix convention).
--preset-resources: override CPUs and memory for a specific preset
(format: PRESET:CPUS:MEMORY_GB). Repeatable.
"""

import argparse
import json
import os
import shutil
import sys


def _load_manifest(path: str) -> dict:
    with open(path) as f:
        return json.load(f)


def _copy_executables(bin_dir: str, dest_dir: str, suffix: str) -> list[str]:
    """Copy executable files from bin_dir to dest_dir/<name><suffix>. Returns names."""
    copied = []
    if not os.path.isdir(bin_dir):
        print(f"Warning: {bin_dir} not found, skipping", file=sys.stderr)
        return copied
    for name in sorted(os.listdir(bin_dir)):
        src = os.path.join(bin_dir, name)
        if os.path.isfile(src) and os.access(src, os.X_OK):
            shutil.copy2(src, os.path.join(dest_dir, f"{name}{suffix}"))
            copied.append(name)
    return copied


def main():
    parser = argparse.ArgumentParser(description="Flatten binaries and generate v2 manifest")
    parser.add_argument("targets_dir", help="Destination for flattened binaries")
    parser.add_argument("manifest_out", help="Output path for unified v2 manifest")
    parser.add_argument("manifests", nargs="*", help="Per-preset manifests (schedulable)")
    parser.add_argument("--copy-only", action="append", default=[], dest="companions",
                        help="Per-preset manifests for companion builds (copy only, not scheduled)")
    parser.add_argument("--cpus", type=int, default=4, help="Default CPUs per target")
    parser.add_argument("--memory-gb", type=int, default=8, help="Default memory GB per target")
    parser.add_argument("--preset-resources", action="append", default=[], dest="preset_resources",
                        help="Override resources for a preset (format: PRESET:CPUS:MEMORY_GB, repeatable)")
    args = parser.parse_args()

    # Parse preset resource overrides into {preset: {cpus, memory_gb}}
    preset_res: dict[str, dict] = {}
    for spec in args.preset_resources:
        parts = spec.split(":")
        if len(parts) != 3:
            parser.error(f"--preset-resources must be PRESET:CPUS:MEMORY_GB, got: {spec}")
        preset_res[parts[0]] = {"cpus": int(parts[1]), "memory_gb": int(parts[2])}

    os.makedirs(args.targets_dir, exist_ok=True)

    # Collect coverage fuzzer names (from whichever manifest has preset fuzzing-coverage)
    cov_names: set[str] = set()
    for path in args.manifests + args.companions:
        data = _load_manifest(path)
        if data.get("preset") == "fuzzing-coverage":
            cov_names = {fz["name"] for fz in data.get("fuzzers", [])}

    targets = []
    total_copied = 0

    # The fuzzing-avm preset enables FUZZING_AVM in cmake, which adds the
    # AVM-specific fuzzers (avm_fuzzer_*, harness_*).  However cmake also
    # rebuilds every base fuzzer target (stdlib_*, ecc_*, translator_*, etc.)
    # as a side effect.  Those collateral rebuilds are identical in behaviour
    # to the base preset and should NOT be scheduled as separate jobs.
    #
    # We collect fuzzer names from the first (base) manifest, then for the
    # AVM preset we only schedule names that are new (the actual AVM fuzzers).
    # All binaries are still copied to /targets/ — the entrypoint may need them.
    #
    # TODO: if cmake learns to build only AVM-specific targets in the
    # fuzzing-avm preset, this filter can be removed.
    base_names: set[str] = set()

    for i, path in enumerate(args.manifests):
        data = _load_manifest(path)
        suffix = data.get("suffix", "")
        preset = data.get("preset", "")
        label = preset.removeprefix("fuzzing-") or "asm"
        bin_dir = os.path.dirname(path)

        copied = _copy_executables(bin_dir, args.targets_dir, suffix)
        total_copied += len(copied)

        fuzzers_meta = {fz["name"]: fz["source_path"] for fz in data.get("fuzzers", [])}

        if i == 0:
            base_names = set(copied)

        # See docstring above — only the AVM preset needs dedup.
        dedup = preset == "fuzzing-avm" and bool(base_names)

        # Use preset-specific resources if provided, otherwise global defaults
        res = preset_res.get(preset, {"cpus": args.cpus, "memory_gb": args.memory_gb})

        scheduled = 0
        for name in copied:
            if dedup and name in base_names:
                continue
            scheduled += 1
            source_path = fuzzers_meta.get(name, "")
            modes = ["fuzz", "minimize", "reproduce", "regress"]
            if name in cov_names:
                modes.append("coverage")
            targets.append({
                "name": f"{name}{suffix}",
                "display_name": f"{name} ({label})",
                "language": "c++",
                "fuzzer_engine": "libfuzzer",
                "source_path": f"barretenberg/cpp/src/barretenberg/{source_path}" if source_path else "",
                "modes": modes,
                "resources": res,
            })
        if scheduled < len(copied):
            print(f"  {preset}: {scheduled} scheduled, {len(copied) - scheduled} skipped (in base preset)")

    # Process companion presets: copy binaries only
    for path in args.companions:
        data = _load_manifest(path)
        suffix = data.get("suffix", "")
        bin_dir = os.path.dirname(path)
        copied = _copy_executables(bin_dir, args.targets_dir, suffix)
        total_copied += len(copied)

    manifest = {"schema": "2", "targets": targets}
    os.makedirs(os.path.dirname(args.manifest_out) or ".", exist_ok=True)
    with open(args.manifest_out, "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"Copied {total_copied} binaries to {args.targets_dir}, "
          f"wrote {len(targets)} targets to {args.manifest_out}")


if __name__ == "__main__":
    main()
