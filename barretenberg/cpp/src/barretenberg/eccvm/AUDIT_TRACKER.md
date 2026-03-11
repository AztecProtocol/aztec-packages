# Veridise ECCVM Audit - Issue Tracker

Tracking document for Veridise audit findings related to the ECCVM subsystem.

Last updated: 2026-03-11

## ECCVM-Specific Issues

### CRITICAL

| ID | Title | Status | Fix Commit(s) | Notes |
|----|-------|--------|---------------|-------|
| V-BRTB-VUL-001 | Aggregated EC-operation constraints can cancel (`ecc_msm_relation_impl.hpp`) | FIXED | `e11d4ce90b` (PR #20349) | Split add/double/skew constraints into four individual accumulators instead of one combined accumulator. |
| V-BRTB-VUL-002 | `scalar_sum` can be initialized to arbitrary non-zero value (`ecc_wnaf_relation_impl.hpp`) | FIXED | `007fbb664f` (PR #19112), `7fb92e8cdf` (PR #20358) | Edge-case issues fixed via `lagrange_first`; `precompute_select` and `q_transition` explicitly constrained. |
| V-BRTB-VUL-003 | MSM accumulator can be arbitrarily reset by inserting inactive rows (`ecc_msm_relation_impl.hpp`) | FIXED | `9be42cc139` / `0cebefc6cf` (PR #20357) | Accumulator now propagates correctly when all phase selectors are 0. Corruption/failure tests added. |

### HIGH

| ID | Title | Status | Fix Commit(s) | Notes |
|----|-------|--------|---------------|-------|
| V-BRTB-VUL-004 | Inconsistent handling of points at infinity (`ecc_transcript_relation_impl.hpp`) | FIXED | `ffa9e2ce18` (PR #20356) | Added constraints ensuring point-at-infinity flag corresponds to `(0, 0)` coordinates. |
| V-BRTB-VUL-006 | Set relation assumes existence of z2 implies z1 (`ecc_set_relation_impl.hpp`) | FIXED | `c36a82fb05` (PR #20858) | Replaced hardcoded `transcript_pc - 1` with `transcript_pc - lookup_first` so pc offset adapts when `z1_zero == 1` and `z2_zero == 0`. |

### MEDIUM

| ID | Title | Status | Fix Commit(s) | Notes |
|----|-------|--------|---------------|-------|
| V-BRTB-VUL-007 | No-ops corrupt accumulator and corresponding flag (`ecc_transcript_relation_impl.hpp`) | FIXED | `4d2642da99` (PR #20849) | No-ops in transcript table now force the next accumulator to be 0. Corruption tests added. |

### LOW

| ID | Title | Status | Fix Commit(s) | Notes |
|----|-------|--------|---------------|-------|
| V-BRTB-VUL-009 | MSM add selectors not constrained to be boolean (`ecc_bools_relation_impl.hpp`) | FIXED | `8c8f8c1ec7` (PR #20359) | `msm_addX` selectors explicitly constrained to be boolean. |
| V-BRTB-VUL-010 | Cross-Family Tuple Hash Collisions in Set Relation (`ecc_set_relation_impl.hpp`) | FIXED | `ce2de2ad5f` (PR #20352) | Added domain separation for the multiset equality check. |
| V-BRTB-VUL-011 | Incorrect precomputed table can be created in witness generation (`precomputed_tables_builder.hpp`) | IN-PROGRESS | `86fc4b81b6` (current branch) | AUDITTODO added for point table ordering in `msm_builder.hpp`. Witness-generation-only issue (not a circuit soundness bug). |
| V-BRTB-VUL-012 | Set-relation tuple can be injected from inactive WNAF row (`ecc_set_relation_impl.hpp`) | FIXED | `007fbb664f` (PR #19112), `7fb92e8cdf` (PR #20358) | Fixed via `precompute_select` monotonicity constraint and `q_transition == 0` when `precompute_select == 0`. |

### WARNING

| ID | Title | Status | Fix Commit(s) | Notes |
|----|-------|--------|---------------|-------|
| V-BRTB-VUL-015 | Wrong, misleading or outdated documentation (multiple files) | IN-PROGRESS | `92d0490542`, `9af4ab3f56`, `64a0e3496e`, `5d913742d2`, `be80a8d06d`, `d209e77ac4` (current branch) | Comment corrections across ECCVM README, wnaf, transcript, msm relation files, transcript_builder, and eccvm_flavor. |
| V-BRTB-VUL-016 | Maintainability Issues (multiple files) | IN-PROGRESS | Various | Ongoing cleanup. |

---

## Non-ECCVM Issues (out of scope for this tracker)

These are included for completeness but are NOT tracked here:

| ID | Severity | Title | Domain |
|----|----------|-------|--------|
| V-BRTB-VUL-005 | HIGH | ECDSA issue | ECDSA |
| V-BRTB-VUL-008 | MEDIUM | Transcript/IPA domain separation | Transcript/IPA |
| V-BRTB-VUL-013 | LOW | IPA transcript curve params | IPA |
| V-BRTB-VUL-014 | LOW | IPA group generator | IPA |
| V-BRTB-VUL-017 | WARNING | IPA SRS validation | IPA |
| V-BRTB-VUL-018 | WARNING | WASM issue | WASM |
| V-BRTB-VUL-019 | WARNING | Grumpkin CRS | CRS |

---

## Key Branches

| Branch | Purpose |
|--------|---------|
| `rk/eccvm-external-audit-1-documentation` | VUL-015/016: Documentation fixes (current branch) |
| `rk/eccvm-external-audit-1-z1-zero-handling` | VUL-006: z1_zero handling fix |
| `rk/eccvm-external-audit-1-transcript-no-op` | VUL-007: Transcript no-op fix |
| `rk/eccvm-external-audit-1-set-domain-separation` | VUL-010: Set relation domain separation |
| `rk/eccvm-external-audit-1-constrain-precompute-select` | VUL-002/012: precompute_select constraint |
| `merge-train/barretenberg` | Integration branch where fixes land |

## Summary

- **FIXED**: 9 of 12 ECCVM-specific issues (VUL-001, 002, 003, 004, 006, 007, 009, 010, 012)
- **IN-PROGRESS**: 3 of 12 ECCVM-specific issues (VUL-011, 015, 016)
- **OPEN**: 0
