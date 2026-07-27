#pragma once

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#include "barretenberg/noir_programs_boomerang_values/poseidon2s_helpers.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK_ZK/honk_zk_recursion_preprocessor_verification.hpp"
#include <cstddef>
#include <set>
#include <vector>

namespace HonkZKRecursionValidation::Sumcheck {

// Whole Sumcheck (ALPHA_POWERS ctor + Libra + rounds) — single production layout.
static constexpr recursion_helpers::FunctionFingerprint ARITH_TOTAL = {
    2720, 0xd07d54971e301b9aULL, 0x1fbb6652329869fcULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint NNF_TOTAL = {
    186, 0x8532e80b0fef3fa6ULL, 0x9a912483a8530514ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint POSEIDON2_EXT_TOTAL = {
    1020, 0xd66e384960826081ULL, 0x5530b6527d8d9d6cULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint POSEIDON2_INT_TOTAL = {
    5814, 0xfeae5f9d5c27d251ULL, 0x1c72e38e00fad7d5ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr size_t LOG_N = 25;
static constexpr size_t ARITH_GATES = ARITH_TOTAL.gate_count;

struct SumcheckValidationResult {
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
    bool squeeze_count_ok = true;
};

template <typename FF, typename CircuitBuilder>
SumcheckValidationResult validate_sumcheck(CircuitBuilder& builder,
                                           cdg::StaticAnalyzer_<FF, CircuitBuilder>&,
                                           const Preprocessor::PreprocessorValidationResult& previous)
{
    SumcheckValidationResult result;
    if (!previous.is_valid) {
        return result;
    }

    result.arith_start = previous.arith_end;
    result.nnf_start = previous.nnf_end;
    result.poseidon2_ext_start = previous.poseidon2_ext_end;
    result.poseidon2_int_start = previous.poseidon2_int_end;

    auto& arith = builder.blocks.arithmetic;
    auto& nnf = builder.blocks.nnf;
    auto& p2ext = poseidon2_helpers::poseidon2_external_block(builder);
    auto& p2int = poseidon2_helpers::poseidon2_internal_block(builder);

    result.arith_ok = recursion_helpers::matches_fingerprint_at(builder, arith, result.arith_start, ARITH_TOTAL);
    result.nnf_ok = recursion_helpers::matches_fingerprint_at(builder, nnf, result.nnf_start, NNF_TOTAL);
    result.poseidon2_ext_ok =
        recursion_helpers::matches_fingerprint_at(builder, p2ext, result.poseidon2_ext_start, POSEIDON2_EXT_TOTAL);
    result.poseidon2_int_ok =
        recursion_helpers::matches_fingerprint_at(builder, p2int, result.poseidon2_int_start, POSEIDON2_INT_TOTAL);

    result.arith_end = result.arith_start + ARITH_TOTAL.gate_count;
    result.nnf_end = result.nnf_start + NNF_TOTAL.gate_count;
    result.poseidon2_ext_end = result.poseidon2_ext_start + POSEIDON2_EXT_TOTAL.gate_count;
    result.poseidon2_int_end = result.poseidon2_int_start + POSEIDON2_INT_TOTAL.gate_count;

    result.is_valid = result.arith_ok && result.nnf_ok && result.poseidon2_ext_ok && result.poseidon2_int_ok;
    return result;
}

template <typename FF, typename CircuitBuilder>
SumcheckValidationResult validate_sumcheck(CircuitBuilder& builder,
                                           cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                           const Preprocessor::PreprocessorValidationResult& previous,
                                           const std::vector<size_t>&,
                                           std::set<size_t>&)
{
    return validate_sumcheck<FF>(builder, analyzer, previous);
}

} // namespace HonkZKRecursionValidation::Sumcheck
