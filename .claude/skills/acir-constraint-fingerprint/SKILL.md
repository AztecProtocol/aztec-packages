---
name: acir-constraint-fingerprint
description: >-
  Phase 1 boomerang workflow: trace production ACIR→circuit chain, map witness-using
  components, mirror production line-for-line in test helper, parity gtest, dump
  FunctionFingerprint per component interval. Phase 1 of boomerang-constraint-validator.
  Use when adding discovery tests, *_functions_analysis.txt, or ACIR constraint inspection.
---

# ACIR Production Chain → Component Dump → FunctionFingerprint

> **Orchestrator:** skill `boomerang-constraint-validator`. This file is **Phase 1 (Production mirror + dump)** only.
> **Pre-check:** approved `<slug>_tz.md` from `boomerang-validator-intake` (or user skip intake). Works for any ACIR opcode named in that TZ.

## Hard rule

Dump tests must exercise the **same gate chain** as production. Fingerprints from a reimplemented or native-mock path will not match integration validation.

```text
Allowed test diff vs production:
  + BlockSnapshot before/after each component
  + dump_stage(...) / ofstream
  + SCOPED_TRACE, test fixture names

Forbidden as primary chain:
  - setup_verifier_components() with fresh native VK/proof when ACIR parity required
  - hand-rolled verifier calls that diverge from production source
  - skipping create_*_constraint witness wiring (fields_from_witnesses, key_hash, proof, predicate)
```

When step-by-step dump is needed, copy verifier stage bodies from production **line-for-line** (see `hn_execute_oink_part` vs `OinkVerifier`).

---

## When to Use

- new constraint family or variant (HONK, ROOT_ROLLUP_HONK, CHONK, HN, …);
- create `*_functions_analysis.txt` for Phase 3 constants;
- fingerprint mismatch suspected → first re-check production mirror, not hash logic.

---

## Default workflow

```text
Phase 1 Progress:
- [ ] Step 0: Production trace — file:line from ACIR entry to last verifier stage
- [ ] Step 1: Component map — list stages; mark opcode-witness consumers
- [ ] Step 2: Mirrored executor — copy production chain; add dump hooks only
- [ ] Step 3: ACIR setup API — make_<constraint>_acir_setup() (reuse serde / test_class patterns)
- [ ] Step 4: TEST — parity vs create_circuit (gate count or analyzer)
- [ ] Step 5: TEST — FingerPrintDump via mirrored executor → *_functions_analysis.txt
- [ ] Step 6: Run focused gtest; verify dump tags match component map names
```

One step per change, then run focused test.

---

## Step 0 — Production trace (mandatory before coding)

Read and list **in execution order**:

| # | Location | What runs |
|---|----------|-----------|
| 1 | `dsl/acir_format/acir_format.cpp` | `create_circuit<Builder>(program, metadata)` |
| 2 | `recursion_constraint.cpp` or family handler | dispatches to `create_*_recursion_constraints` |
| 3 | `*_recursion_constraint.cpp` | witness wiring from ACIR struct |
| 4 | Verifier entry | e.g. `verifier.verify_proof(proof_fields)` |
| 5 | Internal stages | Oink → padding → sumcheck → … (open callee files) |

Output artifact (test comment or `<constraint>_component_map.txt` header):

```text
# Production trace: <constraint>
# create_circuit → recursion_constraint.cpp:L… → honk_recursion_constraint.cpp:L… → UltraVerifier::verify_proof
# Components (execution order):
#   C0 wrapper: fields_from_witnesses(key), from_witness_index(key_hash), proof_fields  [WITNESS]
#   C1 verify_proof entry
#   C2 Oink: vk_hash  [WITNESS: key_hash via vk_and_hash]
#   C3 Oink: receive_commitment × N  [WITNESS: proof body — serialization]
#   C4 …
```

Mark `[WITNESS]` on every component that reads `constraint.*` witness indices (directly or via stdlib objects built from them).

---

## Step 1 — Component map

For each component `Ci`:

- **Production anchor:** `file:line` of first statement in segment
- **Witness fields:** subset of `key`, `key_hash`, `proof[]`, `public_inputs`, `predicate`, family extras
- **Role:** `serialization` | `circuit` | `wrapper` | `output`
- **Dump tag:** `FAMILY_STAGE:substage` (will appear in `*_functions_analysis.txt`)

Serialization components (typical): proof deserialize, decompose, range, NNF, `receive_commitment` on proof bytes.

Circuit components (typical): vk_hash crypto, challenges, sumcheck, Shplemini, KZG, IPA finalize.

Do not invent dump tags that do not correspond to a production function boundary.

---

## Step 2 — Mirrored executor (line-for-line)

Create `execute_<constraint>_mirrored(builder, ctx, out)` (or family name) in test helpers header.

**Procedure:**

1. Open production source for the segment (e.g. `oink_verifier.cpp`, `create_honk_recursion_constraints`).
2. Copy the block **verbatim** into executor — same calls, same order, same variable names where possible.
3. Wrap each **mapped component** only:

```cpp
const auto snap = [&]() { return recursion_helpers::BlockSnapshot::capture(builder); };

const auto dump_component = [&](const char* tag, const char* fp_prefix,
                                const BlockSnapshot& before, const BlockSnapshot& after) {
    // reuse dump_stage / hn_compute_fingerprint / print_fp from recursion_constraints_helper.hpp
};

{
    auto before = snap();
    // === production lines unchanged ===
    vk_hash = vk->hash_with_origin_tagging(*transcript);
    transcript->add_to_hash_buffer(ds + "vk_hash", vk_hash);
    // === end production lines ===
    dump_component("HN_OINK:vk_hash", "HN_OINK_VK_HASH", before, snap());
}
```

4. Context struct (`build_<constraint>_context`) must mirror production witness wiring:

```cpp
// Copy from create_*_recursion_constraints / hypernova handler:
auto key_fields = fields_from_witnesses(builder, constraint.key);
auto vk_hash = field_ct::from_witness_index(&builder, constraint.key_hash);
auto proof_fields = fields_from_witnesses(builder, add_public_inputs_to_proof(...));
// Same transcript / verifier_instance construction as production path
```

Reference: `build_hn_init_oink_context` + `hn_execute_oink_part` in `boomerang_hn_recursion_test_helpers.hpp`.

**If full opcode path is required:** prefer dump hooks inside a shared helper called from both production analysis and test — but default is mirror in test helpers until duplication hurts.

---

## Step 3 — ACIR setup API

Reuse patterns from existing boomerang tests; wire `AcirProgram` exactly as production expects:

```cpp
program.constraints.max_witness_index = ...;
program.constraints.num_acir_opcodes = ...;
program.constraints.<family>_constraints = { constraint };
program.constraints.original_opcode_indices = ...;
```

For recursion: use `recursion_data_to_recursion_constraint`, IVC queue, `ProgramMetadata` (`has_ipa_claim`, etc.) matching the production scenario under test.

Naming:

- `make_<family>_acir_setup()` — generic
- `make_<family>_<variant>_acir_setup()` — e.g. `make_hn_init_acir_setup()`, `make_root_rollup_honk_acir_setup()`

---

## Step 4 — Parity test (blocker before dump)

Prove mirrored chain matches production construction.

**Option A — full circuit gate count** (from `honk_recursion_constraint.test.cpp`):

```cpp
TEST_F(..., Acir<Constraint>Compiles) {
    auto setup = make_<constraint>_acir_setup();
    auto builder = create_circuit<Builder>(setup.program, setup.metadata);
    EXPECT_GT(builder.get_num_finalized_gates(), 0UL);
}
```

**Option B — analyzer parity:**

```cpp
AcirFormat cs_copy = setup.program.constraints;
cdg::StaticAnalyzerAcir analyzer(std::move(cs_copy), std::move(builder));
EXPECT_TRUE(analyzer.get_incorrect_opcodes().empty());
```

**Option C — segment parity** (when using witness builder + mirrored executor):

Run mirrored executor on witness builder; compare cumulative block sizes to known production gate-count constants (`gate_count_constants.hpp`) or to full `create_circuit` snapshot after equivalent stages.

**Do not run FingerPrintDump until parity test passes.**

---

## Step 5 — FingerPrintDump test

```cpp
TEST_F(..., <Constraint>FingerPrintDump) {
    BB_DISABLE_ASSERTS();
    const auto setup = make_<constraint>_acir_setup();
    Builder builder = build_<family>_witness_builder(setup);  // or create_circuit if executor runs post-opcode
    auto ctx = build_<constraint>_context(builder, setup);
    std::ofstream out("<constraint>_functions_analysis.txt");
    execute_<constraint>_mirrored(builder, ctx, out);
    SUCCEED();
}
```

Dump file requirements:

- Each section tag = component name from Step 1 map
- `inline constexpr FunctionFingerprint` lines via `print_fp`
- Comment header pointing to production trace + component map file

Build + run:

```bash
cd barretenberg/cpp/build
cmake --build . --target noir_programs_boomerang_values_tests -j$(nproc)
./bin/noir_programs_boomerang_values_tests --gtest_filter='*<Constraint>*FingerPrint*'
```

---

## Pick path (still apply)

| Path | When | Chain source |
|------|------|--------------|
| **A. Full create_circuit** | MegaStaticAnalyzerAcir, end-to-end gate map | production opcode only |
| **B. Witness builder + mirrored executor** | per-stage FP like HN OINK | production verifier bodies copied |
| **C. ACIR-backed context only** | context wiring check before executor | `fields_from_witnesses` from constraint |

Do not mix path B executor with path A metadata without documenting why gate regions still match.

---

## Reuse architecture

| Layer | Location |
|-------|----------|
| Fingerprint infra | `recursion_constraints_helper.hpp` |
| Mirrored executors | `*_test_helpers.hpp` |
| Component map + trace | `<constraint>_component_map.txt` or test file header |
| Dump output | `<constraint>_functions_analysis.txt` |

New constraint adds at most: setup wrapper, context builder, mirrored executor, component map, parity test, dump test.

---

## Anti-patterns

- Dump before production trace + component map exist.
- `execute_*` that rewrites verifier logic instead of copying production.
- Different witness source (native mock) than `constraint.key` / `proof`.
- Dump tags not aligned with component map.
- Skipping parity test «because dump compiles».

---

## Canonical files

| Topic | Path |
|-------|------|
| Mirror + dump (HN OINK) | `boomerang_hn_recursion_test_helpers.hpp`, `boomerang_hn_init_recursion.test.cpp` |
| Production HONK wrapper | `honk_recursion_constraint.cpp` |
| Production circuit entry | `acir_format.cpp` — `create_circuit` |
| CHONK stage dump style | `boomerang_chonk_recursion.test.cpp` — `write_stage_fingerprint` |
| Gate count pins | `gate_count_constants.hpp` |

---

## After Phase 1

Orchestrator → **Phase 2** (`acir-witness-gate-discovery`) on the **same chain** and component map.

Extended templates: [reference.md](reference.md).
