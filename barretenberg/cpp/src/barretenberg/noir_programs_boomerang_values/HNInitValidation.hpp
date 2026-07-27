#pragma once

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/noir_programs_boomerang_values/HNOinkValidationCommon.hpp"
#include "barretenberg/noir_programs_boomerang_values/hypernova_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"

#include <functional>
#include <optional>
#include <vector>

namespace HNVerification {
using namespace recursion_helpers;
namespace HNInitValidation {

// vk_hash anchor profile, from AcirHNInitVkHashProfileDiscovery. No ACIR key/key_hash witness reaches
// the arithmetic block, so the anchor is poseidon-only and the arith fingerprint is empty (same shape as
// RESET_VK_HASH_PROFILE); `validate_vk_hash_anchor` skips its arith search when gate_count == 0.
// The poseidon2 span is byte-identical to RESET's -- both hash the same VK shape -- so it is aliased
// rather than duplicated. It sits at poseidon2[0..1276) here, vs [300..1576) on RESET.
inline constexpr FunctionFingerprint INIT_VK_HASH_ARITH = { 0, 0, 0, 0 };
inline constexpr FunctionFingerprint INIT_VK_HASH_POSEIDON2_EXT = RESET_VK_HASH_POSEIDON2;
// Never compared on the Mega path: `validate_vk_hash_anchor` aliases both poseidon2_external and
// poseidon2_internal to the merged `builder.blocks.poseidon2`, so the internal hop it would gate is
// unreachable. Aliased to the external fingerprint, matching RESET_VK_HASH_PROFILE.
inline constexpr FunctionFingerprint INIT_VK_HASH_POSEIDON2_INT = INIT_VK_HASH_POSEIDON2_EXT;

// ── Cursor-chain fingerprints (AcirHNInitCursorChainDiscovery) ──
// Contiguous coverage: arith [0..4363) and poseidon2 [0..5400). Same stage split as RESET's chain
// (head / pre-batching padding / N batching windows / tail), because INIT runs the same
// Oink → gate_challenge → Sumcheck → batching pipeline. Post-merge every Oink and Sumcheck challenge is
// `fr`-typed (StdlibCodec::convert_full_challenge -- zero gates), so only the batching-phase `fq`
// challenges leave a squeeze-detectable decompose gate: 28 survive, versus the 61 the retired
// squeeze-index model expected.

// [0..2207): Oink + gate_challenge + Main Sumcheck's 24-round relation arithmetic, ending on the first
// surviving squeeze. Smaller than RESET's 2602-gate equivalent because INIT verifies App instances
// (MegaAppRecursiveFlavor: NUM_BUS_COLUMNS=1, NUM_UNSHIFTED_ENTITIES=52) rather than kernel instances.
// Per-round sub-boundaries are not fingerprinted individually -- no squeeze marker sub-divides them.
inline constexpr FunctionFingerprint INIT_OINK_MAINSC_LIVE_ARITH = {
    2207, 0x69f86c376e4cdecfULL, 0x64be0d7ed5b057ULL, 20
};
// [2207..3594): the same 1387-gate selector-zero pre-batching padding RESET has (byte-identical
// fingerprint, so aliased). Root emitter still unidentified -- see RESET_PRE_BATCHING_PADDING_ARITH.
inline constexpr FunctionFingerprint INIT_PRE_BATCHING_PADDING_ARITH = RESET_PRE_BATCHING_PADDING_ARITH;
// [3594..4114): 26 identical 20-gate batching-phase `fq` challenge windows, byte-identical to RESET's
// window template. The count differs from RESET's 33 because the batching challenge labels scale with
// the instance flavor's entity counts (get_hypernova_batching_challenges over NUM_UNSHIFTED/SHIFTED_ENTITIES).
inline constexpr FunctionFingerprint INIT_BATCHING_CHALLENGE_WINDOW_ARITH = RESET_BATCHING_CHALLENGE_WINDOW_ARITH;
static constexpr size_t INIT_NUM_BATCHING_CHALLENGE_WINDOWS = 26;
// [4114..4363): tail after the last batching squeeze -- batched evaluation dot-products, the output
// accumulator hash, the default databus commitments for unfilled app slots, and KernelIO's public-input
// plumbing. Far shorter than RESET's 875-gate equivalent because a single-app INIT skips multilinear
// batching entirely (HypernovaFoldingVerifier::finalize short-circuits at claims.size() == 1), so no MLB
// alpha or MLB Sumcheck gates appear here. This span grows with app count; see the N>=2 note on validate().
inline constexpr FunctionFingerprint INIT_POST_BATCHING_TAIL_ARITH = {
    249, 0x759410a0cce32760ULL, 0x1e74fdadc1610f23ULL, 20
};
// poseidon2 [1276..5400): everything after the vk_hash anchor span.
inline constexpr FunctionFingerprint INIT_POSEIDON2_TAIL = { 4124, 0xdaf56faae2628656ULL, 0xad62fb683587532cULL, 20 };

// vk_hash span on the witness-builder production mirror (`vk->hash_with_origin_tagging` plus the
// transcript absorb and vk_and_hash assert). A different, larger region than the ACIR anchor above --
// pinned by HNInitOinkFingerprintMatch so mirror/production parity stays checked.
inline constexpr FunctionFingerprint INIT_MIRROR_VK_HASH_ARITH = {
    149, 0x18aff961654ecccfULL, 0x2bd8e61084090a3aULL, 20
};

using HNOinkValidation::COMMITMENT_RECEIVE_ARITH;

// Monolithic pre-eta transcript-absorption chain (Stage 4c, 2026-07-13): replaces the stale
// 16x5-gate COMMITMENT_RECEIVE_ARITH model. Empirical witness trace (HNInitPreEtaWitnessTrace)
// confirmed the span [vk_hash.arith_end, squeeze[0]+1) is 1 is_fix_witness_gate (accumulator init)
// followed by is_transcript_add_gate absorptions of every public input and pre-eta commitment fr
// limb (protocol-fixed count for this kernel type, not per-witness-value-dependent) -- from
// hn_init_coarse_functions_analysis.txt via HNInitCoarseFingerPrintDump.
inline constexpr FunctionFingerprint INIT_PRE_ETA_ARITH = { 76, 0xab8b62289f00b3fbULL, 0xdf5657fbee78e62cULL, 20 };

// Inter-squeeze OINK window retained for HNInnerValidation's C1 path, which aliases it.
inline constexpr FunctionFingerprint OINK_BETA_TO_ALPHA_ARITH = {
    98, 0x1e092eca9c65aadcULL, 0x89704a7e6b8f9403ULL, 20
};
inline constexpr FunctionFingerprint OINK_BETA_TO_ALPHA_POSEIDON2_EXT = {
    2377, 0x840b6b73357db138ULL, 0xa1e5c4d89792c4c4ULL, 20
};
inline constexpr FunctionFingerprint OINK_BETA_TO_ALPHA_POSEIDON2_INT = {
    3455, 0x899264eaceb0c538ULL, 0xcd3f8047c368308dULL, 20
};

// No longer consumed by this file's own validate() (see INIT_PRE_ETA_ARITH above) -- kept because
// HNInnerValidation.hpp's loop1/C1 path still aliases and uses it (validate_loop1_micro_oink),
// pending that path's own re-derivation.
static constexpr size_t INIT_NUM_PRE_ETA_COMMITMENTS = 16;
static constexpr size_t INIT_NUM_POST_ETA_COMMITMENTS = 3;
static constexpr size_t INIT_NUM_POST_BETA_COMMITMENTS = 4;

struct IvQueueExpectedVk {
    const std::vector<bb::fr>& fields; ///< Expected VK field elements (from IVC queue at setup time).
    const bb::fr& hash;                ///< Expected VK hash matching constraint.key_hash witness.
};

struct IvQueueValidationResult {
    bool checked = false;
    bool proof_type_matches = false;
    bool vk_witnesses_match = false;
    bool key_hash_matches = false;
    bool public_inputs_empty = false;
    bool proof_empty = false;
    bool is_kernel_matches = false;
    bool valid = false;
};

using VkHashValidationResult = HNOinkValidation::VkHashValidationResult;

struct OinkValidationResult {
    VkHashValidationResult vk_hash;
    bool valid = false;
};

struct CoarsePhaseResult {
    size_t arith_start = 0;
    size_t arith_end = 0;
    bool fingerprint_valid = false;
};

struct PostBatchingResult {
    size_t arith_start = 0;
    size_t arith_end = 0;
    bool valid = false;
};

struct Result {
    IvQueueValidationResult iv_queue;
    OinkValidationResult oink;
    CoarsePhaseResult main_sumcheck; ///< Head stage: Oink + gate_challenge + Main Sumcheck.
    CoarsePhaseResult pre_batching_padding;
    CoarsePhaseResult batching;
    PostBatchingResult post_batching;
    size_t batching_windows_found = 0;
    size_t arith_cursor_end = 0; ///< Where the arith chain stopped; equals arith_region_end on PASS.
    size_t arith_region_end = 0; ///< builder.blocks.arithmetic.size().
    size_t poseidon2_cursor_end = 0;
    size_t poseidon2_region_end = 0;
    bool arith_coverage_valid = false; ///< arith_cursor_end == arith_region_end (no unmatched gates).
    bool poseidon2_coverage_valid = false;
    bool all_valid = false;
};

/**
 * @brief Cross-check ACIR recursion constraint metadata against an IVC verification queue entry.
 *
 * Mirrors the consistency checks in process_hn_recursion_constraints: proof type, kernel flag,
 * empty ACIR proof/public_inputs, and VK field/hash witnesses against expected native VK values.
 * expected_vk is required because honk_vk on the queue entry may be cleared after circuit build.
 *
 * @param builder      Populated circuit containing constraint witness values.
 * @param constraint   HN recursion constraint from ACIR (key, key_hash, proof_type, …).
 * @param queue_entry  Native IVC verification queue slot being recursively verified.
 * @param expected_vk  VK field elements and hash captured before circuit construction.
 * @return             Per-check flags and aggregate valid bit (checked is always true).
 */
template <typename FF, typename CircuitBuilder>
IvQueueValidationResult validate_init_iv_queue_consistency(CircuitBuilder& builder,
                                                           const acir_format::RecursionConstraint& constraint,
                                                           const Chonk::VerifierInputs& queue_entry,
                                                           const IvQueueExpectedVk& expected_vk)
{
    IvQueueValidationResult result;
    result.checked = true;

    // INIT's queue entry is always the leading app, verified via an OINK proof (VerifierInputs no longer carries
    // a per-entry proof-type tag to compare against -- see expected_proof_type in recursion_constraint.hpp, which
    // derives the same expectation from IVC CircuitKind state).
    result.proof_type_matches = constraint.proof_type == static_cast<uint32_t>(acir_format::PROOF_TYPE::OINK);
    result.is_kernel_matches = !queue_entry.is_kernel();
    result.public_inputs_empty = constraint.public_inputs.empty();
    result.proof_empty = constraint.proof.empty();

    const std::vector<bb::fr>& vk_fields = expected_vk.fields;
    const bb::fr& vk_hash = expected_vk.hash;

    result.vk_witnesses_match = constraint.key.size() == vk_fields.size();
    for (size_t i = 0; i < constraint.key.size() && result.vk_witnesses_match; ++i) {
        if (builder.get_variable(constraint.key[i]) != vk_fields[i]) {
            result.vk_witnesses_match = false;
        }
    }
    result.key_hash_matches = builder.get_variable(constraint.key_hash) == vk_hash;

    result.valid = result.proof_type_matches && result.is_kernel_matches && result.public_inputs_empty &&
                   result.proof_empty && result.vk_witnesses_match && result.key_hash_matches;
    return result;
}

inline constexpr HNOinkValidation::VkHashProfile INIT_VK_HASH_PROFILE{
    .arith = INIT_VK_HASH_ARITH,
    .poseidon2_ext = INIT_VK_HASH_POSEIDON2_EXT,
    .poseidon2_int = INIT_VK_HASH_POSEIDON2_INT,
};

/**
 * @brief Anchor this constraint's vk_hash inside the INIT kernel via `HNOinkValidation`.
 *
 * @param builder     Populated INIT kernel circuit.
 * @param analyzer    Static analyzer for poseidon link traversal.
 * @param constraint  ACIR HN recursion constraint (key_hash witness).
 * @return            Arith/poseidon2 region bounds + validity for the vk_hash gate group.
 */
template <typename FF, typename CircuitBuilder>
VkHashValidationResult validate_init_vk_hash(CircuitBuilder& builder,
                                             cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                             const acir_format::RecursionConstraint& constraint)
{
    return HNOinkValidation::validate_vk_hash_anchor<FF>(builder, analyzer, constraint, INIT_VK_HASH_PROFILE);
}

/**
 * @brief Full boomerang validator for the HN::INIT kernel via a contiguous FunctionFingerprint cursor chain.
 *
 * Anchors `primitive_start` on the ACIR `key_hash`/`key[]` witnesses, then walks one cursor per block
 * through the pinned stage chain, verifying each fingerprint AT the cursor rather than scanning for a
 * match. PASS requires total contiguous coverage: every gate in the arithmetic and poseidon2 blocks must
 * fall inside a matched fingerprint, so an injected or missing gate cannot hide in an unchecked gap.
 *
 * Pipeline (fail-fast):
 * 1. Optional IVC queue cross-check when queue_entry and expected_vk are supplied (tests only).
 * 2. vk_hash anchor (poseidon-only) → poseidon2 tail; asserts the ACIR key limbs drive the anchor.
 * 3. Arith chain: Oink+gate_challenge+Main Sumcheck head → pre-batching padding →
 *    INIT_NUM_BATCHING_CHALLENGE_WINDOWS batching windows → post-batching tail.
 * 4. Coverage: both cursors must land exactly on their block sizes.
 *
 * Scoped to a single-app INIT group. A group with N>=2 apps runs multilinear batching (which a 1-app group
 * short-circuits) and leaves fewer default databus commitments, so its arith tail has a different shape
 * that these constants do not describe; such a circuit fails the coverage check rather than passing loosely.
 *
 * @param builder     Populated INIT kernel circuit.
 * @param analyzer    Static analyzer for the vk_hash witness anchor.
 * @param constraint  ACIR HN recursion constraint (key/key_hash witnesses).
 * @param queue_entry Optional IVC queue slot for metadata cross-check (tests).
 * @param expected_vk Optional expected VK snapshot; required when queue_entry is set.
 * @return            Granular Result with per-stage flags, cursors, and the all_valid aggregate.
 */
template <typename FF, typename CircuitBuilder>
Result validate(CircuitBuilder& builder,
                cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                const acir_format::RecursionConstraint& constraint,
                std::optional<std::reference_wrapper<const Chonk::VerifierInputs>> queue_entry = std::nullopt,
                std::optional<std::reference_wrapper<const IvQueueExpectedVk>> expected_vk = std::nullopt)
{
    Result result;
    auto& arith = builder.blocks.arithmetic;
    auto& poseidon2 = builder.blocks.poseidon2;
    result.arith_region_end = arith.size();
    result.poseidon2_region_end = poseidon2.size();

    if (queue_entry.has_value()) {
        if (!expected_vk.has_value()) {
            return result;
        }
        result.iv_queue =
            validate_init_iv_queue_consistency<FF>(builder, constraint, queue_entry->get(), expected_vk->get());
        if (!result.iv_queue.valid) {
            return result;
        }
    }

    // Stage 0: witness anchor. Poseidon-only -- no ACIR key witness reaches the arithmetic block.
    result.oink.vk_hash = validate_init_vk_hash<FF>(builder, analyzer, constraint);
    if (!result.oink.vk_hash.valid) {
        return result;
    }
    if (!HNOinkValidation::validate_key_limbs_drive_vk_hash<FF>(builder, analyzer, constraint, result.oink.vk_hash)
             .valid) {
        return result;
    }
    result.oink.valid = true;

    size_t poseidon_cursor = result.oink.vk_hash.poseidon2_ext_end;
    if (poseidon_cursor + INIT_POSEIDON2_TAIL.gate_count > poseidon2.size() ||
        !matches_fingerprint_at(builder, poseidon2, poseidon_cursor, INIT_POSEIDON2_TAIL)) {
        return result;
    }
    poseidon_cursor += INIT_POSEIDON2_TAIL.gate_count;
    result.poseidon2_cursor_end = poseidon_cursor;

    size_t arith_cursor = 0;
    const auto advance_arith = [&](const FunctionFingerprint& fp) -> bool {
        if (arith_cursor + fp.gate_count > arith.size() || !matches_fingerprint_at(builder, arith, arith_cursor, fp)) {
            return false;
        }
        arith_cursor += fp.gate_count;
        return true;
    };

    // Stage 1: Oink + gate_challenge + Main Sumcheck. One fingerprint, not 24 per-round windows: every
    // challenge in this span is `fr`-typed post-merge, so no squeeze marker sub-divides it.
    result.main_sumcheck.arith_start = arith_cursor;
    if (!advance_arith(INIT_OINK_MAINSC_LIVE_ARITH)) {
        return result;
    }
    result.main_sumcheck.arith_end = arith_cursor;
    result.main_sumcheck.fingerprint_valid = true;

    // Stage 2: pre-batching padding -- its own stage so an injection here is not mistaken for stage 1 or 3.
    result.pre_batching_padding.arith_start = arith_cursor;
    if (!advance_arith(INIT_PRE_BATCHING_PADDING_ARITH)) {
        return result;
    }
    result.pre_batching_padding.arith_end = arith_cursor;
    result.pre_batching_padding.fingerprint_valid = true;

    // Stage 3: the batching-phase `fq` challenge windows -- the one phase whose internal structure the
    // squeeze detector still resolves post-merge.
    result.batching.arith_start = arith_cursor;
    for (size_t i = 0; i < INIT_NUM_BATCHING_CHALLENGE_WINDOWS; ++i) {
        if (!advance_arith(INIT_BATCHING_CHALLENGE_WINDOW_ARITH)) {
            result.batching_windows_found = i;
            return result;
        }
    }
    result.batching_windows_found = INIT_NUM_BATCHING_CHALLENGE_WINDOWS;
    result.batching.arith_end = arith_cursor;
    result.batching.fingerprint_valid = true;

    // Stage 4: tail -- batched dot-products, accumulator hash, default databus commitments, KernelIO.
    result.post_batching.arith_start = arith_cursor;
    if (!advance_arith(INIT_POST_BATCHING_TAIL_ARITH)) {
        return result;
    }
    result.post_batching.arith_end = arith_cursor;
    result.post_batching.valid = true;

    result.arith_cursor_end = arith_cursor;
    result.arith_coverage_valid = (arith_cursor == arith.size());
    result.poseidon2_coverage_valid = (poseidon_cursor == poseidon2.size());

    result.all_valid = (!result.iv_queue.checked || result.iv_queue.valid) && result.oink.valid &&
                       result.main_sumcheck.fingerprint_valid && result.pre_batching_padding.fingerprint_valid &&
                       result.batching.fingerprint_valid && result.post_batching.valid && result.arith_coverage_valid &&
                       result.poseidon2_coverage_valid;
    return result;
}

} // namespace HNInitValidation

using HNInitValidationResult = HNInitValidation::Result;
/**
 * @brief Validate HN::INIT kernel with ACIR constraint (production / analyzer entry point).
 *
 * @param builder    Populated INIT kernel circuit.
 * @param analyzer   Static analyzer wired to the same builder.
 * @param constraint ACIR recursion constraint for vk_hash anchoring.
 * @return           HNInitValidationResult from HNInitValidation::validate.
 */
template <typename FF, typename CircuitBuilder>
HNInitValidationResult validate_hn_init(CircuitBuilder& builder,
                                        cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                        const acir_format::RecursionConstraint& constraint)
{
    return HNInitValidation::validate<FF>(builder, analyzer, constraint);
}

/**
 * @brief Validate HN::INIT with full ACIR ↔ IVC queue cross-check (test entry point).
 *
 * @param builder     Populated INIT kernel circuit.
 * @param analyzer    Static analyzer wired to the same builder.
 * @param constraint  ACIR recursion constraint.
 * @param queue_entry IVC verification queue entry (type, is_kernel flags).
 * @param expected_vk VK fields/hash captured before circuit build.
 * @return            HNInitValidationResult including iv_queue sub-result.
 */
template <typename FF, typename CircuitBuilder>
HNInitValidationResult validate_hn_init(CircuitBuilder& builder,
                                        cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                        const acir_format::RecursionConstraint& constraint,
                                        const Chonk::VerifierInputs& queue_entry,
                                        const HNInitValidation::IvQueueExpectedVk& expected_vk)
{
    return HNInitValidation::validate<FF>(
        builder, analyzer, constraint, std::cref(queue_entry), std::cref(expected_vk));
}

/**
 * @brief Convenience wrapper: builds a local StaticAnalyzer and validates HN::INIT.
 *
 * @param builder    Populated INIT kernel circuit.
 * @param constraint ACIR recursion constraint for vk_hash anchoring.
 * @return           HNInitValidationResult from HNInitValidation::validate.
 */
template <typename CircuitBuilder>
HNInitValidationResult validate_hn_init(CircuitBuilder& builder, const acir_format::RecursionConstraint& constraint)
{
    cdg::StaticAnalyzer_<bb::fr, CircuitBuilder> analyzer(builder, false);
    return validate_hn_init<bb::fr>(builder, analyzer, constraint);
}

} // namespace HNVerification
