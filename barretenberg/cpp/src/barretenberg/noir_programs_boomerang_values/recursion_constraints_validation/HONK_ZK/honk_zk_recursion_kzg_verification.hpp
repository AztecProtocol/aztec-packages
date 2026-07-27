#pragma once

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/HONK_ZK/honk_zk_recursion_shplemini_verification.hpp"
#include <cstddef>
#include <set>
#include <vector>

namespace HonkZKRecursionValidation::KZG {

// Whole-KZG (W_receive + batch_mul). No poseidon windows in Phase 1 dump.
static constexpr recursion_helpers::FunctionFingerprint ARITH_TOTAL = {
    272371, 0x2dce00dfaa8b2f7aULL, 0xeba3ad5ffcf6f476ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint MEMORY_TOTAL = {
    19005, 0xd57d77a9715cfae9ULL, 0xd55e886c6171861bULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};
static constexpr recursion_helpers::FunctionFingerprint NNF_TOTAL = {
    150644, 0x8532e80b0fef3fa6ULL, 0xd2d219205c1684b5ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
};

static constexpr size_t ARITH_GATES = ARITH_TOTAL.gate_count;

struct KZGValidationResult {
    bool is_valid = false;
    size_t arith_start = SIZE_MAX;
    size_t arith_end = SIZE_MAX;
    size_t memory_start = SIZE_MAX;
    size_t memory_end = SIZE_MAX;
    size_t nnf_start = SIZE_MAX;
    size_t nnf_end = SIZE_MAX;
    // Pass-through: KZG dump has no poseidon windows; Output continues from Shplemini cursors.
    size_t poseidon2_ext_start = SIZE_MAX;
    size_t poseidon2_ext_end = SIZE_MAX;
    size_t poseidon2_int_start = SIZE_MAX;
    size_t poseidon2_int_end = SIZE_MAX;
    bool arith_ok = false;
    bool memory_ok = false;
    bool nnf_ok = false;
    bool squeeze_count_ok = true;
};

template <typename FF, typename CircuitBuilder>
KZGValidationResult validate_kzg(CircuitBuilder& builder,
                                 cdg::StaticAnalyzer_<FF, CircuitBuilder>& /*analyzer*/,
                                 const Shplemini::ShpleminiValidationResult& previous)
{
    KZGValidationResult result;
    if (!previous.is_valid) {
        return result;
    }

    result.arith_start = previous.arith_end;
    result.nnf_start = previous.nnf_end;
    result.memory_start = 0;
    result.poseidon2_ext_start = previous.poseidon2_ext_end;
    result.poseidon2_ext_end = previous.poseidon2_ext_end;
    result.poseidon2_int_start = previous.poseidon2_int_end;
    result.poseidon2_int_end = previous.poseidon2_int_end;

    auto& arith = builder.blocks.arithmetic;
    auto& mem = builder.blocks.memory;
    auto& nnf = builder.blocks.nnf;

    result.arith_ok = recursion_helpers::matches_fingerprint_at(builder, arith, result.arith_start, ARITH_TOTAL);
    result.memory_ok = recursion_helpers::matches_fingerprint_at(builder, mem, result.memory_start, MEMORY_TOTAL);
    result.nnf_ok = recursion_helpers::matches_fingerprint_at(builder, nnf, result.nnf_start, NNF_TOTAL);

    result.arith_end = result.arith_start + ARITH_TOTAL.gate_count;
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
                                 std::set<size_t>&)
{
    return validate_kzg<FF>(builder, analyzer, previous);
}

} // namespace HonkZKRecursionValidation::KZG
