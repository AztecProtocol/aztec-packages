// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

namespace bb {

// Runtime implementations for arithmetic operations
namespace univariate_internal {

template <typename Fr> void add_arrays_skip(Fr* result, const Fr* lhs, const Fr* rhs, size_t length, size_t skip_count)
{
    result[0] = lhs[0] + rhs[0];
    for (size_t i = skip_count + 1; i < length; ++i) {
        result[i] = lhs[i] + rhs[i];
    }
}

template <typename Fr>
void subtract_arrays_skip(Fr* result, const Fr* lhs, const Fr* rhs, size_t length, size_t skip_count)
{
    result[0] = lhs[0] - rhs[0];
    for (size_t i = skip_count + 1; i < length; ++i) {
        result[i] = lhs[i] - rhs[i];
    }
}

template <typename Fr>
void multiply_arrays_skip(Fr* result, const Fr* lhs, const Fr* rhs, size_t length, size_t skip_count)
{
    result[0] = lhs[0] * rhs[0];
    for (size_t i = skip_count + 1; i < length; ++i) {
        result[i] = lhs[i] * rhs[i];
    }
}

template <typename Fr> void self_sqr_array_skip(Fr* values, size_t length, size_t skip_count)
{
    if constexpr (std::is_same_v<Fr, bb::fr> || std::is_same_v<Fr, grumpkin::fr>) {
        values[0].self_sqr();
        for (size_t i = skip_count + 1; i < length; ++i) {
            values[i].self_sqr();
        }
    } else {
        // For stdlib::field_t, use sqr() method
        values[0] = values[0].sqr();
        for (size_t i = skip_count + 1; i < length; ++i) {
            values[i] = values[i].sqr();
        }
    }
}

template <typename Fr> void add_scalar_to_array_skip(Fr* values, const Fr& scalar, size_t length, size_t skip_count)
{
    values[0] += scalar;
    for (size_t i = skip_count + 1; i < length; ++i) {
        values[i] += scalar;
    }
}

template <typename Fr>
void subtract_scalar_from_array_skip(Fr* values, const Fr& scalar, size_t length, size_t skip_count)
{
    values[0] -= scalar;
    for (size_t i = skip_count + 1; i < length; ++i) {
        values[i] -= scalar;
    }
}

template <typename Fr>
void multiply_array_by_scalar_skip(Fr* values, const Fr& scalar, size_t length, size_t skip_count)
{
    values[0] *= scalar;
    for (size_t i = skip_count + 1; i < length; ++i) {
        values[i] *= scalar;
    }
}

template <typename Fr> void negate_array_skip(Fr* result, const Fr* values, size_t length, size_t skip_count)
{
    result[0] = -values[0];
    for (size_t i = 1; i < length; ++i) {
        if (i <= skip_count) {
            result[i] = values[i]; // Don't negate skipped elements
        } else {
            result[i] = -values[i];
        }
    }
}

template void add_arrays_skip<bb::fr>(bb::fr*, const bb::fr*, const bb::fr*, size_t, size_t);
template void subtract_arrays_skip<bb::fr>(bb::fr*, const bb::fr*, const bb::fr*, size_t, size_t);
template void multiply_arrays_skip<bb::fr>(bb::fr*, const bb::fr*, const bb::fr*, size_t, size_t);
template void self_sqr_array_skip<bb::fr>(bb::fr*, size_t, size_t);
template void add_scalar_to_array_skip<bb::fr>(bb::fr*, const bb::fr&, size_t, size_t);
template void subtract_scalar_from_array_skip<bb::fr>(bb::fr*, const bb::fr&, size_t, size_t);
template void multiply_array_by_scalar_skip<bb::fr>(bb::fr*, const bb::fr&, size_t, size_t);
template void negate_array_skip<bb::fr>(bb::fr*, const bb::fr*, size_t, size_t);

template void add_arrays_skip<grumpkin::fr>(grumpkin::fr*, const grumpkin::fr*, const grumpkin::fr*, size_t, size_t);
template void subtract_arrays_skip<grumpkin::fr>(
    grumpkin::fr*, const grumpkin::fr*, const grumpkin::fr*, size_t, size_t);
template void multiply_arrays_skip<grumpkin::fr>(
    grumpkin::fr*, const grumpkin::fr*, const grumpkin::fr*, size_t, size_t);
template void self_sqr_array_skip<grumpkin::fr>(grumpkin::fr*, size_t, size_t);
template void add_scalar_to_array_skip<grumpkin::fr>(grumpkin::fr*, const grumpkin::fr&, size_t, size_t);
template void subtract_scalar_from_array_skip<grumpkin::fr>(grumpkin::fr*, const grumpkin::fr&, size_t, size_t);
template void multiply_array_by_scalar_skip<grumpkin::fr>(grumpkin::fr*, const grumpkin::fr&, size_t, size_t);
template void negate_array_skip<grumpkin::fr>(grumpkin::fr*, const grumpkin::fr*, size_t, size_t);

// Runtime view operations to avoid template bloat
template <typename Fr>
void add_univariate_views(Fr* result, const Fr* lhs, const Fr* rhs, size_t length, size_t skip_count)
{
    add_arrays_skip(result, lhs, rhs, length, skip_count);
}

template <typename Fr>
void subtract_univariate_views(Fr* result, const Fr* lhs, const Fr* rhs, size_t length, size_t skip_count)
{
    subtract_arrays_skip(result, lhs, rhs, length, skip_count);
}

template <typename Fr>
void multiply_univariate_views(Fr* result, const Fr* lhs, const Fr* rhs, size_t length, size_t skip_count)
{
    multiply_arrays_skip(result, lhs, rhs, length, skip_count);
}

template void add_univariate_views<bb::fr>(bb::fr*, const bb::fr*, const bb::fr*, size_t, size_t);
template void subtract_univariate_views<bb::fr>(bb::fr*, const bb::fr*, const bb::fr*, size_t, size_t);
template void multiply_univariate_views<bb::fr>(bb::fr*, const bb::fr*, const bb::fr*, size_t, size_t);

template void add_univariate_views<grumpkin::fr>(
    grumpkin::fr*, const grumpkin::fr*, const grumpkin::fr*, size_t, size_t);
template void subtract_univariate_views<grumpkin::fr>(
    grumpkin::fr*, const grumpkin::fr*, const grumpkin::fr*, size_t, size_t);
template void multiply_univariate_views<grumpkin::fr>(
    grumpkin::fr*, const grumpkin::fr*, const grumpkin::fr*, size_t, size_t);

template <typename Fr> void extend_univariate_2_to_n(Fr* output, const Fr* input, size_t extended_length)
{
    // Copy initial values
    output[0] = input[0];
    output[1] = input[1];

    // Compute extension for LENGTH == 2 case
    Fr delta = input[1] - input[0];
    for (size_t idx = 1; idx < extended_length - 1; idx++) {
        output[idx + 1] = output[idx] + delta;
    }
}

template <typename Fr> void extend_univariate_3_to_n(Fr* output, const Fr* input, size_t extended_length)
{
    // Copy initial values
    output[0] = input[0];
    output[1] = input[1];
    output[2] = input[2];

    // Compute extension for LENGTH == 3 case
    Fr inverse_two = Fr(2).invert();
    Fr a = (input[2] + input[0]) * inverse_two - input[1];
    Fr b = input[1] - a - input[0];
    Fr a2 = a + a;
    Fr a_mul = a2;
    for (size_t i = 0; i < 1; i++) { // domain_end - 2 where domain_end = 3
        a_mul += a2;
    }
    Fr extra = a_mul + a + b;
    for (size_t idx = 2; idx < extended_length - 1; idx++) {
        output[idx + 1] = output[idx] + extra;
        extra += a2;
    }
}

template <typename Fr> void extend_univariate_4_to_n(Fr* output, const Fr* input, size_t extended_length)
{
    // Copy initial values
    for (size_t i = 0; i < 4; i++) {
        output[i] = input[i];
    }

    // Compute extension for LENGTH == 4 case
    Fr inverse_six = Fr(6).invert();
    Fr zero_times_3 = input[0] + input[0] + input[0];
    Fr zero_times_6 = zero_times_3 + zero_times_3;
    Fr zero_times_12 = zero_times_6 + zero_times_6;
    Fr one_times_3 = input[1] + input[1] + input[1];
    Fr one_times_6 = one_times_3 + one_times_3;
    Fr two_times_3 = input[2] + input[2] + input[2];
    Fr three_times_2 = input[3] + input[3];
    Fr three_times_3 = three_times_2 + input[3];

    Fr one_minus_two_times_3 = one_times_3 - two_times_3;
    Fr one_minus_two_times_6 = one_minus_two_times_3 + one_minus_two_times_3;
    Fr one_minus_two_times_12 = one_minus_two_times_6 + one_minus_two_times_6;
    Fr a = (one_minus_two_times_3 + input[3] - input[0]) * inverse_six;
    Fr b = (zero_times_6 - one_minus_two_times_12 - one_times_3 - three_times_3) * inverse_six;
    Fr c =
        (input[0] - zero_times_12 + one_minus_two_times_12 + one_times_6 + two_times_3 + three_times_2) * inverse_six;

    Fr a_plus_b = a + b;
    Fr a_plus_b_times_2 = a_plus_b + a_plus_b;
    size_t start_idx_sqr = 3 * 3; // (domain_end - 1) * (domain_end - 1) where domain_end = 4
    size_t idx_sqr_three = start_idx_sqr + start_idx_sqr + start_idx_sqr;
    Fr idx_sqr_three_times_a = Fr(idx_sqr_three) * a;
    Fr x_a_term = Fr(6 * 3) * a; // 6 * (domain_end - 1) where domain_end = 4
    Fr three_a = a + a + a;
    Fr six_a = three_a + three_a;

    Fr three_a_plus_two_b = a_plus_b_times_2 + a;
    Fr linear_term = Fr(3) * three_a_plus_two_b + (a_plus_b + c); // (domain_end - 1) where domain_end = 4

    for (size_t idx = 3; idx < extended_length - 1; idx++) {
        output[idx + 1] = output[idx] + idx_sqr_three_times_a + linear_term;
        idx_sqr_three_times_a += x_a_term + three_a;
        x_a_term += six_a;
        linear_term += three_a_plus_two_b;
    }
}

// Explicit instantiations
template void extend_univariate_2_to_n<bb::fr>(bb::fr*, const bb::fr*, size_t);
template void extend_univariate_3_to_n<bb::fr>(bb::fr*, const bb::fr*, size_t);
template void extend_univariate_4_to_n<bb::fr>(bb::fr*, const bb::fr*, size_t);

template void extend_univariate_2_to_n<grumpkin::fr>(grumpkin::fr*, const grumpkin::fr*, size_t);
template void extend_univariate_3_to_n<grumpkin::fr>(grumpkin::fr*, const grumpkin::fr*, size_t);
template void extend_univariate_4_to_n<grumpkin::fr>(grumpkin::fr*, const grumpkin::fr*, size_t);

template <typename Fr> Fr evaluate_univariate(const Fr* values, size_t domain_start, size_t domain_end, const Fr& u)
{
    // Barycentric evaluation for arbitrary point u
    Fr full_numerator_value = 1;
    for (size_t i = domain_start; i != domain_end; ++i) {
        full_numerator_value *= u - Fr(i);
    }

    const size_t length = domain_end - domain_start;

    // Compute Lagrange denominators - these would ideally be precomputed
    Fr result = 0;
    for (size_t i = 0; i < length; ++i) {
        Fr denominator = 1;
        for (size_t j = 0; j < length; ++j) {
            if (i != j) {
                denominator *= Fr(domain_start + i) - Fr(domain_start + j);
            }
        }
        denominator *= u - Fr(domain_start + i);
        Fr term = values[i] * (Fr(1) / denominator);
        result += term;
    }

    result *= full_numerator_value;
    return result;
}

// Generic barycentric extension for larger sizes
template <typename Fr>
void extend_univariate_generic(
    Fr* output, const Fr* input, size_t input_length, size_t output_length, size_t domain_start)
{
    // Copy input values
    for (size_t i = 0; i < input_length; ++i) {
        output[i] = input[i];
    }

    // Extend using barycentric formula
    for (size_t k = input_length; k < output_length; ++k) {
        output[k] = 0;
        Fr full_numerator = 1;
        for (size_t i = domain_start; i < domain_start + input_length; ++i) {
            full_numerator *= Fr(domain_start + k) - Fr(i);
        }

        for (size_t j = 0; j < input_length; ++j) {
            Fr denominator = 1;
            for (size_t i = 0; i < input_length; ++i) {
                if (i != j) {
                    denominator *= Fr(domain_start + j) - Fr(domain_start + i);
                }
            }
            denominator *= Fr(domain_start + k) - Fr(domain_start + j);
            Fr term = input[j] * (Fr(1) / denominator);
            output[k] += term;
        }
        output[k] *= full_numerator;
    }
}

template bb::fr evaluate_univariate<bb::fr>(const bb::fr*, size_t, size_t, const bb::fr&);
template grumpkin::fr evaluate_univariate<grumpkin::fr>(const grumpkin::fr*, size_t, size_t, const grumpkin::fr&);
template void extend_univariate_generic<bb::fr>(bb::fr*, const bb::fr*, size_t, size_t, size_t);
template void extend_univariate_generic<grumpkin::fr>(grumpkin::fr*, const grumpkin::fr*, size_t, size_t, size_t);

// Explicit instantiation for stdlib field types
using StdlibFieldUltra = bb::stdlib::field_t<bb::UltraCircuitBuilder_<bb::UltraExecutionTraceBlocks>>;
template void add_arrays_skip<StdlibFieldUltra>(
    StdlibFieldUltra*, const StdlibFieldUltra*, const StdlibFieldUltra*, size_t, size_t);
template void subtract_arrays_skip<StdlibFieldUltra>(
    StdlibFieldUltra*, const StdlibFieldUltra*, const StdlibFieldUltra*, size_t, size_t);
template void multiply_arrays_skip<StdlibFieldUltra>(
    StdlibFieldUltra*, const StdlibFieldUltra*, const StdlibFieldUltra*, size_t, size_t);
template void self_sqr_array_skip<StdlibFieldUltra>(StdlibFieldUltra*, size_t, size_t);
template void add_scalar_to_array_skip<StdlibFieldUltra>(StdlibFieldUltra*, const StdlibFieldUltra&, size_t, size_t);
template void subtract_scalar_from_array_skip<StdlibFieldUltra>(StdlibFieldUltra*,
                                                                const StdlibFieldUltra&,
                                                                size_t,
                                                                size_t);
template void multiply_array_by_scalar_skip<StdlibFieldUltra>(StdlibFieldUltra*,
                                                              const StdlibFieldUltra&,
                                                              size_t,
                                                              size_t);
template void negate_array_skip<StdlibFieldUltra>(StdlibFieldUltra*, const StdlibFieldUltra*, size_t, size_t);
template void extend_univariate_2_to_n<StdlibFieldUltra>(StdlibFieldUltra*, const StdlibFieldUltra*, size_t);
template void extend_univariate_3_to_n<StdlibFieldUltra>(StdlibFieldUltra*, const StdlibFieldUltra*, size_t);
template void extend_univariate_4_to_n<StdlibFieldUltra>(StdlibFieldUltra*, const StdlibFieldUltra*, size_t);
template StdlibFieldUltra evaluate_univariate<StdlibFieldUltra>(const StdlibFieldUltra*,
                                                                size_t,
                                                                size_t,
                                                                const StdlibFieldUltra&);
template void extend_univariate_generic<StdlibFieldUltra>(
    StdlibFieldUltra*, const StdlibFieldUltra*, size_t, size_t, size_t);

using StdlibFieldMega = bb::stdlib::field_t<bb::MegaCircuitBuilder_<bb::fr>>;
template void add_arrays_skip<StdlibFieldMega>(
    StdlibFieldMega*, const StdlibFieldMega*, const StdlibFieldMega*, size_t, size_t);
template void subtract_arrays_skip<StdlibFieldMega>(
    StdlibFieldMega*, const StdlibFieldMega*, const StdlibFieldMega*, size_t, size_t);
template void multiply_arrays_skip<StdlibFieldMega>(
    StdlibFieldMega*, const StdlibFieldMega*, const StdlibFieldMega*, size_t, size_t);
template void self_sqr_array_skip<StdlibFieldMega>(StdlibFieldMega*, size_t, size_t);
template void add_scalar_to_array_skip<StdlibFieldMega>(StdlibFieldMega*, const StdlibFieldMega&, size_t, size_t);
template void subtract_scalar_from_array_skip<StdlibFieldMega>(StdlibFieldMega*,
                                                               const StdlibFieldMega&,
                                                               size_t,
                                                               size_t);
template void multiply_array_by_scalar_skip<StdlibFieldMega>(StdlibFieldMega*, const StdlibFieldMega&, size_t, size_t);
template void negate_array_skip<StdlibFieldMega>(StdlibFieldMega*, const StdlibFieldMega*, size_t, size_t);
template void extend_univariate_2_to_n<StdlibFieldMega>(StdlibFieldMega*, const StdlibFieldMega*, size_t);
template void extend_univariate_3_to_n<StdlibFieldMega>(StdlibFieldMega*, const StdlibFieldMega*, size_t);
template void extend_univariate_4_to_n<StdlibFieldMega>(StdlibFieldMega*, const StdlibFieldMega*, size_t);
template StdlibFieldMega evaluate_univariate<StdlibFieldMega>(const StdlibFieldMega*,
                                                              size_t,
                                                              size_t,
                                                              const StdlibFieldMega&);
template void extend_univariate_generic<StdlibFieldMega>(
    StdlibFieldMega*, const StdlibFieldMega*, size_t, size_t, size_t);

} // namespace univariate_internal
} // namespace bb
