#pragma once

// HONK_ZK recursion constraint validation
//
// Baseline: UltraZKRecursiveFlavor_<UltraCircuitBuilder>, DefaultIO, constant-true predicate.
// Starts at Phase 2 primitive_start (VkDeserialize ARITH @ 1709), then chains
// residual → Oink → Preprocessor → Sumcheck → Shplemini → KZG → Output.

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#include "barretenberg/noir_programs_boomerang_values/poseidon2s_helpers.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK_ZK/honk_zk_recursion_kzg_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK_ZK/honk_zk_recursion_oink_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK_ZK/honk_zk_recursion_output_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK_ZK/honk_zk_recursion_preprocessor_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK_ZK/honk_zk_recursion_shplemini_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK_ZK/honk_zk_recursion_sumcheck_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK_ZK/honk_zk_recursion_vk_deserialize_verification.hpp"

#include <cstddef>
#include <vector>

namespace HonkZKRecursionValidation {

static constexpr size_t OINK_ARITH_GATES = Oink::ARITH_GATES;
static constexpr size_t PREPROCESSOR_ARITH_GATES = Preprocessor::ARITH_GATES;
static constexpr size_t SUMCHECK_ARITH_GATES = Sumcheck::ARITH_GATES;
static constexpr size_t SHPLEMINI_ARITH_GATES = Shplemini::ARITH_GATES;
static constexpr size_t KZG_ARITH_GATES = KZG::ARITH_GATES;

// Legacy squeeze totals — Output recursion_separator only remains live.
static constexpr size_t TOTAL_SQUEEZE_GATES = 1;
static constexpr size_t NUM_VALIDATED_SQUEEZE_GATES = 0;

struct ArithBoundaries {
    size_t oink = Oink::ARITH_START;
    size_t preproc = Oink::ARITH_START + Oink::ARITH_GATES;
    size_t sumcheck = 0;
    size_t shplemini = 0;
    size_t kzg = 0;
};

inline ArithBoundaries compute_arith_boundaries_from_oink_start(size_t oink_arith_start = Oink::ARITH_START)
{
    ArithBoundaries b;
    b.oink = oink_arith_start;
    b.preproc = oink_arith_start + OINK_ARITH_GATES;
    b.sumcheck = b.preproc + PREPROCESSOR_ARITH_GATES;
    b.shplemini = b.sumcheck + SUMCHECK_ARITH_GATES;
    b.kzg = b.shplemini + SHPLEMINI_ARITH_GATES;
    return b;
}

inline ArithBoundaries compute_arith_boundaries(size_t = 0)
{
    return compute_arith_boundaries_from_oink_start();
}

struct HonkZKRecursionValidationResult {
    bool is_valid = false;
    VkDeserialize::VkDeserializeValidationResult vk_deserialize;
    Oink::OinkValidationResult oink;
    Preprocessor::PreprocessorValidationResult preprocessor;
    Sumcheck::SumcheckValidationResult sumcheck;
    Shplemini::ShpleminiValidationResult shplemini;
    KZG::KZGValidationResult kzg;
    Output::OutputValidationResult output;

    size_t arith_cursor_end = 0;
    size_t arith_region_end = 0;
    size_t poseidon2_ext_cursor_end = 0;
    size_t poseidon2_ext_region_end = 0;
    size_t poseidon2_int_cursor_end = 0;
    size_t poseidon2_int_region_end = 0;
    size_t nnf_cursor_end = 0;
    size_t nnf_region_end = 0;
    size_t memory_cursor_end = 0;
    size_t memory_region_end = 0;

    bool arith_coverage_valid = false;
    bool poseidon2_ext_coverage_valid = false;
    bool poseidon2_int_coverage_valid = false;
    bool nnf_coverage_valid = false;
    bool memory_coverage_valid = false;
    bool all_valid = false;
};

template <typename FF, typename CircuitBuilder>
HonkZKRecursionValidationResult validate_honk_zk_recursion(CircuitBuilder& builder,
                                                           cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                           const acir_format::RecursionConstraint& constraint,
                                                           const std::vector<uint32_t>& proof_body_witnesses)
{
    HonkZKRecursionValidationResult result;

    result.vk_deserialize = VkDeserialize::validate_vk_deserialize_region<FF>(builder, analyzer, constraint);
    if (!result.vk_deserialize.is_valid) {
        return result;
    }

    result.oink = Oink::validate_oink<FF>(builder,
                                          analyzer,
                                          result.vk_deserialize.arith_end,
                                          result.vk_deserialize.nnf_end,
                                          /*poseidon2_ext_start=*/0,
                                          /*poseidon2_int_start=*/0,
                                          &constraint,
                                          &proof_body_witnesses);
    if (!result.oink.is_valid) {
        return result;
    }

    result.preprocessor = Preprocessor::validate_preprocessor<FF>(builder, analyzer, result.oink);
    if (!result.preprocessor.is_valid) {
        return result;
    }

    result.sumcheck = Sumcheck::validate_sumcheck<FF>(builder, analyzer, result.preprocessor);
    if (!result.sumcheck.is_valid) {
        return result;
    }

    result.shplemini = Shplemini::validate_shplemini<FF>(builder, analyzer, result.sumcheck);
    if (!result.shplemini.is_valid) {
        return result;
    }

    result.kzg = KZG::validate_kzg<FF>(builder, analyzer, result.shplemini);
    if (!result.kzg.is_valid) {
        return result;
    }

    result.output = Output::validate_output<FF>(builder, analyzer, result.kzg);

    result.arith_cursor_end = result.output.arith_end;
    result.arith_region_end = builder.blocks.arithmetic.size();
    result.poseidon2_ext_cursor_end = result.output.poseidon2_ext_end;
    result.poseidon2_ext_region_end = poseidon2_helpers::poseidon2_external_block(builder).size();
    result.poseidon2_int_cursor_end = result.output.poseidon2_int_end;
    result.poseidon2_int_region_end = poseidon2_helpers::poseidon2_internal_block(builder).size();
    result.nnf_cursor_end = result.output.nnf_end;
    result.nnf_region_end = builder.blocks.nnf.size();
    result.memory_cursor_end = result.kzg.memory_end;
    result.memory_region_end = builder.blocks.memory.size();

    result.arith_coverage_valid = result.arith_cursor_end == result.arith_region_end;
    result.poseidon2_ext_coverage_valid = result.poseidon2_ext_cursor_end == result.poseidon2_ext_region_end;
    result.poseidon2_int_coverage_valid = result.poseidon2_int_cursor_end == result.poseidon2_int_region_end;
    result.nnf_coverage_valid = result.nnf_cursor_end == result.nnf_region_end;
    result.memory_coverage_valid = result.memory_cursor_end == result.memory_region_end;

    result.all_valid = result.output.is_valid && result.arith_coverage_valid && result.poseidon2_ext_coverage_valid &&
                       result.poseidon2_int_coverage_valid && result.nnf_coverage_valid && result.memory_coverage_valid;
    result.is_valid = result.all_valid;
    return result;
}

} // namespace HonkZKRecursionValidation
