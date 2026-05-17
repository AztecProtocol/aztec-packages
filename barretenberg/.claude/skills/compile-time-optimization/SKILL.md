---
name: compile-time-optimization
description: Use for Barretenberg C++ compile-time reduction work, especially profile-guided changes to Ninja targets, Clang -ftime-trace analysis, constexpr hot spots, and include/header parsing reductions without changing runtime semantics or build flags.
---

# Barretenberg Compile-Time Optimization

## Constraints

- Optimize total compiler work, not only wall-clock time.
- Do not change CMake/build flags, optimization levels, or test sources to claim a win.
- Do not update verification keys unless explicitly asked; most compile-time-only edits should not affect VKs.
- Do not use `-j` with Ninja.
- Preserve runtime semantics. Prefer direct literals or out-of-line definitions only when the linkage and dependency graph already support them.

## Workflow

1. Establish the target and profile baseline.
   - Use the target the user cares about, e.g. `ninja -C build-profile-assert-light-1 -t clean ultra_honk_tests` then `ninja -C build-profile-assert-light-1 ultra_honk_tests`.
   - Keep trace sets comparable. Remove stale `*.json` traces from unrelated validation targets before comparing.
   - Analyze with `python3 scripts/compile_trace_explorer.py <build-dir> --top 30 --json /tmp/<name>.json --output /tmp/<name>.md`.

2. Pick changes from evidence.
   - Constant-eval hotspots: replace repeated expensive constexpr parsing/inversion/exponentiation with checked field limb literals when the value is fixed by protocol constants.
   - Header self-time hotspots: first look for heavy inline bodies, avoidable transitive includes, or functions that can be declared in headers and defined in an already-linked `.cpp`.
   - Include-route hotspots: prefer forward declarations or narrower headers if the public API only needs names, not definitions.

3. Preserve constexpr where possible.
   - For BN254 fields, native builds may use direct Montgomery limbs with `field(l0, l1, l2, l3)`.
   - Keep a canonical-limb fallback for WASM or non-`__int128` builds: `field(numeric::uint256_t{...})`.
   - Add cheap static assertions when replacing derived constants, e.g. checking that a precomputed inverse multiplied by its denominator equals one.

4. Validate.
   - Build and run the smallest relevant test target first.
   - Rebuild the profiled target from clean and re-run the trace explorer.
   - Confirm the targeted trace event disappears or materially drops, and report aggregate `execute`, `frontend`, and `backend` traced work.
   - Finish with the user-requested Ninja target and `git diff --check`.

## Common Commands

```bash
ninja -C build-profile-assert-light-1 -t clean ultra_honk_tests
ninja -C build-profile-assert-light-1 ultra_honk_tests
python3 scripts/compile_trace_explorer.py build-profile-assert-light-1 --top 30 --json /tmp/bb-compile.json --output /tmp/bb-compile.md
```

## Guardrails

- A smaller clock time is not enough; prefer changes that reduce frontend/backend traced work.
- If a structural out-of-line move would require changing CMake dependencies, stop and reassess before editing build files.
- If minimal repro TUs are too expensive, use clean `ninja bb` or the user-selected Ninja target as the measurement surface.
