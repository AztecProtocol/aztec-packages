#pragma once

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK/honk_recursion_sumcheck_verification.hpp"
#include <cstddef>
#include <set>
#include <vector>

namespace HonkRecursionValidation::Shplemini {

static constexpr recursion_helpers::FunctionFingerprint ARITH_TOTAL = {
    3599, 0xfc6581cd3b303eecULL, 0x87df1e59db9ca06eULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint NNF_TOTAL = {
    1550, 0x8532e80b0fef3fa6ULL, 0x6db07e2807d8e8fcULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint POSEIDON2_EXT_TOTAL = {
    580, 0xd66e384960826081ULL, 0x7847807629ca2ddcULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint POSEIDON2_INT_TOTAL = {
    3306, 0xfeae5f9d5c27d251ULL, 0xc6e3196ccd55ce4ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr size_t ARITH_GATES = ARITH_TOTAL.gate_count;

struct ShpleminiValidationResult {
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
ShpleminiValidationResult validate_shplemini(CircuitBuilder& builder,
                                             cdg::StaticAnalyzer_<FF, CircuitBuilder>&,
                                             const Sumcheck::SumcheckValidationResult& previous)
{
    ShpleminiValidationResult result;
    if (!previous.is_valid) {
        return result;
    }

    result.arith_start = previous.arith_end;
    result.nnf_start = previous.nnf_end;
    result.poseidon2_ext_start = previous.poseidon2_ext_end;
    result.poseidon2_int_start = previous.poseidon2_int_end;

    auto& arith = builder.blocks.arithmetic;
    auto& nnf = builder.blocks.nnf;
    auto& p2ext = builder.blocks.poseidon2_external;
    auto& p2int = builder.blocks.poseidon2_internal;

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
ShpleminiValidationResult validate_shplemini(CircuitBuilder& builder,
                                             cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                             const Sumcheck::SumcheckValidationResult& previous,
                                             const std::vector<size_t>&,
                                             std::set<size_t>&)
{
    return validate_shplemini<FF>(builder, analyzer, previous);
}

} // namespace HonkRecursionValidation::Shplemini
