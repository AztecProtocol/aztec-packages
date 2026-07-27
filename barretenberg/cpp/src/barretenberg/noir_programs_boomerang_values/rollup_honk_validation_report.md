# ROLLUP_HONK Validator Review

| Field | Value |
|-------|-------|
| Constraint | `ROLLUP_HONK` (`PROOF_TYPE::ROLLUP_HONK`, Ultra + RollupIO) |
| Review round | 2 |
| Mode | AUDIT |
| Phase 1 | complete |
| Phase 2 | complete |
| Phase 3 | complete |
| Verdict | PASS |

## Scope (round 2)

Re-AUDIT after fixing round-1 `[critical]` (incomplete Rejects*). Same Phase 1–3 cursor-migrate baseline.

## Round 2 — fixes applied

- ~~Critical #1 (corruption suite incomplete)~~ **FIXED**: added `RejectsCorruptedRollupHonkPreprocessor`, `RejectsCorruptedRollupHonkSumcheck`, `RejectsCorruptedRollupHonkShplemini`, `RejectsCorruptedRollupHonkKZG` (selector tamper in each large-primitive arith window → stage `is_valid == false`). Full set now: VkDeserialize, Oink, Preprocessor, Sumcheck, Shplemini, KZG, Output, E2E.

Verified: `--gtest_filter='...RejectsCorruptedRollupHonk*'` → **8/8 PASSED**.

## Findings (round 2)

- [info] `validate_rollup_honk_recursion_cursor` — `shplemini_kzg_commitments` receive-FP scan informative (stale SINGLE_COMMITMENT NNF); WitnessLink covers Oink groups + IPA claim.
- [info] Full-block coverage not gated into `honk.is_valid`; `create_circuit(has_ipa_claim)` appends finalize after Output (IPA accumulate + RollupIO::set_public). Phase 1 dump ends at Output; finalize PI-export in component_map, not FP-chained this TZ (ROOT full_verify out of scope).
- [info] IPA tail = layout/pass-through only (`ipa_tail0_arith=none`); WitnessLink covers IPA claim in Output.
- [info] Squeeze-era `RejectsCorruptedHonkCommitment` SKIP under fork=cursor-migrate; superseded by `RejectsCorruptedRollupHonkOink`.
- [info] VkDeserialize key[3..] witness overlap checked inside `validate_vk_deserialize_region` (`commitments_ok`); Oink `key_hash` + 8 commitment groups via `AcirRollupHonkWitnessLinkInOink`.

No open `[critical]`.

## Checklist results (round 2)

**Phase 1:** PASS — component_map, mirrored executor, parity, dump tags Oink…Output, fork=`cursor-migrate` / `squeeze_gate_count=1`.

**Phase 2:** PASS — serialization + gate map; `primitive_start_arith=1709`; `first_primitive_part=VkDeserialize`; `io_prefix=14`.

**Phase 3:** PASS — cursor VkDeserialize@1709 → residual → Oink@4451 → Preprocessor → Sumcheck → Shplemini → KZG → Rollup Output → IPA layout; WitnessLink InOink + InOutputIpaClaim; FingerprintsMatch + StaticAnalyzerAccepts; Rejects per large primitive + E2E.

## Verdict

**PASS** — `phase1 ∧ phase2 ∧ phase3 ∧ critical_remarks=∅`.

## Prior rounds

### Round 1 — FAIL

One critical: Rejects suite missing Preprocessor / Sumcheck / Shplemini / KZG. Closed in round 2.
