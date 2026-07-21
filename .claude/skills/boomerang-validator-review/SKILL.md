---
name: boomerang-validator-review
description: >-
  Code review for boomerang constraint validators: spawn-critic style audit that
  no ACIR circuit-building stage is skipped; writes incremental report.md with
  critical/info tags. Final gate of boomerang-constraint-validator after Phase 1–3.
  Use when orchestrator runs review loop or user asks for validator audit.
---

# Boomerang Validator Review

> **Orchestrator:** entry point is skill `boomerang-constraint-validator`. This file is the **Review phase** only — run after Phase 1, 2, and 3 are complete.

Adapted from skill `spawn-critic` (`.cursor/skills/spawn-critic/SKILL.md`): same directness, scoped to boomerang validator completeness.

---

## When to run

Orchestrator invokes this skill when:

- Phase 1 dump test + `*_functions_analysis.txt` exist
- Phase 2 `primitive_start_*` artifact exists (`Acir*PrimitiveStartDiscovery`)
- Phase 3 `*_validation.hpp` + integration tests exist
- User asks for validator review / audit

Do **not** run review before all three phases complete (unless user explicitly wants partial audit).

---

## Pass condition

Review **passes** iff:

```text
PASS ⇔ phase1_complete ∧ phase2_complete ∧ phase3_complete ∧ (critical_remarks = ∅)
```

| Flag | Meaning |
|------|---------|
| `phase1_complete` | Production trace + component map + mirrored executor + parity test pass; dump test writes `*_functions_analysis.txt` with tags aligned to component map |
| `phase2_complete` | Serialization + primitive part map; `primitive_start_*` pinned; witness gate map artifact |
| `phase3_complete` | Each large protocol primitive has chained FP validate_* from `primitive_start`; witness link tests for Phase 2 opcode parts; orchestrator + corruption tests pass |
| `critical_remarks` | Lines in `report.md` tagged `[critical]` |

Any `[critical]` line ⇒ **FAIL** — orchestrator must fix and re-run review.

`[info]` / `[minor]` lines do not block pass but should be listed in final summary.

---

## Report file (mandatory)

**Path:** `barretenberg/cpp/src/barretenberg/noir_programs_boomerang_values/<constraint>_validation_report.md`

Create on first read. **Append/update during review** — do not batch notes only at the end.

### Header (first write)

```markdown
# <Constraint> Validator Review

| Field | Value |
|-------|-------|
| Constraint | `<name>` |
| Review round | 1 |
| Phase 1 | pending / complete |
| Phase 2 | pending / complete |
| Phase 3 | pending / complete |
| Verdict | pending / PASS / FAIL |

## Findings

```

### Finding line format

```markdown
- [critical] <file>:<symbol> — <what is wrong>; <required fix>
- [info] <file> — <observation>
```

Write a finding **as soon as** you identify it while reading code. Increment `Review round` on each orchestrator re-run.

---

## Review procedure

### 1. Gather context

Read:

- `<constraint>_functions_analysis.txt` (Phase 1)
- `<constraint>_witness_gate_map.txt` or Phase 2 artifact (Phase 2)
- `<constraint>_validation.hpp` + orchestrator (Phase 3)
- Dump / witness / validation tests in `boomerang_*_*.test.cpp`
- Constraint source: `dsl/acir_format/*_recursion*.cpp`, step executor if present
- Child skills checklists (Phase 1–3 Definition of Done)

Update report header phase flags.

### 2. Launch critic subagent (recommended)

Use Task tool `subagent_type: generalPurpose`, `readonly: true`.

Prompt skeleton:

```text
You are a BOOMERANG VALIDATOR REVIEWER. Find gaps where ACIR constraint circuit-building stages are missing from validation. Be direct and cite files/lines.

## Constraint
<name>

## Phase artifacts
- Dump: <path to functions_analysis>
- Witness map: <path>
- Validation header: <path>

## Phase status
Phase 1: <complete|incomplete>
Phase 2: <complete|incomplete>
Phase 3: <complete|incomplete>

## Report path (write findings live)
<absolute path to report.md>

## Your tasks
1. Verify Phase 1: production trace doc, component map, mirrored executor (line-for-line vs production), parity test.
2. Verify Phase 2: serialization rules documented; WitnessSerializationParse before WitnessGateDump; aligned `proof_indices` not raw `proof[]`.
3. Verify Phase 2 uses same create_circuit / setup as Phase 1 dump — not a third chain.
4. Compare Phase 1 **large primitives** + dump tags to Phase 3 `validate_<large_primitive>()` coverage.
5. Verify Phase 3 starts first large primitive at Phase 2 `primitive_start_*`.
6. Check each Phase 2 opcode-linked primitive part has **witness link test** + FP range overlap.
7. Check deduplicated fingerprints have positional/count validation where labels differ.
8. Check integration test corrupts validated region inside a large primitive and fails.
9. For each issue: append to report.md immediately with [critical] or [info].
10. Set Verdict: PASS only if phase1∧phase2∧phase3 complete AND zero [critical] lines.

Do not be polite. Every [critical] must be actionable.
```

If subagent unavailable, executor performs same steps inline and still writes `report.md` incrementally.

### 3. Production chain checklist (Phase 1)

- [ ] `<constraint>_component_map.txt` (or equivalent) lists components in execution order
- [ ] Each `[WITNESS]` component names constraint fields
- [ ] `execute_*_mirrored` copies production source; diff is dump hooks only
- [ ] Parity test vs `create_circuit` (or gate-count constant) passes
- [ ] Dump tags in `*_functions_analysis.txt` match component map names

### 4. Witness serialization + primitive start (Phase 2)

- [ ] `<constraint>_witness_serialization.txt` with rules + aligned table + early processing order
- [ ] Witness → primitive part map (`first_primitive_part`, `last_serialization_part`)
- [ ] `Acir*WitnessSerializationParse` before gate tests
- [ ] `Acir*PrimitiveStartDiscovery` pins `primitive_start_*`; `serialization_end < primitive_start`
- [ ] Wrapper witnesses (first in create_*) not mistaken for primitive start

### 5. Large primitive FP validation (Phase 3)

For each **large protocol primitive** in Phase 1 catalog (Oink, Sumcheck, Shplemini, KZG, …):

- [ ] `validate_<large_primitive>()` chains **all** internal dump stage FPs in order
- [ ] First large primitive starts at `primitive_start_*`
- [ ] Subsequent primitives start at previous primitive end (documented in Result)
- [ ] Serialization-only dump sections excluded from FP chain
- [ ] Corruption test targets gate inside at least one large primitive

### 6. Opcode witness link (Phase 3 ↔ Phase 2)

For each primitive part Phase 2 marked as using opcode witnesses:

- [ ] `Acir*WitnessLinkIn*` (or equivalent) test exists
- [ ] `get_variable_gates(aligned_witness)` intersects `[part_start, part_end)` from validate Result
- [ ] Serialization parts: witness gates asserted **before** `primitive_start`, not in crypto validators

### 7. Stage coverage checklist

For each internal stage tag inside a large primitive:

- [ ] Mapped in Phase 2 witness map or marked serialization-only
- [ ] `validate_*` or grouped validate with comment in Phase 3
- [ ] Result struct fields record `arith_start` / `arith_end`
- [ ] Orchestrator calls stage in protocol order
- [ ] Corruption test exists for non-trivial stage (or grouped region)

Serialization-only stages (commitment deserialize, fix_witness padding):

- [ ] Phase 2 excludes serialization parts from `primitive_start`
- [ ] Phase 3 does not treat them as separate crypto validates unless dump requires

Cross-block stages (vk_hash poseidon2 ext + int + arith):

- [ ] Linked gate validation or documented chain in header
- [ ] Phase 2 artifact names starting block indices

### 8. Verdict

After checklist + critic:

- Scan `report.md` for `[critical]`
- Set `Verdict: PASS` or `Verdict: FAIL`
- If FAIL: list critical ids; orchestrator fixes code, increments round, re-runs from step 1

---

## HN opcode review (special case — overrides Phase 2/3 checklist)

HN recursion opcodes (`hn_recursion_constraints`, `proof_type` INIT/INNER/TAIL(8)/FINAL(7)) do **not** fit the generic HONK/CHONK model. The standard Phase 2 `proof_indices` / `primitive_start` / `serialization_end` checklist (§4, §6) is **inapplicable** — applying it literally produces false `[critical]`. Use the rules below instead **for any HN variant**.

### HN.0 — Why HN differs (must confirm before flagging)

- **`constraint.proof` is empty.** ACIR opcode links **only** `constraint.key` + `constraint.key_hash` (`recursion_constraint.cpp:200-202`). There is no `add_public_inputs_to_proof` stitch, no `proof_indices`, no serialization boundary in the arith block.
- **Proof witnesses come from the native IVC queue**, not ACIR: fold proof from `Chonk::verification_queue.front().proof` (`chonk.cpp:61`); FINAL decider proof from `Chonk::decider_proof` (`chonk.hpp:138`). Wired via `stdlib::Proof(builder, native_proof)` → each native FF becomes a fresh witness in proof order (value-matchable, **not** witness-index-matchable).
- **Anchor is squeeze-indexed + native-queue value-match**, not gate-index-from-serialization. See [project_hn_native_queue_anchor](../memory/project_hn_native_queue_anchor.md).

Reference artifacts: `hypernova_verification.hpp` (orchestrator), `HNInitValidation.hpp` / `HNFinalValidation.hpp`, `hn_tail_component_map.md` / `hn_final_component_map.md`, `recursion_constraints_validation/tracker.md` Phase 9.

### HN.1 — Report + naming

- HN is a **family** (INIT/INNER/TAIL/FINAL sharing one `hypernova_verification.hpp`), not one constraint with one `<constraint>_validation.hpp`.
- Report path: `noir_programs_boomerang_values/hn_validation_report.md`, **one report per family** with a per-variant section (INIT / INNER / TAIL / FINAL). Do **not** demand a separate `hn_final_validation.hpp` + `hn_final_validation_report.md` in generic form.

### HN.2 — Phase 2 substitutes (replace §4 checklist)

Do **not** look for `*_witness_serialization.txt`, `Acir*WitnessSerializationParse`, aligned `proof_indices`, or `serialization_end < primitive_start`. Instead verify:

- [ ] **Squeeze count pinned** — `find_all_transcript_squeeze_gates` size matches the variant constant (e.g. FINAL `HN_HIDING_TOTAL_SQUEEZES == 95`).
- [ ] **Anchor = squeeze index**, documented per variant. FINAL F2/F3 boundary = **claim_batching `sq[76]`**, proven empirically by `AcirHNFinalFoldDeciderBoundary` (FINAL-vs-plain-HN per-squeeze arith-window FP compare; first divergence == sq[76]). A boundary asserted without such a divergence test ⇒ `[critical]`.
- [ ] **Native-queue value-match** — proof/decider witnesses located by value (`std::map<uint256_t, gates>`), skipping colliding mock commitments (`Commitment::one()` limbs, `match_count` filter). Blind whole-proof value-match ⇒ `[critical]` (mock-commitment collision, same class as sumcheck IV pitfall).
- [ ] **Masks are structural, not value-matched** — `Fq::random_element()`, not stored in Chonk. TAIL masks at **front** of ecc_op (prelude 10 rows); FINAL masks at **end** (4 rows). Verified by non-zero op-wire signature, not FP/value.

### HN.3 — Phase 3 substitutes (replace §5/§6 checklist)

- [ ] **Fold-core reuse** — TAIL/FINAL reuse `validate_hn_baseline`/`validate_hn_baseline_impl` for shared fold-core (F2). TAIL: full baseline offset by masking prelude. FINAL: `validate_hn_baseline_impl(..., skip_post_mlb_phase=true)` for sq[0..76] — post-MLB tail is **replaced** by the decider, not shared. Reusing baseline without `skip_post_mlb_phase=true` on FINAL ⇒ `[critical]`.
- [ ] **Decider as windowed FP chain, not named primitives** — FINAL decider validated as an **indexed window array** (`HN_FINAL_DECIDER_WINDOWS[19]`, D0..D18), each window = arith FP + linked poseidon2 FPs. This satisfies "chain all internal stage FPs" — do **not** flag absence of named `validate_shplemini`/`validate_kzg` functions. **Do** flag: gap/overlap between windows, windows not covering `[sq[76]+1 .. arith.size())` contiguously, or a window count ≠ pinned constant.
- [ ] **Decider FP determinism** — decider FPs are selector/structure hashes (`calculate_hash_arithmetic_block` / `compute_selector_hash`), so stable despite random mock decider evals. A validator that value-hashes the decider region ⇒ `[critical]` (non-deterministic across runs).
- [ ] **Squeeze-window vs eval-absorption-window not conflated** — decider SQUEEZES (~sq[90..94]) sit **after** the eval-absorption arith region (~[8186..8797]); both inside F3. Conflating the two ⇒ `[critical]`.
- [ ] **F6 mask stage** — trailing/leading mask has its own `validate_hn_*_mask` result field and corruption test.

### HN.4 — Witness link (replace §6 for HN)

Opcode witnesses to link are **only `key` + `key_hash`** (not `proof[]`). Additionally, native-queue witnesses (fold proof, decider_proof evals) are value-matched into validated ranges.

- [ ] `key_hash` gates land in the oink `vk_hash` region (poseidon2).
- [ ] Native decider_proof random evals value-match into the F3 decider range (`AcirHNFinalWitnessLinkInDecider`, `EXPECT_GE(checked, 15)`).
- [ ] **Not required:** exhaustive per-element coverage of all ~478 queue / 109 decider witnesses. Validator anchors regions, not every witness — flag as `[info]` if user wants exhaustive coverage, never `[critical]`.

### HN.5 — HN-specific [critical] triggers

- FINAL F2/F3 boundary asserted without `AcirHNFinalFoldDeciderBoundary` divergence proof.
- Baseline reused for FINAL without `skip_post_mlb_phase=true`.
- Decider region value-hashed instead of selector/structure fingerprinted.
- Decider windows non-contiguous / count ≠ pinned constant.
- Blind native-proof value-match ignoring `Commitment::one()` collisions.
- Masks value-matched instead of structurally checked.
- Applying generic `proof_indices`/`serialization_end`/`primitive_start` findings to HN (false positives — reviewer error).

### HN.6 — HN pass condition (override)

```text
PASS_HN ⇔ squeeze_count_pinned
        ∧ anchor_squeeze_indexed (F2/F3 boundary divergence-proven for FINAL)
        ∧ fold_core_reused_correctly (skip_post_mlb for FINAL)
        ∧ decider_windows_contiguous_and_pinned (FINAL)
        ∧ masks_structural
        ∧ key/key_hash + decider_eval witness links present
        ∧ corruption tests (baseline, decider, mask) fail as expected
        ∧ (critical_remarks = ∅)
```

---

## Orchestrator loop (parent skill)

```text
while Verdict != PASS:
    fix all [critical] findings
    re-run Phase 2/3 tests as needed
    increment Review round in report.md
    re-run boomerang-validator-review

when PASS:
    stop coding
    deliver final validator + report.md summary to user
```

Reviewer **updates same** `report.md` each round. Resolved `[critical]` items: strike through or move to «Resolved» section with round number — do not delete history.

---

## What counts as [critical]

- Missing production trace or component map for Phase 1
- Dump/executor reimplements verifier instead of mirroring production
- Phase 2 gate dump before SerializationParse test
- `get_variable_gates` on raw `constraint.proof[i]` without stitch / alignment table
- Missing `<constraint>_witness_serialization.txt`
- Missing `validate_<large_primitive>()` for a protocol segment in Phase 1 dump
- First large primitive not starting at Phase 2 `primitive_start_*`
- Phase 2 opcode-linked part with no witness link test in Phase 3
- Witness link test passes globally but not inside validated FP range
- First fingerprint not anchored via Phase 2 `primitive_start_*`
- Orchestrator validates stages out of protocol order
- Duplicate fingerprint constants with identical hash tuples
- No corruption / negative test for integration path
- Phase 2 artifact exists but Phase 3 ignores pinned starts
- ACIR witness anchor replaced by native mock path
- `all_valid` true while a stage Result has `fingerprint_valid == false`

## What counts as [info]

- Missing comment on fingerprint deduplication grouping
- Test name unclear
- Optional refactor of shared helpers
- Minor doc gap in artifact header

---

## Anti-patterns

- Review before Phase 1–3 done without user OK
- Findings only in chat, not in `report.md`
- PASS with open `[critical]` lines
- Reviewer rewrites validator code (review only — orchestrator fixes)
- Deleting prior review rounds from report

---

## Canonical references

| Topic | Path |
|-------|------|
| Spawn critic pattern | `.cursor/skills/spawn-critic/SKILL.md` |
| Phase 1 | `.claude/skills/acir-constraint-fingerprint/SKILL.md` |
| Phase 2 | `.claude/skills/acir-witness-gate-discovery/SKILL.md` |
| Phase 3 | `.claude/skills/constraint-fingerprint-validation/SKILL.md` |
| Example validation | `HNInitValidation.hpp`, `hypernova_verification.hpp` |
| Review report target dir | `noir_programs_boomerang_values/` |
