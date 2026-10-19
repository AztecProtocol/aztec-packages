# AVM relations and PIL development guide

**Scope:** Use this guide when editing PIL relation files in `barretenberg/cpp/pil/vm2`. After changing PIL you must regenerate C++ and recompile.

## Related rules

- **barretenberg/cpp/src/barretenberg/vm2/CLAUDE.md** — AVM C++ simulator, tracegen, prover; build targets and tests.
- **barretenberg/cpp/CLAUDE.md** — Barretenberg root; the build recipe, bootstrap and general cpp workflow.

Further reading: `docs/README.md` (AVM circuit architecture, lookup/permutation syntax), `docs/recipes.md` (constraint idioms), `docs/skippable.md` (`#[skippable_if]`).

---

## Overview

The PIL files here define the AVM constraints (PIL is Polygon's Polynomial Identity Language). PIL is the source of truth; `scripts/avm2_gen.sh` compiles it to C++ under `src/barretenberg/vm2/generated/`.

## Workflow: changing PIL

Prerequisites for `avm2_gen.sh`: a built bb-pilcom, Node (it runs `protocol/constants-codegen`), and clang-format. The script first generates `constants_gen.pil` from the protocol constants. That file is gitignored; do not edit it by hand.

1. **Ensure `bb-pilcom` is built**, once per checkout and again after bb-pilcom changes: `bb-pilcom/bootstrap.sh` (runs `cargo build --release`). Changes to PIL do not require rebuilding pilcom.
2. **Regenerate C++:** From `barretenberg/cpp/`, run:
   ```bash
   ./scripts/avm2_gen.sh
   ```
   Check the output for errors. On success, generated files under `barretenberg/cpp/src/barretenberg/vm2/generated/` are updated.
3. **Recompile AVM:** Follow build and test instructions in `barretenberg/cpp/src/barretenberg/vm2/CLAUDE.md` (e.g. build `bb-avm` or `vm2_tests`).
4. **Proof length:** If you added or removed columns and the build fails a `static_assert` in `src/barretenberg/vm2/constraining/flavor.hpp`, run `scripts/bump_avm_proof_length.sh` (see its header).
