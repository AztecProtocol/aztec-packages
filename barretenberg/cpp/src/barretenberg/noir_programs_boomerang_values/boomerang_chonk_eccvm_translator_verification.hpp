#pragma once
#include "barretenberg/noir_programs_boomerang_values/chonk_merge_verification.hpp"
#include <cstddef>

namespace ECCVMTranslatorVerification {

struct EccvmConstructorValidation {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;

    static constexpr recursion_helpers::FunctionFingerprint CONSTRUCTOR_ARITHMETIC = {
        37, 0x475d6022afa3e9a2ULL, 0x64e02dab78215155ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
};

struct EccvmPartValidation {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    size_t elliptic_gate_start_idx = SIZE_MAX;
    size_t memory_gate_start_idx = SIZE_MAX;
    size_t nnf_gate_start_idx = SIZE_MAX;
    size_t poseidon2_external_gate_start_idx = SIZE_MAX;
    size_t poseidon2_internal_gate_start_idx = SIZE_MAX;

    static constexpr recursion_helpers::FunctionFingerprint REDUCE_TO_IPA_OPENING_ARITHMETIC = {
        81316, 0x13ddeb2caf5adf1cULL, 0x343252cc9912f406ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint REDUCE_TO_IPA_OPENING_ELLIPTIC = {
        11882, 0xa9be1730a335e7d9ULL, 0x5da279acdfeb4d62ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint REDUCE_TO_IPA_OPENING_MEMORY = {
        11120, 0xe7fd0be5c039f40fULL, 0x8ca03b1f11d26ce9ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint REDUCE_TO_IPA_OPENING_NNF = {
        45823, 0xff2ca3c0bde9b337ULL, 0x37e8e692a8b3a722ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint REDUCE_TO_IPA_OPENING_POSEIDON2_EXT = {
        2390, 0x0ec92a899925d755ULL, 0x1ac1844f6378199bULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint REDUCE_TO_IPA_OPENING_POSEIDON2_INT = {
        13623, 0xee3a7ac895f8a6d9ULL, 0x656227f9b57f3b6fULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
};

// Current trace shows `ECCVM:get_translator_input_data` adds no gates.

struct TranslatorConstructorValidation {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    size_t nnf_gate_start_idx = SIZE_MAX;

    static constexpr recursion_helpers::FunctionFingerprint CONSTRUCTOR_ARITHMETIC = {
        671, 0xd77ecc5a10bbddf2ULL, 0xecd3e8245363984cULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint CONSTRUCTOR_NNF = {
        380, 0xff2ca3c0bde9b337ULL, 0x99e6761ea68bad9cULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
};

struct TranslatorPartValidation {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    size_t memory_gate_start_idx = SIZE_MAX;
    size_t nnf_gate_start_idx = SIZE_MAX;
    size_t poseidon2_external_gate_start_idx = SIZE_MAX;
    size_t poseidon2_internal_gate_start_idx = SIZE_MAX;

    static constexpr recursion_helpers::FunctionFingerprint REDUCE_TO_PAIRING_CHECK_ARITHMETIC = {
        512920, 0xebd9f2f0874391c9ULL, 0x7cb19fcfa60ef258ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint REDUCE_TO_PAIRING_CHECK_MEMORY = {
        34360, 0xe7fd0be5c039f40fULL, 0x2b6269d56d71b9d6ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint REDUCE_TO_PAIRING_CHECK_NNF = {
        280212, 0x5357cf033657dca2ULL, 0xac4ef0dd3519a2a3ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint REDUCE_TO_PAIRING_CHECK_POSEIDON2_EXT = {
        3020, 0x0ec92a899925d755ULL, 0xf23298a21dedf0c0ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint REDUCE_TO_PAIRING_CHECK_POSEIDON2_INT = {
        17214, 0xee3a7ac895f8a6d9ULL, 0x26bfbbd3f6bf889aULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
};

template <typename CircuitBuilder, typename FF>
EccvmPartValidation validate_eccvm_part(
    CircuitBuilder& builder,
    const MergeVerifierVerification::KzgReduceVerifyBatchOpeningClaimValidation& merge_kzg_reduce,
    cdg::StaticAnalyzer_<FF, CircuitBuilder>& analyzer)
{
    EccvmPartValidation result;
    EccvmConstructorValidation constructor;
    auto& arithmetic = builder.blocks.arithmetic;
    auto& elliptic = builder.blocks.elliptic;
    auto& memory = builder.blocks.memory;
    auto& nnf = builder.blocks.nnf;
    auto& poseidon2_external = builder.blocks.poseidon2_external;
    auto& poseidon2_internal = builder.blocks.poseidon2_internal;

    if (!merge_kzg_reduce.is_valid) {
        log_error("previous step wasn't validated correctly. skip eccvm_part");
        return result;
    }

    constructor.arithmetic_gate_start_idx = merge_kzg_reduce.arithmetic_gate_start_idx +
                                            MergeVerifierVerification::KzgReduceVerifyBatchOpeningClaimValidation::
                                                KZG_REDUCE_VERIFY_BATCH_OPENING_CLAIM_ARITHMETIC.gate_count;
    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   arithmetic,
                                                   constructor.arithmetic_gate_start_idx,
                                                   EccvmConstructorValidation::CONSTRUCTOR_ARITHMETIC)) {
        log_error("eccvm_constructor failed: arithmetic fingerprint mismatch at start ",
                  constructor.arithmetic_gate_start_idx);
        return result;
    }
    constructor.is_valid = true;

    result.arithmetic_gate_start_idx =
        constructor.arithmetic_gate_start_idx + EccvmConstructorValidation::CONSTRUCTOR_ARITHMETIC.gate_count;
    result.memory_gate_start_idx =
        merge_kzg_reduce.memory_gate_start_idx + MergeVerifierVerification::KzgReduceVerifyBatchOpeningClaimValidation::
                                                     KZG_REDUCE_VERIFY_BATCH_OPENING_CLAIM_MEMORY.gate_count;
    result.nnf_gate_start_idx =
        merge_kzg_reduce.nnf_gate_start_idx +
        MergeVerifierVerification::KzgReduceVerifyBatchOpeningClaimValidation::KZG_REDUCE_VERIFY_BATCH_OPENING_CLAIM_NNF
            .gate_count;
    result.poseidon2_external_gate_start_idx = merge_kzg_reduce.poseidon2_external_gate_start_idx +
                                               MergeVerifierVerification::KzgReduceVerifyBatchOpeningClaimValidation::
                                                   KZG_REDUCE_VERIFY_BATCH_OPENING_CLAIM_POSEIDON2_EXT.gate_count;
    result.poseidon2_internal_gate_start_idx = merge_kzg_reduce.poseidon2_internal_gate_start_idx +
                                               MergeVerifierVerification::KzgReduceVerifyBatchOpeningClaimValidation::
                                                   KZG_REDUCE_VERIFY_BATCH_OPENING_CLAIM_POSEIDON2_INT.gate_count;

    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   arithmetic,
                                                   result.arithmetic_gate_start_idx,
                                                   EccvmPartValidation::REDUCE_TO_IPA_OPENING_ARITHMETIC)) {
        log_error("eccvm_part failed: arithmetic fingerprint mismatch at start ", result.arithmetic_gate_start_idx);
        return result;
    }
    if (!recursion_helpers::matches_fingerprint_at(
            builder, memory, result.memory_gate_start_idx, EccvmPartValidation::REDUCE_TO_IPA_OPENING_MEMORY)) {
        log_error("eccvm_part failed: memory fingerprint mismatch at start ", result.memory_gate_start_idx);
        return result;
    }
    if (!recursion_helpers::matches_fingerprint_at(
            builder, nnf, result.nnf_gate_start_idx, EccvmPartValidation::REDUCE_TO_IPA_OPENING_NNF)) {
        log_error("eccvm_part failed: nnf fingerprint mismatch at start ", result.nnf_gate_start_idx);
        return result;
    }
    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   poseidon2_external,
                                                   result.poseidon2_external_gate_start_idx,
                                                   EccvmPartValidation::REDUCE_TO_IPA_OPENING_POSEIDON2_EXT)) {
        log_error("eccvm_part failed: poseidon2_external fingerprint mismatch at start ",
                  result.poseidon2_external_gate_start_idx);
        return result;
    }
    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   poseidon2_internal,
                                                   result.poseidon2_internal_gate_start_idx,
                                                   EccvmPartValidation::REDUCE_TO_IPA_OPENING_POSEIDON2_INT)) {
        log_error("eccvm_part failed: poseidon2_internal fingerprint mismatch at start ",
                  result.poseidon2_internal_gate_start_idx);
        return result;
    }

    std::set<size_t> linked_elliptic_gates = recursion_helpers::collect_linked_gates(
        builder,
        analyzer,
        arithmetic,
        result.arithmetic_gate_start_idx,
        result.arithmetic_gate_start_idx + EccvmPartValidation::REDUCE_TO_IPA_OPENING_ARITHMETIC.gate_count,
        elliptic);
    if (linked_elliptic_gates.empty()) {
        log_error("eccvm_part failed: no elliptic gates linked from ECCVM arithmetic range");
        return result;
    }

    auto elliptic_start = recursion_helpers::find_fingerprint_range_containing_any_gates(
        builder, elliptic, linked_elliptic_gates, EccvmPartValidation::REDUCE_TO_IPA_OPENING_ELLIPTIC);
    if (!elliptic_start.has_value()) {
        log_error("eccvm_part failed: no elliptic range matching ECCVM fingerprint contains linked arithmetic gates");
        return result;
    }

    result.elliptic_gate_start_idx = *elliptic_start;
    result.is_valid = true;
    return result;
}

template <typename CircuitBuilder>
TranslatorPartValidation validate_translator_part(CircuitBuilder& builder, const EccvmPartValidation& eccvm_validator)
{
    TranslatorPartValidation result;
    TranslatorConstructorValidation constructor;
    auto& arithmetic = builder.blocks.arithmetic;
    auto& memory = builder.blocks.memory;
    auto& nnf = builder.blocks.nnf;
    auto& poseidon2_external = builder.blocks.poseidon2_external;
    auto& poseidon2_internal = builder.blocks.poseidon2_internal;

    if (!eccvm_validator.is_valid) {
        log_error("eccvm step wasn't validated correctly. skip translator part");
        return result;
    }

    constructor.arithmetic_gate_start_idx =
        eccvm_validator.arithmetic_gate_start_idx + EccvmPartValidation::REDUCE_TO_IPA_OPENING_ARITHMETIC.gate_count;
    constructor.nnf_gate_start_idx =
        eccvm_validator.nnf_gate_start_idx + EccvmPartValidation::REDUCE_TO_IPA_OPENING_NNF.gate_count;
    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   arithmetic,
                                                   constructor.arithmetic_gate_start_idx,
                                                   TranslatorConstructorValidation::CONSTRUCTOR_ARITHMETIC)) {
        log_error("translator_constructor failed: arithmetic fingerprint mismatch at start ",
                  constructor.arithmetic_gate_start_idx);
        return result;
    }
    if (!recursion_helpers::matches_fingerprint_at(
            builder, nnf, constructor.nnf_gate_start_idx, TranslatorConstructorValidation::CONSTRUCTOR_NNF)) {
        log_error("translator_constructor failed: nnf fingerprint mismatch at start ", constructor.nnf_gate_start_idx);
        return result;
    }
    constructor.is_valid = true;

    result.arithmetic_gate_start_idx =
        constructor.arithmetic_gate_start_idx + TranslatorConstructorValidation::CONSTRUCTOR_ARITHMETIC.gate_count;
    result.memory_gate_start_idx =
        eccvm_validator.memory_gate_start_idx + EccvmPartValidation::REDUCE_TO_IPA_OPENING_MEMORY.gate_count;
    result.nnf_gate_start_idx =
        constructor.nnf_gate_start_idx + TranslatorConstructorValidation::CONSTRUCTOR_NNF.gate_count;
    result.poseidon2_external_gate_start_idx = eccvm_validator.poseidon2_external_gate_start_idx +
                                               EccvmPartValidation::REDUCE_TO_IPA_OPENING_POSEIDON2_EXT.gate_count;
    result.poseidon2_internal_gate_start_idx = eccvm_validator.poseidon2_internal_gate_start_idx +
                                               EccvmPartValidation::REDUCE_TO_IPA_OPENING_POSEIDON2_INT.gate_count;

    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   arithmetic,
                                                   result.arithmetic_gate_start_idx,
                                                   TranslatorPartValidation::REDUCE_TO_PAIRING_CHECK_ARITHMETIC)) {
        log_error("translator_part failed: arithmetic fingerprint mismatch at start ",
                  result.arithmetic_gate_start_idx);
        return result;
    }
    if (!recursion_helpers::matches_fingerprint_at(
            builder, memory, result.memory_gate_start_idx, TranslatorPartValidation::REDUCE_TO_PAIRING_CHECK_MEMORY)) {
        log_error("translator_part failed: memory fingerprint mismatch at start ", result.memory_gate_start_idx);
        return result;
    }
    if (!recursion_helpers::matches_fingerprint_at(
            builder, nnf, result.nnf_gate_start_idx, TranslatorPartValidation::REDUCE_TO_PAIRING_CHECK_NNF)) {
        log_error("translator_part failed: nnf fingerprint mismatch at start ", result.nnf_gate_start_idx);
        return result;
    }
    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   poseidon2_external,
                                                   result.poseidon2_external_gate_start_idx,
                                                   TranslatorPartValidation::REDUCE_TO_PAIRING_CHECK_POSEIDON2_EXT)) {
        log_error("translator_part failed: poseidon2_external fingerprint mismatch at start ",
                  result.poseidon2_external_gate_start_idx);
        return result;
    }
    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   poseidon2_internal,
                                                   result.poseidon2_internal_gate_start_idx,
                                                   TranslatorPartValidation::REDUCE_TO_PAIRING_CHECK_POSEIDON2_INT)) {
        log_error("translator_part failed: poseidon2_internal fingerprint mismatch at start ",
                  result.poseidon2_internal_gate_start_idx);
        return result;
    }

    result.is_valid = true;
    return result;
}

} // namespace ECCVMTranslatorVerification
