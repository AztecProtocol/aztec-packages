// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/compiler_hints.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/stdlib/primitives/bool/bool.hpp"

#include <cstddef>
#include <vector>
namespace bb {
/**
 * @struct RowDisablingPolynomial
 * @brief Polynomial for Sumcheck with disabled Rows
 *
 * \f$ n = 2^d \f$ circuit size
 * \f$ L_i \f$ multilinear Lagrange in \f$ d \f$ variables, \f$ i = 0,\ldots, n-1 \f$.
 *
 * Assume we are given a "valid" execution trace at rows \f$ 0,\ldots, n-5 \f$, i.e.,
 * \f[
 * \sum_{\mathbb{H} \setminus \{n-1, n-2, n-3, n-4\}} H = 0.
 * \f]
 *
 * We want to pad the witness polynomials with random field elements in rows \f$ n-1, n-2, n-3 \f$.
 * Since the commitment to the shift must coincide with the commitment to its unshifted counterpart,
 * we have to reserve \f$ 4 \f$ rows at the end to be able to.
 * To achieve this, we multiply the Honk relation \f$ H \f$ by the polynomial
 * \f[
 * 1 - L = 1 - L_{n-1} - L_{n-2} - L_{n-3} - L_{n-4}.
 * \f]
 * that vanishes at the last \f$ 4 \f$ rows and is equal to \f$ 1 \f$ everywhere else on the hypercube.
 *
 * We consider the sumcheck protocol for the modified relation
 * \f[
 * \sum_{\mathbb{H}} (1 - L) H = \sum_{\mathbb{H}} H - \sum_{\mathbb{H}} L \cdot H.
 * \f]
 *
 * Note that the target sum remains \f$ 0 \f$ because the contributions from the last rows are multiplied by \f$ 0 \f$.
 *
 * Recall:
 * - \f$ n-1 = 2^d - 1 = (1,1, \ldots, 1) \f$
 * - \f$ n-2 = (0,1,\ldots,1) \f$
 * - \f$ n-3 = (1,0,\ldots,1) \f$
 * - \f$ n-4 = (0,0,\ldots,1) \f$
 *
 * ### Round 0:
 * \f[
 * \begin{aligned}
 * S' &=
 * S_{H,0} - \Big(L_{n-1}(X, 1, \ldots, 1) + L_{n-2}(X, 1,\ldots,1)\Big) H(X,1,\ldots, 1) \\
 * &\quad - \Big(L_{n-3}(X, 0,1,\ldots,1) + L_{n-4}(X,0,1,\ldots,1)\Big) H(X,0,1,\ldots,1)
 * \end{aligned}
 * \f]
 *
 * We do not modify the algorithm computing \f$ S_{H,0} \f$. Simply add a method that computes the contribution from the
 * edges \f$ (0,1,\ldots,1) \f$ and \f$ (1,\ldots,1) \in \mathbb{H}^{d-1} \f$.
 *
 * First, compute the coefficients in the Lagrange basis of the factor coming from the Lagranges:
 * \f[
 * \begin{aligned}
 * L_{n-1}(X,\vec{1}) + L_{n-2}(X,\vec{1}) &= X + (1 - X) = 1 \\
 * L_{n-3}(X,0,1,\ldots,1) + L_{n-4}(X,0,1,\ldots,1) &= 1
 * \end{aligned}
 * \f]
 *
 * \f[
 * S'_0 = S_{H,0} - H(X,1,\ldots,1) - H(X,0,1,\ldots,1)
 * \f]
 *
 * ### Round 1:
 * \f[
 * \begin{aligned}
 * L_{n-1}(u_0,X,\vec{1}) + L_{n-2}(u_0,X,\vec{1}) &=
 * u_0 X + (1 - u_0) X = X \\
 * L_{n-3}(u_0,X,\vec{1}) + L_{n-4}(u_0,X,\vec{1}) &=
 * u_0 (1 - X) + (1 - u_0)(1 - X) = (1 - X)
 * \end{aligned}
 * \f]
 *
 * \f[
 * S'_1 = S_{H,1} - H(X,1,\ldots,1)
 * \f]
 *
 * ### Round 2:
 * \f[
 * S'_2 = S_{H,2} - X \cdot H(u_0,u_1,X,1,\ldots,1)
 * \f]
 *
 * ### Rounds i > 1:
 * We can compute the restricted sumcheck univariates \f$ S' \f$ in each round as follows:
 * \f[
 * \begin{aligned}
 * S' = S_{H,i} -
 * \Big(L_{n-1}(u_0, \ldots, u_{i-1}, X, 1, \ldots, 1) + L_{n-2}(u_0, \ldots, u_{i-1}, X, 1,\ldots,1) \\
 * + L_{n-3}(u_0, \ldots, u_{i-1}, X, 1,\ldots,1) + L_{n-4}(u_0, \ldots, u_{i-1}, X, 1,\ldots,1)\Big) \\
 * \times H(u_0, \ldots, u_{i-1}, X, 1,\ldots,1)
 * \end{aligned}
 * \f]
 *
 * Compute the factor coming from the Lagranges:
 * \f[
 * \begin{aligned}
 * &\left(u_0 \cdots u_{i-1} + (1 - u_0) u_1 \cdots u_{i-1} + u_0 (1 - u_1) u_2 \cdots u_{i-1} + (1 - u_0)(1 - u_1) u_2
 * \cdots u_{i-1}\right) X \\
 * &= \left(u_0 u_1 + (1 - u_0) u_1 + u_0 (1 - u_1) + (1 - u_0)(1 - u_1)\right) u_2 \cdots u_{i-1} X \\
 * &= 0 \cdot (1 - X) + 1 \cdot u_2 \cdots u_{i-1} \cdot X
 * \end{aligned}
 * \f]
 *
 * This way, we get:
 * \f[
 * S_{H,i}(X) = S_{H,i} - u_2 \cdots u_{i-1} \cdot X \cdot H(u_0, \ldots, u_{i-1}, X, 1, \ldots, 1).
 * \f]
 *
 * ## The algorithm:
 *
 * Let \f$ D \f$ be the max partial degree of \f$ H \f$.
 *
 * 1. Compute \f$ S_{H,i} \f$ without any modifications as a polynomial of degree \f$ D \f$. Extend it to degree \f$ D +
 * 1 \f$, because it is the max partial degree of \f$ L \cdot H \f$.
 *
 * 2. If \f$ i = 0 \f$, compute \f$ H(X,1,1,\ldots,1) + H(X,0,1,\ldots,1) \f$ as a univariate of degree \f$ D \f$, else
 * compute \f$ H(u_0, \ldots, u_{i-1}, X, 1, \ldots, 1) \f$ as a univariate of degree \f$ D \f$. Extend to degree \f$ D
 * + 1 \f$.
 *
 * 3. Compute the extension of \f$ L^{(i)} = L(u_0, \ldots, u_{i-1}, X, 1, \ldots, 1) \f$ to the degree \f$ D + 1 \f$
 * polynomial.
 *
 * 4. Compute the coefficients of the product \f$ L^{(i)} \cdot H^{(i)} \f$.
 *
 * 5. Compute the coefficients of \f$ S_{H,i} - L^{(i)} \cdot H^{(i)} \f$ (degree \f$ D + 1 \f$ univariate).
 *
 * The verifier needs to evaluate \f$ 1 - L(u_0, \ldots, u_{d-1}) \f$, which is equal to \f$ 0 \f$ if \f$ d < 2 \f$, and
 * is equal to \f$ 1-  u_2 \cdots u_{d-1} \f$ otherwise.
 */

template <typename FF> struct RowDisablingPolynomial {
    // initialized as a constant linear polynomial = 1
    FF eval_at_0{ 1 };
    FF eval_at_1{ 1 };

    RowDisablingPolynomial() = default;
    /**
     * @brief Compute the evaluations of L^{(i)} at 0 and 1.
     *
     * @details In every round, the contribution from the Honk relation computed at
     * disabled rows has to be mutiplied by \f$ L^{(i)} \f$, which is a linear combination of Lagrange polynomials
     * defined above.
     *
     * @param round_challenge Sumcheck round challenge
     * @param round_idx Sumcheck round index
     */
    void update_evaluations(FF round_challenge, size_t round_idx)
    {
        if (round_idx == 1) {
            eval_at_0 = FF{ 0 };
        }
        if (round_idx >= 2) {
            eval_at_1 *= round_challenge;
        }
    }
    /**
     * @brief Compute the evaluation of \f$ 1 - L \f$ at the sumcheck challenge
     *
     * @param multivariate_challenge
     * @param log_circuit_size
     * @return FF
     */
    static FF evaluate_at_challenge(std::vector<FF> multivariate_challenge, const size_t log_circuit_size)
    {
        FF evaluation_at_multivariate_challenge{ 1 };

        for (size_t idx = 2; idx < log_circuit_size; idx++) {
            evaluation_at_multivariate_challenge *= multivariate_challenge[idx];
        }

        return FF{ 1 } - evaluation_at_multivariate_challenge;
    }

    /**
     * @brief A variant of the above that uses `padding_indicator_array`.
     *
     * @param multivariate_challenge Sumcheck evaluation challenge
     * @param padding_indicator_array An array with first log_n entries equal to 1, and the remaining entries are 0.
     */
    template <size_t virtual_log_n>
    static FF evaluate_at_challenge(std::span<FF> multivariate_challenge,
                                    const std::array<FF, virtual_log_n>& padding_indicator_array)
    {
        FF evaluation_at_multivariate_challenge{ 1 };

        for (size_t idx = 2; idx < virtual_log_n; idx++) {
            const FF& indicator = padding_indicator_array[idx];
            evaluation_at_multivariate_challenge *= FF{ 1 } - indicator + indicator * multivariate_challenge[idx];
        }

        return FF{ 1 } - evaluation_at_multivariate_challenge;
    }
};

} // namespace bb
