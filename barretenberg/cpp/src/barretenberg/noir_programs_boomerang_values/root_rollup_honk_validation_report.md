# ROOT_ROLLUP_HONK Validator Review

| Field | Value |
|-------|-------|
| Constraint | `ROOT_ROLLUP_HONK` |
| Builder | `UltraCircuitBuilder` |
| Review round | 11 |
| Mode | AUDIT (ROOT cursor handoff after ROLLUP cursor-migrate) |
| Phase 1 | complete (prior) |
| Phase 2 | complete — `discover_rollup_vk_hash_in_segment` off Oink squeezes |
| Phase 3 | complete — `validate_rollup_honk_recursion_cursor_from` + analyzer handoff |
| Verdict | **PASS** |

## Scope (round 11)

Implement ROOT multi-opcode cursor with explicit `BlockCursor` starts by `opcode_index`. Keep single-`ROLLUP_HONK` on existing pin@1709 cursor. Drop `squeeze_legacy` from dispatcher.

## Green evidence (gtest, 2026-07-27)

Filter:

```text
RollupHonkIpaFullVerifyFastValidationTests.ValidateRootRollupOpcodes
RollupHonkIpaFullVerifyTests.AcirRootRollupHonkFingerprintsMatchConstants
RollupHonkIpaFinalizeTests.ValidateBothRootRollupOpcodesBeforeIpa
RollupHonkIpaFinalizeTests.RootRollupHonkMergesTwoRollupConstraints
```

Result: **4 PASSED / 0 FAILED**. ROLLUP regression `AcirRollupHonkFingerprintsMatchConstants` also green.

## Findings

- ~~[critical] dual dispatch HONK@1709 / squeeze_legacy~~ — fixed: `ROOT_ROLLUP_HONK` → `cursor_from(starts, opcode_index)`; `ROLLUP_HONK` → existing `validate_rollup_honk_recursion_cursor`.
- ~~[critical] squeeze-based `discover_rollup_vk_hash_in_segment`~~ — fixed: VkDeserialize `key[3]` + PRE_ETA at `region_end` + `key_hash` poseidon.
- ~~[critical] analyzer ROOT per-opcode fail~~ — fixed: `rollup_cursor_handoff` updated from `handoff_end` after each ROOT opcode.
- [info] `shplemini_kzg_commitments` remain informative (stale SINGLE_COMMITMENT receive-FP); WitnessLink owns limbs.
- [info] IPA `full_verify` / `DefaultIO` FPs may still drift under cursor-migrate; analyzer gates on opcodes + accumulate only this round. Accumulate FPs + `ROOT_ROLLUP_OPCODES_DELTA` / `FINALIZE_DELTA` refreshed from dumps. `AcirRootRollupHonkFingerprintsMatchConstants` hard-asserts opcodes + accumulate; full_verify/DefaultIO soft.

## Design (shipped)

1. `validate_rollup_honk_recursion_cursor_from` — Rollup `VkDeserialize(opcode_index, nnf_start)` → assert arith handoff (skip when op0/`starts.arith==0`) → Oink cursor with `ARITH_TOTAL_OP0/OP1` → Preprocessor…KZG(`opcode_index`, `starts.memory`) → Rollup Output → IPA pass-through.
2. Analyzer supplies/updates `rollup_cursor_handoff`.
3. Refreshed ROOT VkDeserialize ARITH_OP0=4450 / OP1=2632; opcode aggregate FPs; KZG `ARITH_TOTAL_OP1`; IPA accumulate FPs + squeeze count 30.

## Checklist results (round 11)

**Phase 1–2:** OK for cursor-migrate (no Oink squeezes in entry anchors).

**Phase 3 / analyzer:** PASS — 4/4 focused ROOT integration filters green; single ROLLUP cursor path preserved.

## Verdict

**PASS** — `critical_remarks = ∅`.

## Prior rounds

### Round 10

FAIL — shared dispatcher after ROLLUP cursor-migrate broke ROOT (HONK@1709 / squeeze_legacy). Superseded by round 11.

### Rounds 1–9

Historical PASS at round 9. See git history.
