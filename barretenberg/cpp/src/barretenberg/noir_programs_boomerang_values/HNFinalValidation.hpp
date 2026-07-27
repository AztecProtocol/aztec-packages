#pragma once

#include "barretenberg/constants.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/noir_programs_boomerang_values/hypernova_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#include "barretenberg/noir_programs_boomerang_values/sha256_circuit_helpers.hpp"

#include <array>
#include <vector>

// HN::FINAL (hiding kernel) decider + batch-merge validation. The shared fold-core (F2) is validated by
// validate_hn_shared_fold_core through claim_batching; everything after it -- the FINAL-only decider (F3 =
// Shplemini + KZG, hypernova_decider_verifier.cpp:verify_proof), the delayed batch-merge verifier (F5,
// goblin.recursively_verify_batch_merge, Shplonk+KZG), and the HidingKernelIO output tail -- collapses to
// a SINGLE monolithic FunctionFingerprint chain, for the same reason RESET's Oink/MainSC/MLB stages did:
// post-merge, only one transcript challenge across the entire ~9147-gate F3+F5+tail region still converts
// to `fq` (bigfield, squeeze-detectable) -- confirmed empirically by AcirHNFinalPostSharedCoreSqueezeDiscovery
// (36 total squeezes for FINAL vs RESET's 35 -- exactly +1, not the ~87 the old per-window D0-D4/HASH_i
// model assumed). The old squeeze-delimited window arrays (D0-D4, HASH_0..HASH_55, per-stage tails) are
// gone; do not resurrect per-window fingerprints here without first re-confirming squeeze visibility.

namespace HNVerification {
using namespace recursion_helpers;
namespace HNFinalValidation {

// [shared_end .. shared_end+9125): decider (Shplemini/Gemini/Shplonk/KZG) + batch-merge (subtable receive,
// hash-consistency, degree-check, Shplonk/KZG) body, through the one squeeze-visible challenge that
// survives in this region. Combined-span check, like RESET's Stage-1/Stage-4 fingerprints -- cannot
// independently attribute sub-ranges to decider vs batch-merge without a full production trace of both
// verifiers; open follow-up if finer granularity is ever needed.
inline constexpr FunctionFingerprint HN_FINAL_DECIDER_AND_MERGE_ARITH = {
    9125, 0xaefb6d4a5d80a6bbULL, 0x6d78dd22862ee89aULL, 20
};
// Trailing 22 gates after the one surviving squeeze: pairing-aggregate finalization + HidingKernelIO
// output. Own fingerprint so a corruption there isn't silently absorbed into the body check above.
inline constexpr FunctionFingerprint HN_FINAL_POST_MERGE_TAIL_ARITH = {
    22, 0xe1afa2edd58e5946ULL, 0xb901f84f6ead6ee2ULL, 20
};
// Poseidon2 span [8025 .. 20200): decider Fiat-Shamir absorption + batch-merge's own HASH_idx sponge
// rounds (real Poseidon2 permutations regardless of fr/fq challenge typing). One monolithic fingerprint,
// same rationale as the arith body above.
inline constexpr FunctionFingerprint HN_FINAL_DECIDER_AND_MERGE_POSEIDON2 = {
    12175, 0x24491dfe40c3c6d1ULL, 0xed88adb3d0fff0b3ULL, 20
};

struct HNFinalDeciderMergeValidationResult {
    size_t arith_start = 0;
    size_t arith_end = 0;
    size_t poseidon2_start = 0;
    size_t poseidon2_end = 0;
    bool valid = false;
};

// -- F3 ecc_op selector coverage ----------------------------------------------------
//
// The decider's KZG/Shplemini pairing-point reduction (PCS::reduce_verify_batch_opening_claim,
// hypernova_decider_verifier.cpp) routes its EC group operations through the Goblin ecc_op block, not
// through arithmetic/elliptic. That adds ~62 ecc_op gates over plain HN that neither validate_hn_baseline
// (arith+poseidon2 only) nor the decider window chain (arith+poseidon2 only) ever inspect. The trailing
// F6 hiding mask covers only the last HN_FINAL_MASK_ROWS rows, so without this stage the decider's ecc_op
// gates are entirely unfingerprinted.
//
// We fingerprint the whole non-mask ecc_op region [0, size - HN_FINAL_MASK_ROWS) with the same
// selector-hash mechanism used for the non-arithmetic blocks (sha256_helpers::compute_selector_hash over
// block.get_selectors()). Selectors are construction-deterministic (independent of the random mock proof
// coordinate values, which live in the wires), so the hash is stable across runs and catches structural /
// selector corruption of the decider ecc_op gates. The trailing mask rows are excluded (their random-op
// wires are validated structurally by validate_hn_final_mask; HN_FINAL_MASK_ROWS is defined below).
/**
 * @brief Selector-hash the decider's ecc_op gates over `[start, end)` (exclusive end).
 *
 * @param builder Populated FINAL kernel circuit.
 * @param start   First ecc_op row to hash (inclusive).
 * @param end     One past the last ecc_op row to hash; `end <= start` hashes as empty (returns 0).
 * @return        `sha256_helpers::compute_selector_hash` over the given row range.
 */
template <typename CircuitBuilder> size_t hn_ecc_op_selector_hash(CircuitBuilder& builder, size_t start, size_t end)
{
    // compute_selector_hash takes an inclusive end index; guard the empty range.
    if (end <= start) {
        return 0;
    }
    return sha256_helpers::compute_selector_hash(0, builder.blocks.ecc_op, start, end - 1);
}

struct HNFinalEccOpValidationResult {
    size_t ecc_op_size = 0;
    size_t hashed_rows = 0; // = ecc_op_size - HN_FINAL_MASK_ROWS
    size_t selector_hash = 0;
    bool valid = false;
};

/**
 * @brief Validate the combined FINAL-only decider (F3) + batch-merge (F5) + HidingKernelIO tail region as
 * a two-stage FunctionFingerprint chain (arith) plus one poseidon2 fingerprint, anchored right after the
 * shared fold-core's claim_batching boundary.
 *
 * @param shared_arith_end     Arithmetic cursor where the shared fold-core ended (claim_batching+1).
 * @param shared_poseidon_end  Poseidon2 cursor where the shared fold-core ended.
 */
template <typename CircuitBuilder>
HNFinalDeciderMergeValidationResult validate_hn_final_decider_merge(CircuitBuilder& builder,
                                                                    size_t shared_arith_end,
                                                                    size_t shared_poseidon_end)
{
    HNFinalDeciderMergeValidationResult result;
    auto& arith = builder.blocks.arithmetic;
    auto& poseidon2 = builder.blocks.poseidon2;

    result.arith_start = shared_arith_end;
    size_t arith_cursor = shared_arith_end;
    if (arith_cursor + HN_FINAL_DECIDER_AND_MERGE_ARITH.gate_count > arith.size() ||
        !matches_fingerprint_at(builder, arith, arith_cursor, HN_FINAL_DECIDER_AND_MERGE_ARITH)) {
        return result;
    }
    arith_cursor += HN_FINAL_DECIDER_AND_MERGE_ARITH.gate_count;

    if (arith_cursor + HN_FINAL_POST_MERGE_TAIL_ARITH.gate_count > arith.size() ||
        !matches_fingerprint_at(builder, arith, arith_cursor, HN_FINAL_POST_MERGE_TAIL_ARITH)) {
        return result;
    }
    arith_cursor += HN_FINAL_POST_MERGE_TAIL_ARITH.gate_count;
    result.arith_end = arith_cursor;
    if (result.arith_end != arith.size()) {
        return result; // total coverage required -- no uncovered gap left in the arithmetic block
    }

    result.poseidon2_start = shared_poseidon_end;
    size_t poseidon_cursor = shared_poseidon_end;
    if (poseidon_cursor + HN_FINAL_DECIDER_AND_MERGE_POSEIDON2.gate_count > poseidon2.size() ||
        !matches_fingerprint_at(builder, poseidon2, poseidon_cursor, HN_FINAL_DECIDER_AND_MERGE_POSEIDON2)) {
        return result;
    }
    poseidon_cursor += HN_FINAL_DECIDER_AND_MERGE_POSEIDON2.gate_count;
    result.poseidon2_end = poseidon_cursor;
    if (result.poseidon2_end != poseidon2.size()) {
        return result; // total coverage required
    }

    result.valid = true;
    return result;
}

// -- F6 hiding mask (trailing ecc_op) -----------------------------------------------

// The hiding kernel masks the op queue at the END of the ecc_op block: hide_op_queue_content_in_hiding
// (chonk.cpp:325) appends 2x queue_ecc_random_op = 4 rows. Unlike TAIL's front prelude, this is a trailing
// mask. Random-op values are Fq::random_element(), not exposed in Chonk state, so this is validated by the
// row-position structural signature (2nd row of each op pair carries a non-zero op wire), matching
// validate_hn_tail_masking_prelude's random_ops_valid logic.
inline constexpr size_t HN_FINAL_MASK_ROWS = 4;

struct HNFinalMaskValidationResult {
    size_t mask_start_row = 0;
    bool valid = false;
};

/**
 * @brief Validate the trailing F6 hiding mask: 2 random ops (4 ecc_op rows) at the block's tail.
 *
 * @param builder FINAL kernel circuit; `builder.blocks.ecc_op` must hold at least `HN_FINAL_MASK_ROWS` rows.
 * @return        Mask start row + validity (2nd row of each random-op pair carries a non-zero op wire).
 */
template <typename CircuitBuilder> HNFinalMaskValidationResult validate_hn_final_mask(CircuitBuilder& builder)
{
    HNFinalMaskValidationResult result;
    auto& block = builder.blocks.ecc_op;
    if (block.size() < HN_FINAL_MASK_ROWS) {
        return result;
    }
    const size_t base = block.size() - HN_FINAL_MASK_ROWS;
    result.mask_start_row = base;

    const auto zero = bb::fr::zero();
    // Two random ops at [base, base+1] and [base+2, base+3]; the 2nd row of each carries a non-zero op wire
    // (the property unique to random ops, per the TAIL prelude discovery).
    result.valid =
        builder.get_variable(block.w_l()[base + 1]) != zero && builder.get_variable(block.w_l()[base + 3]) != zero;
    return result;
}

// -- F3 ecc_op selector coverage (validator) ----------------------------------------

// Pinned by AcirHNFinalEccOpSelectorHashDump (determinism proven across two independent builds).
// Re-derived 2026-07-26: a later MAX_APPS_PER_KERNEL bump (3->5, CHONK_MAX_NUM_CIRCUITS 51->56, see
// HN_FINAL_BATCH_MERGE_MAX_MERGE_SIZE's static_assert) grew the batch-merge subtable/merged column count,
// and with it this block, from the 2026-07-21 pin (668) to 726 rows -- re-pin whenever
// HN_FINAL_BATCH_MERGE_MAX_MERGE_SIZE's static_assert value changes, don't assume this stays in sync.
inline constexpr size_t HN_FINAL_ECC_OP_SIZE = 726;
inline constexpr size_t HN_FINAL_ECC_OP_SELECTOR_HASH = 0xa717495b6fb82aecULL;

/**
 * @brief Validate the ecc_op block's selector hash over the non-mask region `[0, size - HN_FINAL_MASK_ROWS)`.
 *
 * Covers the decider's EC group operations (Goblin ecc_op gates from the KZG/Shplemini pairing reduction),
 * which are invisible to the arith/poseidon2 fingerprints. Pins both the block size and the selector hash.
 *
 * @param builder FINAL kernel circuit.
 * @return        Block size, hashed-row count, selector hash, and validity against the pinned constants.
 */
template <typename CircuitBuilder> HNFinalEccOpValidationResult validate_hn_final_ecc_op(CircuitBuilder& builder)
{
    HNFinalEccOpValidationResult result;
    auto& block = builder.blocks.ecc_op;
    result.ecc_op_size = block.size();
    if (block.size() < HN_FINAL_MASK_ROWS) {
        return result;
    }
    result.hashed_rows = block.size() - HN_FINAL_MASK_ROWS;
    result.selector_hash = hn_ecc_op_selector_hash(builder, 0, result.hashed_rows);
    result.valid =
        (result.ecc_op_size == HN_FINAL_ECC_OP_SIZE) && (result.selector_hash == HN_FINAL_ECC_OP_SELECTOR_HASH);
    return result;
}

// -- Full HIDING (HN_FINAL) kernel validator ----------------------------------------

// 95 squeezes total. The shared fold-core (F2) runs through the claim_batching squeeze sq[76]; the
// remaining 18 squeezes sq[77..94] plus the KZG/kernel-IO tail are the FINAL-only decider (F3).
// HN_HIDING_DECIDER_FIRST/HN_HIDING_EXTRA_SQUEEZES are retained for the older gap-based diagnostics; the
// real F2/F3 boundary is HN_SQUEEZE_CLAIM_BATCHING.
static constexpr size_t HN_HIDING_TOTAL_SQUEEZES = 148;
static constexpr size_t HN_HIDING_EXTRA_SQUEEZES = 5;
static constexpr size_t HN_HIDING_DECIDER_FIRST = 90; // sq index of first decider squeeze (legacy)

struct HNHidingValidationResult {
    HNVerification::HNBaselineValidationResult baseline; // F2: shared fold-core through claim_batching
    HNFinalDeciderMergeValidationResult decider_merge;   // F3+F5+tail: decider + delayed batch-merge + IO tail
    HNFinalEccOpValidationResult ecc_op;                 // F3+F5: decider + batch-merge ecc_op selectors
    HNFinalMaskValidationResult mask;                    // F6: trailing ecc_op hiding mask
    bool all_valid = false;
};

/**
 * @brief Validate a HIDING (HN_FINAL) kernel circuit via a contiguous FunctionFingerprint cursor chain
 * (hn_cursor_chaining_plan.md) -- no transcript-squeeze-count gate.
 *
 * Three parts:
 *   F2 -- the RESET/FINAL-shared fold-core through claim_batching (validate_hn_shared_fold_core).
 *   F3+F5+tail -- the FINAL-only decider (Shplemini/KZG) + delayed batch-merge (Shplonk/KZG) + the
 *         HidingKernelIO output tail, a two-stage arith fingerprint chain plus one poseidon2 fingerprint
 *         anchored right where F2 ended (validate_hn_final_decider_merge).
 *   F6 -- the trailing hiding mask on the ecc_op block (validate_hn_final_mask).
 *
 * @param constraint  Optional ACIR constraint for the vk_hash anchor (see validate_hn_shared_fold_core).
 */
template <typename FF, typename CircuitBuilder>
HNHidingValidationResult validate_hn_hiding(CircuitBuilder& builder,
                                            cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                            const acir_format::RecursionConstraint* constraint = nullptr)
{
    HNHidingValidationResult result;

    // F2: shared fold-core through claim_batching.
    result.baseline = HNVerification::validate_hn_shared_fold_core<FF>(builder, analyzer, constraint);
    if (!result.baseline.mlb.valid) {
        return result;
    }

    // F3+F5+tail: decider + delayed batch-merge + HidingKernelIO output, anchored where F2 ended.
    result.decider_merge = validate_hn_final_decider_merge(
        builder, result.baseline.shared_fold_core_arith_end, result.baseline.poseidon2_cursor_end);
    if (!result.decider_merge.valid) {
        return result;
    }

    // F3+F5 (ecc_op): the decider's KZG/Shplemini pairing reduction and the batch-merge primitive's own
    // subtable/merged-column commitments both emit EC group ops in the Goblin ecc_op block that the
    // arith/poseidon2 window chains never inspect. Cover them via the ecc_op selector hash.
    result.ecc_op = validate_hn_final_ecc_op(builder);
    if (!result.ecc_op.valid) {
        return result;
    }

    // F6: trailing hiding mask on the ecc_op block.
    result.mask = validate_hn_final_mask(builder);
    if (!result.mask.valid) {
        return result;
    }

    result.all_valid = true;
    return result;
}

/**
 * @brief `validate_hn_hiding` convenience overload: builds its own `bb::fr` analyzer for `builder`.
 */
template <typename CircuitBuilder>
HNHidingValidationResult validate_hn_hiding(CircuitBuilder& builder,
                                            const acir_format::RecursionConstraint* constraint = nullptr)
{
    cdg::StaticAnalyzer_<bb::fr, CircuitBuilder> analyzer(builder, false);
    return validate_hn_hiding<bb::fr>(builder, analyzer, constraint);
}

} // namespace HNFinalValidation
} // namespace HNVerification
