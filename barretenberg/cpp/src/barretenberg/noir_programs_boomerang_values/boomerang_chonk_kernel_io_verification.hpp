#pragma once
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"
using FunctionFingerPrint = recursion_helpers::FunctionFingerprint;

namespace KernelIOVerification {

struct KernelIOPartValidation {
    bool is_valid = false;
    size_t reconstruct_from_public_arithmetic_start = SIZE_MAX;
    size_t reconstruct_from_public_nnf_start = SIZE_MAX;
    size_t return_data_assert_equal_arithmetic_start = SIZE_MAX;
    size_t return_data_assert_equal_nnf_start = SIZE_MAX;
    static constexpr recursion_helpers::FunctionFingerprint RECONSTRUCT_FROM_PUBLIC_ARITHMETIC = {
        553, 0xb44f41ca2be07184ULL, 0x891d45bfdb04a403ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint RECONSTRUCT_FROM_PUBLIC_NNF = {
        434, 0xff2ca3c0bde9b337ULL, 0x58533760539f7098ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };

    static constexpr recursion_helpers::FunctionFingerprint KERNEL_RETURN_DATA_ASSERT_EQUAL_ARITHMETIC = {
        24, 0xe6bd4cf4136d2d26ULL, 0xfdb455979cdd2777ULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
    static constexpr recursion_helpers::FunctionFingerprint KERNEL_RETURN_DATA_ASSERT_EQUAL_NNF = {
        26, 0xea7878474fb57b58ULL, 0xdfa194b30ba8255fULL, recursion_helpers::SCANNER_FINGERPRINT_SIZE
    };
};

template <typename CircuitBuilder>
KernelIOVerification::KernelIOPartValidation validate_kernel_io_part(
    CircuitBuilder& builder, const KZGVerification::BatchMulValidationResult& batch_mul_result)
{
    // step 1. validation of Kernel_IO part. It should start after KZG step of MegaZK verifier. We start validation
    // of Goblin part if and only if MegaZK part has been validated correctly before. It means that in
    // BatchMulValidationResult field is_valid = true
    KernelIOVerification::KernelIOPartValidation kernel_io;
    if (!batch_mul_result.is_valid) {
        log_error("kernel_io_reconstruct failed: batch_mul_result is invalid");
        return kernel_io;
    }

    kernel_io.reconstruct_from_public_arithmetic_start =
        batch_mul_result.arithmetic_gate_start_idx + KZGVerification::BATCH_MUL_ARITHMETIC.gate_count;
    kernel_io.reconstruct_from_public_nnf_start =
        batch_mul_result.nnf_gate_start_idx + KZGVerification::BATCH_MUL_NNF.gate_count;

    auto& arith = builder.blocks.arithmetic;
    auto& nnf = builder.blocks.nnf;

    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   arith,
                                                   kernel_io.reconstruct_from_public_arithmetic_start,
                                                   KernelIOPartValidation::RECONSTRUCT_FROM_PUBLIC_ARITHMETIC)) {
        log_error("kernel_io_reconstruct failed: RECONSTRUCT_FROM_PUBLIC_ARITHMETIC fingerprint mismatch at start ",
                  kernel_io.reconstruct_from_public_arithmetic_start);
        return kernel_io;
    }

    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   nnf,
                                                   kernel_io.reconstruct_from_public_nnf_start,
                                                   KernelIOPartValidation::RECONSTRUCT_FROM_PUBLIC_NNF)) {
        log_error("kernel_io_reconstruct failed: RECONSTRUCT_FROM_PUBLIC_NNF fingerprint mismatch at start ",
                  kernel_io.reconstruct_from_public_nnf_start);
        return kernel_io;
    }

    kernel_io.return_data_assert_equal_arithmetic_start =
        kernel_io.reconstruct_from_public_arithmetic_start +
        KernelIOPartValidation::RECONSTRUCT_FROM_PUBLIC_ARITHMETIC.gate_count;
    kernel_io.return_data_assert_equal_nnf_start =
        kernel_io.reconstruct_from_public_nnf_start + KernelIOPartValidation::RECONSTRUCT_FROM_PUBLIC_NNF.gate_count;

    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   arith,
                                                   kernel_io.return_data_assert_equal_arithmetic_start,
                                                   KernelIOPartValidation::KERNEL_RETURN_DATA_ASSERT_EQUAL_ARITHMETIC)) {
        log_error("kernel_io_reconstruct failed: KERNEL_RETURN_DATA_ASSERT_EQUAL_ARITHMETIC fingerprint mismatch "
                  "at start ",
                  kernel_io.return_data_assert_equal_arithmetic_start);
        return kernel_io;
    }

    if (!recursion_helpers::matches_fingerprint_at(builder,
                                                   nnf,
                                                   kernel_io.return_data_assert_equal_nnf_start,
                                                   KernelIOPartValidation::KERNEL_RETURN_DATA_ASSERT_EQUAL_NNF)) {
        log_error("kernel_io_reconstruct failed: RETURN_DATA_ASSERT_EQUAL_NNF fingerprint mismatch at start ",
                  kernel_io.return_data_assert_equal_nnf_start);
        return kernel_io;
    }
    kernel_io.is_valid = true;
    return kernel_io;
}
} // namespace KernelIOVerification
