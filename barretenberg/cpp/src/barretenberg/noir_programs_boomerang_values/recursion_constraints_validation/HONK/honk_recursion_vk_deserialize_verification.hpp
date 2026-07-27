#pragma once

// Phase 3: pre-Oink VkDeserialize + setup residual (cursor-chained from Phase 2 primitive_start).
//
// Phase 2 pin: primitive_start_arith=1709, first_primitive_part=VkDeserialize.
// key[3..] commitment limbs land in ARITH; NNF setup window [0, SETUP_NNF) is the matching
// deserialize NNF span (limbs may not appear via get_variable_gates on raw key indices).
// After ARITH ends at 4372, a 79-gate residual remains before Oink (setup arith=4451).

#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"

#include <optional>

namespace HonkRecursionValidation::VkDeserialize {

static constexpr size_t PRIMITIVE_START_ARITH = 1709;
static constexpr size_t OINK_ARITH_START = 4451; // mirror/real setup end; Phase 2 map residual note
static constexpr size_t FIRST_COMMITMENT_KEY_INDEX = 3;

static constexpr recursion_helpers::FunctionFingerprint ARITH = {
    2663, 0xec01069372bf3deaULL, 0xd9ed1c196b16b6bdULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
// Setup residual after last key[3..] arith touch, before Oink.
static constexpr recursion_helpers::FunctionFingerprint SETUP_RESIDUAL_ARITH = {
    79, 0xecfa5df53beebfacULL, 0x6b2d93c9a40a16bcULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
// Promoted from mirror setup nnf [0, 1736) — refreshed in Phase 3 cursor promote.
static constexpr recursion_helpers::FunctionFingerprint NNF = {
    1736, 0x8532e80b0fef3fa6ULL, 0xa7afbc28f9f887f9ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

struct VkDeserializeValidationResult {
    bool is_valid = false;
    size_t arith_start = SIZE_MAX;
    size_t arith_end = SIZE_MAX;  // == OINK_ARITH_START when residual matches
    size_t region_end = SIZE_MAX; // alias of arith_end for older call sites
    size_t nnf_start = SIZE_MAX;
    size_t nnf_end = SIZE_MAX;
    size_t commitments_checked = 0;
    bool arith_ok = false;
    bool residual_ok = false;
    bool nnf_ok = false;
    bool commitments_ok = false;
};

/**
 * @brief Cursor-chain validate VkDeserialize from Phase 2 primitive_start (no scan helpers).
 */
template <typename FF, typename CircuitBuilder>
VkDeserializeValidationResult validate_vk_deserialize_region(CircuitBuilder& builder,
                                                             cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                             const acir_format::RecursionConstraint& constraint,
                                                             size_t arith_start = PRIMITIVE_START_ARITH,
                                                             size_t nnf_start = 0)
{
    VkDeserializeValidationResult result;
    if (constraint.key.size() <= FIRST_COMMITMENT_KEY_INDEX) {
        return result;
    }
    if (arith_start != PRIMITIVE_START_ARITH) {
        return result;
    }

    auto& arith = builder.blocks.arithmetic;
    auto& nnf = builder.blocks.nnf;

    result.arith_start = arith_start;
    result.arith_ok = recursion_helpers::matches_fingerprint_at(builder, arith, arith_start, ARITH);
    size_t arith_cursor = arith_start + ARITH.gate_count;

    result.residual_ok = recursion_helpers::matches_fingerprint_at(builder, arith, arith_cursor, SETUP_RESIDUAL_ARITH);
    arith_cursor += SETUP_RESIDUAL_ARITH.gate_count;
    result.arith_end = arith_cursor;
    result.region_end = arith_cursor;

    result.nnf_start = nnf_start;
    result.nnf_ok = recursion_helpers::matches_fingerprint_at(builder, nnf, nnf_start, NNF);
    result.nnf_end = nnf_start + NNF.gate_count;

    const size_t region_lo = arith_start;
    const size_t region_hi = arith_start + ARITH.gate_count; // commitment limbs live in ARITH span
    result.commitments_ok = true;
    for (size_t j = FIRST_COMMITMENT_KEY_INDEX; j < constraint.key.size(); ++j) {
        const uint32_t real = builder.real_variable_index[constraint.key[j]];
        bool found = false;
        for (const auto& [blk, gi] : analyzer.get_variable_gates(real)) {
            if (&builder.blocks.get()[blk] == &arith && gi >= region_lo && gi < region_hi) {
                found = true;
                break;
            }
        }
        if (!found) {
            result.commitments_ok = false;
            break;
        }
        ++result.commitments_checked;
    }

    result.is_valid = result.arith_ok && result.residual_ok && result.nnf_ok && result.commitments_ok &&
                      result.arith_end == OINK_ARITH_START;
    return result;
}

} // namespace HonkRecursionValidation::VkDeserialize
