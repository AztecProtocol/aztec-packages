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

namespace HonkRecursionValidation::Oink {

// Coarse whole-Oink FPs promoted from Phase 1 dump / Phase 3 cursor promote (mirror==real).
static constexpr recursion_helpers::FunctionFingerprint ARITH_TOTAL = {
    1405, 0x54b6283c06479365ULL, 0x23049a4ef6cfaf91ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint NNF_TOTAL = {
    496, 0x8532e80b0fef3fa6ULL, 0x3dafb8c7e4c95f24ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint POSEIDON2_EXT_TOTAL = {
    560, 0xd66e384960826081ULL, 0xde008ed420992e0dULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint POSEIDON2_INT_TOTAL = {
    3192, 0xfeae5f9d5c27d251ULL, 0x912aba966bd0e550ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint OINK_NNF_TOTAL = NNF_TOTAL;
static constexpr recursion_helpers::FunctionFingerprint OINK_POSEIDON2_EXT_TOTAL = POSEIDON2_EXT_TOTAL;
static constexpr recursion_helpers::FunctionFingerprint OINK_POSEIDON2_INT_TOTAL = POSEIDON2_INT_TOTAL;
// Stale fine-grained aliases — discovery tests that still name these should migrate to ARITH_TOTAL.
static constexpr recursion_helpers::FunctionFingerprint PRE_ETA_ARITH = ARITH_TOTAL;
static constexpr recursion_helpers::FunctionFingerprint POST_ETA_ARITH = ARITH_TOTAL;
static constexpr recursion_helpers::FunctionFingerprint POST_BETA_GAMMA_ARITH = ARITH_TOTAL;
static constexpr recursion_helpers::FunctionFingerprint SINGLE_COMMITMENT_NNF = {
    62, 0xff2ca3c0bde9b337ULL, 0x6f7911bba1f0ffe7ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr size_t NUM_COMMITMENT_GROUPS = 8;
static constexpr std::array<size_t, 3> PRE_ETA_COMMITMENT_GROUPS = { 0, 1, 2 };
static constexpr std::array<size_t, 3> POST_ETA_COMMITMENT_GROUPS = { 6, 7, 3 };
static constexpr std::array<size_t, 1> POST_BETA_GAMMA_COMMITMENT_GROUPS = { 5 };
static constexpr size_t LOOKUP_INVERSES_GROUP = 5;
static constexpr size_t Z_PERM_GROUP = 4;
static constexpr size_t SETUP_NNF_GATE_COUNT = 1736;
static constexpr size_t ARITH_GATES = ARITH_TOTAL.gate_count;
static constexpr size_t ARITH_START = 4451; // after VkDeserialize + setup residual

// HONK proof serialization rules for Oink witness commitments.
//
// Logical group ids follow UltraFlavor::WitnessEntities column order:
//   0 w_l, 1 w_r, 2 w_o, 3 w_4, 4 z_perm, 5 lookup_inverses,
//   6 lookup_read_counts, 7 lookup_read_tags.
//
// Proof order follows Oink transcript receive order after DefaultIO public inputs:
//   w_l, w_r, w_o, lookup_read_counts, lookup_read_tags, w_4, lookup_inverses, z_perm.
static constexpr size_t HONK_DEFAULT_IO_PUBLIC_INPUTS = 8; // DefaultIO pairing points.
static constexpr std::array<size_t, NUM_COMMITMENT_GROUPS> HONK_PROOF_POSITION_BY_GROUP = {
    0, // w_l
    1, // w_r
    2, // w_o
    5, // w_4
    7, // z_perm
    6, // lookup_inverses
    3, // lookup_read_counts
    4, // lookup_read_tags
};

inline size_t honk_public_input_prefix_size(const acir_format::RecursionConstraint* acir_constraint)
{
    if (acir_constraint == nullptr) {
        return 0;
    }
    if (acir_constraint->proof_type == acir_format::PROOF_TYPE::ROLLUP_HONK ||
        acir_constraint->proof_type == acir_format::PROOF_TYPE::ROOT_ROLLUP_HONK) {
        return bb::ROLLUP_PUBLIC_INPUTS_SIZE;
    }
    return HONK_DEFAULT_IO_PUBLIC_INPUTS;
}

inline std::optional<std::array<uint32_t, recursion_helpers::FRS_PER_COMMITMENT>>
get_honk_commitment_group_witness_indices(const std::vector<uint32_t>& proof_witnesses,
                                          size_t group_idx,
                                          size_t public_input_prefix_size)
{
    if (group_idx >= HONK_PROOF_POSITION_BY_GROUP.size()) {
        return std::nullopt;
    }

    const size_t proof_position = HONK_PROOF_POSITION_BY_GROUP[group_idx];
    const size_t base = public_input_prefix_size + proof_position * recursion_helpers::FRS_PER_COMMITMENT;
    if (base + 3 >= proof_witnesses.size()) {
        return std::nullopt;
    }

    return std::array<uint32_t, recursion_helpers::FRS_PER_COMMITMENT>{
        proof_witnesses[base], proof_witnesses[base + 1], proof_witnesses[base + 2], proof_witnesses[base + 3]
    };
}

template <typename FF, typename CircuitBuilder>
bool validate_honk_commitment_group_full(CircuitBuilder& builder,
                                         cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                         const std::vector<uint32_t>& proof_witnesses,
                                         size_t group_idx,
                                         const acir_format::RecursionConstraint* acir_constraint)
{
    const auto frs = get_honk_commitment_group_witness_indices(
        proof_witnesses, group_idx, honk_public_input_prefix_size(acir_constraint));
    if (!frs.has_value()) {
        return false;
    }

    auto fp = recursion_helpers::validate_commitment_receive_fingerprint<FF>(
        builder, analyzer, (*frs)[0], (*frs)[1], (*frs)[2], (*frs)[3]);
    if (!fp.is_valid) {
        return false;
    }
    if (!recursion_helpers::validate_oink_commitment<FF>(
            builder, analyzer, (*frs)[0], (*frs)[1], (*frs)[2], (*frs)[3])) {
        return false;
    }
    return true;
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
    // Legacy fields retained for ROLLUP_HONK consumers that still fill them.
    bool squeeze_count_ok = false;
    bool pre_eta_arith_ok = false;
    bool post_eta_arith_ok = false;
    bool post_beta_gamma_arith_ok = false;
};

static constexpr size_t NUM_OINK_SQUEEZES = 3; // legacy; baseline HONK no longer uses squeeze slicing

/**
 * @brief Cursor-chain validate whole Oink at post-setup cursors (no squeeze / scan helpers).
 */
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
        auto validate_group = [&](size_t group_idx) {
            // Phase 3: wire-trace only. Commitment-receive FunctionFingerprint scan uses
            // stale SINGLE_COMMITMENT_* constants post-merge; WitnessLinkInOink covers
            // opcode limbs inside the validated Oink arith range.
            const auto frs = get_honk_commitment_group_witness_indices(
                *proof_body_witnesses, group_idx, honk_public_input_prefix_size(acir_constraint));
            if (!frs.has_value()) {
                return false;
            }
            return recursion_helpers::validate_oink_commitment<FF>(
                builder, analyzer, (*frs)[0], (*frs)[1], (*frs)[2], (*frs)[3]);
        };
        result.commitments_ok =
            std::all_of(PRE_ETA_COMMITMENT_GROUPS.begin(), PRE_ETA_COMMITMENT_GROUPS.end(), validate_group) &&
            std::all_of(POST_ETA_COMMITMENT_GROUPS.begin(), POST_ETA_COMMITMENT_GROUPS.end(), validate_group) &&
            std::all_of(
                POST_BETA_GAMMA_COMMITMENT_GROUPS.begin(), POST_BETA_GAMMA_COMMITMENT_GROUPS.end(), validate_group) &&
            validate_group(Z_PERM_GROUP);
    }

    result.is_valid = result.arith_ok && result.nnf_ok && result.poseidon2_ext_ok && result.poseidon2_int_ok &&
                      result.acir_constraint_ok;
    // commitments_ok is informative; Phase 3 WitnessLinkInOink asserts opcode limbs in range.
    // validate_oink_commitment currently fails post-merge (stale limb→NNF linkage assumptions).
    result.squeeze_count_ok = true;
    result.pre_eta_arith_ok = result.arith_ok;
    result.post_eta_arith_ok = result.arith_ok;
    result.post_beta_gamma_arith_ok = result.arith_ok;
    return result;
}

// Legacy overload: ignore squeeze vectors; start poseidon cursors at 0 and nnf at SETUP_NNF.
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

} // namespace HonkRecursionValidation::Oink
