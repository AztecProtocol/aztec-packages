---
name: boomerang-validator-review
description: >-
  Dual-mode boomerang validator review: Mode AUDIT (checklist coverage → report.md
  PASS/FAIL) and Mode CRITIC (spawn-critic 5Q on approach). Used at Intake Step C
  (any ACIR opcode, before Phase 1), as escape when stuck, and as final gate after
  Phase 1–3. Part of boomerang-constraint-validator.
---

# Boomerang Validator Review

> **Orchestrator:** entry point is skill `boomerang-constraint-validator`. Modes:
> - **CRITIC** during **Intake Step C** (before Phase 1) and when stuck mid-pipeline
> - **AUDIT** as final gate after Phase 1–3
>
> Applies to **any** ACIR opcode class (simple / recursion-generic / recursion-special).

Adapted from skill `spawn-critic` (`.cursor/skills/spawn-critic/SKILL.md`): same directness, scoped to boomerang validators. Two invoke modes — pick one before reading code.

---

## Mode selection (do this first)

```text
Need Review?
│
├─ Mode AUDIT  (default final gate)
│   Trigger: Phase 1–3 complete; orchestrator final gate; user asks for
│            validator review / audit / coverage check
│   Output: report.md checklist findings; Verdict PASS/FAIL
│
└─ Mode CRITIC (approach challenge)
    Trigger: **Intake Step C** (required before TZ); stuck / circling;
             user asks to challenge approach / spawn critic;
             same [critical] recurring across ≥2 Review rounds
    Output: spawn-critic 5Q verbatim to user; Strategy Notes / analysis Critique
            (only ACIR-fidelity breaks become [critical])
```

| | AUDIT | CRITIC |
|---|---|---|
| Goal | No missing stages vs Phase 1–3 DoD | Is approach capable of the goal? |
| When | After Phase 1–3 (or explicit partial audit) | **Intake**; stuck / circles; challenge assumptions |
| Subagent prompt | Coverage checklist (§ AUDIT prompt) | Spawn-critic 5Q + boomerang context (§ CRITIC prompt); Intake uses analysis.md as current state |
| PASS blocker | Any `[critical]` from checklist | Only Q1 failures that break ACIR-fidelity → `[critical]`; Q2–Q5 → `[info]` / Strategy Notes |
| Report to user | Summary + open criticals | Critic answers **verbatim** |

Do **not** run Mode AUDIT before all three phases complete (unless user explicitly wants partial audit). Mode CRITIC **must** run at Intake Step C and may run earlier/mid-pipeline when stuck.

If unsure: no approved TZ yet → Intake + **CRITIC**. Phase 1–3 done and user wants pass/fail → **AUDIT**. Progress stalled → **CRITIC**. Can run CRITIC then AUDIT in one session; do not merge modes into one vague pass.

---

## Pass condition (Mode AUDIT)

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

Any `[critical]` line ⇒ **FAIL** — orchestrator must fix and re-run Mode AUDIT.

`[info]` / `[minor]` / Strategy Notes do not block pass but should be listed in final summary.

Mode CRITIC does **not** set Verdict PASS by itself. After strategy fix, orchestrator re-runs Mode AUDIT for the gate.

---

## Report file (mandatory for both modes)

**Path:** `barretenberg/cpp/src/barretenberg/noir_programs_boomerang_values/<constraint>_validation_report.md`

Create on first read. **Append/update during review** — do not batch notes only at the end.

### Header (first write)

```markdown
# <Constraint> Validator Review

| Field | Value |
|-------|-------|
| Constraint | `<name>` |
| Review round | 1 |
| Mode | AUDIT / CRITIC |
| Phase 1 | pending / complete |
| Phase 2 | pending / complete |
| Phase 3 | pending / complete |
| Verdict | pending / PASS / FAIL |

## Findings

## Strategy Notes
```

### Finding line format

```markdown
- [critical] <file>:<symbol> — <what is wrong>; <required fix>
- [info] <file> — <observation>
```

Write a finding **as soon as** you identify it while reading code. Increment `Review round` on each orchestrator re-run. Set `Mode` to the mode of the current round.

---

## Shared: gather context

Before launching either subagent, read:

- `<constraint>_functions_analysis.txt` (Phase 1)
- `<constraint>_witness_gate_map.txt` or Phase 2 artifact (Phase 2)
- `<constraint>_validation.hpp` + orchestrator (Phase 3)
- Dump / witness / validation tests in `boomerang_*_*.test.cpp`
- Constraint source: `dsl/acir_format/*_recursion*.cpp`, step executor if present
- Child skills checklists (Phase 1–3 Definition of Done)
- Plan / PROGRESS / phase plan files if present (`*_phase*_plan.md`, `tracker.md`)

Update report header phase flags and `Mode`.

Summarize for the prompt: what was attempted, what worked, what failed (especially recurring FAIL reasons).

---

# Mode AUDIT — coverage gate

## AUDIT procedure

### 1. Launch critic subagent (coverage)

Use Task tool `subagent_type: generalPurpose` (readonly if available).

Prompt skeleton:

```text
You are a BOOMERANG VALIDATOR REVIEWER (Mode AUDIT). Find gaps where ACIR
constraint circuit-building stages are missing from validation. Be direct and
cite files/lines.

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

### 2. Production chain checklist (Phase 1)

- [ ] `<constraint>_component_map.txt` (or equivalent) lists components in execution order
- [ ] Each `[WITNESS]` component names constraint fields
- [ ] `execute_*_mirrored` copies production source; diff is dump hooks only
- [ ] Parity test vs `create_circuit` (or gate-count constant) passes
- [ ] Dump tags in `*_functions_analysis.txt` match component map names

### 3. Witness serialization + primitive start (Phase 2)

- [ ] `<constraint>_witness_serialization.txt` with rules + aligned table + early processing order
- [ ] Witness → primitive part map (`first_primitive_part`, `last_serialization_part`)
- [ ] `Acir*WitnessSerializationParse` before gate tests
- [ ] `Acir*PrimitiveStartDiscovery` pins `primitive_start_*`; `serialization_end < primitive_start`
- [ ] Wrapper witnesses (first in create_*) not mistaken for primitive start

### 4. Large primitive FP validation (Phase 3)

For each **large protocol primitive** in Phase 1 catalog (Oink, Sumcheck, Shplemini, KZG, …):

- [ ] `validate_<large_primitive>()` chains **all** internal dump stage FPs in order
- [ ] First large primitive starts at `primitive_start_*`
- [ ] Subsequent primitives start at previous primitive end (documented in Result)
- [ ] Serialization-only dump sections excluded from FP chain
- [ ] Corruption test targets gate inside at least one large primitive

### 5. Opcode witness link (Phase 3 ↔ Phase 2)

For each primitive part Phase 2 marked as using opcode witnesses:

- [ ] `Acir*WitnessLinkIn*` (or equivalent) test exists
- [ ] `get_variable_gates(aligned_witness)` intersects `[part_start, part_end)` from validate Result
- [ ] Serialization parts: witness gates asserted **before** `primitive_start`, not in crypto validators

### 6. Stage coverage checklist

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

### 7. AUDIT verdict

After checklist + subagent:

- Scan `report.md` for `[critical]`
- Set `Verdict: PASS` or `Verdict: FAIL`
- If FAIL: list critical ids; orchestrator fixes code, increments round, re-runs Mode AUDIT from gather context

---

# Mode CRITIC — approach challenge (spawn-critic + E mapping)

Use when stuck, circling, or before investing more in a doubtful path. Same gather-context step as AUDIT.

## CRITIC procedure

### 1. Launch critic subagent (strategy)

Use Task tool `subagent_type: generalPurpose` (readonly if available).

Prompt skeleton (spawn-critic 5Q + boomerang domain):

```text
You are a CRITIC for boomerang ACIR constraint validation. Your job is to find
fundamental problems in the approach, not to be polite. Be direct, specific,
and constructive.

## Project context
Boomerang constraint validator: Phase 1 production-chain mirror + component dump;
Phase 2 witness/gate discovery on same chain; Phase 3 validate_* FP pipeline +
witness links; Review until report.md has no [critical].
Core rule: fingerprints and anchors must come from the production ACIR→circuit
chain (create_circuit / create_*_recursion_constraints), not a parallel native
mock path. Gate-count parity ≠ witness-linkage parity.
Constraint under review: <name>
Goals from child skills / CLAUDE.md / plan:
<paste Definition of Done + any plan goals>

## Current state
Phase 1: <complete|incomplete> — artifacts: <paths>
Phase 2: <complete|incomplete> — artifacts: <paths>
Phase 3: <complete|incomplete> — artifacts: <paths>
Attempted so far:
<what was tried, what worked, what failed, recurring errors>
Main files:
<list paths>

## Report path
<absolute path to report.md>
Append Strategy Notes and any mapped findings live. Do not set Verdict PASS.

## Your task
Read the relevant code and files, then answer:

1. Is the current approach fundamentally capable of achieving the stated goal? If not, why?
2. What are the biggest blind spots or incorrect assumptions?
3. Where is effort being wasted on improvements that won't help?
4. What concrete alternative strategies would be more effective?
5. What is the single highest-leverage change that could be made right now?

Be brutally honest. Cite specific code, files, and reasoning. Do not suggest vague
improvements — every recommendation must be actionable.

## Finding severity mapping (piece E)
- Q1 failures that break ACIR-fidelity (wrong chain, native mock instead of ACIR,
  mirror used for witness-link without re-verify, Phase 2/3 on a third construction
  path) → append [critical] to Findings with file:symbol and required fix.
- Q1 issues that are design preferences but still reach the goal → [info] or Strategy Notes.
- Q2–Q5 (blind spots, wasted effort, alternatives, leverage) → ## Strategy Notes
  and/or [info]. Never block PASS solely on Q2–Q5.
```

If subagent unavailable, executor answers the same 5Q inline and writes Strategy Notes.

### 2. Report critic verbatim

After the subagent returns:

1. Paste the critic's five answers **verbatim** to the user (do not soften).
2. Ensure report.md has `Mode: CRITIC`, Strategy Notes updated, and any Q1 ACIR-fidelity `[critical]` lines.
3. Do **not** set `Verdict: PASS` from CRITIC alone.
4. Orchestrator / user picks the highest-leverage change; after fixes, run **Mode AUDIT** for the pass gate.

### 3. CRITIC anti-noise

- Do not convert "could refactor helpers" into `[critical]`.
- Do not demand HN-generic `proof_indices` / `serialization_end` when HN rules apply (see HN section) — that is reviewer error, not a strategy win.
- If approach is sound and only coverage gaps remain → say so in Q1, then recommend Mode AUDIT.

---

## HN opcode review (special case — overrides Phase 2/3 checklist)

HN recursion opcodes (`hn_recursion_constraints`, `proof_type` INIT/INNER/TAIL(8)/FINAL(7)) do **not** fit the generic HONK/CHONK model. The standard Phase 2 `proof_indices` / `primitive_start` / `serialization_end` checklist (AUDIT §3, §5) is **inapplicable** — applying it literally produces false `[critical]`. Use the rules below instead **for any HN variant**. Applies in Mode AUDIT; Mode CRITIC must treat these as hard domain constraints in Q1–Q4.

### HN.0 — Why HN differs (must confirm before flagging)

- **`constraint.proof` is empty.** ACIR opcode links **only** `constraint.key` + `constraint.key_hash` (`recursion_constraint.cpp:200-202`). There is no `add_public_inputs_to_proof` stitch, no `proof_indices`, no serialization boundary in the arith block.
- **Proof witnesses come from the native IVC queue**, not ACIR: fold proof from `Chonk::verification_queue.front().proof` (`chonk.cpp:61`); FINAL decider proof from `Chonk::decider_proof` (`chonk.hpp:138`). Wired via `stdlib::Proof(builder, native_proof)` → each native FF becomes a fresh witness in proof order (value-matchable, **not** witness-index-matchable).
- **Anchor is squeeze-indexed + native-queue value-match**, not gate-index-from-serialization. See [project_hn_native_queue_anchor](../memory/project_hn_native_queue_anchor.md).

Reference artifacts: `hypernova_verification.hpp` (orchestrator), `HNInitValidation.hpp` / `HNFinalValidation.hpp`, `hn_tail_component_map.md` / `hn_final_component_map.md`, `recursion_constraints_validation/tracker.md` Phase 9.

### HN.1 — Report + naming

- HN is a **family** (INIT/INNER/TAIL/FINAL sharing one `hypernova_verification.hpp`), not one constraint with one `<constraint>_validation.hpp`.
- Report path: `noir_programs_boomerang_values/hn_validation_report.md`, **one report per family** with a per-variant section (INIT / INNER / TAIL / FINAL). Do **not** demand a separate `hn_final_validation.hpp` + `hn_final_validation_report.md` in generic form.

### HN.2 — Phase 2 substitutes (replace AUDIT §3 checklist)

Do **not** look for `*_witness_serialization.txt`, `Acir*WitnessSerializationParse`, aligned `proof_indices`, or `serialization_end < primitive_start`. Instead verify:

- [ ] **Squeeze count pinned** — `find_all_transcript_squeeze_gates` size matches the variant constant (e.g. FINAL `HN_HIDING_TOTAL_SQUEEZES == 95`).
- [ ] **Anchor = squeeze index**, documented per variant. FINAL F2/F3 boundary = **claim_batching `sq[76]`**, proven empirically by `AcirHNFinalFoldDeciderBoundary` (FINAL-vs-plain-HN per-squeeze arith-window FP compare; first divergence == sq[76]). A boundary asserted without such a divergence test ⇒ `[critical]`.
- [ ] **Native-queue value-match** — proof/decider witnesses located by value (`std::map<uint256_t, gates>`), skipping colliding mock commitments (`Commitment::one()` limbs, `match_count` filter). Blind whole-proof value-match ⇒ `[critical]` (mock-commitment collision, same class as sumcheck IV pitfall).
- [ ] **Masks are structural, not value-matched** — `Fq::random_element()`, not stored in Chonk. TAIL masks at **front** of ecc_op (prelude 10 rows); FINAL masks at **end** (4 rows). Verified by non-zero op-wire signature, not FP/value.

### HN.3 — Phase 3 substitutes (replace AUDIT §4/§5)

- [ ] **Fold-core reuse** — TAIL/FINAL reuse `validate_hn_baseline`/`validate_hn_baseline_impl` for shared fold-core (F2). TAIL: full baseline offset by masking prelude. FINAL: `validate_hn_baseline_impl(..., skip_post_mlb_phase=true)` for sq[0..76] — post-MLB tail is **replaced** by the decider, not shared. Reusing baseline without `skip_post_mlb_phase=true` on FINAL ⇒ `[critical]`.
- [ ] **Decider as windowed FP chain, not named primitives** — FINAL decider validated as an **indexed window array** (`HN_FINAL_DECIDER_WINDOWS[19]`, D0..D18), each window = arith FP + linked poseidon2 FPs. This satisfies "chain all internal stage FPs" — do **not** flag absence of named `validate_shplemini`/`validate_kzg` functions. **Do** flag: gap/overlap between windows, windows not covering `[sq[76]+1 .. arith.size())` contiguously, or a window count ≠ pinned constant.
- [ ] **Decider FP determinism** — decider FPs are selector/structure hashes (`calculate_hash_arithmetic_block` / `compute_selector_hash`), so stable despite random mock decider evals. A validator that value-hashes the decider region ⇒ `[critical]` (non-deterministic across runs).
- [ ] **Squeeze-window vs eval-absorption-window not conflated** — decider SQUEEZES (~sq[90..94]) sit **after** the eval-absorption arith region (~[8186..8797]); both inside F3. Conflating the two ⇒ `[critical]`.
- [ ] **F6 mask stage** — trailing/leading mask has its own `validate_hn_*_mask` result field and corruption test.

### HN.4 — Witness link (replace AUDIT §5 for HN)

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

### HN.6 — HN pass condition (override for Mode AUDIT)

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
# Default final gate
run Mode AUDIT
while Verdict != PASS:
    if same [critical] class repeats ≥ 2 rounds OR progress stalled:
        run Mode CRITIC
        apply highest-leverage change from Q5 (or user choice)
    else:
        fix all [critical] findings
    re-run Phase 2/3 tests as needed
    increment Review round in report.md
    re-run Mode AUDIT

when PASS:
    stop coding
    deliver final validator + report.md summary to user
```

Reviewer **updates same** `report.md` each round. Resolved `[critical]` items: strike through or move to «Resolved» section with round number — do not delete history.

---

## What counts as [critical]

### From Mode AUDIT (coverage)

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

### From Mode CRITIC (strategy → critical only if ACIR-fidelity break)

- Approach cannot meet goal because it uses non-production chain for fingerprints/anchors
- Witness-link validators proven on mirror then pointed at real build (or reverse) without re-verify
- Phase 2/3 built on a third construction path vs Phase 1 dump
- Q1 concludes goal unreachable under current architecture (state the concrete fork)

All other CRITIC output → Strategy Notes / `[info]`.

## What counts as [info]

- Missing comment on fingerprint deduplication grouping
- Test name unclear
- Optional refactor of shared helpers
- Minor doc gap in artifact header
- CRITIC Q2–Q5 recommendations (blind spots, wasted effort, alternatives, leverage)
- Exhaustive per-witness coverage requests (especially HN queue)

---

## Anti-patterns

- Review before Phase 1–3 done without user OK (**AUDIT** only; CRITIC may run early)
- Running CRITIC and treating Q2–Q5 as PASS blockers
- Softening or paraphrasing CRITIC answers when reporting to user
- Findings only in chat, not in `report.md`
- PASS with open `[critical]` lines
- Reviewer rewrites validator code (review only — orchestrator fixes)
- Deleting prior review rounds from report
- Merging AUDIT + CRITIC into one vague subagent pass without mode label

---

## Canonical references

| Topic | Path |
|-------|------|
| Intake (A→C→P→T) | `.claude/skills/boomerang-validator-intake/SKILL.md` |
| Spawn critic pattern | `.cursor/skills/spawn-critic/SKILL.md` |
| Phase 1 | `.claude/skills/acir-constraint-fingerprint/SKILL.md` |
| Phase 2 | `.claude/skills/acir-witness-gate-discovery/SKILL.md` |
| Phase 3 | `.claude/skills/constraint-fingerprint-validation/SKILL.md` |
| Example validation | `HNInitValidation.hpp`, `hypernova_verification.hpp` |
| Review report target dir | `noir_programs_boomerang_values/` |
