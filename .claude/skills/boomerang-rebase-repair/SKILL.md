---
name: boomerang-rebase-repair
description: >-
  Phase 0 for boomerang-constraint-validator: triage and repair validator breakage
  after merging/rebasing onto upstream `next`. Classifies compile errors as
  mechanical (safe rename) vs semantic (real gate/protocol-shape change), fixes
  mechanical breakage in bulk, and flags semantic breakage for re-derivation
  instead of guessing. Use immediately after a merge/rebase when
  noir_programs_boomerang_values_tests (or any boomerang validator target) stops
  compiling, or before trusting a compile-clean build's validation results.
---

# Boomerang Rebase Repair (Phase 0)

> **Orchestrator:** skill `boomerang-constraint-validator`. This file runs **before** Phase 1,
> triggered specifically by upstream-merge breakage — not by new-constraint-family work.

## Hard rule

A compile error after merging upstream is either a **rename** (old accessor → new accessor,
identical semantics, safe to fix by pattern) or a **structural change** (the underlying
gate/block/protocol shape itself changed). Treat every error as structural until proven
otherwise by reading the production diff. Blind pattern-renaming a structural change produces
code that compiles and is wrong — worse than a compile error, because nothing flags it.

```text
Forbidden:
  - renaming a removed accessor to whatever new accessor "looks similar" without reading
    the definition it resolves to
  - assuming a fix that worked for one builder type (Ultra/Mega) applies to all instantiations
    of the same templated function
  - treating "it compiles now" as "it validates correctly now"

Required:
  - read the new type/function definition before writing the replacement
  - check whether the broken function is templated and instantiated for more than one
    concrete type (grep for `template class ... _<...>;` instantiations) before hardcoding
    a fix that only makes sense for one of them
  - after any semantic (non-1:1) fix, treat every FunctionFingerprint downstream of the
    changed primitive as stale — re-derive via Phase 1, never patch the hash constant by hand
```

---

## Default workflow

```text
Phase 0 Progress:
- [ ] Step 1: Full compile-error harvest (not just first error per file)
- [ ] Step 2: Classify each error — mechanical vs semantic
- [ ] Step 3: Mechanical pass — fix by pattern across all matching files, rebuild after each batch
- [ ] Step 4: Semantic pass — read the upstream diff/definition before fixing each one
- [ ] Step 5: Templated-function check — does this fix need to work for >1 builder/flavor type?
- [ ] Step 6: Silent-drift check — diff dispatch/protocol files even where they compiled clean
- [ ] Step 7: Fingerprint invalidation — mark what's now stale, don't hand-patch hashes
- [ ] Step 8: Baseline test run — quantify pass/fail, confirm failures are fingerprint drift
      not new compile-shaped surprises
- [ ] Step 9: Hand off to boomerang-constraint-validator Phase 1 per affected family
```

One step per batch, rebuild after each — a fatal error in a translation unit hides every later
error in that same file, so convergence is iterative, not one-shot.

---

## Step 1 — Full compile-error harvest

Build the target and read the **whole** log, not just the first failure:

```bash
cd barretenberg/cpp/build-debug
cmake --build . --target <target> -j"$(nproc)" 2>&1 | tail -400
grep -n "error:" <log> | head -100
```

Rebuild after every fix batch — new errors surface as earlier ones clear, because each `.cpp`
translation unit stops at its first fatal error.

---

## Step 2 — Classify: mechanical vs semantic

| Signal | Mechanical | Semantic |
|---|---|---|
| Error shape | `no member named 'X'; did you mean 'Y'` where Y is an obvious 1:1 rename | `no member named 'X'` with no suggestion, or the suggested name has a different type/shape |
| Fix confidence | You can name the replacement without reading any other file | You need to read a relation/flavor/constant file to know what changed |
| Risk if wrong | Compile error persists (safe) | Compiles, wrong result, silent |

When unsure, it's semantic. Read the definition before writing the fix.

---

## Step 3 — Mechanical pass

Fix **by pattern** across every matching file in one batch (`replace_all` per file, not
site-by-site), then rebuild once for the whole batch. Example fix table maintained across
rebase incidents so far — extend it, don't restart it:

| Old (removed) | New | Notes |
|---|---|---|
| `block.q_arith()` | `block.gate_selector_for(bb::GateKind::Arith)` | Safe when the block variable is bound to one *fixed, known* kind (e.g. `builder.blocks.arithmetic`) |
| `block.q_poseidon2_external()` | `block.gate_selector_for(bb::GateKind::Poseidon2Ext)` | Same fixed-block rule |
| generic `block.q_X()` where `block` comes from `builder.blocks.get()[block_idx]` (runtime-indexed, kind not statically known) | `bb::read_gate_selector(block, bb::GateKind::X, idx)` | **Not** `gate_selector_for` — that aborts on a non-owning block; `read_gate_selector` returns zero, matching old cross-block-safe semantics |
| `builder.blocks.poseidon2_internal` (Mega) | `builder.blocks.poseidon2_quad_internal` | Mega-only. **Ultra kept the old block name** — check which concrete builder type the surrounding function is instantiated with before renaming (see Step 5) |

Decision rule for the generic-vs-fixed case: if the block variable's binding line reads
`auto& x = builder.blocks.<name>;` with a literal name, it's fixed → `gate_selector_for`. If the
block comes from an index/loop/analyzer result, it's generic → `read_gate_selector`.

---

## Step 4 — Semantic pass

For each remaining error, before writing anything:

1. Read the new definition the compiler points at (`did you mean` target, or the type's header).
2. If it's a protocol/relation change, read the relation/algorithm doc comment (these files
   document the *why*, not just the *what* — e.g. `poseidon2_quad_internal_relation.hpp` explains
   the closed-form Vandermonde encoding, which tells you a one-round-per-gate loop can never be
   patched into correctness for it — it needs a different algorithm entirely).
3. If a struct field was removed (not renamed), check whether any file downstream of it actually
   *used* the value (`grep` for the field name outside the generated/serde header) before writing
   a replacement — sometimes the field was already dead weight and the fix is just deleting the
   read, not finding a substitute.
4. If a class's internal state moved from public to private (e.g. a `Verifier` class no longer
   exposes its per-stage locals for external mirroring), don't fabricate an unauthorized
   workaround. Check who actually calls the broken code — a helper written for a Phase 1 dump
   test that re-implements the algorithm locally (mirroring, not calling into the class) can often
   be repointed at the class's still-public collaborator objects (e.g. a shared `verifier_instance`)
   instead of the class's now-private fields.

---

## Step 5 — Templated-function check

Before hardcoding a fix inside a function template, check how many concrete types it's
instantiated with:

```bash
grep -rn "template class <ClassName>_<" <dir>
grep -rn "<function_name><" <dir>   # explicit template argument call sites
```

If a shared helper (e.g. a VK-hash validator used by both an Ultra-only ACIR opcode path and a
Mega-only HN path) is instantiated for more than one builder/flavor type, a fix that's correct
for one instantiation can be a compile error — or worse, a silently-wrong runtime result — for
the other. Two concrete block/flavor types can even be the **same underlying C++ type** (e.g.
`MegaTraceBlock` and `UltraTraceBlock` were both `ExecutionTraceBlock<fr, 4>`), so you cannot
disambiguate by the block's static type alone — the dispatch has to happen at the level that
*does* carry the distinguishing type (the `CircuitBuilder` template parameter), via
`if constexpr (IsMegaBuilder<CircuitBuilder>)` (concept typically declared at global scope, not
inside `bb::` — check before qualifying it), not by inspecting the block object.

Pattern for the fix: write a small dispatch helper at the point where the builder type is still
known, and thread the *result* (a block reference, or a `GateKind` value) down into the
lower-level generic function as a runtime parameter — don't try to re-derive the builder type
inside a function that only received the block.

---

## Step 6 — Silent-drift check

Compile-clean is not evidence of correctness. Dispatch/protocol files can change behavior with
zero compile errors:

- A kernel-dispatch function that used to hardcode "exactly 2 constraints" can be generalized to
  "1 + up to N" without any signature change — every call site still compiles, but a validator
  that assumed the binary case now silently mis-dispatches.
- A per-step verification call that used to add a full recursive-verifier subcircuit can be
  replaced by a cheap hash absorb, with the heavy verification moved to a single later step — the
  function that used to call it still compiles fine; only the gate count reveals the change.

For any file that dispatches by constraint count, opcode type, or `proof_type` — diff it against
upstream explicitly (`git show --stat <sha>`, targeted `git diff <base>..<upstream> -- <file>`)
even when it compiled clean. A clean build only proves the *types* still line up.

---

## Step 7 — Fingerprint invalidation

If Step 4 or 6 touched a primitive that any `FunctionFingerprint` anchors on (gate shape of a
relation, masking/row-disabling model, arithmetic block layout, a dispatch count), every pinned
fingerprint downstream of that primitive is presumed stale. Do not:

- patch the hash constant to "make the test pass" — you'd be pinning wrong data,
- assume a pinned gate-count coincidentally still fits — verify against production or re-derive.

Do: hand off to `acir-constraint-fingerprint` (Phase 1) to re-dump fresh, per affected family.

---

## Step 8 — Baseline test run

Run the full target and read the **shape** of the failures, not just the count:

```bash
./bin/<target> --gtest_filter='*'
```

- All failures are `EXPECT_EQ(hash, PINNED_CONSTANT)`-style mismatches, no crashes, no new error
  categories → confirms Stage 0-2 (mechanical + structural) is solid; remaining work is
  re-derivation (Phase 1-3 per family), not further bug-hunting.
- Any crash, hang, or non-fingerprint assertion failure → still a live bug from this pass; do not
  hand off to Phase 1 until the build is genuinely clean of those.

### Safe "constants-only" outcome

If production primitive code for a family did not change (or changed only in selector
serialization/layout) and the only red tests are pinned-hash mismatches, updating the pinned
constants to freshly observed canonical values can be sufficient.

Acceptance rule:
- after constant refresh, all family tests are green;
- no new failure categories appear (no relation failures, no crashes, no connectivity/range errors);
- no structural protocol mismatch remains.

In this case, treat the incident as synchronization drift, not a vulnerability.

---

## Step 9 — Hand off

Once mechanical/structural is done and semantic drift is cataloged (even if not yet fixed),
proceed into `boomerang-constraint-validator`'s Phase 1 → 2 → 3 → Review pipeline **per affected
constraint family**, in ascending complexity order. Re-derivation is multi-session work per
family — don't try to compress it into the same pass as the compile-repair.

---

## Anti-patterns

- Blind `replace_all` of a removed accessor across a whole file without checking whether that
  file's function is instantiated for more than one concrete type.
- Treating a "did you mean" compiler suggestion as automatically correct without reading what it
  resolves to.
- Patching a `FunctionFingerprint` hash constant by hand after a structural change, instead of
  re-dumping.
- Declaring the repair done once the build is green, without a baseline test run to confirm the
  remaining failures are fingerprint drift and not new bugs.
- Disabling a whole broken test file's content permanently instead of tracking it as a follow-up
  (temporary `#if 0` with a comment explaining exactly what changed and why is fine; silently
  deleting the file or its tests is not).

---

## Canonical files (grow this list per incident)

| Concept | Path |
|---|---|
| Selector storage (`GateKind`, `gate_selector_for`, `read_gate_selector`) | `barretenberg/cpp/src/barretenberg/honk/execution_trace/execution_trace_block.hpp` |
| Mega block layout (`poseidon2_quad_internal`, etc.) | `barretenberg/cpp/src/barretenberg/honk/execution_trace/mega_execution_trace.hpp` |
| Ultra block layout (`poseidon2_internal` unchanged) | `barretenberg/cpp/src/barretenberg/honk/execution_trace/ultra_execution_trace.hpp` |
| Builder-type concepts (`IsMegaBuilder`, global scope) | `barretenberg/cpp/src/barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp` |
| Masking/trace-offset constants | `barretenberg/cpp/src/barretenberg/constants.hpp` |
| Poseidon2 quad-compression algebra | `barretenberg/cpp/src/barretenberg/relations/poseidon2_quad_internal_relation.hpp`, `crypto/poseidon2/poseidon2_quad_params.hpp` |
| Row-disabling / masking model | `barretenberg/cpp/src/barretenberg/polynomials/row_disabling_polynomial.hpp` |
| OinkVerifier internal state ownership | `barretenberg/cpp/src/barretenberg/ultra_honk/oink_verifier.hpp` / `.cpp`, `barretenberg/cpp/src/barretenberg/ultra_honk/verifier_instance.hpp` |
| Chonk kernel dispatch / merge semantics | `barretenberg/cpp/src/barretenberg/dsl/acir_format/hypernova_recursion_constraint.cpp`, `barretenberg/cpp/src/barretenberg/chonk/chonk.cpp`, `goblin.cpp` |
| Per-builder gate-count constants (already handles Ultra-vs-Mega splits) | `barretenberg/cpp/src/barretenberg/dsl/acir_format/gate_count_constants.hpp` |

---

## After Phase 0

Orchestrator → **Phase 1** (`acir-constraint-fingerprint`), fresh dump, per affected family.
