#pragma once

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#include "barretenberg/noir_programs_boomerang_values/poseidon2s_helpers.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK_ZK/honk_zk_recursion_kzg_verification.hpp"
#include <cstddef>

namespace HonkZKRecursionValidation::Output {

// reconstruct_from_public + PairingPoints::aggregate (recursion_separator squeeze lives here).
static constexpr recursion_helpers::FunctionFingerprint ARITH_TOTAL = {
    32909, 0x2dce00dfaa8b2f7aULL, 0xfdcb458d3b5c8635ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint NNF_TOTAL = {
    18148, 0x8532e80b0fef3fa6ULL, 0xe999b59ee758b306ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint POSEIDON2_EXT_TOTAL = {
    60, 0xd66e384960826081ULL, 0xb5182aac47dd389ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint POSEIDON2_INT_TOTAL = {
    342, 0xfeae5f9d5c27d251ULL, 0x5ebb1cec5105115bULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

struct OutputValidationResult {
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
};

template <typename FF, typename CircuitBuilder>
OutputValidationResult validate_output(CircuitBuilder& builder,
                                       cdg::StaticAnalyzer_<FF, CircuitBuilder>&,
                                       const KZG::KZGValidationResult& previous)
{
    OutputValidationResult result;
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

} // namespace HonkZKRecursionValidation::Output
