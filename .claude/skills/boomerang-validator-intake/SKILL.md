---
name: boomerang-validator-intake
description: >-
  Prefatory track for any ACIR opcode before Phase 1–3: Analysis → Critique →
  Plan → TZ (tech spec). Gates coding until TZ approved. Use when starting a
  new constraint validator, when no <opcode>_tz.md exists, or when user asks
  for analysis/plan/TZ before dump or validate_*. Part of
  boomerang-constraint-validator.
---

# Boomerang Validator Intake

> **Orchestrator:** `boomerang-constraint-validator`. This skill is the **Intake** track — run **before** Phase 1 (mirror/dump). Applies to **any** ACIR opcode / constraint family (LOGIC, RANGE, POSEIDON2, HONK/ROLLUP/CHONK/HN recursion, AES, MSM, …), not only recursion.

**Pipeline:** Analysis → Critique → Plan → TZ → (user/agent approve) → Phase 0?/1/2/3 → Review → Deliver/PR.

Do **not** write dump tests, `*_validation.hpp`, or pin fingerprints during Intake. Artifacts only.

---

## When to run

Orchestrator invokes Intake when:

- User starts validation for an ACIR opcode / constraint and there is no approved `<slug>_tz.md`
- User asks for analysis / critique / plan / ТЗ before coding
- Existing Phase 1–3 work is abandoned or wrong-chain; need re-intake
- Switching opcode family mid-session without a TZ for the new family

**Skip** only if user explicitly says `skip intake` / `continue Phase N` **and** a usable TZ (or equivalent signed plan) already exists for that slug.

---

## Slug and paths (any opcode)

Pick a short **slug** for the constraint family (examples: `honk`, `rollup_honk`, `chonk_megazk`, `hn`, `poseidon2`, `logic`, `aes128`).

**Artifact directory** (prefer family folder if it exists):

```text
barretenberg/cpp/src/barretenberg/noir_programs_boomerang_values/
  └── [<family>/]                    # e.g. recursion_constraints_validation/HONK/
        <slug>_analysis.md
        <slug>_plan.md
        <slug>_tz.md
```

If no family folder yet, write under `noir_programs_boomerang_values/` and note the intended folder in TZ.

Critique findings go into `<slug>_analysis.md` § Critique **and** (if review report exists) Strategy Notes in `<slug>_validation_report.md`.

---

## Hard gate

```text
MAY_START_PHASE_1 ⇔ <slug>_tz.md exists
                   ∧ status = approved
                   ∧ Critique completed (5Q answered)
                   ∧ Plan exists and TZ references it
```

Until `MAY_START_PHASE_1`: **no** Phase 1–3 code edits (except Phase 0 rebase-repair if build is broken).

`approved` means: user said approve / LGTM / «утверждаю ТЗ», **or** agent filled checklist in TZ and user did not require interactive sign-off (default: **ask user** to approve TZ before Phase 1).

---

## Step A — Analysis

**Goal:** Understand production ACIR→circuit path and current gaps **without** implementing.

### Procedure

1. Identify opcode / constraint type in `dsl/acir_format/` (struct, `create_*`, serde).
2. Trace production call chain from `create_circuit` / opcode dispatch to circuit-building and any verifier stages.
3. List sibling validators under `noir_programs_boomerang_values/` (same family or analogous opcode).
4. Classify opcode class:

| Class | Examples | Intake notes |
|-------|----------|--------------|
| **Simple constraint** | RANGE, LOGIC, POSEIDON2, AES, QUAD | Often one `process_*` / small stage set; still need production mirror + corruption tests |
| **Recursion (generic Honk-like)** | HONK, ROLLUP_HONK, Ultra/Mega recursion | Phase 1–3 + `proof_indices` / serialization / `primitive_start` |
| **Recursion (HN / Chonk special)** | HN INIT/INNER/TAIL/FINAL, Chonk Goblin/MegaZK | HN overrides in review skill; native-queue anchors; empty `proof[]` possible |
| **Composite / multi-stage** | CHONK full, multi-opcode programs | Split slug per opcode or document multi-opcode scope in TZ |

5. Write `<slug>_analysis.md` from template below.
6. Do **not** invent gate indices. Mark unknowns as `TBD (Phase 2)`.

### Template — `<slug>_analysis.md`

```markdown
# <Slug> — Analysis

| Field | Value |
|-------|-------|
| Slug | `<slug>` |
| ACIR opcode / constraint | `<Type>` |
| Class | simple / recursion-generic / recursion-special / composite |
| Production entry | `file:line` (`create_*` / dispatch) |
| Status | draft / critique-done |

## Production chain

1. ...
2. ...

## Witness-using components (expected)

| Component | Constraint fields | Notes |
|-----------|-------------------|-------|
| ... | key / key_hash / proof / … | |

## Existing artifacts / siblings

- ...

## Gaps vs DoD (Phase 1–3)

- [ ] Phase 1 ...
- [ ] Phase 2 ...
- [ ] Phase 3 ...

## Risks / wrong-chain traps

- Gate-count parity ≠ witness-linkage parity
- ...

## Critique

(filled in Step C — paste 5Q verbatim)
```

**Done when:** production chain listed with file:line; class chosen; gaps listed; no code written.

---

## Step C — Critique

**Goal:** Challenge the analysis and intended approach **before** Plan/TZ.

### Procedure

1. Read `boomerang-validator-review` Mode CRITIC prompt pattern (or invoke that skill in Mode CRITIC with intake context).
2. Launch Task `generalPurpose` (readonly) with prompt:

```text
You are a CRITIC for boomerang ACIR constraint validation (Intake).
Find fundamental problems in the proposed approach for this opcode — not politeness.

## Opcode / slug
<slug> — <ACIR type> — class <class>

## Analysis (paste or path)
<path or full analysis.md>

## Project rules
- Fingerprints/anchors from production ACIR→circuit chain
- Dump may use mirror only after parity; witness-link requires real build
- Gate-count parity ≠ witness-linkage parity
- HN/special classes must not be forced into generic proof_indices checklist

## Answer
1. Is the current approach fundamentally capable of achieving a correct validator for this opcode? If not, why?
2. Biggest blind spots or incorrect assumptions?
3. Where would effort be wasted?
4. Concrete alternative strategies?
5. Single highest-leverage change right now (still in Intake — usually analysis/plan/TZ, not code)?

Be brutally honest. Cite files. Actionable only.

## Severity
- Q1 ACIR-fidelity / wrong-class / wrong-chain → must fix analysis before Plan
- Q2–Q5 → record under Critique; inform Plan/TZ
```

3. Paste 5Q **verbatim** into analysis § Critique and report to user.
4. If Q1 says approach cannot work: revise analysis (class, chain, sibling model) and re-run Critique. Do not write Plan yet.

**Done when:** 5Q answered; Q1 does not block; user saw verbatim critique.

---

## Step P — Plan

**Goal:** Ordered execution plan for Phase 1→2→3 (+ Review), decisions locked.

### Procedure

Write `<slug>_plan.md`:

```markdown
# <Slug> — Plan

| Field | Value |
|-------|-------|
| Slug | `<slug>` |
| Based on analysis | `<slug>_analysis.md` |
| Critique incorporated | yes / date |
| Status | draft / ready-for-tz |

## Decisions (locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Dump chain | mirror + parity / real only | |
| Witness-link chain | real build (`create_circuit` / `create_*`) | required for fidelity |
| Opcode class overrides | none / HN / … | |
| Family folder | `.../<path>/` | |

## Phase order

1. Phase 1 — ...
2. Phase 2 — ...
3. Phase 3 — ...
4. Review AUDIT — ...

## Out of scope this plan

- ...

## Open questions (must close in TZ or Phase 2)

- ...
```

Reuse sibling plans (e.g. `honk_recursion_phase2_plan.md`) as **references**, not as a substitute for this slug’s plan.

**Done when:** dump vs witness-link chain chosen; phase order clear; HN/special overrides named if any.

---

## Step T — TZ (technical specification)

**Goal:** Acceptance contract. Phase 1–3 execute against TZ, not against chat memory.

### Procedure

Write `<slug>_tz.md`:

```markdown
# <Slug> — TZ (Tech Spec)

| Field | Value |
|-------|-------|
| Slug | `<slug>` |
| ACIR type | |
| Class | |
| Plan | `<slug>_plan.md` |
| Analysis | `<slug>_analysis.md` |
| Status | draft / **approved** / superseded |
| Approved by | user / date |

## Scope

What validator must prove for this opcode (one paragraph).

## Chain matrix

| Job | Source |
|-----|--------|
| Phase 1 dump / stage FP | mirror (after parity) **or** real — <choice> |
| Phase 2/3 witness-link / ACIR fidelity | **real** `create_circuit` / `create_*_constraints` |

## Deliverables (files)

| Path | Phase |
|------|-------|
| `..._component_map.txt` | 1 |
| `..._functions_analysis.txt` | 1 |
| `..._witness_serialization.txt` / gate map | 2 |
| `..._validation.hpp` + tests | 3 |
| `..._validation_report.md` | Review |

(Adapt names to opcode; HN may use family report.)

## Acceptance criteria

- [ ] Phase 1 DoD (`acir-constraint-fingerprint`)
- [ ] Phase 2 DoD (`acir-witness-gate-discovery`) — or HN substitutes if class=recursion-special
- [ ] Phase 3 DoD (`constraint-fingerprint-validation`)
- [ ] Review Mode AUDIT PASS (no `[critical]`)
- [ ] Corruption / reject tests for validated regions
- [ ] Witness-link tests for opcode-linked parts (or HN key/key_hash + documented substitutes)

## Non-goals

- Pinning gate indices before Phase 2 discovery
- Parallel native mock chain for ACIR anchors
- ...

## Test filters (fill as known)

```text
./bin/noir_programs_boomerang_values_tests --gtest_filter='...'
```

## PR (when Deliver)

- Base: `merge-train/barretenberg`
- Paths in scope: <list>
- Summary bullets: from this TZ acceptance
```

Then **ask user to approve** (`Status: approved`). Do not start Phase 1 until approved (unless user waived).

**Done when:** `Status: approved` in `<slug>_tz.md`.

---

## After Intake

Return to orchestrator:

```text
Intake complete → Phase 1 (acir-constraint-fingerprint) per TZ
```

If build broken post-merge first → Phase 0, then resume Phase 1 under same TZ.

If Plan/TZ become wrong mid-flight (wrong class, wrong chain): **re-open Intake** (revise A→C→P→T), set old TZ `superseded`, do not silently invent a new path in Phase 3.

---

## Anti-patterns

- Starting Phase 1 because «no dump file» while TZ missing
- Critique only after failing Review (too late for Intake; still use escape CRITIC)
- Copying HONK/HN checklists onto a simple LOGIC/POSEIDON2 opcode without class check
- Forcing `proof_indices` / `serialization_end` onto HN-class opcodes
- Writing `validate_*` during Analysis
- Approving TZ yourself without user when user asked to review ТЗ
- One TZ covering unrelated opcodes without composite scope section

---

## Orchestrator checklist (copy)

```text
Intake Progress:
- [ ] A Analysis (<slug>_analysis.md)
- [ ] C Critique (5Q verbatim in analysis)
- [ ] P Plan (<slug>_plan.md)
- [ ] T TZ (<slug>_tz.md Status=approved)
- [ ] Gate open → Phase 1
```

---

## References

| Topic | Path |
|-------|------|
| Orchestrator | `.claude/skills/boomerang-constraint-validator/SKILL.md` |
| Critique pattern | `.claude/skills/boomerang-validator-review/SKILL.md` (Mode CRITIC) |
| Spawn critic | `.cursor/skills/spawn-critic/SKILL.md` |
| Phase 1–3 | `acir-constraint-fingerprint`, `acir-witness-gate-discovery`, `constraint-fingerprint-validation` |
| Example plans (legacy) | `recursion_constraints_validation/honk_recursion_phase*_plan.md` |
