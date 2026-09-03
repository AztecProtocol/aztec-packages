---
name: boomerang-constraint-validator
description: >-
  Orchestrator for ACIR boomerang constraint validation for any ACIR opcode:
  Intake (Analysis→Critique→Plan→TZ) then Phase 1 dump, Phase 2 witness/gate
  discovery, Phase 3 validate_*, Review AUDIT/CRITIC, optional Deliver/PR.
  Routes to child skills. Use for full constraint validation, boomerang tests,
  *_validation.hpp, validator audit, or whenever working in
  barretenberg/cpp/src/barretenberg/noir_programs_boomerang_values/.
---

# Boomerang Constraint Validator Agent

You are a **constraint validator orchestrator** for **any ACIR opcode** (simple constraints and recursion families). Pipeline: **Intake → Phase 0?/1/2/3 → Review → Deliver**. Pick the correct stage, **read the linked child skill in full**, then execute. Do not skip Intake unless TZ already approved (or user explicitly skips). Do not guess gate indices.

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

## Which circuit source for which job

Two jobs, two allowed sources — pick by what the test is actually proving, not by habit or by what a sibling family already uses.

| Job | Source | Why |
|-----|--------|-----|
| Phase 1 discovery/dump (stage gate counts, `FunctionFingerprint` pinning) | Mirror OK (`build_full_*_circuit`-style hand-copied executor) | Easier to instrument with snapshots between stages. **Only** allowed once a parity test proves mirror block sizes == real build, block for block. |
| Phase 2/3 witness-link / ACIR-fidelity checks (`validate_vk_hash`, VkDeserialize-style region checks, IPA tail witness link, block-linkage, anything tracing `constraint.key`/`key_hash`/`proof[]` into real gates) | Real build required (`create_circuit<Builder>` / `create_*_recursion_constraints<Flavor, IO>(builder, constraint)`) | These exist specifically to catch production divergence — a mirror can't answer "does production wire this witness correctly," only a real build can. |

Both sources can legitimately appear side by side in the same family's test files (e.g. ROLLUP_HONK dumps via the mirror but validates VK-deserialize/IPA-tail witness links via the real `create_honk_recursion_constraints` build directly) — that is not an inconsistency, it's two different questions being asked.

**Gotcha — gate-count parity ≠ witness-linkage parity.** A mirror can match a real build's block sizes exactly (parity test green) and still diverge in copy-constraint witness wiring underneath. A passing parity test licenses using the mirror for *further stage-boundary/fingerprint discovery* only — it does **not** license pointing Phase 3 witness-link validators (built and proven against one source) at the other source without re-verifying witness links specifically. Confirmed case: HONK mirror vs real build matched every block exactly through KZG, yet `validate_vk_hash`'s poseidon2_external copy-constraint check failed once Phase 3 validators built for the mirror were run against the real build instead.

---

## Phase map

```text
Intake  — Analysis → Critique → Plan → TZ (any ACIR opcode)
                                              → boomerang-validator-intake
Phase 0 — Post-upstream-merge repair (only after a next merge/rebase breaks the build)
                                              → boomerang-rebase-repair
Phase 1 — Production mirror + component dump → acir-constraint-fingerprint
Phase 2 — Witness gates on same chain        → acir-witness-gate-discovery
Phase 3 — Fingerprint validation             → constraint-fingerprint-validation
Review  — AUDIT gate + CRITIC escape         → boomerang-validator-review
Deliver — PR after AUDIT PASS (when user asks)
```

**Full pipeline order:** Intake (A→C→P→T, TZ approved) → 1 → 2 → 3 → Review Mode AUDIT (loop until PASS) → Deliver/PR (optional). Mode CRITIC on Intake and on stuck / recurring FAIL.

Phase 2 **must** use the same chain as Phase 1 (`create_circuit` builder or the mirrored executor from Phase 1) — never a third construction path.

**Opcode-agnostic:** same Intake→Execute→Review path for LOGIC, RANGE, POSEIDON2, AES, HONK, ROLLUP_HONK, CHONK, HN, … Class-specific overrides live in Intake TZ and in review HN section — do not invent a parallel orchestrator per opcode.

---

## Phase selection (do this first)

```text
User wants constraint validation for an ACIR opcode?
│
├─ Intake — NO APPROVED TZ FOR THIS SLUG
│   Trigger: missing/draft <slug>_tz.md; new opcode family; user asks analysis/plan/ТЗ;
│            approach invalidated mid-flight (supersede TZ and re-intake)
│   → Read: boomerang-validator-intake
│   → A Analysis → C Critique → P Plan → T TZ → user approves
│   Hard gate: do NOT enter Phase 1 until Status=approved (unless user: skip intake)
│
├─ Phase 0 — JUST MERGED/REBASED ONTO next AND BUILD BREAKS
│   Trigger: a merge/rebase from upstream next landed and the validator target (or any
│   boomerang test target) no longer compiles, or you're about to trust a compile-clean
│   build's results right after such a merge without having checked for silent drift
│   → Read: boomerang-rebase-repair
│   (Keep existing approved TZ; repair then resume Phase 1–3)
│
├─ Phase 1 — PRODUCTION MIRROR + DUMP
│   Trigger: TZ approved; no component map / no mirrored executor / no *_functions_analysis.txt
│   → Read: acir-constraint-fingerprint
│   Execute against TZ deliverables — do not invent scope beyond TZ
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
├─ Review — dual mode (see boomerang-validator-review)
│   ├─ Mode AUDIT (default final gate)
│   │   Trigger: Phase 1–3 complete; user asks for review/audit; orchestrator final gate
│   │   → checklist coverage → report.md Verdict PASS/FAIL
│   └─ Mode CRITIC (approach challenge)
│       Trigger: Intake Step C; stuck/circling; user asks spawn-critic;
│                same [critical] class repeats ≥2 AUDIT rounds
│       → spawn-critic 5Q verbatim; only ACIR-fidelity Q1 breaks → [critical]
│       → Intake: fix analysis/plan/TZ; Execute: then re-run Mode AUDIT
│
└─ Deliver — PR
    Trigger: Review AUDIT PASS + user asks for PR / commit+PR
    → Base merge-train/barretenberg; body from TZ acceptance + report
```

**Rules:**

- Never start Phase 1 without **approved** `<slug>_tz.md` (or explicit user skip).
- Never start Phase 2 without Phase 1 artifact **and** documented production component map.
- Never start Phase 3 without Phase 2 `circuit_build_start` (test-proven, not guessed).
- Never declare work **finished** until Review **Mode AUDIT PASS** (no `[critical]` in `report.md`). Mode CRITIC alone does not PASS. Intake alone does not PASS.
- If fingerprints disagree with integration test → suspect **non-production test chain**, not transcript logic.
- If failures are only pinned hash/constant mismatches and all related tests turn green after refreshing constants, classify as synchronization drift (selector/layout drift), not a vulnerability.
- If Execute reveals wrong opcode class or wrong chain vs TZ → **supersede TZ**, re-run Intake; do not patch Phase 3 around a false TZ.

---

## Intake — Analysis → Critique → Plan → TZ

**Goal:** For **any** ACIR opcode, lock approach and acceptance **before** dump/validate code. Prevents jumping straight into Phase 1.

**Child skill:** `.claude/skills/boomerang-validator-intake/SKILL.md`

**User phrases:**

- «анализ», «критика», «план», «ТЗ», «tech spec»
- «новый опкод», «validate LOGIC/POSEIDON2/HONK/… from scratch»
- starting work with no `<slug>_tz.md`

**Done when:**

- [ ] `<slug>_analysis.md` — production chain, class, gaps
- [ ] Critique 5Q verbatim in analysis (Mode CRITIC / intake prompt)
- [ ] `<slug>_plan.md` — dump vs witness-link chain, phase order
- [ ] `<slug>_tz.md` with `Status: approved` (ask user)

**Then:** Phase 1 (or Phase 0 if build broken). Do not merge Intake and Phase 1 in one undirected coding spree.

---

## Phase 1 — Production mirror + component dump

**Goal:** Study production ACIR→circuit chain; copy it line-for-line into test helper; dump `FunctionFingerprint` per **component interval** that uses opcode witnesses.

**Pre-check:** approved `<slug>_tz.md` (or user skip intake).

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

## Review — Audit / Critic loop

**Goal:** No missing circuit-building stages; production parity verified; documented in `report.md`. When stuck, challenge the approach before more checklist churn.

**Child skill:** `.claude/skills/boomerang-validator-review/SKILL.md` (Mode AUDIT | Mode CRITIC)

**Mode AUDIT** (default final gate) — reviewer must flag as `[critical]`:

- dump/witness tests that do not trace to production `create_*_constraint` / verifier source
- reimplemented verifier logic in test instead of mirrored copy
- Phase 1 component map missing or dump tags not aligned with components
- Phase 3 witness-link validator run against a mirror-built circuit (or a mirror-proven validator run against a real build) without its own witness-link re-verification — gate-count parity does not imply witness-linkage parity

**Mode CRITIC** — spawn-critic 5Q on approach/blind spots/wasted effort; report answers verbatim to user. Map only ACIR-fidelity Q1 failures to `[critical]`; Q2–Q5 → Strategy Notes / `[info]`. Does not set Verdict PASS; follow with Mode AUDIT.

**Pass:** Mode AUDIT with `phase1_complete ∧ phase2_complete ∧ phase3_complete ∧ no [critical] in report.md`

---

## Deliver — PR

**Goal:** Ship validator work after AUDIT PASS when user asks for a PR (or commit+PR).

**Trigger:** Review Verdict PASS + explicit user request to open PR / create PR.

**Steps:**

1. Confirm `<slug>_tz.md` acceptance criteria met and `*_validation_report.md` Verdict PASS.
2. Base branch: `merge-train/barretenberg` (barretenberg work). Fetch before branch/push.
3. Commit only paths in TZ scope (named files / `git add` specific paths — not `git add -A`).
4. `gh pr create --base merge-train/barretenberg` with body:

```markdown
## Summary
- <bullets from TZ scope / acceptance>
- Review: <slug>_validation_report.md PASS

## Test plan
- [ ] cmake build `noir_programs_boomerang_values_tests`
- [ ] gtest filters from TZ
- [ ] Review AUDIT already PASS locally
```

Do **not** open PR before AUDIT PASS unless user explicitly overrides.

---

## How to detect existing work

| Signal | Stage |
|--------|-------|
| No `<slug>_analysis.md` / `_plan.md` / approved `_tz.md` for this opcode | **Intake** |
| Build broke right after a `next` merge/rebase | **0** |
| TZ approved; no component map, no mirrored executor, no `*_functions_analysis.txt` | **1** |
| Dump exists, no `*_witness_serialization.txt` / no SerializationParse test | **2** (early) |
| Serialization done, no primitive part map / primitive_start | **2** |
| Gate map + primitive_start, no `*_validation.hpp` / no WitnessLink tests | **3** |
| All three done, no PASS in `*_validation_report.md` | **Review** |
| AUDIT PASS + user wants PR | **Deliver** |

Legacy: if only `*_phase*_plan.md` exists (e.g. HONK), treat as Plan draft — still require `<slug>_tz.md` approved before **new** Phase work, or user skip intake.

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
Turn 0 — Intake: Analysis → Critique → Plan → TZ (approve)   [any ACIR opcode]
Turn A — Phase 1: trace production → component map → mirrored executor → parity → dump
Turn B — Phase 2: align witnesses → primitive part map → primitive_start
Turn C — Phase 3: large primitive FP chains + witness link tests + orchestrator
Turn D — Review loop until AUDIT PASS
Turn E — Deliver PR (only if user asks)
```

Do not merge Intake + all execute phases in one undirected diff unless user explicitly asks.
Do not start Turn A without approved TZ (or explicit skip).

---

## Agent behavior rules

1. **Announce stage** at start: Intake | Phase 0/1/2/3 | Review (AUDIT/CRITIC) | Deliver.
2. **Read child skill** completely before editing (Intake skill before any Phase 1 code).
3. **TZ first** for new opcode work — Analysis→Critique→Plan→TZ before dump/validate.
4. **Production line → test line** before any dump or witness work.
5. **One construction path** across Phase 1 and 2.
6. **Tests prove guesses** — gtest must pass before next phase.
7. **Final delivery** only after Review AUDIT PASS; PR only on user request.

Also respect: `.cursor/rules/acir-recursion-constraints.mdc` for recursion opcodes.

---

## Child skills map

| Stage | Skill | Path |
|-------|-------|------|
| Intake | `boomerang-validator-intake` | `.claude/skills/boomerang-validator-intake/SKILL.md` |
| 0 — Rebase repair | `boomerang-rebase-repair` | `.claude/skills/boomerang-rebase-repair/SKILL.md` |
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
