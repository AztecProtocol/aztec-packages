// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../witness/witness.hpp"

namespace bb::stdlib {

/**
 * @file
 * @brief For a small integer N = `virtual_log_n` and a given witness x = `log_n`, compute in-circuit an
 * `indicator_padding_array` of size \f$ N \f$, such that
 * \f{align}{ \text{indicator_padding_array}[i] = \text{"} i < x \text{"}. \f}. To achieve the strict ineqaulity, we
 * evaluate all Lagranges at (x-1) and compute step functions. More concretely
 *
 * 1) Constrain x to be in the range \f$ [2, \ldots, N] \f$ by asserting
 * \f{align}{ \prod_{i=1}^{N-1} (x - 1 - i) = 0 \f}.
 *
 * 2) For \f$ i = 0, ..., N-1 \f$, evaluate \f$ L_i(x) \f$.
 * Since \f$ 1 < x <= N \f$, \f$ L_i(x - 1) = 1 \f$ if and only if \f$  x - 1 =  i  \f$.
 *
 * 3) Starting at \f$ b_{N-1} = L_{N-1}(x - 1)\f$, compute the step functions
 * \f{align}{
 * b_i(x - 1) = \sum_{i}^{N-1} L_i(x - 1) = L_i(x - 1) + b_{i+1}(x - 1) \f}.
 *
 * We compute the Lagrange coefficients out-of-circuit, since \f$ N \f$ is a circuit constant.
 *
 * The resulting array is being used to pad the number of Verifier rounds in Sumcheck and Shplemini to a fixed constant
 * and turn Recursive Verifier circuits into constant circuits. Note that the number of gates required to compute
 * \f$ [b_0(x-1), \ldots, b_{N-1}(x-1)] \f$ only depends on \f$ N \f$ adding ~\f$ 4\cdot N \f$ gates to the circuit.
 *
 */
template <typename Fr, typename Builder, size_t virtual_log_n>
static std::array<Fr, virtual_log_n> compute_padding_indicator_array(const Fr& log_n)
{
    // Create a domain of size `virtual_log_n` and compute Lagrange denominators
    using Data = BarycentricDataRunTime<Fr, virtual_log_n, /*num_evals=*/1>;

    std::array<Fr, virtual_log_n> result{};
    Builder* builder = log_n.get_context();
    Fr zero{ 0 };
    zero.convert_constant_to_fixed_witness(builder);
    // 1) Build prefix products:
    //    prefix[i] = ∏_{m=0..(i-1)} (x - 1 - big_domain[m]), with prefix[0] = 1.
    std::vector<Fr> prefix(virtual_log_n + 1, Fr{ 1 });
    for (size_t i = 0; i < virtual_log_n; ++i) {
        prefix[i + 1] = prefix[i] * (log_n - Fr{ 1 } - Data::big_domain[i]);
    }

    // 2) Build suffix products:
    //    suffix[i] = ∏_{m=i..(N-1)} (x - 1 - big_domain[m]),
    //    but we'll store it in reverse:
    //    suffix[virtual_log_n] = 1.
    std::vector<Fr> suffix(virtual_log_n + 1, Fr(1));
    for (size_t i = virtual_log_n; i > 0; i--) {
        suffix[i - 1] = suffix[i] * (log_n - Fr{ 1 } - Data::big_domain[i - 1]);
    }

    // To ensure 0 < log_n < N, note that suffix[1] = \prod_{i=1}^{N-1} (x - 1 - i), therefore we just need to ensure
    // that this product is 0.
    suffix[1].assert_equal(zero);

    // 3) Combine prefixes & suffixes to get L_i(x-1):
    //    L_i(x-1) = (1 / lagrange_denominators[i]) * prefix[i] * suffix[i+1].
    //    (We skip factor (x - big_domain[i]) by splitting into prefix & suffix.)
    for (size_t i = 0; i < virtual_log_n; ++i) {
        result[i] = Data::precomputed_denominator_inverses[i] * prefix[i] * suffix[i + 1];
    }
    // Convert result into the array of step function evaluations sums b_i.
    for (size_t idx = virtual_log_n - 1; idx > 0; idx--) {
        // Use idx - 1 in the body if you prefer
        result[idx - 1] += result[idx];
    }

    return result;
}

} // namespace bb::stdlib
