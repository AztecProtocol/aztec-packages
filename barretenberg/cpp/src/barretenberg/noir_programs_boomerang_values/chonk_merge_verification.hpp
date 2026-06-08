#pragma once
#include "barretenberg/noir_programs_boomerang_values/boomerang_chonk_kernel_io_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
using FunctionFingerPrint = recursion_helpers::FunctionFingerprint;
using namespace KernelIOVerification;

namespace MergeVerifierVerification {
// Stages with no new gates in the current trace:
//   - Merge:shift_size
//   - Merge:evaluations
struct MergeTableCommitmentsValidation {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    size_t nnf_gate_start_idx = SIZE_MAX;
    static constexpr recursion_helpers::FunctionFingerprint MERGED_TABLE_COMMITMENTS_ARITHMETIC = {
        316, 0xb44f41ca2be07184ULL, 0x4dae25114ab906faULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint MERGED_TABLE_COMMITMENTS_NNF = {
        248, 0xff2ca3c0bde9b337ULL, 0xb01a3cb2b503141bULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
};

struct DegreeCheckChallengesValidation {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    size_t poseidon2_external_gate_start_idx = SIZE_MAX;
    size_t poseidon2_internal_gate_start_idx = SIZE_MAX;
    static constexpr recursion_helpers::FunctionFingerprint DEGREE_CHECK_CHALLENGES_ARITHMETIC = {
        96, 0xa2e0eeda7254b643ULL, 0xb61d4e684dac79c3ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint DEGREE_CHECK_CHALLENGES_POSEIDON2_EXT = {
        70, 0x0ec92a899925d755ULL, 0xc30dd3ab427eb0c0ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint DEGREE_CHECK_CHALLENGES_POSEIDON2_INT = {
        399, 0xee3a7ac895f8a6d9ULL, 0x6619c8437f11d164ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
};

struct ReversedBatchedLeftTablesValidation {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    size_t nnf_gate_start_idx = SIZE_MAX;
    static constexpr recursion_helpers::FunctionFingerprint REVERSED_BATCHED_LEFT_TABLES_ARITHMETIC = {
        79, 0xb44f41ca2be07184ULL, 0x7e14d02952bda35aULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint REVERSED_BATCHED_LEFT_TABLES_NNF = {
        62, 0xff2ca3c0bde9b337ULL, 0x6f7911bba1f0ffe7ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
};

struct ShplonkBatchingChallengesValidation {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    size_t poseidon2_external_gate_start_idx = SIZE_MAX;
    size_t poseidon2_internal_gate_start_idx = SIZE_MAX;
    static constexpr recursion_helpers::FunctionFingerprint SHPLONK_BATCHING_CHALLENGES_ARITHMETIC = {
        184, 0x241e4591236fc64cULL, 0x8268049c680bd920ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint SHPLONK_BATCHING_CHALLENGES_POSEIDON2_EXT = {
        80, 0x0ec92a899925d755ULL, 0x0a2cc4995f4c42d1ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint SHPLONK_BATCHING_CHALLENGES_POSEIDON2_INT = {
        456, 0xee3a7ac895f8a6d9ULL, 0xfc04fb28e12830ffULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
};

struct KappaValidation {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    size_t poseidon2_external_gate_start_idx = SIZE_MAX;
    size_t poseidon2_internal_gate_start_idx = SIZE_MAX;
    static constexpr recursion_helpers::FunctionFingerprint KAPPA_ARITHMETIC = {
        184, 0x60f86c38585de9b2ULL, 0x01d6a07f1fd0fb48ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint KAPPA_POSEIDON2_EXT = {
        10, 0x22f75c874568e52cULL, 0x22f75c874568e52cULL, 10
    };
    static constexpr recursion_helpers::FunctionFingerprint KAPPA_POSEIDON2_INT = {
        57, 0xee3a7ac895f8a6d9ULL, 0xc950d2cdbec675d4ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
};

struct CheckConcatenationIdentitiesValidation {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    static constexpr recursion_helpers::FunctionFingerprint CHECK_CONCATENATION_IDENTITIES_ARITHMETIC = {
        12, 0x09b1e019d207fc0fULL, 0x09b1e019d207fc0fULL, 12
    };
};

struct CheckDegreeIdentityValidation {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    static constexpr recursion_helpers::FunctionFingerprint CHECK_DEGREE_IDENTITY_ARITHMETIC = {
        9, 0x1194a1ba980c5dd9ULL, 0x1194a1ba980c5dd9ULL, 9
    };
};

struct ShplonkBatchedQuotientValidation {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    size_t nnf_gate_start_idx = SIZE_MAX;
    static constexpr recursion_helpers::FunctionFingerprint SHPLONK_BATCHED_QUOTIENT_ARITHMETIC = {
        79, 0xb44f41ca2be07184ULL, 0x7e14d02952bda35aULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint SHPLONK_BATCHED_QUOTIENT_NNF = {
        62, 0xff2ca3c0bde9b337ULL, 0x6f7911bba1f0ffe7ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
};

struct ShplonkOpeningChallengeValidation {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    size_t poseidon2_external_gate_start_idx = SIZE_MAX;
    size_t poseidon2_internal_gate_start_idx = SIZE_MAX;
    static constexpr recursion_helpers::FunctionFingerprint SHPLONK_OPENING_CHALLENGE_ARITHMETIC = {
        71, 0xa2e0eeda7254b643ULL, 0x06fe733afd981fb2ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint SHPLONK_OPENING_CHALLENGE_POSEIDON2_EXT = {
        60, 0x0ec92a899925d755ULL, 0x46682aada49238a4ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint SHPLONK_OPENING_CHALLENGE_POSEIDON2_INT = {
        342, 0xee3a7ac895f8a6d9ULL, 0x73840b6c70a88162ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
};

struct PrepareBatchedOpeningClaimValidation {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    static constexpr recursion_helpers::FunctionFingerprint PREPARE_BATCHED_OPENING_CLAIM_ARITHMETIC = {
        36, 0xb6c434dcf56cdbabULL, 0x7c3a0cd845cc1d3cULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
};

struct KzgReduceVerifyBatchOpeningClaimValidation {
    bool is_valid = false;
    size_t arithmetic_gate_start_idx = SIZE_MAX;
    size_t memory_gate_start_idx = SIZE_MAX;
    size_t nnf_gate_start_idx = SIZE_MAX;
    size_t poseidon2_external_gate_start_idx = SIZE_MAX;
    size_t poseidon2_internal_gate_start_idx = SIZE_MAX;
    static constexpr recursion_helpers::FunctionFingerprint KZG_REDUCE_VERIFY_BATCH_OPENING_CLAIM_ARITHMETIC = {
        92125, 0xb44f41ca2be07184ULL, 0x2379f2276c1a90b9ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint KZG_REDUCE_VERIFY_BATCH_OPENING_CLAIM_MEMORY = {
        4595, 0xe7fd0be5c039f40fULL, 0x844193b01ad1fec7ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint KZG_REDUCE_VERIFY_BATCH_OPENING_CLAIM_NNF = {
        52324, 0xff2ca3c0bde9b337ULL, 0xf563a17c979a9861ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint KZG_REDUCE_VERIFY_BATCH_OPENING_CLAIM_POSEIDON2_EXT = {
        20, 0x0ec92a899925d755ULL, 0x0ec92a899925d755ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint KZG_REDUCE_VERIFY_BATCH_OPENING_CLAIM_POSEIDON2_INT = {
        114, 0xee3a7ac895f8a6d9ULL, 0x8112ac29167e98daULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
};

template <typename CircuitBuilder>
MergeTableCommitmentsValidation validate_merge_table_commitments(CircuitBuilder& builder,
                                                                 const KernelIOPartValidation& kernel_io)
{
    MergeTableCommitmentsValidation commitments;
    auto& arith = builder.blocks.arithmetic;
    auto& nnf = builder.blocks.nnf;

    if (!kernel_io.is_valid) {
        log_error("kernel_io part is incorrect. There's no meaning to validate Merge Verifier part");
        return commitments;
    }
    commitments.arithmetic_gate_start_idx = kernel_io.return_data_assert_equal_arithmetic_start +
                                            kernel_io.KERNEL_RETURN_DATA_ASSERT_EQUAL_ARITHMETIC.gate_count;
    commitments.nnf_gate_start_idx =
        kernel_io.return_data_assert_equal_nnf_start + kernel_io.KERNEL_RETURN_DATA_ASSERT_EQUAL_NNF.gate_count;

    if (!recursion_helpers::matches_fingerprint_at(
            builder, arith, commitments.arithmetic_gate_start_idx, commitments.MERGED_TABLE_COMMITMENTS_ARITHMETIC)) {
        log_error("merge table commitments failed: MERGE_TABLE_COMMITMENTS_ARITHMETIC fingerprint mismatch at start ",
                  commitments.arithmetic_gate_start_idx);
        return commitments;
    }

    if (!recursion_helpers::matches_fingerprint_at(
            builder, nnf, commitments.nnf_gate_start_idx, commitments.MERGED_TABLE_COMMITMENTS_NNF)) {
        log_error("kernel_io_reconstruct failed: RECONSTRUCT_FROM_PUBLIC_NNF fingerprint mismatch at start ",
                  kernel_io.reconstruct_from_public_nnf_start);
        return commitments;
    }
    commitments.is_valid = true;
    return commitments;
}

template <typename CircuitBuilder>
DegreeCheckChallengesValidation validate_degree_check_challenges(
    CircuitBuilder& builder,
    const MergeTableCommitmentsValidation& merge_table_commitments,
    const KZGVerification::MaskingChallengeValidationResult& masking_challenge)
{
    DegreeCheckChallengesValidation degree_challenges;
    auto& arith = builder.blocks.arithmetic;
    auto& poseidon2_external = builder.blocks.poseidon2_external;
    auto& poseidon2_internal = builder.blocks.poseidon2_internal;

    if (!merge_table_commitments.is_valid || !masking_challenge.is_valid) {
        log_error("previous step wasn't validated correctly. skip this part");
        return degree_challenges;
    }

    degree_challenges.arithmetic_gate_start_idx =
        merge_table_commitments.arithmetic_gate_start_idx +
        MergeTableCommitmentsValidation::MERGED_TABLE_COMMITMENTS_ARITHMETIC.gate_count;
    degree_challenges.poseidon2_external_gate_start_idx =
        masking_challenge.poseidon2_external_gate_start_idx + KZGVerification::MASKING_CHALLENGE_POSEIDON2_EXT.gate_count;
    degree_challenges.poseidon2_internal_gate_start_idx =
        masking_challenge.poseidon2_internal_gate_start_idx + KZGVerification::MASKING_CHALLENGE_POSEIDON2_INT.gate_count;

    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   arith,
                                                   degree_challenges.arithmetic_gate_start_idx,
                                                   DegreeCheckChallengesValidation::DEGREE_CHECK_CHALLENGES_ARITHMETIC)) {
        log_error("degree_check_challenges failed: arithmetic fingerprint mismatch at start ",
                  degree_challenges.arithmetic_gate_start_idx);
        return degree_challenges;
    }

    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   poseidon2_external,
                                                   degree_challenges.poseidon2_external_gate_start_idx,
                                                   DegreeCheckChallengesValidation::DEGREE_CHECK_CHALLENGES_POSEIDON2_EXT)) {
        log_error("degree_check_challenges failed: poseidon2_external fingerprint mismatch at start ",
                  degree_challenges.poseidon2_external_gate_start_idx);
        return degree_challenges;
    }

    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   poseidon2_internal,
                                                   degree_challenges.poseidon2_internal_gate_start_idx,
                                                   DegreeCheckChallengesValidation::DEGREE_CHECK_CHALLENGES_POSEIDON2_INT)) {
        log_error("degree_check_challenges failed: poseidon2_internal fingerprint mismatch at start ",
                  degree_challenges.poseidon2_internal_gate_start_idx);
        return degree_challenges;
    }

    degree_challenges.is_valid = true;
    return degree_challenges;
}

template <typename CircuitBuilder>
ReversedBatchedLeftTablesValidation validate_reversed_batched_left_tables(
    CircuitBuilder& builder,
    const MergeTableCommitmentsValidation& merge_table_commitments,
    const DegreeCheckChallengesValidation& degree_check_challenges)
{
    ReversedBatchedLeftTablesValidation reversed;
    auto& arith = builder.blocks.arithmetic;
    auto& nnf = builder.blocks.nnf;

    if (!merge_table_commitments.is_valid || !degree_check_challenges.is_valid) {
        log_error("previous step wasn't validated correctly. skip reversed_batched_left_tables");
        return reversed;
    }

    reversed.arithmetic_gate_start_idx =
        degree_check_challenges.arithmetic_gate_start_idx +
        DegreeCheckChallengesValidation::DEGREE_CHECK_CHALLENGES_ARITHMETIC.gate_count;
    reversed.nnf_gate_start_idx =
        merge_table_commitments.nnf_gate_start_idx + MergeTableCommitmentsValidation::MERGED_TABLE_COMMITMENTS_NNF.gate_count;

    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   arith,
                                                   reversed.arithmetic_gate_start_idx,
                                                   ReversedBatchedLeftTablesValidation::REVERSED_BATCHED_LEFT_TABLES_ARITHMETIC)) {
        log_error("reversed_batched_left_tables failed: arithmetic fingerprint mismatch at start ",
                  reversed.arithmetic_gate_start_idx);
        return reversed;
    }

    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   nnf,
                                                   reversed.nnf_gate_start_idx,
                                                   ReversedBatchedLeftTablesValidation::REVERSED_BATCHED_LEFT_TABLES_NNF)) {
        log_error("reversed_batched_left_tables failed: nnf fingerprint mismatch at start ",
                  reversed.nnf_gate_start_idx);
        return reversed;
    }

    reversed.is_valid = true;
    return reversed;
}

template <typename CircuitBuilder>
ShplonkBatchingChallengesValidation validate_shplonk_batching_challenges(
    CircuitBuilder& builder,
    const DegreeCheckChallengesValidation& degree_check_challenges,
    const ReversedBatchedLeftTablesValidation& reversed_batched_left_tables)
{
    ShplonkBatchingChallengesValidation shplonk_batching;
    auto& arith = builder.blocks.arithmetic;
    auto& poseidon2_external = builder.blocks.poseidon2_external;
    auto& poseidon2_internal = builder.blocks.poseidon2_internal;

    if (!degree_check_challenges.is_valid || !reversed_batched_left_tables.is_valid) {
        log_error("previous step wasn't validated correctly. skip shplonk_batching_challenges");
        return shplonk_batching;
    }

    shplonk_batching.arithmetic_gate_start_idx =
        reversed_batched_left_tables.arithmetic_gate_start_idx +
        ReversedBatchedLeftTablesValidation::REVERSED_BATCHED_LEFT_TABLES_ARITHMETIC.gate_count;
    shplonk_batching.poseidon2_external_gate_start_idx =
        degree_check_challenges.poseidon2_external_gate_start_idx +
        DegreeCheckChallengesValidation::DEGREE_CHECK_CHALLENGES_POSEIDON2_EXT.gate_count;
    shplonk_batching.poseidon2_internal_gate_start_idx =
        degree_check_challenges.poseidon2_internal_gate_start_idx +
        DegreeCheckChallengesValidation::DEGREE_CHECK_CHALLENGES_POSEIDON2_INT.gate_count;

    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   arith,
                                                   shplonk_batching.arithmetic_gate_start_idx,
                                                   ShplonkBatchingChallengesValidation::SHPLONK_BATCHING_CHALLENGES_ARITHMETIC)) {
        log_error("shplonk_batching_challenges failed: arithmetic fingerprint mismatch at start ",
                  shplonk_batching.arithmetic_gate_start_idx);
        return shplonk_batching;
    }

    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   poseidon2_external,
                                                   shplonk_batching.poseidon2_external_gate_start_idx,
                                                   ShplonkBatchingChallengesValidation::SHPLONK_BATCHING_CHALLENGES_POSEIDON2_EXT)) {
        log_error("shplonk_batching_challenges failed: poseidon2_external fingerprint mismatch at start ",
                  shplonk_batching.poseidon2_external_gate_start_idx);
        return shplonk_batching;
    }

    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   poseidon2_internal,
                                                   shplonk_batching.poseidon2_internal_gate_start_idx,
                                                   ShplonkBatchingChallengesValidation::SHPLONK_BATCHING_CHALLENGES_POSEIDON2_INT)) {
        log_error("shplonk_batching_challenges failed: poseidon2_internal fingerprint mismatch at start ",
                  shplonk_batching.poseidon2_internal_gate_start_idx);
        return shplonk_batching;
    }

    shplonk_batching.is_valid = true;
    return shplonk_batching;
}

template <typename CircuitBuilder>
KappaValidation validate_kappa(CircuitBuilder& builder,
                               const ShplonkBatchingChallengesValidation& shplonk_batching_challenges)
{
    KappaValidation kappa;
    auto& arith = builder.blocks.arithmetic;
    auto& poseidon2_external = builder.blocks.poseidon2_external;
    auto& poseidon2_internal = builder.blocks.poseidon2_internal;

    if (!shplonk_batching_challenges.is_valid) {
        log_error("previous step wasn't validated correctly. skip kappa");
        return kappa;
    }

    kappa.arithmetic_gate_start_idx =
        shplonk_batching_challenges.arithmetic_gate_start_idx +
        ShplonkBatchingChallengesValidation::SHPLONK_BATCHING_CHALLENGES_ARITHMETIC.gate_count;
    kappa.poseidon2_external_gate_start_idx =
        shplonk_batching_challenges.poseidon2_external_gate_start_idx +
        ShplonkBatchingChallengesValidation::SHPLONK_BATCHING_CHALLENGES_POSEIDON2_EXT.gate_count;
    kappa.poseidon2_internal_gate_start_idx =
        shplonk_batching_challenges.poseidon2_internal_gate_start_idx +
        ShplonkBatchingChallengesValidation::SHPLONK_BATCHING_CHALLENGES_POSEIDON2_INT.gate_count;

    if (!recursion_helpers::matches_fingerprint_at(
            builder, arith, kappa.arithmetic_gate_start_idx, KappaValidation::KAPPA_ARITHMETIC)) {
        log_error("kappa failed: arithmetic fingerprint mismatch at start ", kappa.arithmetic_gate_start_idx);
        return kappa;
    }
    if (!recursion_helpers::matches_fingerprint_at(
            builder, poseidon2_external, kappa.poseidon2_external_gate_start_idx, KappaValidation::KAPPA_POSEIDON2_EXT)) {
        log_error("kappa failed: poseidon2_external fingerprint mismatch at start ",
                  kappa.poseidon2_external_gate_start_idx);
        return kappa;
    }
    if (!recursion_helpers::matches_fingerprint_at(
            builder, poseidon2_internal, kappa.poseidon2_internal_gate_start_idx, KappaValidation::KAPPA_POSEIDON2_INT)) {
        log_error("kappa failed: poseidon2_internal fingerprint mismatch at start ",
                  kappa.poseidon2_internal_gate_start_idx);
        return kappa;
    }

    kappa.is_valid = true;
    return kappa;
}

template <typename CircuitBuilder>
CheckConcatenationIdentitiesValidation validate_check_concatenation_identities(CircuitBuilder& builder,
                                                                               const KappaValidation& kappa)
{
    CheckConcatenationIdentitiesValidation concatenation;
    auto& arith = builder.blocks.arithmetic;

    if (!kappa.is_valid) {
        log_error("previous step wasn't validated correctly. skip check_concatenation_identities");
        return concatenation;
    }

    concatenation.arithmetic_gate_start_idx = kappa.arithmetic_gate_start_idx + KappaValidation::KAPPA_ARITHMETIC.gate_count;
    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   arith,
                                                   concatenation.arithmetic_gate_start_idx,
                                                   CheckConcatenationIdentitiesValidation::CHECK_CONCATENATION_IDENTITIES_ARITHMETIC)) {
        log_error("check_concatenation_identities failed: arithmetic fingerprint mismatch at start ",
                  concatenation.arithmetic_gate_start_idx);
        return concatenation;
    }
    concatenation.is_valid = true;
    return concatenation;
}

template <typename CircuitBuilder>
CheckDegreeIdentityValidation validate_check_degree_identity(
    CircuitBuilder& builder, const CheckConcatenationIdentitiesValidation& concatenation_identities)
{
    CheckDegreeIdentityValidation degree_identity;
    auto& arith = builder.blocks.arithmetic;

    if (!concatenation_identities.is_valid) {
        log_error("previous step wasn't validated correctly. skip check_degree_identity");
        return degree_identity;
    }

    degree_identity.arithmetic_gate_start_idx =
        concatenation_identities.arithmetic_gate_start_idx +
        CheckConcatenationIdentitiesValidation::CHECK_CONCATENATION_IDENTITIES_ARITHMETIC.gate_count;
    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   arith,
                                                   degree_identity.arithmetic_gate_start_idx,
                                                   CheckDegreeIdentityValidation::CHECK_DEGREE_IDENTITY_ARITHMETIC)) {
        log_error("check_degree_identity failed: arithmetic fingerprint mismatch at start ",
                  degree_identity.arithmetic_gate_start_idx);
        return degree_identity;
    }
    degree_identity.is_valid = true;
    return degree_identity;
}

template <typename CircuitBuilder>
ShplonkBatchedQuotientValidation validate_shplonk_batched_quotient(
    CircuitBuilder& builder,
    const ReversedBatchedLeftTablesValidation& reversed_batched_left_tables,
    const CheckDegreeIdentityValidation& degree_identity)
{
    ShplonkBatchedQuotientValidation quotient;
    auto& arith = builder.blocks.arithmetic;
    auto& nnf = builder.blocks.nnf;

    if (!reversed_batched_left_tables.is_valid || !degree_identity.is_valid) {
        log_error("previous step wasn't validated correctly. skip shplonk_batched_quotient");
        return quotient;
    }

    quotient.arithmetic_gate_start_idx =
        degree_identity.arithmetic_gate_start_idx + CheckDegreeIdentityValidation::CHECK_DEGREE_IDENTITY_ARITHMETIC.gate_count;
    quotient.nnf_gate_start_idx =
        reversed_batched_left_tables.nnf_gate_start_idx +
        ReversedBatchedLeftTablesValidation::REVERSED_BATCHED_LEFT_TABLES_NNF.gate_count;

    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   arith,
                                                   quotient.arithmetic_gate_start_idx,
                                                   ShplonkBatchedQuotientValidation::SHPLONK_BATCHED_QUOTIENT_ARITHMETIC)) {
        log_error("shplonk_batched_quotient failed: arithmetic fingerprint mismatch at start ",
                  quotient.arithmetic_gate_start_idx);
        return quotient;
    }
    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   nnf,
                                                   quotient.nnf_gate_start_idx,
                                                   ShplonkBatchedQuotientValidation::SHPLONK_BATCHED_QUOTIENT_NNF)) {
        log_error("shplonk_batched_quotient failed: nnf fingerprint mismatch at start ", quotient.nnf_gate_start_idx);
        return quotient;
    }
    quotient.is_valid = true;
    return quotient;
}

template <typename CircuitBuilder>
ShplonkOpeningChallengeValidation validate_shplonk_opening_challenge(
    CircuitBuilder& builder,
    const ShplonkBatchedQuotientValidation& shplonk_batched_quotient,
    const KappaValidation& kappa)
{
    ShplonkOpeningChallengeValidation opening_challenge;
    auto& arith = builder.blocks.arithmetic;
    auto& poseidon2_external = builder.blocks.poseidon2_external;
    auto& poseidon2_internal = builder.blocks.poseidon2_internal;

    if (!shplonk_batched_quotient.is_valid || !kappa.is_valid) {
        log_error("previous step wasn't validated correctly. skip shplonk_opening_challenge");
        return opening_challenge;
    }

    opening_challenge.arithmetic_gate_start_idx =
        shplonk_batched_quotient.arithmetic_gate_start_idx +
        ShplonkBatchedQuotientValidation::SHPLONK_BATCHED_QUOTIENT_ARITHMETIC.gate_count;
    opening_challenge.poseidon2_external_gate_start_idx =
        kappa.poseidon2_external_gate_start_idx + KappaValidation::KAPPA_POSEIDON2_EXT.gate_count;
    opening_challenge.poseidon2_internal_gate_start_idx =
        kappa.poseidon2_internal_gate_start_idx + KappaValidation::KAPPA_POSEIDON2_INT.gate_count;

    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   arith,
                                                   opening_challenge.arithmetic_gate_start_idx,
                                                   ShplonkOpeningChallengeValidation::SHPLONK_OPENING_CHALLENGE_ARITHMETIC)) {
        log_error("shplonk_opening_challenge failed: arithmetic fingerprint mismatch at start ",
                  opening_challenge.arithmetic_gate_start_idx);
        return opening_challenge;
    }
    if (!recursion_helpers::matches_fingerprint_at(
            builder,
            poseidon2_external,
            opening_challenge.poseidon2_external_gate_start_idx,
            ShplonkOpeningChallengeValidation::SHPLONK_OPENING_CHALLENGE_POSEIDON2_EXT)) {
        log_error("shplonk_opening_challenge failed: poseidon2_external fingerprint mismatch at start ",
                  opening_challenge.poseidon2_external_gate_start_idx);
        return opening_challenge;
    }
    if (!recursion_helpers::matches_fingerprint_at(
            builder,
            poseidon2_internal,
            opening_challenge.poseidon2_internal_gate_start_idx,
            ShplonkOpeningChallengeValidation::SHPLONK_OPENING_CHALLENGE_POSEIDON2_INT)) {
        log_error("shplonk_opening_challenge failed: poseidon2_internal fingerprint mismatch at start ",
                  opening_challenge.poseidon2_internal_gate_start_idx);
        return opening_challenge;
    }
    opening_challenge.is_valid = true;
    return opening_challenge;
}

template <typename CircuitBuilder>
PrepareBatchedOpeningClaimValidation validate_prepare_batched_opening_claim(
    CircuitBuilder& builder, const ShplonkOpeningChallengeValidation& shplonk_opening_challenge)
{
    PrepareBatchedOpeningClaimValidation prepare;
    auto& arith = builder.blocks.arithmetic;

    if (!shplonk_opening_challenge.is_valid) {
        log_error("previous step wasn't validated correctly. skip prepare_batched_opening_claim");
        return prepare;
    }

    prepare.arithmetic_gate_start_idx =
        shplonk_opening_challenge.arithmetic_gate_start_idx +
        ShplonkOpeningChallengeValidation::SHPLONK_OPENING_CHALLENGE_ARITHMETIC.gate_count;
    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   arith,
                                                   prepare.arithmetic_gate_start_idx,
                                                   PrepareBatchedOpeningClaimValidation::PREPARE_BATCHED_OPENING_CLAIM_ARITHMETIC)) {
        log_error("prepare_batched_opening_claim failed: arithmetic fingerprint mismatch at start ",
                  prepare.arithmetic_gate_start_idx);
        return prepare;
    }
    prepare.is_valid = true;
    return prepare;
}

template <typename CircuitBuilder>
KzgReduceVerifyBatchOpeningClaimValidation validate_kzg_reduce_verify_batch_opening_claim(
    CircuitBuilder& builder,
    const PrepareBatchedOpeningClaimValidation& prepare_batched_opening_claim,
    const ShplonkBatchedQuotientValidation& shplonk_batched_quotient,
    const ShplonkOpeningChallengeValidation& shplonk_opening_challenge,
    const KZGVerification::BatchMulValidationResult& megazk_batch_mul)
{
    KzgReduceVerifyBatchOpeningClaimValidation kzg_reduce;
    auto& arith = builder.blocks.arithmetic;
    auto& memory = builder.blocks.memory;
    auto& nnf = builder.blocks.nnf;
    auto& poseidon2_external = builder.blocks.poseidon2_external;
    auto& poseidon2_internal = builder.blocks.poseidon2_internal;

    if (!prepare_batched_opening_claim.is_valid || !shplonk_batched_quotient.is_valid ||
        !shplonk_opening_challenge.is_valid || !megazk_batch_mul.is_valid) {
        log_error("previous step wasn't validated correctly. skip kzg_reduce_verify_batch_opening_claim");
        return kzg_reduce;
    }

    kzg_reduce.arithmetic_gate_start_idx =
        prepare_batched_opening_claim.arithmetic_gate_start_idx +
        PrepareBatchedOpeningClaimValidation::PREPARE_BATCHED_OPENING_CLAIM_ARITHMETIC.gate_count;
    kzg_reduce.memory_gate_start_idx =
        megazk_batch_mul.memory_gate_start_idx + KZGVerification::BATCH_MUL_MEMORY.gate_count;
    kzg_reduce.nnf_gate_start_idx =
        shplonk_batched_quotient.nnf_gate_start_idx + ShplonkBatchedQuotientValidation::SHPLONK_BATCHED_QUOTIENT_NNF.gate_count;
    kzg_reduce.poseidon2_external_gate_start_idx =
        shplonk_opening_challenge.poseidon2_external_gate_start_idx +
        ShplonkOpeningChallengeValidation::SHPLONK_OPENING_CHALLENGE_POSEIDON2_EXT.gate_count;
    kzg_reduce.poseidon2_internal_gate_start_idx =
        shplonk_opening_challenge.poseidon2_internal_gate_start_idx +
        ShplonkOpeningChallengeValidation::SHPLONK_OPENING_CHALLENGE_POSEIDON2_INT.gate_count;

    if (!recursion_helpers::matches_fingerprint_at(
            builder, arith, kzg_reduce.arithmetic_gate_start_idx,
            KzgReduceVerifyBatchOpeningClaimValidation::KZG_REDUCE_VERIFY_BATCH_OPENING_CLAIM_ARITHMETIC)) {
        log_error("kzg_reduce_verify_batch_opening_claim failed: arithmetic fingerprint mismatch at start ",
                  kzg_reduce.arithmetic_gate_start_idx);
        return kzg_reduce;
    }
    if (!recursion_helpers::matches_fingerprint_at(
            builder, memory, kzg_reduce.memory_gate_start_idx,
            KzgReduceVerifyBatchOpeningClaimValidation::KZG_REDUCE_VERIFY_BATCH_OPENING_CLAIM_MEMORY)) {
        log_error("kzg_reduce_verify_batch_opening_claim failed: memory fingerprint mismatch at start ",
                  kzg_reduce.memory_gate_start_idx);
        return kzg_reduce;
    }
    if (!recursion_helpers::matches_fingerprint_at(
            builder, nnf, kzg_reduce.nnf_gate_start_idx,
            KzgReduceVerifyBatchOpeningClaimValidation::KZG_REDUCE_VERIFY_BATCH_OPENING_CLAIM_NNF)) {
        log_error("kzg_reduce_verify_batch_opening_claim failed: nnf fingerprint mismatch at start ",
                  kzg_reduce.nnf_gate_start_idx);
        return kzg_reduce;
    }
    if (!recursion_helpers::matches_fingerprint_at(
            builder, poseidon2_external, kzg_reduce.poseidon2_external_gate_start_idx,
            KzgReduceVerifyBatchOpeningClaimValidation::KZG_REDUCE_VERIFY_BATCH_OPENING_CLAIM_POSEIDON2_EXT)) {
        log_error("kzg_reduce_verify_batch_opening_claim failed: poseidon2_external fingerprint mismatch at start ",
                  kzg_reduce.poseidon2_external_gate_start_idx);
        return kzg_reduce;
    }
    if (!recursion_helpers::matches_fingerprint_at(
            builder, poseidon2_internal, kzg_reduce.poseidon2_internal_gate_start_idx,
            KzgReduceVerifyBatchOpeningClaimValidation::KZG_REDUCE_VERIFY_BATCH_OPENING_CLAIM_POSEIDON2_INT)) {
        log_error("kzg_reduce_verify_batch_opening_claim failed: poseidon2_internal fingerprint mismatch at start ",
                  kzg_reduce.poseidon2_internal_gate_start_idx);
        return kzg_reduce;
    }

    kzg_reduce.is_valid = true;
    return kzg_reduce;
}

template <typename CircuitBuilder>
KzgReduceVerifyBatchOpeningClaimValidation validate_merge_verifier(
    CircuitBuilder& builder,
    const KernelIOPartValidation& kernel_io,
    const KZGVerification::MaskingChallengeValidationResult& masking_challenge,
    const KZGVerification::BatchMulValidationResult& megazk_batch_mul)
{
    KzgReduceVerifyBatchOpeningClaimValidation result;
    auto merge_table_commitments = validate_merge_table_commitments(builder, kernel_io);
    if (!merge_table_commitments.is_valid) {
        return result;
    }

    auto degree_check_challenges = validate_degree_check_challenges(builder, merge_table_commitments, masking_challenge);
    if (!degree_check_challenges.is_valid) {
        return result;
    }

    auto reversed_batched_left_tables =
        validate_reversed_batched_left_tables(builder, merge_table_commitments, degree_check_challenges);
    if (!reversed_batched_left_tables.is_valid) {
        return result;
    }

    auto shplonk_batching_challenges =
        validate_shplonk_batching_challenges(builder, degree_check_challenges, reversed_batched_left_tables);
    if (!shplonk_batching_challenges.is_valid) {
        return result;
    }

    auto kappa = validate_kappa(builder, shplonk_batching_challenges);
    if (!kappa.is_valid) {
        return result;
    }

    auto concatenation_identities = validate_check_concatenation_identities(builder, kappa);
    if (!concatenation_identities.is_valid) {
        return result;
    }

    auto degree_identity = validate_check_degree_identity(builder, concatenation_identities);
    if (!degree_identity.is_valid) {
        return result;
    }

    auto shplonk_batched_quotient =
        validate_shplonk_batched_quotient(builder, reversed_batched_left_tables, degree_identity);
    if (!shplonk_batched_quotient.is_valid) {
        return result;
    }

    auto shplonk_opening_challenge = validate_shplonk_opening_challenge(builder, shplonk_batched_quotient, kappa);
    if (!shplonk_opening_challenge.is_valid) {
        return result;
    }

    auto prepare_batched_opening_claim = validate_prepare_batched_opening_claim(builder, shplonk_opening_challenge);
    if (!prepare_batched_opening_claim.is_valid) {
        return result;
    }

    result = validate_kzg_reduce_verify_batch_opening_claim(
        builder, prepare_batched_opening_claim, shplonk_batched_quotient, shplonk_opening_challenge, megazk_batch_mul);
    return result;
}

} // namespace MergeVerifierVerification
