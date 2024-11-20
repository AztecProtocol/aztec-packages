#pragma once
#include "barretenberg/common/compiler_hints.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/stdlib/primitives/bool/bool.hpp"

#include <cstddef>
#include <vector>
namespace bb {
/**
 * @brief Struct for the polynomial \f$ L =  (1 - L_1(X_0, \ldots, X_{d-1}) - L_2(X_0, \ldots, X_{d-1}) - L_3(X_0,
 * \ldots, X_{d-1}) )\f$.
 * @details Need to efficiently evaluate this polynomial at any point of the form \f$ (u_0, \ldots, u_{k}, \vec{i} ) \f$
 * where \f$ \vec{i}\f$ belongs to a hypercube.
 * First, note \f$ L_1(X_0, \ldots, X_{d-1}) = X_0 \prod_{i=1}^{d-1} (1 - X_i)\f$, \f$ L_2 =  (1 - X_0)
 * X_1\prod_{i=2}^{n-1} (1 - X_i)\f$ and \f$  L_3(X_0, \ldots, X_{d-1}) = X_0 * X_1 * \prod_{i=2}^{d-1} (1 - X_i) \f$.
 * Therefore, \f$ L = (X_0*(1-X_1) + (1 - X_0)* X_1 + X_0 * X_1) * \prod_{i=2}^{d-1} (1- X_i)\f$ which simplifies
 * further to \f$ L = (1 + X_0 + X_1 - X_0*X_1) \prod_{i=2}^{d-1} (1- X_i) \f$.
 * We could compute the sumcheck univariate contributions from \f$L\f$: \f$ \sum_{i=0}^{2^n-1} L = 2^{n} - 3\f$, because
 * \f$ L =  0\f$ at \f$ i = 1, 2, 3\f$ and \f$1\f$ elsewhere.
 * After getting the first challenge \f$ u_0 \f$, \f$ L(u_0) =    L(u_0, X_1, \ldots, X_{d-1}) = 1 - (1 + u_0 + X_1 -
 * u_0\cdot X_1) L_0(X_2,X_3,\ldots, X_{d-1})\f$. It is more useful to have the values of \f$ L(u_0) \f$ on the
 * hypercube.
 *
 * \f$ L_1(u_0, X_1,\ldots, X_{d-1})  = u_0 * L_0 (X_1,\ldots, X_{d-1})\f$, it evaluates to \f$ u_0\f$ at \f$ 0 \f$ and
 * is \f$ 0 \f$ elsewehere.
 *
 * \f$ L_2(u_0, X_1,\ldots, X_{d-1})  = (1-u_0) * L_1 (X_1,\ldots, X_{d-1})\f$, it evaluates to \f$ (1-u_0) \f$ at \f$ 1
 * \f$ and is \f$ 0 \f$ elsewhere.
 *
 * \f$ L_3(u_0, X_1,\ldots, X_{d-1})  = u_0 * L_1 (X_1,\ldots, X_{d-1})\f$, it evaluates to \f$ u_0 \f$ at \f$ 1\f$ and
 * is \f$ 0 \f$ elsewhere.
 * Therefore, \f$ L(u_0)(i) = 1 \f$ for $i \neq 0 \f$, \f$ L(u_0)(0) = 1 - u_0 \f$.
 *
 * We see that the sum of \f$ L(u_0) \f$ over the smaller hypercube is equal to \f$ 2^{d-2} - 2 - (u_0 + 1) \f$.
 * The partial eval \f$ L(u_0, u_1) \f$ is given by \f$ 1 - (1+u_0 + u_1 - u_0 \cdot u_1) L_0(X_2, X_3,\ldots,
 * X_{d-1})\f$, it is \f$ 1 \f$ outside of \f$ 0 \f$, and is equal to \f$ - u_0 - u_1 + u_0u_1 \f$.
 * In the subsequent rounds \f$L(u_0, \ldots, u_i)\f$ is \f$ 1\f$ outside of \f$ 0 \f$ ans is given as
 * \f$ 1 -  (1+u_0 + u_1 - u_0 \cdot u_1) (1-u_2)\cdots (1 - u_i) L_0(X_{i+1}, \ldots, X_{d-1})\f$.
 *
 * When the prover computes the first sumcheck univariate \f$S_k(X) = \sum L \cdot H(X_0,\ldots, X_{d-1})\f$, it has to
 * compute \f$ \sum_{i_{k+1},\ldots, i_{d-1}} L(u_0,u_1,\ldots, u_{k-1}, X, i_{k+1},\ldots, i_{d-1}) H(\cdots)\f$
 *
 * @tparam FF
 */
template <typename FF> struct RowDisablingPolynomial {
    // by default it is a constant multilinear polynomial = 1
    FF eval_at_0{ 1 };
    FF eval_at_1{ 2 };
    FF one = FF{ 1 };
    FF zero = FF{ 0 };

    RowDisablingPolynomial() = default;

    void update_evaluations(FF round_challenge, size_t round_idx)
    {
        if (round_idx == 0) {
            eval_at_0 = round_challenge;
            eval_at_1 = one;
        };
        if (round_idx == 1) {
            eval_at_0 = zero;
            eval_at_1 = eval_at_0 + round_challenge - eval_at_0 * round_challenge;
        };

        if (round_idx > 1) {
            eval_at_0 = zero;
            eval_at_1 = eval_at_1 * round_challenge;
        }
    }
};

} // namespace bb