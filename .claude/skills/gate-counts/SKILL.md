---
name: gate-counts
description: Manage the pinned barretenberg gate-count fixture and the ci-refresh-gates refresh flow. Use when updating, regenerating, or reviewing the gate_count_constants.hpp / gate-counts.json pair.
argument-hint: <action> e.g. "regen", "refresh-local", "refresh-pr"
---

# Pinned barretenberg gate counts

Measured gate counts pinned by the test suite live in
`barretenberg/cpp/scripts/gate-counts.json`. The generated
`barretenberg/cpp/src/barretenberg/dsl/acir_format/gate_count_constants.hpp`
is derived from that JSON via `gen_gate_count_constants.py` and must not be
edited by hand.

Owner scripts:

- `barretenberg/cpp/scripts/gate-counts.json` — canonical fixture (committed).
- `barretenberg/cpp/scripts/gen_gate_count_constants.py` — renders the header.
- `barretenberg/cpp/scripts/merge_observed_gate_counts.py` — folds observed
  values from `BB_GATE_COUNT_OBSERVED_DIR` JSONL files back into the JSON.
- `barretenberg/cpp/scripts/ci_update_gate_counts.sh` — PR push-back step.
- `barretenberg/cpp/src/barretenberg/dsl/acir_format/gate_count_fixture.{hpp,cpp}`
  — `BB_OBSERVE_GATE_COUNT(key, value)` macro that records observed counts when
  the env var is set, and a no-op otherwise.

Use the scripts instead of editing the `.hpp` directly. Tests use
`BB_OBSERVE_GATE_COUNT("KEY", measured_value)` alongside their `EXPECT_EQ`.

## Common Commands

Regenerate the header from the JSON (after editing the JSON by hand):

```bash
barretenberg/cpp/scripts/gen_gate_count_constants.py
```

Verify the on-disk header matches the JSON (CI guard against hand edits):

```bash
barretenberg/cpp/scripts/gen_gate_count_constants.py --check
```

Refresh the pinned values locally from real test runs:

```bash
OBS=$(mktemp -d)
BB_GATE_COUNT_OBSERVED_DIR="$OBS" \
  barretenberg/cpp/scripts/run_test.sh dsl_tests '*GateCount*'
BB_GATE_COUNT_OBSERVED_DIR="$OBS" \
  barretenberg/cpp/scripts/run_test.sh stdlib_eccvm_verifier_tests '*'
BB_GATE_COUNT_OBSERVED_DIR="$OBS" \
  barretenberg/cpp/scripts/run_test.sh stdlib_honk_verifier_tests '*RecursiveVerifierTest*'
barretenberg/cpp/scripts/merge_observed_gate_counts.py "$OBS"
barretenberg/cpp/scripts/gen_gate_count_constants.py
```

In PR CI, refresh via the `ci-refresh-gates` label or a `--ci-refresh-gates`
head-commit marker. The follow-up refresh commit includes `--ci-skip` so the
push does not retrigger CI.

## Review Checklist

- Edits to `gate_count_constants.hpp` are only via the codegen. CI runs
  `gen_gate_count_constants.py --check` to enforce that.
- Keep refresh commits scoped to `gate-counts.json` and the regenerated header.
- New gate-count test sites should pair their `EXPECT_EQ` with
  `BB_OBSERVE_GATE_COUNT(key, observed)` so the refresh round-trip captures
  them.
- New `HONK_RECURSION_CONSTANTS` flavors need entries in both the JSON and the
  flavor switch inside `gen_gate_count_constants.py`.
