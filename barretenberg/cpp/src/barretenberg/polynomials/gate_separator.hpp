// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/compiler_hints.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/stdlib/primitives/bool/bool.hpp"

#include <cstddef>
#include <vector>
namespace bb {

template <typename FF> struct GateSeparatorPolynomial {
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
     * @brief Construct a new GateSeparatorPolynomial
     *
     * @param betas
     * @param log_num_monomials
     */
    GateSeparatorPolynomial(const std::vector<FF>& betas, const size_t log_num_monomials)
        : betas(betas)
        , beta_products(compute_beta_products(betas, log_num_monomials))
    {}

    /**
     * @brief Construct a new GateSeparatorPolynomial object without expanding to a vector of monomials
     * @details The sumcheck verifier does not use beta_products
     *
     * @param betas
     */
    GateSeparatorPolynomial(const std::vector<FF>& betas)
        : betas(betas)
    {}

    /**
     * @brief Constructs a virtual GateSeparator used by the prover in rounds k > d - 1, and computes its partial
     * evaluation at (u_0, ..., u_{d-1}).
     *
     */
    GateSeparatorPolynomial(const std::vector<FF>& betas, const std::vector<FF>& challenge)
        : betas(betas)
    {
        for (const auto& u_k : challenge) {
            partially_evaluate(u_k);
        }
    }

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
     * @param indicator An entry of `padding_indicator_array`, which is equal to 1 when round_idx < log_circuit_size
     * and is 0 otherwise.
     */
    void partially_evaluate(const FF& challenge, const FF& indicator)
    {
        FF current_univariate_eval = univariate_eval(challenge);
        // If dummy round, make no update to the partial_evaluation_result
        partial_evaluation_result = (FF(1) - indicator) * partial_evaluation_result +
                                    indicator * partial_evaluation_result * current_univariate_eval;
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
        BB_BENCH_NAME("GateSeparatorPolynomial::compute_beta_products");
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
        const size_t num_betas_per_thread = numeric::get_msb(iterations_per_thread);

        // Explanations of the algorithm:
        // The product of the betas at index i (beta_products[i]) contains the multiplicative factor betas[j] if and
        // only if the jth bit of i is 1 (j starting with 0 for the least significant bit). For instance, i = 13 = 1101
        // in binary, so the product is betas[0] * betas[2] * betas[3]. Observe that if we toggle the kth bit of i (0 to
        // 1), i.e., we add 2^k to i, then the product is multiplied by betas[k]: beta_products[i + 2^k] =
        // beta_products[i] * betas[k]. If we know the products for the interval of indices [0, 2^k), we can compute all
        // the products for the interval of indices [2^k, 2^(k+1)) by multiplying each element by betas[k]. Iteratively,
        // starting with beta_products[0] = 1, we can double the number of computed products at each iteration by
        // multiplying the previous products by betas[k]. We first multiply beta_products[0] = 1 by betas[0], then we
        // multiply beta_products[0] and beta_products[1] by betas[1], etc...
        //
        // We distribute the computation of the beta_products evenly across threads, i.e., thread number
        // thread_idx will handle the interval of indices [thread_idx * iterations_per_thread, (thread_idx + 1) *
        // iterations_per_thread). Note that for a given thread, all the processed indices have the same
        // prefix in binary. Therefore, each beta_product of the thread is a multiple of this "prefix product". The
        // successive products are then populated by the above algorithm whereby we double the interval at each
        // iteration and multiply by the new beta to process the suffix bits. The difference is that we initialize the
        // first product with this "prefix product" instead of 1.

        // Compute the prefix products for each thread
        std::vector<FF> thread_prefix_beta_products(num_threads);
        thread_prefix_beta_products.at(0) = 1;

        // Same algorithm applies for the prefix products. The difference is that we start at a beta which is not the
        // first one (index 0), but the one at index num_betas_per_thread. We process the high bits only.
        // Example: If num_betas_per_thread = 3, we compute after the first iteration:
        //          (1, beta_3)
        // 2nd iteration: (1, beta_3, beta_4, beta_3 * beta_4)
        // 3nd iteration: (1, beta_3, beta_4, beta_3 * beta_4, beta_5, beta_3 * beta_5, beta_4 * beta_5, beta_3 * beta_4
        // * beta_5)
        // etc ....
        for (size_t beta_idx = num_betas_per_thread, window_size = 1; beta_idx < log_num_monomials;
             beta_idx++, window_size <<= 1) {
            const auto& beta = betas.at(beta_idx);
            for (size_t j = 0; j < window_size; j++) {
                thread_prefix_beta_products.at(window_size + j) = beta * thread_prefix_beta_products.at(j);
            }
        }

        parallel_for(num_threads, [&](size_t thread_idx) {
            size_t start = thread_idx * iterations_per_thread;
            beta_products.at(start) = thread_prefix_beta_products.at(thread_idx);

            // Compute the suffix products for each thread
            // Example: Assume we start with the prefix product = beta_3 * beta_5
            // After the first iteration, we get: (beta_3 * beta_5, beta_0 * beta_3 * beta_5)
            // 2nd iteration: (beta_3 * beta_5, beta_0 * beta_3 * beta_5, beta_1 * beta_3 * beta_5, beta_0 * beta_1 *
            // beta_3 * beta_5)
            // etc ...
            for (size_t beta_idx = 0, window_size = 1; beta_idx < num_betas_per_thread; beta_idx++, window_size <<= 1) {
                const auto& beta = betas.at(beta_idx);
                for (size_t j = 0; j < window_size; j++) {
                    beta_products.at(start + window_size + j) = beta * beta_products.at(start + j);
                }
            }
        });

        return beta_products;
    }
};
/**<
 * @struct GateSeparatorPolynomial
 * @brief Implementation of the methods for the \f$pow_{\ell}\f$-polynomials used in Protogalaxy and
\f$pow_{\beta}\f$-polynomials used in Sumcheck.
 *
 * @details
 * ## GateSeparatorPolynomial in Protogalaxy
 *
 * \todo Expand this while completing PG docs.
 *
 * For \f$0\leq \ell \leq 2^d-1 \f$, the \f$pow_{\ell} \f$-polynomials used in Protogalaxy is a multilinear polynomial
defined by the formula
 * \f{align} pow_{\ell}(X_0,\ldots, X_{d-1})
          =    \prod_{k=0}^{d-1} ( ( 1-\ell_k ) + \ell_k \cdot X_k )
          =      \prod_{k=0}^{d-1} X_{k}^{ \ell_k }
     \f}
 *where \f$(\ell_0,\ldots, \ell_{d-1})\f$ is the binary representation of \f$\ell \f$.
 *
 *
  ## Pow-contributions to Round Univariates in Sumcheck {#PowContributions}
 * For a fixed \f$ \vec \beta \in \mathbb{F}^d\f$, the map \f$ \ell \mapsto pow_{\ell} (\vec \beta)\f$ defines a
 polynomial \f{align}{ pow_{\beta} (X_0,\ldots, X_{d-1}) = \prod_{k=0}^{d-1} (1- X_k + X_k \cdot \beta_k)
 \f}
such that \f$ pow_{\beta} (\vec \ell) = pow_{\ell} (\vec \beta) \f$ for any \f$0\leq \ell \leq 2^d-1 \f$ and any vector
\f$(\beta_0,\ldots, \beta_{d-1})  \in \mathbb{F} ^d\f$.

 * Let \f$ i \f$ be the current Sumcheck round, \f$ i \in \{0, …, d-1\}\f$ and \f$ u_{0}, ..., u_{i-1} \f$ be the
challenges generated in Rounds \f$ 0 \f$ to \f$ i-1\f$.
 *
 * In Round \f$ i \f$, we iterate over the points \f$ (\ell_{i+1}, \ldots, \ell_{d-1}) \in
\{0,1\}^{d-1-i}\f$.
Define a univariate polynomial \f$pow_{\beta}^i(X_i, \vec \ell) \f$  as follows
 *   \f{align}{  pow_{\beta}^i(X_i, \vec \ell) =   pow_{\beta} ( u_{0}, ..., u_{i-1}, X_i, \ell_{i+1}, \ldots,
\ell_{d-1})            = c_i \cdot ( (1−X_i) + X_i \cdot \beta_i ) \cdot \beta_{i+1}^{\ell_{i+1}}\cdot \cdots \cdot
\beta_{d-1}^{\ell_{d-1}}, \f} where \f$ c_i = \prod_{k=0}^{i-1} (1- u_k + u_k \cdot \beta_k) \f$. It will be used below
to simplify the computation of Sumcheck round univariates.

 ### Computing Sumcheck Round Univariates
 * We identify \f$ \vec \ell = (\ell_{i+1}, \ldots, \ell_{d-1}) \in \{0,1\}^{d-1 - i}\f$ with the binary representation
of the integer \f$ \ell \in \{0,\ldots, 2^{d-1-i}-1 \}\f$.
 *
 * Set
  \f{align}{S^i_{\ell}( X_i ) = F( u_{0}, ..., u_{i-1}, X_{i},  \vec \ell ), \f}
 * i.e. \f$ S^{i}_{\ell}( X_i ) \f$  is the univariate of the full relation \f$ F \f$ defined by its partial evaluation
at \f$(u_0,\ldots,u_{i-1},  \ell_{i+1},\ldots, \ell_{d-1}) \f$
 * which  is an alpha-linear-combination of the subrelations evaluated at this point.
 *
 * In Round \f$i\f$, the prover
 * \ref bb::SumcheckProverRound< Flavor >::compute_univariate "computes the univariate polynomial" for the relation
defined by \f$ \tilde{F} (X_0,\ldots, X_{d-1}) = pow_{\beta}(X_0,\ldots, X_{d-1}) \cdot F\f$, namely
 * \f{align}{
    \tilde{S}^{i}(X_i) = \sum_{ \ell = 0} ^{2^{d-i-1}-1}  pow^i_\beta ( X_i, \ell_{i+1}, \ldots, \ell_{d-1} )
S^i_{\ell}( X_i )
 *        =  c_i \cdot ( (1−X_i) + X_i\cdot \beta_i )  \cdot \sum_{ \ell = 0} ^{2^{d-i-1}-1} \beta_{i+1}^{\ell_{i+1}}
\cdot \ldots \cdot \beta_{d-1}^{\ell_{d-1}} \cdot S^i_{\ell}( X_i ) \f}
 *
 * Define
 \f{align} T^{i}( X_i ) =  \sum_{\ell = 0}^{2^{d-i-1}-1} \beta_{i+1}^{\ell_{i+1}} \cdot \ldots \cdot
\beta_{d-1}^{\ell_{d-1}} \cdot S^{i}_{\ell}( X_i ) \f} then \f$ \deg_{X_i} (T^i) \leq \deg_{X_i} S^i \f$.
 ### Features of GateSeparatorPolynomial used by Sumcheck Prover
 - The factor \f$ c_i \f$ is the #partial_evaluation_result, it is updated by \ref partially_evaluate.
 - The challenges \f$(\beta_0,\ldots, \beta_{d-1}) \f$ are recorded in #betas.
 - The consecutive evaluations \f$ pow_{\ell}(\vec \beta) = pow_{\beta}(\vec \ell) \f$ for \f$\vec \ell\f$ identified
with the integers \f$\ell = 0,\ldots, 2^d-1\f$ represented in binary are pre-computed by \ref compute_values and stored
in #beta_products.
 *
 */

} // namespace bb
