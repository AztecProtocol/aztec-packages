#pragma once

#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"

#include <set>
#include <vector>

namespace HNVerification {
using namespace recursion_helpers;
namespace HNOinkValidation {

inline constexpr FunctionFingerprint COMMITMENT_RECEIVE_ARITH = { 5, 0x8c7907ea98903f3ULL, 0x8c7907ea98903f3ULL, 5 };

struct VkHashProfile {
    FunctionFingerprint arith;
    FunctionFingerprint poseidon2_ext;
    FunctionFingerprint poseidon2_int;
};

struct VkHashValidationResult {
    bool valid = false;
    size_t arith_start = 0;
    size_t arith_end = 0;
    size_t poseidon2_ext_start = 0;
    size_t poseidon2_ext_end = 0;
    size_t poseidon2_int_start = 0;
    size_t poseidon2_int_end = 0;
};

struct KeyLimbLinkResult {
    bool valid = false;
    size_t limbs_checked = 0;
    size_t limbs_linked = 0;
};

/**
 * @brief Locate vk_hash stage anchored on constraint.key_hash using profile fingerprints.
 *
 * Mega's poseidon2_external/poseidon2_quad_internal were merged into one `poseidon2` block, so the
 * two aliases below are the same object — the Ultra-style external→internal hop is skipped.
 * When `profile.arith.gate_count == 0`, the ACIR path is poseidon-only (no digest copy into
 * arithmetic); `arith_start`/`arith_end` stay 0 and `poseidon2_ext_start` is the primitive start.
 */
template <typename FF, typename CircuitBuilder>
VkHashValidationResult validate_vk_hash_anchor(CircuitBuilder& builder,
                                               cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                               const acir_format::RecursionConstraint& constraint,
                                               const VkHashProfile& profile)
{
    VkHashValidationResult result;
    auto& arith = builder.blocks.arithmetic;
    auto& poseidon2_external = builder.blocks.poseidon2;
    auto& poseidon2_internal = builder.blocks.poseidon2;
    const bool mega_merged_poseidon2 = (&poseidon2_external == &poseidon2_internal);

    if (constraint.key.empty()) {
        return result;
    }

    const uint32_t key_hash_real = builder.real_variable_index[constraint.key_hash];
    const std::vector<size_t> external_candidate_gates =
        OinkVerifierValidation::collect_real_witness_gates_in_block<FF>(
            builder, analyzer, key_hash_real, poseidon2_external);
    std::set<size_t> tried_external_starts;

    for (size_t gate_idx : external_candidate_gates) {
        const auto external_start =
            find_fingerprint_range_containing_gate(builder, poseidon2_external, gate_idx, profile.poseidon2_ext);
        if (!external_start.has_value() || !tried_external_starts.insert(*external_start).second) {
            continue;
        }

        const size_t external_end = *external_start + profile.poseidon2_ext.gate_count;

        size_t internal_start = *external_start;
        size_t internal_end = external_end;
        if (!mega_merged_poseidon2) {
            const std::set<size_t> linked_internal_gates = collect_linked_gates(
                builder, analyzer, poseidon2_external, *external_start, external_end, poseidon2_internal);
            const auto found_internal = find_fingerprint_range_at_or_after_any_gate(
                builder, poseidon2_internal, linked_internal_gates, profile.poseidon2_int);
            if (!found_internal.has_value()) {
                continue;
            }
            internal_start = *found_internal;
            internal_end = internal_start + profile.poseidon2_int.gate_count;
        }

        size_t arith_start = 0;
        size_t arith_end = 0;
        if (profile.arith.gate_count > 0) {
            const std::set<size_t> linked_arith_gates =
                collect_linked_gates(builder, analyzer, poseidon2_external, *external_start, external_end, arith);
            const auto found_arith =
                find_fingerprint_range_containing_any_gate(builder, arith, linked_arith_gates, profile.arith);
            if (!found_arith.has_value()) {
                continue;
            }
            arith_start = *found_arith;
            arith_end = arith_start + profile.arith.gate_count;
        }

        // Prefer the earliest poseidon2 start (poseidon-only) or earliest arith start.
        const bool better =
            !result.valid || (profile.arith.gate_count > 0 ? arith_start < result.arith_start
                                                           : *external_start < result.poseidon2_ext_start);
        if (better) {
            result.valid = true;
            result.arith_start = arith_start;
            result.arith_end = arith_end;
            result.poseidon2_ext_start = *external_start;
            result.poseidon2_ext_end = external_end;
            result.poseidon2_int_start = internal_start;
            result.poseidon2_int_end = internal_end;
        }
    }

    return result;
}

/**
 * @brief Assert ACIR `constraint.key[]` drives the vk_hash poseidon region (and is fully wired).
 *
 * Post-merge Mega RESET layout (from AcirHNResetPrimitiveStartDiscovery):
 * - Most key limbs appear on `ecc_op` (VK commitment wiring), not on poseidon2.
 * - A minority appear on poseidon2; those must lie inside the vk_hash poseidon span.
 * - Every limb must appear on at least one gate; key_hash must lie in the vk_hash poseidon span.
 */
template <typename FF, typename CircuitBuilder>
KeyLimbLinkResult validate_key_limbs_drive_vk_hash(CircuitBuilder& builder,
                                                   cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                   const acir_format::RecursionConstraint& constraint,
                                                   const VkHashValidationResult& vk_hash)
{
    KeyLimbLinkResult result;
    if (!vk_hash.valid || constraint.key.empty()) {
        return result;
    }

    auto& poseidon2 = builder.blocks.poseidon2;
    const auto in_vk_hash_poseidon = [&](size_t gate_idx) {
        return (gate_idx >= vk_hash.poseidon2_ext_start && gate_idx < vk_hash.poseidon2_ext_end) ||
               (gate_idx >= vk_hash.poseidon2_int_start && gate_idx < vk_hash.poseidon2_int_end);
    };

    // key_hash itself must sit in the vk_hash poseidon span.
    const uint32_t key_hash_real = builder.real_variable_index[constraint.key_hash];
    bool key_hash_in_span = false;
    for (size_t g :
         OinkVerifierValidation::collect_real_witness_gates_in_block<FF>(builder, analyzer, key_hash_real, poseidon2)) {
        if (in_vk_hash_poseidon(g)) {
            key_hash_in_span = true;
            break;
        }
    }
    if (!key_hash_in_span) {
        return result;
    }

    result.limbs_checked = constraint.key.size();
    for (uint32_t key_wit : constraint.key) {
        const uint32_t key_real = builder.real_variable_index[key_wit];
        const auto all_gates = analyzer.get_variable_gates(key_real);
        if (all_gates.empty()) {
            continue;
        }
        const auto p2_gates =
            OinkVerifierValidation::collect_real_witness_gates_in_block<FF>(builder, analyzer, key_real, poseidon2);
        if (p2_gates.empty()) {
            // Limb wired only outside poseidon2 (typically ecc_op for Kernel VK commitments).
            ++result.limbs_linked;
            continue;
        }
        bool in_span = false;
        for (size_t g : p2_gates) {
            if (in_vk_hash_poseidon(g)) {
                in_span = true;
                break;
            }
        }
        if (in_span) {
            ++result.limbs_linked;
        }
    }
    result.valid = result.limbs_linked == result.limbs_checked && result.limbs_checked > 0;
    return result;
}

/**
 * @brief Check one Oink commitment-receive FunctionFingerprint at a fixed arithmetic-block offset.
 *
 * @param builder     Circuit under validation.
 * @param arith_start Offset into `builder.blocks.arithmetic` where the receive gates should start.
 * @return            False if the fingerprint's gate range overruns the block or doesn't match.
 */
template <typename CircuitBuilder> bool validate_commitment_receive_at(CircuitBuilder& builder, size_t arith_start)
{
    auto& arith = builder.blocks.arithmetic;
    if (arith_start + COMMITMENT_RECEIVE_ARITH.gate_count > arith.size()) {
        return false;
    }
    return matches_fingerprint_at(builder, arith, arith_start, COMMITMENT_RECEIVE_ARITH);
}

/**
 * @brief Validate `count` consecutive commitment-receive fingerprints starting at `cursor`, advancing it.
 *
 * @param builder Circuit under validation.
 * @param cursor  Arithmetic-block offset of the first receive gate; advanced past the last on success.
 * @param count   Number of consecutive commitments to check.
 * @return        False on the first mismatch (cursor left at the failing offset).
 */
template <typename CircuitBuilder> bool validate_commitment_chain(CircuitBuilder& builder, size_t& cursor, size_t count)
{
    for (size_t i = 0; i < count; ++i) {
        if (!validate_commitment_receive_at(builder, cursor)) {
            return false;
        }
        cursor += COMMITMENT_RECEIVE_ARITH.gate_count;
    }
    return true;
}

/**
 * @brief Check one monolithic pre-eta transcript-absorption chain FunctionFingerprint.
 *
 * The pre-eta span between vk_hash and the eta squeeze absorbs a protocol-fixed sequence of
 * public inputs and commitment limbs, one `is_transcript_add_gate` per fr element, preceded by a
 * single `is_fix_witness_gate` accumulator-init pin. Every absorption gate shares the identical
 * selector signature regardless of which element it absorbs, so the public-input/commitment-limb
 * boundary isn't independently distinguishable by selectors alone -- the whole span is pinned as
 * one fixed-length unit instead of N discrete per-commitment blocks. Mirrors the pattern already
 * used for HNInnerValidation's loop0/C0 pre-eta window (C0_PRE_ETA_ARITH).
 *
 * @param builder Circuit under validation.
 * @param start   Arithmetic-block offset of the leading fix_witness gate (vk_hash.arith_end).
 * @param fp      Fixed-span FunctionFingerprint covering the whole chain.
 * @return        False if the fingerprint's gate range overruns the block or doesn't match.
 */
template <typename CircuitBuilder>
bool validate_pre_eta_transcript_chain(CircuitBuilder& builder, size_t start, const FunctionFingerprint& fp)
{
    auto& arith = builder.blocks.arithmetic;
    if (start + fp.gate_count > arith.size()) {
        return false;
    }
    return matches_fingerprint_at(builder, arith, start, fp);
}

} // namespace HNOinkValidation
} // namespace HNVerification
