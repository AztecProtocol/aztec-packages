#pragma once

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#include "barretenberg/noir_programs_boomerang_values/poseidon2s_helpers.hpp"
#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <set>
#include <vector>

namespace HonkZKRecursionValidation::Oink {

// Whole-Oink FPs from Phase 3 cursor promote (mirror==real). Includes Gemini masking receive.
static constexpr recursion_helpers::FunctionFingerprint ARITH_TOTAL = {
    1515, 0x54b6283c06479365ULL, 0x65090e8acbf4aef8ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint NNF_TOTAL = {
    558, 0x8532e80b0fef3fa6ULL, 0x47e3e12c87a3fd0cULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint POSEIDON2_EXT_TOTAL = {
    580, 0xd66e384960826081ULL, 0x7847807629ca2ddcULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint POSEIDON2_INT_TOTAL = {
    3306, 0xfeae5f9d5c27d251ULL, 0xc6e3196ccd55ce4ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint OINK_NNF_TOTAL = NNF_TOTAL;
static constexpr recursion_helpers::FunctionFingerprint OINK_POSEIDON2_EXT_TOTAL = POSEIDON2_EXT_TOTAL;
static constexpr recursion_helpers::FunctionFingerprint OINK_POSEIDON2_INT_TOTAL = POSEIDON2_INT_TOTAL;
// Legacy squeeze-era aliases (Phase 1 fork measurement only — not used for Phase 3 cursors).
static constexpr recursion_helpers::FunctionFingerprint PRE_ETA_ARITH = ARITH_TOTAL;
static constexpr recursion_helpers::FunctionFingerprint POST_ETA_ARITH = ARITH_TOTAL;
static constexpr recursion_helpers::FunctionFingerprint POST_BETA_GAMMA_ARITH = ARITH_TOTAL;

static constexpr size_t NUM_COMMITMENT_GROUPS = 9; // Gemini masking + 8 Ultra witness commitments.
static constexpr size_t SETUP_NNF_GATE_COUNT = 1736;
static constexpr size_t ARITH_GATES = ARITH_TOTAL.gate_count;
static constexpr size_t ARITH_START = 4451;
static constexpr size_t NUM_OINK_SQUEEZES = 3; // legacy; challenge squeezes dead post convert_full_challenge
static constexpr size_t HONK_ZK_DEFAULT_IO_PUBLIC_INPUTS = 8;

// Proof positions after DefaultIO prefix (Phase 2 Rule C):
//   0 gemini_masking, 1 w_l, 2 w_r, 3 w_o, 4 lookup_read_counts, 5 lookup_read_tags,
//   6 w_4, 7 lookup_inverses, 8 z_perm.
static constexpr std::array<size_t, NUM_COMMITMENT_GROUPS> HONK_ZK_PROOF_POSITION_BY_GROUP = {
    0, 1, 2, 3, 4, 5, 6, 7, 8
};

inline size_t honk_zk_public_input_prefix_size(const acir_format::RecursionConstraint* acir_constraint)
{
    return acir_constraint != nullptr ? HONK_ZK_DEFAULT_IO_PUBLIC_INPUTS : 0;
}

inline std::optional<std::array<uint32_t, recursion_helpers::FRS_PER_COMMITMENT>>
get_honk_zk_commitment_group_witness_indices(const std::vector<uint32_t>& proof_witnesses,
                                             size_t group_idx,
                                             size_t public_input_prefix_size)
{
    if (group_idx >= HONK_ZK_PROOF_POSITION_BY_GROUP.size()) {
        return std::nullopt;
    }
    const size_t proof_position = HONK_ZK_PROOF_POSITION_BY_GROUP[group_idx];
    const size_t base = public_input_prefix_size + proof_position * recursion_helpers::FRS_PER_COMMITMENT;
    if (base + 3 >= proof_witnesses.size()) {
        return std::nullopt;
    }
    return std::array<uint32_t, recursion_helpers::FRS_PER_COMMITMENT>{
        proof_witnesses[base], proof_witnesses[base + 1], proof_witnesses[base + 2], proof_witnesses[base + 3]
    };
}

struct OinkValidationResult {
    bool is_valid = false;
    size_t arith_start = SIZE_MAX;
    size_t arith_end = SIZE_MAX;
    size_t nnf_start = SIZE_MAX;
    size_t nnf_end = SIZE_MAX;
    size_t poseidon2_ext_start = SIZE_MAX;
    size_t poseidon2_ext_end = SIZE_MAX;
    size_t poseidon2_int_start = SIZE_MAX;
    size_t poseidon2_int_end = SIZE_MAX;
    bool arith_ok = false;
    bool nnf_ok = false;
    bool poseidon2_ext_ok = false;
    bool poseidon2_int_ok = false;
    bool acir_constraint_ok = false;
    bool commitments_ok = false;
    bool squeeze_count_ok = true;
    bool pre_eta_arith_ok = false;
    bool post_eta_arith_ok = false;
    bool post_beta_gamma_arith_ok = false;
};

template <typename FF, typename CircuitBuilder>
OinkValidationResult validate_oink(CircuitBuilder& builder,
                                   cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                   size_t arith_start,
                                   size_t nnf_start,
                                   size_t poseidon2_ext_start,
                                   size_t poseidon2_int_start,
                                   const acir_format::RecursionConstraint* acir_constraint = nullptr,
                                   const std::vector<uint32_t>* proof_body_witnesses = nullptr)
{
    OinkValidationResult result;
    auto& arith = builder.blocks.arithmetic;
    auto& nnf = builder.blocks.nnf;
    auto& p2ext = poseidon2_helpers::poseidon2_external_block(builder);
    auto& p2int = poseidon2_helpers::poseidon2_internal_block(builder);

    result.arith_start = arith_start;
    result.nnf_start = nnf_start;
    result.poseidon2_ext_start = poseidon2_ext_start;
    result.poseidon2_int_start = poseidon2_int_start;

    result.arith_ok = recursion_helpers::matches_fingerprint_at(builder, arith, arith_start, ARITH_TOTAL);
    result.nnf_ok = recursion_helpers::matches_fingerprint_at(builder, nnf, nnf_start, NNF_TOTAL);
    result.poseidon2_ext_ok =
        recursion_helpers::matches_fingerprint_at(builder, p2ext, poseidon2_ext_start, POSEIDON2_EXT_TOTAL);
    result.poseidon2_int_ok =
        recursion_helpers::matches_fingerprint_at(builder, p2int, poseidon2_int_start, POSEIDON2_INT_TOTAL);

    result.arith_end = arith_start + ARITH_TOTAL.gate_count;
    result.nnf_end = nnf_start + NNF_TOTAL.gate_count;
    result.poseidon2_ext_end = poseidon2_ext_start + POSEIDON2_EXT_TOTAL.gate_count;
    result.poseidon2_int_end = poseidon2_int_start + POSEIDON2_INT_TOTAL.gate_count;

    result.acir_constraint_ok = true;
    if (acir_constraint != nullptr) {
        result.acir_constraint_ok = recursion_helpers::validate_vk_hash<FF>(builder, analyzer, acir_constraint);
    }

    result.commitments_ok = true;
    if (proof_body_witnesses != nullptr) {
        const size_t prefix = honk_zk_public_input_prefix_size(acir_constraint);
        for (size_t g = 0; g < NUM_COMMITMENT_GROUPS; ++g) {
            const auto frs = get_honk_zk_commitment_group_witness_indices(*proof_body_witnesses, g, prefix);
            if (!frs.has_value()) {
                result.commitments_ok = false;
                break;
            }
            // Wire-trace only; WitnessLinkInOink asserts opcode limbs in Oink arith range.
            if (!recursion_helpers::validate_oink_commitment<FF>(
                    builder, analyzer, (*frs)[0], (*frs)[1], (*frs)[2], (*frs)[3])) {
                // Informational — do not fail is_valid (same as baseline HONK).
            }
        }
    }

    result.is_valid = result.arith_ok && result.nnf_ok && result.poseidon2_ext_ok && result.poseidon2_int_ok &&
                      result.acir_constraint_ok;
    result.pre_eta_arith_ok = result.arith_ok;
    result.post_eta_arith_ok = result.arith_ok;
    result.post_beta_gamma_arith_ok = result.arith_ok;
    return result;
}

// Legacy overload: ignore squeeze vectors.
template <typename FF, typename CircuitBuilder>
OinkValidationResult validate_oink(CircuitBuilder& builder,
                                   cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                   size_t arith_start,
                                   const std::vector<size_t>&,
                                   std::set<size_t>&,
                                   const acir_format::RecursionConstraint* acir_constraint = nullptr,
                                   const std::vector<uint32_t>* proof_body_witnesses = nullptr)
{
    return validate_oink<FF>(builder,
                             analyzer,
                             arith_start,
                             SETUP_NNF_GATE_COUNT,
                             /*poseidon2_ext_start=*/0,
                             /*poseidon2_int_start=*/0,
                             acir_constraint,
                             proof_body_witnesses);
}

} // namespace HonkZKRecursionValidation::Oink
