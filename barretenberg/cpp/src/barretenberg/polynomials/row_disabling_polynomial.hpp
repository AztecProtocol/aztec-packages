// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Khashayar], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/compiler_hints.hpp"
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
 * Assume we are given a "valid" execution trace at rows \f$ 4,\ldots, n-1 \f$, i.e.,
 * \f[
 * \sum_{\mathbb{H} \setminus \{0, 1, 2, 3\}} H = 0.
 * \f]
 *
 * We want to pad the witness polynomials with random field elements in rows \f$ 0, 1, 2 \f$.
 * Since the commitment to the shift must coincide with the commitment to its unshifted counterpart,
 * we have to reserve \f$ 4 \f$ rows at the start to be able to.
 * To achieve this, we multiply the Honk relation \f$ H \f$ by the polynomial
 * \f[
 * 1 - L = 1 - L_0 - L_1 - L_2 - L_3.
 * \f]
 * that vanishes at the first \f$ 4 \f$ rows and is equal to \f$ 1 \f$ everywhere else on the hypercube.
 *
 * We consider the sumcheck protocol for the modified relation
 * \f[
 * \sum_{\mathbb{H}} (1 - L) H = \sum_{\mathbb{H}} H - \sum_{\mathbb{H}} L \cdot H.
 * \f]
 *
 * Note that the target sum remains \f$ 0 \f$ because the contributions from the last rows are multiplied by \f$ 0 \f$.
 *
 * Recall:
 * - \f$ 0 = (0,0, \ldots, 0) \f$
 * - \f$ 1 = (1,0,0,\ldots,0) \f$
 * - \f$ 2 = (0,1,0,\ldots,0) \f$
 * - \f$ 3 = (1,1,0,\ldots,0) \f$
 *
 * ### Round 0:
 * \f[
 * \begin{aligned}
 * S' &=
 * S_{H,0} - \Big(L_0(X, 0,0, \ldots, 0) + L_1(X, 0,0,\ldots,0)\Big) H(X,0,0,\ldots, 0) \\
 * &\quad - \Big(L_2(X, 1,0,\ldots,0) + L_3(X,1,0,\ldots,0)\Big) H(X,1,0,\ldots,0)
 * \end{aligned}
 * \f]
 *
 * We do not modify the algorithm computing \f$ S_{H,0} \f$. Simply add a method that computes the contribution from the
 * edges \f$ (0,0,\ldots,0) \f$ and \f$ (1,0,\ldots,0) \in \mathbb{H}^{d-1} \f$.
 *
 * First, compute the coefficients in the Lagrange basis of the factor coming from the Lagranges:
 * \f[
 * \begin{aligned}
 * L_0(X,\vec{0}) + L_1(X,\vec{0}) &= (1 - X) + X = 1 \\
 * L_2(X,1,0,\ldots,0) + L_3(X,1,0,\ldots,0) &= 1
 * \end{aligned}
 * \f]
 *
 * \f[
 * S'_0 = S_{H,0} - H(X,0,\ldots,0) - H(X,1,0,\ldots,0)
 * \f]
 *
 * ### Round 1:
 * \f[
 * \begin{aligned}
 * L_0(u_0,X,\vec{0}) + L_1(u_0,X,\vec{0}) &=
 * (1 - u_0)(1 - X) + u_0 (1 - X) = (1 - X) \\
 * L_2(u_0,X,\vec{0}) + L_3(u_0,X,\vec{0}) &=
 * (1 - u_0) X + u_0 X = X
 * \end{aligned}
 * \f]
 *
 * \f[
 * S'_1 = S_{H,1} - (1-X) \cdot H(u_0,X,0,\ldots,0) - X \cdot H(u_0,X,1,0,\ldots,0)
 * \f]
 * After folding, only 1 edge pair remains: the disabled contribution is at edge \f$ (0,\ldots,0) \f$ with
 * factor \f$ (1-X) \f$.
 *
 * ### Round 2:
 * \f[
 * S'_2 = S_{H,2} - (1 - X) \cdot H(u_0,u_1,X,0,\ldots,0)
 * \f]
 *
 * ### Rounds i > 1:
 * \f[
 * S_{H,i}(X) = S_{H,i} - \prod_{k=2}^{i-1}(1 - u_k) \cdot (1 - X) \cdot H(u_0, \ldots, u_{i-1}, X, 0, \ldots, 0).
 * \f]
 *
 * ## The algorithm:
 *
 * Let \f$ D \f$ be the max partial degree of \f$ H \f$.
 *
 * 1. Compute \f$ S_{H,i} \f$ without any modifications as a polynomial of degree \f$ D \f$. Extend it to degree \f$ D +
 * 1 \f$, because it is the max partial degree of \f$ L \cdot H \f$.
 *
 * 2. If \f$ i = 0 \f$, compute \f$ H(X,0,0,\ldots,0) + H(X,1,0,\ldots,0) \f$ as a univariate of degree \f$ D \f$, else
 * compute \f$ H(u_0, \ldots, u_{i-1}, X, 0, \ldots, 0) \f$ as a univariate of degree \f$ D \f$. Extend to degree \f$ D
 * + 1 \f$.
 *
 * 3. Compute the extension of \f$ L^{(i)} = L(u_0, \ldots, u_{i-1}, X, 0, \ldots, 0) \f$ to the degree \f$ D + 1 \f$
 * polynomial.
 *
 * 4. Compute the coefficients of the product \f$ L^{(i)} \cdot H^{(i)} \f$.
 *
 * 5. Compute the coefficients of \f$ S_{H,i} - L^{(i)} \cdot H^{(i)} \f$ (degree \f$ D + 1 \f$ univariate).
 *
 * The verifier needs to evaluate \f$ 1 - L(u_0, \ldots, u_{d-1}) \f$, which is equal to \f$ 0 \f$ if \f$ d < 2 \f$, and
 * is equal to \f$ 1 - \prod_{k=2}^{d-1}(1 - u_k) \f$ otherwise.
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
            eval_at_1 = FF{ 0 };
        }
        if (round_idx >= 2) {
            eval_at_0 *= (FF{ 1 } - round_challenge);
        }
    }
    /**
     * @brief Compute the evaluation of \f$ 1 - L \f$ at the sumcheck challenge
     *
     * @param multivariate_challenge
     * @param log_circuit_size
     * @return FF
     */
    static FF evaluate_at_challenge(std::span<const FF> multivariate_challenge, const size_t log_circuit_size)
    {
        BB_ASSERT(multivariate_challenge.size() >= log_circuit_size,
                  "RowDisablingPolynomial: challenge shorter than log_circuit_size");
        FF evaluation_at_multivariate_challenge{ 1 };

        for (size_t idx = 2; idx < log_circuit_size; idx++) {
            evaluation_at_multivariate_challenge *= (FF{ 1 } - multivariate_challenge[idx]);
        }

        return FF{ 1 } - evaluation_at_multivariate_challenge;
    }
};

} // namespace bb
