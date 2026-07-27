#pragma once

// Phase 3 validator for the ROOT_ROLLUP_HONK / ROLLUP_HONK pre-Oink gate gap (Op2_VkDeserialize).
//
// The gap before the inner HONK Oink protocol consists solely of verification-key commitment
// deserialization (see rollup_honk_root_opcode_vk_deserialize_analysis.test.cpp). The ACIR
// witnesses that flow into it are exactly constraint.key[3..] (the commitment fields); key[0..2]
// are scalar metadata (log_circuit_size, num_public_inputs, pub_inputs_offset) constrained later
// in the Oink preamble, and key_hash / proof[] / public_inputs[] do not participate.
//
// Validation algorithm:
//   1. Anchor on key[3] (first commitment field): find one of its arithmetic gates.
//   2. Locate the VkDeserialize region via find_fingerprint_range_containing_gate(ARITH) — this
//      verifies the region hash matches the pinned fingerprint.
//   3. Assert every remaining commitment witness key[4..] has an arithmetic gate inside that same
//      region. If so, the pre-Oink section is correct.

#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK/honk_recursion_vk_deserialize_verification.hpp"

#include <optional>

namespace RollupHonkRecursionValidation::VkDeserialize {

// Pinned from RootRollupOpcodeVkDeserializeAnalysis (runs prior opcodes before measuring each).
//
// Opcode 0 runs on a fresh builder → full VkDeserialize arith span (includes what single-HONK
// splits as ARITH + setup residual; ROOT has no separate residual before Oink).
// Opcode 1 runs AFTER opcode 0 has committed constants via fix_witness → fewer arith gates.
// NNF is identical for both opcodes (same as Honk VkDeserialize::NNF).
static constexpr recursion_helpers::FunctionFingerprint ARITH_OP0 = {
    4450, 0x13758fb36b5eef17ULL, 0xdbb0ef99a8c3591bULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint ARITH_OP1 = {
    2632, 0x2dce00dfaa8b2f7aULL, 0x8b162cb2ddabe60cULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint NNF = HonkRecursionValidation::VkDeserialize::NNF;

// key[0]=log_circuit_size, key[1]=num_public_inputs, key[2]=pub_inputs_offset are scalar metadata;
// commitment fields (the ones that produce VkDeserialize gates) start at key[3].
static constexpr size_t FIRST_COMMITMENT_KEY_INDEX = HonkRecursionValidation::VkDeserialize::FIRST_COMMITMENT_KEY_INDEX;

struct VkDeserializeValidationResult {
    bool is_valid = false;
    size_t arith_region_start = SIZE_MAX;
    size_t region_end = SIZE_MAX; // arith_region_start + fingerprint.gate_count; == oink_arith_start
    size_t nnf_start = SIZE_MAX;
    size_t nnf_end = SIZE_MAX;
    size_t commitments_checked = 0;
    bool nnf_ok = false;
};

/**
 * @brief Validate the pre-Oink VkDeserialize region of one HONK recursion constraint.
 *
 * @param opcode_index  Position of this constraint in the merged circuit (0 or 1).
 *                      Selects the correct ARITH fingerprint: opcode 0 builds on a fresh builder
 *                      (ARITH_OP0, 4030 gates); opcode 1 runs after opcode 0 has consumed constants
 *                      via fix_witness (ARITH_OP1, 2212 gates).
 *
 * Anchors on key[3], confirms the region fingerprint, and checks that every other commitment
 * witness lands inside the same region. Returns is_valid=true only if all checks pass.
 */
template <typename FF, typename CircuitBuilder>
VkDeserializeValidationResult validate_vk_deserialize_region(CircuitBuilder& builder,
                                                             cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                             const acir_format::RecursionConstraint& constraint,
                                                             size_t opcode_index,
                                                             size_t nnf_start = 0)
{
    VkDeserializeValidationResult result;
    if (constraint.key.size() <= FIRST_COMMITMENT_KEY_INDEX) {
        return result;
    }
    const auto& arith_fp = opcode_index == 0 ? ARITH_OP0 : ARITH_OP1;
    auto& arith = builder.blocks.arithmetic;
    auto& nnf = builder.blocks.nnf;

    const auto arith_gate_in_range = [&](uint32_t witness_idx, size_t lo, size_t hi) -> std::optional<size_t> {
        const uint32_t real = builder.real_variable_index[witness_idx];
        for (const auto& [blk, gi] : analyzer.get_variable_gates(real)) {
            if (&builder.blocks.get()[blk] == &arith && gi >= lo && gi < hi) {
                return gi;
            }
        }
        return std::nullopt;
    };

    // 1) + 2) Anchor on key[3] and locate the region via fingerprint (hash verified internally).
    const uint32_t anchor_real = builder.real_variable_index[constraint.key[FIRST_COMMITMENT_KEY_INDEX]];
    std::optional<size_t> region_start;
    for (const auto& [blk, gi] : analyzer.get_variable_gates(anchor_real)) {
        if (&builder.blocks.get()[blk] != &arith) {
            continue;
        }
        region_start = recursion_helpers::find_fingerprint_range_containing_gate(builder, arith, gi, arith_fp);
        if (region_start.has_value()) {
            break;
        }
    }
    if (!region_start.has_value()) {
        return result;
    }
    result.arith_region_start = *region_start;
    result.region_end = *region_start + arith_fp.gate_count;

    // 3) Every remaining commitment witness must have an arithmetic gate in the same region.
    for (size_t j = FIRST_COMMITMENT_KEY_INDEX + 1; j < constraint.key.size(); ++j) {
        if (!arith_gate_in_range(constraint.key[j], *region_start, result.region_end).has_value()) {
            return result; // a commitment witness escaped the VkDeserialize region
        }
        ++result.commitments_checked;
    }

    // 4) NNF deserialize window at the caller's handoff cursor (optional for arith-only callers).
    result.nnf_start = nnf_start;
    result.nnf_ok = recursion_helpers::matches_fingerprint_at(builder, nnf, nnf_start, NNF);
    result.nnf_end = nnf_start + NNF.gate_count;
    // Arith region + commitment coverage succeeded (early returns above). NNF is separate so
    // entry-anchor / discover helpers can use arith_region_start without requiring nnf_start.
    result.is_valid = true;
    return result;
}

} // namespace RollupHonkRecursionValidation::VkDeserialize
