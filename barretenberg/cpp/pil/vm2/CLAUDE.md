# AVM relations and PIL development guide

**Scope:** Use this guide when editing PIL relation files in `barretenberg/cpp/pil/vm2`. After changing PIL you must regenerate C++ and recompile; the C++ side is in `barretenberg/cpp/src/barretenberg/vm2`. See that directory’s CLAUDE.md for build and test.

## Related rules

- **barretenberg/cpp/src/barretenberg/vm2/CLAUDE.md** — AVM C++ simulator, tracegen, prover; build targets and tests.
- **barretenberg/cpp/CLAUDE.md** — Barretenberg root; bootstrap and general cpp workflow.

---

## Overview

The **Aztec Virtual Machine (AVM)** executes public transactions and proves correct execution. The **PIL files** in this directory define **relations**: constraints on a trace (matrix of columns and rows) that characterize valid execution. PIL is Polygon’s Polynomial Identity Language.

PIL is the source of truth for relation constraints; it is compiled into C++ used by the AVM prover in `barretenberg/cpp/src/barretenberg/vm2`.

## Workflow: changing PIL

**IMPORTANT:** Any change to PIL files requires regenerating C++ and recompiling the AVM.

1. **Ensure `bb-pilcom` is built** (once per checkout / when pilcom changes). From repo root: run `./bootstrap.sh` in `bb-pilcom/` (e.g. `bb-pilcom/bootstrap.sh`). Changes to PIL do not require rebuilding pilcom.
2. **Regenerate C++:** From `barretenberg/cpp/`, run:
   ```bash
   ./scripts/avm2_gen.sh
   ```
   Check the output for errors. On success, generated files under `barretenberg/cpp/src/barretenberg/vm2/generated/` are updated.
3. **Recompile AVM:** Follow build and test instructions in `barretenberg/cpp/src/barretenberg/vm2/CLAUDE.md` (e.g. build `bb-avm` or `vm2_tests`).
