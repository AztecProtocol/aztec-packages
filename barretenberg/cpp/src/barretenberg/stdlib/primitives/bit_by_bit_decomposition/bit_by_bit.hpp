#pragma once
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../witness/witness.hpp"
#include "barretenberg/transcript/origin_tag.hpp"

namespace bb::stdlib {

/**
 * @brief For a small N =  `domain_size` and a given witness `x`, compute an array [1 `x` times, 0 'domain_size' -
 * `x` times] in-circuit.
 * 1) Constrain `x` to be in the range [1,..., domain_size - 1] by asserting the product
 * \f{align}{ \prod_{i=1}^{N-1} (x - i) == 0 \f}.
 * 2) For \f$ i = 0, ..., N-1 \f$, evaluate \f$L_i(x)\f$. Since \f$ 0 < x < N \f$, \f$ L_i(x) = 1 \f$ if and only if
 * \f$  x == FF(i)\f$.
 * 3) Starting at \f$ b_{N-1} = L_{N-1}(x)\f$, compute partial sums
 * \f{align}{b_i = \sum_{i}^{N-1} L_i(x) = L_i(x) + b_{i+1}\f}.
 * We compute Lagrange coefficients out-of-circuit, since N is a circuit
 * constant. The resulting array is being used to pad the number of Verifier rounds in Sumcheck and Shplemini to a
 * fixed constant.
 * Note that the number of gates required to compute [b_0,..., b_{N-1}] only depends on N.
 */
template <typename Fr, typename Builder, size_t domain_size>
static std::array<Fr, domain_size> compute_padding_indicator_array(const Fr& x)
{
    using Data = BarycentricDataRunTime<Fr, domain_size, 1>;

    std::array<Fr, domain_size> result{};
    Builder* builder = x.get_context();
    Fr zero{ 0 };
    zero.convert_constant_to_fixed_witness(builder);
    // 1) Build prefix products:
    //    prefix[i] = ∏_{m=0..(i-1)} (x - big_domain[m]), with prefix[0] = 1.
    std::vector<Fr> prefix(domain_size + 1, Fr(1));
    for (size_t i = 0; i < domain_size; ++i) {
        prefix[i + 1] = prefix[i] * (x - Data::big_domain[i]);
    }
    // Range constrain 0 < x < domain_size
    prefix.back().assert_equal(zero);
    // 2) Build suffix products:
    //    suffix[i] = ∏_{m=i..(domain_size-1)} (x - big_domain[m]),
    //    but we'll store it in reverse:
    //    suffix[domain_size] = 1.
    std::vector<Fr> suffix(domain_size + 1, Fr(1));
    for (size_t i = domain_size; i > 0; i--) {
        suffix[i - 1] = suffix[i] * (x - Data::big_domain[i - 1]);
    }

    // 3) Combine prefix & suffix to get L_i(x):
    //    L_i(x) = (1 / lagrange_denominators[i]) * prefix[i] * suffix[i+1].
    //    (We skip factor (x - big_domain[i]) by splitting into prefix & suffix.)
    for (size_t i = 0; i < domain_size; ++i) {
        const Fr inv_denom_i = Data::lagrange_denominators[i].invert();
        result[i] = inv_denom_i * prefix[i] * suffix[i + 1];
    }
    // Convert result into the array of partial sums b_i.
    for (size_t idx = domain_size - 1; idx > 0; idx--) {
        // Use idx - 1 in the body if you prefer
        result[idx - 1] += result[idx];
    }

    return result;
}

} // namespace bb::stdlib
