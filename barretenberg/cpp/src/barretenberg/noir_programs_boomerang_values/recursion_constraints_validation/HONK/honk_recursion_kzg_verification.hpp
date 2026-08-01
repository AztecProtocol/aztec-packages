#pragma once

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK/honk_recursion_shplemini_verification.hpp"
#include <cstddef>
#include <set>
#include <vector>

namespace HonkRecursionValidation::KZG {

// Whole-KZG (W_receive + batch_mul). No masking_challenge stage.
static constexpr recursion_helpers::FunctionFingerprint ARITH_TOTAL = {
    265107, 0x2dce00dfaa8b2f7aULL, 0x7311171d14f97f6cULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint MEMORY_TOTAL = {
    18445, 0xd57d77a9715cfae9ULL, 0xb9510f81f6022274ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint NNF_TOTAL = {
    146132, 0x8532e80b0fef3fa6ULL, 0xf595ee664021492dULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
// KZG dump has no poseidon windows; stubs keep discovery tests compiling.
static constexpr recursion_helpers::FunctionFingerprint POSEIDON2_EXT_TOTAL = { 0, 0, 0, 0 };
static constexpr recursion_helpers::FunctionFingerprint POSEIDON2_INT_TOTAL = { 0, 0, 0, 0 };

// ROOT opcode 1: fix_witness dedup shortens KZG arith by 36 gates (measured before_output).
static constexpr recursion_helpers::FunctionFingerprint ARITH_TOTAL_OP0 = ARITH_TOTAL;
static constexpr recursion_helpers::FunctionFingerprint ARITH_TOTAL_OP1 = {
    265071, 0x2dce00dfaa8b2f7aULL, 0x16f7548c90becb43ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
inline const recursion_helpers::FunctionFingerprint& arith_total(size_t opcode_index)
{
    return opcode_index == 0 ? ARITH_TOTAL_OP0 : ARITH_TOTAL_OP1;
}

static constexpr size_t ARITH_GATES = ARITH_TOTAL.gate_count;

struct KZGValidationResult {
    bool is_valid = false;
    size_t arith_start = SIZE_MAX;
    size_t arith_end = SIZE_MAX;
    size_t memory_start = SIZE_MAX;
    size_t memory_end = SIZE_MAX;
    size_t nnf_start = SIZE_MAX;
    size_t nnf_end = SIZE_MAX;
    size_t poseidon2_ext_start = SIZE_MAX;
    size_t poseidon2_ext_end = SIZE_MAX;
    size_t poseidon2_int_start = SIZE_MAX;
    size_t poseidon2_int_end = SIZE_MAX;
    bool arith_ok = false;
    bool memory_ok = false;
    bool nnf_ok = false;
    bool poseidon2_ext_ok = true;
    bool poseidon2_int_ok = true;
    bool squeeze_count_ok = true;
};

template <typename FF, typename CircuitBuilder>
KZGValidationResult validate_kzg(CircuitBuilder& builder,
                                 cdg::StaticAnalyzer_<FF, CircuitBuilder>& /*analyzer*/,
                                 const Shplemini::ShpleminiValidationResult& previous,
                                 size_t opcode_index = 0,
                                 size_t memory_start = 0)
{
    KZGValidationResult result;
    if (!previous.is_valid) {
        return result;
    }

    const auto& arith_fp = arith_total(opcode_index);

    result.arith_start = previous.arith_end;
    result.nnf_start = previous.nnf_end;
    result.memory_start = memory_start;
    result.poseidon2_ext_start = previous.poseidon2_ext_end;
    result.poseidon2_ext_end = previous.poseidon2_ext_end; // no p2 in KZG dump
    result.poseidon2_int_start = previous.poseidon2_int_end;
    result.poseidon2_int_end = previous.poseidon2_int_end;

    auto& arith = builder.blocks.arithmetic;
    auto& mem = builder.blocks.memory;
    auto& nnf = builder.blocks.nnf;

    result.arith_ok = recursion_helpers::matches_fingerprint_at(builder, arith, result.arith_start, arith_fp);
    result.memory_ok = recursion_helpers::matches_fingerprint_at(builder, mem, result.memory_start, MEMORY_TOTAL);
    result.nnf_ok = recursion_helpers::matches_fingerprint_at(builder, nnf, result.nnf_start, NNF_TOTAL);

    result.arith_end = result.arith_start + arith_fp.gate_count;
    result.memory_end = result.memory_start + MEMORY_TOTAL.gate_count;
    result.nnf_end = result.nnf_start + NNF_TOTAL.gate_count;

    result.is_valid = result.arith_ok && result.memory_ok && result.nnf_ok;
    return result;
}

template <typename FF, typename CircuitBuilder>
KZGValidationResult validate_kzg(CircuitBuilder& builder,
                                 cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer,
                                 const Shplemini::ShpleminiValidationResult& previous,
                                 const std::vector<size_t>&,
                                 std::set<size_t>&,
                                 size_t opcode_index = 0)
{
    return validate_kzg<FF>(builder, analyzer, previous, opcode_index);
}

} // namespace HonkRecursionValidation::KZG
