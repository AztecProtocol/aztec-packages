# HONK_ZK Validator Review

| Field | Value |
|-------|-------|
| Constraint | `HONK_ZK` |
| Review round | 6 |
| Mode | AUDIT |
| Phase 1 | complete |
| Phase 2 | complete |
| Phase 3 | complete |
| Verdict | **PASS** |

## Scope (round 6)

Re-AUDIT after fixing round-5 `[critical]` (KZG→Output poseidon cursor handoff). Cursor-migrate Phase 1–3 under approved TZ (supersedes pre-Intake round-4 squeeze-era PASS).

## Round 6 — fix applied

- ~~[critical] `KZGValidationResult` missing `poseidon2_*_end` pass-through~~ **FIXED**: restored cursor fields; `validate_kzg` copies Shplemini poseidon ends (no empty `FunctionFingerprint` stubs). `graph_description_acir.cpp` log no longer references removed `poseidon2_*_ok` on KZG.

Verified: `AcirHonkZKFingerprintsMatchConstants`, `AcirHonkZKWitnessLinkInOink`, `RejectsCorruptedHonkZK*` → **PASSED**.

## Findings (round 6)

- [info] `Oink::validate_oink` — `commitments_ok` / `validate_oink_commitment` not gating `is_valid`; `AcirHonkZKWitnessLinkInOink` covers all 9 proof positions (Gemini + 8 Ultra) + `key_hash` in Oink poseidon2_ext range.
- [info] Phase 3 uses coarse whole-primitive FPs (Sumcheck includes ALPHA_POWERS+Libra+rounds in one window — no dual-shape). Fine-grained PRE_ETA aliases stubbed to `ARITH_TOTAL` for Phase 1 fork measurement only.
- [info] Libra commitment limbs appear in component map as `[WITNESS]` serialization but are not separate Phase 2 aligned table rows; WitnessLink scope matches Phase 2 table (VkDeserialize key[3..] via `validate_vk_deserialize_region` commitments_ok; Oink groups via WitnessLink).
- [info] `graph_description_acir.cpp:process_honk_zk_recursion_constraint` still mis-labels vk_deserialize failure as "Oink stage" (early return leaves default `oink`); returns `result.is_valid` which includes Output + multi-block coverage — same pattern as bare HONK.
- [info] Positive `ValidateHonkZK*` stage tests use mirror `HonkZKValidatorContext`; FingerprintsMatch / WitnessLink / E2E Reject use real `create_honk_recursion_constraints`.
- [info] Arith `[0, 1709)` pre-primitive outside cursor by design; coverage asserts cursor end == block size after Output.

No open `[critical]`.

## Checklist results (round 6)

**Phase 1:** PASS — `honk_zk_component_map.txt` production order + `[WITNESS]` columns; mirrored `run_*_step` (Sumcheck ctor before Libra); `HonkZKMirroredBuildMatchesRealAcirCircuit`; dump `honk_zk_functions_analysis.txt` tags Oink|Preprocessor|Sumcheck|Shplemini|KZG|Output; Step 0 fork `cursor-migrate` / `squeeze_gate_count=1`.

**Phase 2:** PASS — `AcirHonkZKWitnessSerializationParse` → `honk_zk_witness_serialization.txt` (Rule A/B/C; Gemini=pos0); gate dump; `AcirHonkZKPrimitiveStartDiscovery` pins `primitive_start_arith=1709`, `first_primitive_part=VkDeserialize`, `serialization_end_arith=0`; same real-chain setup as Phase 1.

**Phase 3:** PASS — cursor chain VkDeserialize@1709 + residual79 → Oink@4451 → Preprocessor → Sumcheck → Shplemini → KZG → Output; orchestrator multi-block coverage; WitnessLink for Phase 2 Oink-linked parts; Rejects for VkDeserialize/Oink/Preprocessor/Sumcheck/Shplemini/KZG/Output + E2E real-build; no `find_fingerprint_range_*` / dual Sumcheck in validate path.

## Verdict

**PASS** — `phase1 ∧ phase2 ∧ phase3 ∧ critical_remarks=∅`.

---

## Prior rounds

### Round 5 — FAIL

Critical: removed zero poseidon FP stubs and also dropped KZG poseidon cursor fields → Output compile break. Fixed in round 6.

### Rounds 1–4 (historical)

Squeeze-era AUDIT (TOTAL_SQUEEZE_GATES=39 path, ALPHA_POWERS dual-shape, Phase 2 artifacts). Superseded by re-Intake + cursor-migrate TZ 2026-07-27. Full prose in git history.
