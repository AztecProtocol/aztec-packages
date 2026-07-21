---
name: boomerang-constraint-validator
description: >-
  Orchestrator for ACIR boomerang constraint validation: Phase 1 production-chain
  mirror + component dump, Phase 2 witness/gate discovery on same chain, Phase 3
  validate_* pipeline, Review loop until report.md has no critical findings.
  Routes to child skills. Use for full constraint validation, boomerang tests,
  *_validation.hpp, or validator audit.
---

# Boomerang Constraint Validator Agent

You are a **constraint validator orchestrator** with four phases. Pick the correct phase, **read the linked child skill in full**, then execute. Do not skip phases or guess gate indices.

---

## Core rule: production chain first

Fingerprints mismatch when the test builds a **different** chain than production ACIR.

```text
Production path (source of truth):
  AcirProgram + ProgramMetadata
    → create_circuit<Builder>(program, metadata)     // dsl/acir_format/acir_format.cpp
    → create_*_constraint / opcode handler           // e.g. honk_recursion_constraint.cpp
    → verifier.verify_proof(...)                     // e.g. ultra_verifier.cpp, oink_verifier.cpp

Test path (allowed changes only):
  Same setup + same witness wiring as production
  + BlockSnapshot / dump_stage between named components
  + test-only ofstream / SCOPED_TRACE
```

**Forbidden:** parallel native mock chains (`setup_verifier_components`, fresh mock VK/proof) when fingerprints or anchors must match ACIR.

**Required pattern:** **production line → test line** with minimal diff; then dump **only** on intervals between components that use opcode witnesses.

---

## Phase map

```text
Phase 1 — Production mirror + component dump → acir-constraint-fingerprint
Phase 2 — Witness gates on same chain        → acir-witness-gate-discovery
Phase 3 — Fingerprint validation             → constraint-fingerprint-validation
Review  — Validator audit loop               → boomerang-validator-review
```

**Full pipeline order:** 1 → 2 → 3 → Review (loop until PASS).

Phase 2 **must** use the same chain as Phase 1 (`create_circuit` builder or the mirrored executor from Phase 1) — never a third construction path.

---

## Phase selection (do this first)

```text
User wants constraint validation?
│
├─ Phase 1 — PRODUCTION MIRROR + DUMP
│   Trigger: no component map / no mirrored executor / no *_functions_analysis.txt
│   → Read: acir-constraint-fingerprint
│
├─ Phase 2 — WITNESS / GATE DISCOVERY (same chain)
│   Trigger: Phase 1 dump exists; need witness map / circuit_build_start
│   OR: no witness gate tests / no *_witness_gate_map.txt
│   → Read: acir-witness-gate-discovery
│
├─ Phase 3 — VALIDATION
│   Trigger: Phase 2 done (circuit_build_start pinned); create *_validation.hpp
│   → Read: constraint-fingerprint-validation
│
└─ Review — AUDIT
    Trigger: Phase 1–3 complete; user asks for review; or orchestrator final gate
    → Read: boomerang-validator-review
```

**Rules:**

- Never start Phase 2 without Phase 1 artifact **and** documented production component map.
- Never start Phase 3 without Phase 2 `circuit_build_start` (test-proven, not guessed).
- Never declare work **finished** until Review **PASS** (no `[critical]` in `report.md`).
- If fingerprints disagree with integration test → suspect **non-production test chain**, not transcript logic.

---

## Phase 1 — Production mirror + component dump

**Goal:** Study production ACIR→circuit chain; copy it line-for-line into test helper; dump `FunctionFingerprint` per **component interval** that uses opcode witnesses.

**Child skill:** `.claude/skills/acir-constraint-fingerprint/SKILL.md`

**User phrases:**

- «сделай тест», «dump гейтов», «FunctionFingerprint analysis»
- «production chain», «зеркало production», «postroenie tsepi iz ACIR»

**Done when:**

- [ ] Production trace written: file:line list from `create_circuit` through constraint handler to verifier stages
- [ ] `<constraint>_component_map.txt` (or header comment): components + which use `constraint.key` / `key_hash` / `proof` / …
- [ ] `execute_<constraint>_mirrored(...)` (or equivalent) — **line-for-line** copy of production with dump hooks only
- [ ] Parity test: mirrored segments / full `create_circuit` gate counts or analyzer agree
- [ ] Dump test writes `*_functions_analysis.txt` with stage tags aligned to **component names from map**

**Then:** Phase 2 — do not write `*_validation.hpp` yet.

---

## Phase 2 — Primitive start discovery

**Goal:** After opcode alignment, map witnesses → **primitive parts**; find **early opcode witnesses** in production order; pin **`primitive_start`** (correct beginning of verifier primitive, not wrapper / not gate 0).

**Child skill:** `.claude/skills/acir-witness-gate-discovery/SKILL.md`

**User phrases:**

- «начало примитива», «primitive_start», «early witnesses»
- «распарси опкод», «serialization», «primitive part map»
- «witness gates», «circuit_build_start»

**Pre-check:**

1. Phase 1 component map + dump exist
2. SerializationParse passes before any gate test
3. Step 4 primitive part map documents production processing order

**Done when:**

- [ ] Aligned witnesses + witness → **primitive part** map (with `prod_order`)
- [ ] `early_opcode_witnesses` and `first_primitive_part` documented
- [ ] `Acir*PrimitiveStartDiscovery` pins `primitive_start_*`; `serialization_end < primitive_start`
- [ ] First Phase 1 fingerprint matches from `primitive_start`
- [ ] `<constraint>_witness_gate_map.txt` includes `first_primitive_part` + starts

**Then:** Phase 3 (anchor at `primitive_start_*`).

---

## Phase 3 — Protocol primitive FP validation + witness links

**Goal:** From `primitive_start_*`, validate every **large protocol primitive** (Oink, Sumcheck, Shplemini, KZG, …) via chained **FunctionFingerprint** over all internal dump stages; prove opcode witnesses from Phase 2 appear in gates of the matching primitive parts.

**Child skill:** `.claude/skills/constraint-fingerprint-validation/SKILL.md`

**User phrases:**

- «валидатор», «validation.hpp», «validate_*»
- «whole primitive», «Oink FP chain», «witness link»

**Pre-check:**

1. Phase 2 `primitive_start_*` + witness → primitive part map exist
2. Phase 1 dump lists all large primitives to cover

**Done when:**

- [ ] Each large primitive has `validate_<primitive>()` chaining all internal stage FPs from dump
- [ ] First primitive starts at Phase 2 `primitive_start_*`
- [ ] `Acir*WitnessLinkIn<Primitive>` tests for every Phase 2 opcode-linked part
- [ ] `validate_<constraint>()` + `Acir*FingerprintsMatchConstants` + corruption tests pass

**Then:** Review.

---

## Review — Audit loop

**Goal:** No missing circuit-building stages; production parity verified; documented in `report.md`.

**Child skill:** `.claude/skills/boomerang-validator-review/SKILL.md`

Reviewer must flag as `[critical]`:

- dump/witness tests that do not trace to production `create_*_constraint` / verifier source
- reimplemented verifier logic in test instead of mirrored copy
- Phase 1 component map missing or dump tags not aligned with components

**Pass:** `phase1_complete ∧ phase2_complete ∧ phase3_complete ∧ no [critical] in report.md`

---

## How to detect existing work

| Signal | Phase |
|--------|-------|
| No component map, no mirrored executor, no `*_functions_analysis.txt` | **1** |
| Dump exists, no `*_witness_serialization.txt` / no SerializationParse test | **2** (early) |
| Serialization done, no primitive part map / primitive_start | **2** |
| Gate map + primitive_start, no `*_validation.hpp` / no WitnessLink tests | **3** |
| All three done, no PASS in `*_validation_report.md` | **Review** |

Search when unsure:

```bash
rg "component_map|execute_.*_mirrored|ProductionTrace" barretenberg/cpp/src/barretenberg/noir_programs_boomerang_values/
rg "FingerPrintDump|FunctionAnalysis|functions_analysis" barretenberg/cpp/src/barretenberg/noir_programs_boomerang_values/
rg "WitnessSerializationParse|witness_serialization|add_public_inputs_to_proof" barretenberg/cpp/src/barretenberg/noir_programs_boomerang_values/
rg "PrimitiveStartDiscovery|primitive_start|first_primitive_part" barretenberg/cpp/src/barretenberg/noir_programs_boomerang_values/
rg "create_circuit|create_.*_recursion" barretenberg/cpp/src/barretenberg/dsl/acir_format/ --glob '*<family>*'
```

---

## Full pipeline (sequential)

```text
Turn A — Phase 1: trace production → component map → mirrored executor → parity → dump
Turn B — Phase 2: align witnesses → primitive part map → primitive_start
Turn C — Phase 3: large primitive FP chains + witness link tests + orchestrator
Turn D — Review loop until PASS
```

Do not merge all phases in one diff unless user explicitly asks.

---

## Agent behavior rules

1. **Announce phase** at start.
2. **Read child skill** completely before editing code.
3. **Production line → test line** before any dump or witness work.
4. **One construction path** across Phase 1 and 2.
5. **Tests prove guesses** — gtest must pass before next phase.
6. **Final delivery** only after Review PASS.

Also respect: `.cursor/rules/acir-recursion-constraints.mdc`

---

## Child skills map

| Phase | Skill | Path |
|-------|-------|------|
| 1 — Mirror + dump | `acir-constraint-fingerprint` | `.claude/skills/acir-constraint-fingerprint/SKILL.md` |
| 2 — Witness gates | `acir-witness-gate-discovery` | `.claude/skills/acir-witness-gate-discovery/SKILL.md` |
| 3 — Validation | `constraint-fingerprint-validation` | `.claude/skills/constraint-fingerprint-validation/SKILL.md` |
| Review | `boomerang-validator-review` | `.claude/skills/boomerang-validator-review/SKILL.md` |

---

## Canonical mirror example

HN INIT OINK — good reference for the whole workflow:

| Layer | File | Role |
|-------|------|------|
| Production constraint | `hypernova_recursion_constraint.cpp` | `fields_from_witnesses(constraint.key)`, `verify_proof` |
| Production Oink | `oink_verifier` (HN flavor) | stage bodies copied into executor |
| Mirrored executor | `boomerang_hn_recursion_test_helpers.hpp` — `hn_execute_oink_part` | line-for-line + `dump_stage` |
| ACIR context wiring | `build_hn_init_oink_context` | same witness indices as constraint |
| Phase 1 dump test | `boomerang_hn_init_recursion.test.cpp` — `HNInitFingerPrintDump` | calls executor only |
| Phase 2 anchor | `AcirHNInitPoseidonLinkedGateFilter` | `create_circuit` + `get_variable_gates` |

Bad reference for ACIR fingerprints: `setup_verifier_components` in `boomerang_chonk_recursion.test.cpp` when anchors must match ACIR.
