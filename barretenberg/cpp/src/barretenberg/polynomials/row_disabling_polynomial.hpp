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
 * \f$ 1 -  (1+u_0 + u_1 - u_0 \cdot u_1) (1-u_2)\cdots (1 - u_i) L_0(X_{i+1}, \ldots, X_{d-1})\f$
 * @tparam FF
 */
template <typename FF> struct RowDisablingPolynomial {
    /**
     * @brief The challenges \f$(\beta_0,\ldots, \beta_{d-1}) \f$
     *
     */
    std::vector<FF> betas;

    /**
     * @brief The consecutive evaluations \f$ pow_{\ell}(\beta) =  pow_{\beta}(\vec \ell) \f$ for \f$\vec \ell\f$
     * identified with the integers \f$\ell = 0,\ldots, 2^d-1\f$
     *
     */
    std::vector<FF> beta_products;
    /**
     * @brief In Round \f$ i\f$ of Sumcheck, it points to the \f$ i \f$-th element in \f$ \vec \beta \f$
     *
     */
    size_t current_element_idx = 0;
    /**
     * @brief In Round \f$ i\f$ of Sumcheck, the periodicity equals to \f$ 2^{i+1}\f$ and represents the fixed interval
     * at which elements not containing either of \f$ (\beta_0,\ldots ,β_i)\f$ appear in #beta_products.
     *
     */
    size_t periodicity = 2;
    /**
     * @brief  The value \f$c_i\f$ obtained by partially evaluating one variable in the power polynomial at each round.
     * At the end of Round \f$ i \f$ in the sumcheck protocol, variable \f$X_i\f$ is replaced by the challenge \f$u_i
     * \f$. The partial evaluation result is updated to represent \f$ pow_{\beta}(u_0,.., u_{i}) = \prod_{k=0}^{i} (
     * (1-u_k) + u_k\cdot \beta_k) \f$.
     *
     */
    FF partial_evaluation_result = FF(1);

    /**
     * @brief Construct a new RowDisablingPolynomial
     *
     * @param betas
     * @param log_num_monomials
     */
    RowDisablingPolynomial(const std::vector<FF>& betas, const size_t log_num_monomials)
        : betas(betas)
        , beta_products(compute_beta_products(betas, log_num_monomials))
    {}

    /**
     * @brief Construct a new RowDisablingPolynomial object without expanding to a vector of monomials
     * @details The sumcheck verifier does not use beta_products
     *
     * @param betas
     */
    RowDisablingPolynomial(const std::vector<FF>& betas)
        : betas(betas)
    {}

    /**
     * @brief Retruns the element in #beta_products at place #idx.
     *
     * @param idx
     * @return FF const&
     */
    FF const& operator[](size_t idx) const { return beta_products[idx]; }
    /**
     * @brief Computes the component  at index #current_element_idx in #betas.
     *
     * @return FF
     */
    FF current_element() const { return betas[current_element_idx]; }

    /**
     * @brief Evaluate  \f$ ((1−X_{i}) + X_{i}\cdot \beta_{i})\f$ at the challenge point \f$ X_{i}=u_{i} \f$.
     */
    FF univariate_eval(FF challenge) const { return (FF(1) + (challenge * (betas[current_element_idx] - FF(1)))); };

    /**
     */
    template <typename Bool> FF univariate_eval(const FF& challenge, const Bool& dummy_round) const
    {
        FF beta_or_dummy;
        // For the Ultra Recursive flavor to ensure constant size proofs, we perform constant amount of hashing
        // producing 28 gate betas and we need to use the betas in the dummy rounds to ensure the permutation related
        // selectors stay the same regardless of real circuit size.  The other recursive verifiers aren't constant for
        // the dummy sumcheck rounds we just use 1 as we only generated real log_n betas
        if (current_element_idx < betas.size()) {
            beta_or_dummy = betas[current_element_idx];
        } else {
            beta_or_dummy = FF::from_witness(challenge.get_context(), 1);
        }
        FF beta_val = FF::conditional_assign(dummy_round, FF::from_witness(challenge.get_context(), 1), beta_or_dummy);
        return (FF(1) + (challenge * (beta_val - FF(1))));
    }

    /**
     * @brief Partially evaluate the \f$pow_{\beta} \f$-polynomial at the new challenge and update \f$ c_i \f$
     * @details Update the constant \f$c_{i} \to c_{i+1} \f$ multiplying it by \f$pow_{\beta}\f$'s factor \f$\left(
     * (1-X_i) + X_i\cdot \beta_i\right)\vert_{X_i = u_i}\f$ computed by \ref univariate_eval.
     * @param challenge \f$ i \f$-th verifier challenge \f$ u_{i}\f$
     */
    void partially_evaluate(FF challenge)
    {
        FF current_univariate_eval = univariate_eval(challenge);
        partial_evaluation_result *= current_univariate_eval;
        current_element_idx++;
        periodicity *= 2;
    }

    /**
     * @brief Partially evaluate the \f$pow_{\beta} \f$-polynomial at the new challenge and update \f$ c_i \f$
     * @details Update the constant \f$c_{i} \to c_{i+1} \f$ multiplying it by \f$pow_{\beta}\f$'s factor \f$\left(
     * (1-X_i) + X_i\cdot \beta_i\right)\vert_{X_i = u_i}\f$ computed by \ref univariate_eval.
     * @param challenge \f$ i \f$-th verifier challenge \f$ u_{i}\f$
     */
    template <typename Builder> void partially_evaluate(const FF& challenge, const stdlib::bool_t<Builder>& dummy)
    {
        FF current_univariate_eval = univariate_eval(challenge, dummy);
        // If dummy round, make no update to the partial_evaluation_result
        partial_evaluation_result = FF::conditional_assign(
            dummy, partial_evaluation_result, partial_evaluation_result * current_univariate_eval);
        current_element_idx++;
        periodicity *= 2;
    }

    /**
     * @brief Given \f$ \vec\beta = (\beta_0,...,\beta_{d-1})\f$ compute \f$ pow_{\ell}(\vec \beta) = pow_{\beta}(\vec
     * \ell)\f$ for \f$ \ell =0,\ldots,2^{d}-1\f$.
     *
     * @param log_num_monomials Determines the number of beta challenges used to compute beta_products (required because
     * when we generate CONST_SIZE_PROOF_LOG_N, currently 28, challenges but the real circuit size is less than 1 <<
     * CONST_SIZE_PROOF_LOG_N, we should compute unnecessarily a vector of beta_products of length 1 << 28 )
     */
    BB_PROFILE static std::vector<FF> compute_beta_products(const std::vector<FF>& betas,
                                                            const size_t log_num_monomials)
    {

        size_t pow_size = 1 << log_num_monomials;
        std::vector<FF> beta_products(pow_size);

        // Determine number of threads for multithreading.
        // Note: Multithreading is "on" for every round but we reduce the number of threads from the max available based
        // on a specified minimum number of iterations per thread. This eventually leads to the use of a single thread.
        // For now we use a power of 2 number of threads simply to ensure the round size is evenly divided.
        size_t max_num_threads = get_num_cpus_pow2(); // number of available threads (power of 2)
        size_t min_iterations_per_thread = 1 << 6; // min number of iterations for which we'll spin up a unique thread
        size_t desired_num_threads = pow_size / min_iterations_per_thread;
        size_t num_threads = std::min(desired_num_threads, max_num_threads); // fewer than max if justified
        num_threads = num_threads > 0 ? num_threads : 1;                     // ensure num threads is >= 1
        size_t iterations_per_thread = pow_size / num_threads;               // actual iterations per thread

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/864): This computation is asymtotically slow as it
        // does pow_size * log(pow_size) work. However, in practice, its super efficient because its trivially
        // parallelizable and only takes 45ms for the whole 6 iter IVC benchmark. Its also very readable, so we're
        // leaving it unoptimized for now.
        parallel_for(num_threads, [&](size_t thread_idx) {
            size_t start = thread_idx * iterations_per_thread;
            size_t end = (thread_idx + 1) * iterations_per_thread;
            for (size_t i = start; i < end; i++) {
                auto res = FF(1);
                for (size_t j = i, beta_idx = 0; j > 0; j >>= 1, beta_idx++) {
                    if ((j & 1) == 1) {
                        res *= betas[beta_idx];
                    }
                }
                beta_products[i] = res;
            }
        });

        return beta_products;
    }
};

} // namespace bb