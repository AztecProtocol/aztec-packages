#pragma once

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#include "barretenberg/noir_programs_boomerang_values/poseidon2s_helpers.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK_ZK/honk_zk_recursion_oink_verification.hpp"
#include <cstddef>
#include <set>
#include <vector>

namespace HonkZKRecursionValidation::Preprocessor {

// gate_challenges only. Promoted Phase 3 cursor dump.
static constexpr recursion_helpers::FunctionFingerprint ARITH = {
    30, 0x7c75da3a29e5643aULL, 0x7bff0a58e978cd7dULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint POSEIDON2_EXT = {
    10, 0x519dcaf299fd9cbfULL, 0x519dcaf299fd9cbfULL, 10
};
static constexpr recursion_helpers::FunctionFingerprint POSEIDON2_INT = {
    57, 0xfeae5f9d5c27d251ULL, 0x5acee3ed48c55c0aULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr size_t ARITH_GATES = ARITH.gate_count;

struct PreprocessorValidationResult {
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
    bool poseidon2_ext_ok = false;
    bool poseidon2_int_ok = false;
    bool squeeze_count_ok = true;
};

template <typename FF, typename CircuitBuilder>
PreprocessorValidationResult validate_preprocessor(CircuitBuilder& builder,
                                                   cdg::StaticAnalyzer_<FF, CircuitBuilder>& /*analyzer*/,
                                                   const Oink::OinkValidationResult& previous)
{
    PreprocessorValidationResult result;
    if (!previous.is_valid) {
        return result;
    }

    result.arith_start = previous.arith_end;
    result.nnf_start = previous.nnf_end;
    result.nnf_end = previous.nnf_end;
    result.poseidon2_ext_start = previous.poseidon2_ext_end;
    result.poseidon2_int_start = previous.poseidon2_int_end;

    auto& arith = builder.blocks.arithmetic;
    auto& p2ext = poseidon2_helpers::poseidon2_external_block(builder);
    auto& p2int = poseidon2_helpers::poseidon2_internal_block(builder);

    result.arith_ok = recursion_helpers::matches_fingerprint_at(builder, arith, result.arith_start, ARITH);
    result.poseidon2_ext_ok =
        recursion_helpers::matches_fingerprint_at(builder, p2ext, result.poseidon2_ext_start, POSEIDON2_EXT);
    result.poseidon2_int_ok =
        recursion_helpers::matches_fingerprint_at(builder, p2int, result.poseidon2_int_start, POSEIDON2_INT);

    result.arith_end = result.arith_start + ARITH.gate_count;
    result.poseidon2_ext_end = result.poseidon2_ext_start + POSEIDON2_EXT.gate_count;
    result.poseidon2_int_end = result.poseidon2_int_start + POSEIDON2_INT.gate_count;

    result.is_valid = result.arith_ok && result.poseidon2_ext_ok && result.poseidon2_int_ok;
    return result;
}

template <typename FF, typename CircuitBuilder>
PreprocessorValidationResult validate_preprocessor(CircuitBuilder& builder,
                                                   cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                                   const Oink::OinkValidationResult& previous,
                                                   const std::vector<size_t>&,
                                                   std::set<size_t>&)
{
    return validate_preprocessor<FF>(builder, analyzer, previous);
}

} // namespace HonkZKRecursionValidation::Preprocessor
