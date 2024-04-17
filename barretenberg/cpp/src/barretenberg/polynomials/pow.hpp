#pragma once
#include "barretenberg/common/compiler_hints.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/common/thread.hpp"

#include <cstddef>
#include <vector>
namespace bb {

template <typename FF> struct PowPolynomial {

    // \vec{β} = {β_0, β_1,.., β_{d-1}}
    std::vector<FF> betas;

    // The values of pow_\vec{β}(i) for i=0,..,2^d - 1 for the given \vec{β}
    std::vector<FF> pow_betas;

    // At round \f$ i\f$  of sumcheck this will point to the \f$ i \f$-th element in \vec{β}
    size_t current_element_idx = 0;

    // At round l of sumcheck, the periodicity represents the fixed interval at which elements not containing either of
    // β_0,..,β_l appear in pow_betas
    size_t periodicity = 2;

    // The value c_l obtained by partially evaluating one variable in the power polynomial at each round. At the
    // end of round l in the sumcheck protocol, variable X_l is replaced by a verifier challenge u_l. The partial
    // evaluation result is updated to represent pow(u_0,.., u_{l-1}) = \prod_{0 ≤ k < l} ( (1-u_k) + u_k⋅β_k).
    FF partial_evaluation_result = FF(1);

    explicit PowPolynomial(const std::vector<FF>& betas)
        : betas(betas)
    {}

    FF const& operator[](size_t idx) const { return pow_betas[idx]; }

    FF current_element() const { return betas[current_element_idx]; }

    /**
     * @brief Evaluate  \f$ ((1−X_{i}) + X_{i}\cdot \beta_{i})\f$ at the challenge point \f$ X_{i}=u_{i} \f$.
     */
    FF univariate_eval(FF challenge) const { return (FF(1) + (challenge * (betas[current_element_idx] - FF(1)))); };

    /**
     * @brief Partially evaluate the \f$pow \f$-polynomial at the new challenge and update \f$ c_i \f$
     * @details Update the constant \f$c_{i} \to c_{i+1} \f$ multiplying it by \f$pow\f$'s factor \f$\left( (1-X_i) +
     * X_i\cdot \beta_i\right)\vert_{X_i = u_i}\f$ computed by \ref univariate_eval.
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
     * @brief Given \f$ \vec\beta = (\beta_0,...,\beta_{d-1})\f$ compute \f$ pow_{\vec \beta} (i)\f$ for \f$
     * i=0,\ldots,2^{d}-1\f$.
     *
     */
    BB_PROFILE void compute_values()
    {
        size_t pow_size = 1 << betas.size();
        pow_betas = std::vector<FF>(pow_size);

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
                pow_betas[i] = res;
            }
        });
    }
};
/**<
 * @struct PowPolynomial
 * @brief Implementation of the methods for the \f$pow\f$-polynomial defined by the formula
 * \f$ pow(X) = \prod_{k=0}^{d-1} ((1−X_k) + X_k\cdot \beta_k)\f$
 *
 * @details
 * ### Notation
 * Let
 * - \f$ d \f$ be the number of variables
 * - \f$ i \f$ be the current Sumcheck round, \f$ i \in \{0, …, d-1\}\f$
 * - \f$ u_{0}, ..., u_{i-1} \f$ the challenges sent by the verifier in rounds \f$ 0 \f$ to \f$ i-1\f$.
 *
 * Given a \f$pow\f$-challenge \f$\beta\f$, we define
 *
 * - \f$ \beta_{0}, \ldots, \beta_{d-1} \f$, as \f$ \beta_{k} = \beta^{ 2^k } \f$.
 *   When \f$ 0 \leq \ell \leq 2^d -1 \f$ is represented in bits \f$ [\ell_{0}, ..., \ell_{d-1}] \f$ where \f$ \ell_{0}
\f$ is the MSB, we have
 *   \f{align}{\beta^{\ell} =  \beta^{ \sum_{k=0}^{d-1} \ell_k \cdot 2^k }
          =     \prod_{k=0}^{d-1} \beta^{ \ell_k \cdot 2^k }
          =      \prod_{k=0}^{d-1} \beta_{k}^{ \ell_k }
          =     \prod_{k=0}^{d-1} ( ( 1-\ell_k ) + \ell_k \cdot \beta_k ) \f}
s \f$ \ell_{k} \in \{0, 1\} \f$.
 *   Note that
 *   - \f$ \beta_{0} = \beta \f$,
 *   - \f$ \beta_{k+1} = \beta_{k}^2 \f$,
 *   - \f$ \beta_{d-1}  = \beta^{ 2^{d-1} } \f$
 *
 * - \f$ pow (X) = \prod_{k=0}^{d-1} ((1−X_k) + X_k\cdot \beta_k)\f$ is the multi-linear polynomial whose evaluation at
the \f$ \ell \f$ -th index
 *   of the full hypercube, equals \f$ \beta^{\ell} \f$.
 *   We can also see it as the multi-linear extension of the vector \f$ (1, \beta, \beta^2, \ldots, \beta^{2^d-1}) \f$.
  ### Pow-contributions to Round Univariates
 * In Round \f$ i \f$, we iterate over all remaining vertices \f$ (\ell_{i+1}, \ldots, \ell_{d-1}) \in
\{0,1\}^{d-i-1}\f$.
 *   Let \f$ \ell = \sum_{k= i+1}^{d-1} \ell_k \cdot 2^{k-(i+1)} \f$ be the index of the current edge over which we are
evaluating the relation.
 *   We define the edge univariate for the pow polynomial as \f$ pow^{i}_{\ell} (X_i )\f$ and it can be represented as:
 *
 *   \f{align}{ pow^{i}_{\ell} ( X_{i} ) = &\ pow( u_{0}, ..., u_{i-1},
 *                             \cdot ( (1−X_i) + X_i \cdot \beta_i )
 *                    \prod_{k=i+1}^{d-1} ( (1-\ell_k) + \ell_k \cdot \beta_k )\\
 *                  = &\ c_i \cdot ( (1−X_i) + X_i \cdot \beta ^{2^i} ) \cdot \prod_{k=i+1}^{d-1} ((1-\ell_k) +
\ell_k\cdot \beta^{2^k} ) \\
 *                  = &\  c_i \cdot ( (1−X_i) + X_i \cdot \beta^{2^i} ) \cdot \beta^{ \sum_{k=i+1}^{d-1} \ell_k \cdot
2^k }
 *                  = c_i \cdot ( (1−X_i) + X_i \cdot \beta^{2^i} ) \cdot (\beta^{2^{i+1}})^{ \sum_{k=i+1}^{d-1} \ell_k
⋅ 2^{k-(i+1)} } \\
 *                  = &\ c_i \cdot ( (1−X_i) + X_i \cdot \beta^{2^i} ) \cdot \beta_{i+1}^{\ell} \f}
 *
 *   This is the pow polynomial, partially evaluated at
 *     \f$ (X_0, \ldots, X_{i-1}, X_{i+1}, \ldots, X_{d-1}) = (u_{0}, ..., u_{i-1}, \vec \ell) \f$ where \f$ \vec \ell
\in \{0,1\}^{d-i-1} \f$.

 The factor \f$ c_i \f$ is containned in #partial_evaluation_result.

 The challenge's powers  are recorded into the vector #betas.
 *
 ### Computing Round Univariates
 * Let \f$ S^{i}_{\ell}( X_i ) \f$ be the univariate of the full relation \f$ F \f$ defined by partially evaluating \f$F
\f$  at \f$(u_0,\ldots,u_{i-1},  \ell_{i+1},\ldots, \ell_{d-1}) \f$
 * i.e. it is the alpha-linear-combination of the sub-relations evaluated at this point.
 * More concretely,  \f$ S^i_{\ell}( X_i ) = F( u_{0}, ..., u_{i-1}, X_{i},  \vec \ell ) \f$ .
 * The \f$ i \f$-th univariate is given by \f$ S^i( X_i ) = \sum_{ \ell =0}^{2^{d-i-1}-1}   S^i_{\ell}( X_i ) \f$.
 *
 * We exploit the special structure of pow to optimize the computation of round univariates.
 * More specifically, in Round \f$i\f$, the prover computes the univariate polynomial for the relation defined by \f$
\tilde{F} (X)\f$
 * \f{align}{
    \tilde{S}^{i}(X_i) = &\ \sum_{ \ell = 0} ^{2^{d-i-1}-1}  pow^i_{\ell} ( X_i ) S^i_{\ell}( X_i ) \\
 *        = &\ \sum_{ \ell = 0} ^{2^{d-i-1}-1} \left( \beta_{i+1}^{\ell} \cdot ( (1−X_i) + X_i\cdot \beta_{i})\cdot c_i
\right)\cdot S^i_{\ell}( X_i ) \\
 *        = &\ ( (1−X_i) + X_i\cdot \beta_i ) \cdot \sum_{ \ell = 0} ^{2^{d-i-1}-1} \left( c_i\cdot  \beta_{i+1}^{\ell}
\cdot S^i_{\ell}( X_i ) \right) \\
 *        = &\ ( (1−X_i) + X_i\cdot \beta_i ) \cdot \sum_{ \ell = 0} ^{2^{d-i-1}-1} \left( c_i \cdot \beta_{i+1}^{\ell}
\cdot S^i_{\ell}( X_i ) \right) \f}
 *
 * Define \f{align} T^{i}( X_i ) =  \sum_{\ell = 0}^{2^{d-i-1}-1} \left( c_i \cdot \beta_{i+1}^{\ell} \cdot
S^{i}_{\ell}( X_i ) \right) \f} then \f$ \deg_{X_i} (T^i) \leq \deg_{X_i} S^i \f$ and it is only slightly more expensive
to compute than \f$ S^i( X_i )\f$.
 ### Justification
 * Having represented the round univariated \f$ \tilde{S}^i\f$ as above, we could save some prover's work by first
computing the polynomials \f$T^i(X_i) \f$ and multiplying each of them by the factor \f$\left( (1-X_i) + X_i\cdot
\beta_i\right)\vert_{X_i = u_i}\f$ computed by the method \ref univariate_eval and used by the method \ref
partially_evaluate.
 * @param zeta_pow
 * @param zeta_pow_sqr
 *
 *
 */

} // namespace bb