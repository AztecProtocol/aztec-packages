# HONK Validator Review

| Field | Value |
|-------|-------|
| Constraint | `HONK` (bare, `PROOF_TYPE::HONK`, non-ZK) |
| Review round | 4 |
| Mode | AUDIT |
| Phase 1 | complete |
| Phase 2 | complete |
| Phase 3 | complete |
| Verdict | PASS |

## Scope (round 4)

Re-AUDIT after fixing round-3 `[critical]` findings. Same file set as round 3, plus updated Rejects*/WitnessLink tests in `honk_recursion_validation.test.cpp`.

## Round 4 — fixes applied

- ~~Critical #1 (corruption suite incomplete)~~ **FIXED**: added `RejectsCorruptedHonkPreprocessor`, `RejectsCorruptedHonkSumcheck`, `RejectsCorruptedHonkShplemini`, `RejectsCorruptedHonkOutput`, `RejectsCorruptedHonkRecursionEndToEndRealAcirBuild` (real ACIR build, Sumcheck-region tamper → orchestrator `is_valid == false`). Full set now: VkDeserialize, Oink, Preprocessor, Sumcheck, Shplemini, KZG (deep offset), Output, E2E. Note: `CircuitChecker::check` throws `vector::_M_range_check` on this circuit size after tamper — assert FP/`is_valid` only (same as pre-existing Oink/VkDeserialize rejects).
- ~~Critical #2 (WitnessLink only group 0)~~ **FIXED**: `AcirHonkWitnessLinkInOink` loops all `NUM_COMMITMENT_GROUPS` (8) via `get_honk_commitment_group_witness_indices` + arith range intersection; still asserts `key_hash` in Oink poseidon2_ext window.

Verified: `--gtest_filter='...AcirHonkWitnessLinkInOink:...RejectsCorrupted*'` → **9/9 PASSED**.

## Findings (round 4)

- [info] `Oink::validate_oink` — `commitments_ok` still informative / not gating `is_valid`; WitnessLink now covers all eight groups + `key_hash`.
- [info] Phase 3 uses coarse whole-primitive FPs from Phase 1 dump; fine PRE_ETA aliases stubbed to `ARITH_TOTAL`.
- [info] Positive `ValidateHonk*` stage tests still use mirror `HonkValidatorContext`; integration path uses real build (`AcirHonkFingerprintsMatchConstants`, WitnessLink, E2E reject).
- [info] Arith `[0, 1709)` wrapper/pre-primitive outside cursor by design; multi-block coverage asserts cursor end == block size after Output.
- [info] `CircuitChecker::check` after selector corruption is unsafe on this builder (throws); do not reintroduce without fixing checker vs dyadic/trace sizing.

No open `[critical]`.

## Checklist results (round 4)

**Phase 1:** PASS — component map + mirrored executor + parity + dump tags.

**Phase 2:** PASS — serialization / gate dump / `primitive_start_arith=1709` / `first_primitive_part=VkDeserialize`.

**Phase 3:** PASS — cursor chain VkDeserialize→residual→Oink→Preprocessor→Sumcheck→Shplemini→KZG→Output; WitnessLink for Oink opcode parts; orchestrator + reject suite per large primitive + E2E.

## Verdict

**PASS** — `phase1 ∧ phase2 ∧ phase3 ∧ critical_remarks=∅`.

## Prior rounds

### Round 3 — FAIL

Two criticals: incomplete Rejects* set; WitnessLink only commitment group 0. Closed in round 4.

### Round 2 / 1

Historical PASS then superseded by Phase 3 cursor rewrite; see git history for full round-1/2 prose.
