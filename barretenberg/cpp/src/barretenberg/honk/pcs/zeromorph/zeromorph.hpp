#pragma once
#include "barretenberg/polynomials/polynomial.hpp"

/**
 * @brief
 *
 */
namespace proof_system::honk::pcs::zeromorph {

template <typename Curve> class ZeroMorphProver {
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using Polynomial = barretenberg::Polynomial<Fr>;

    // WORKTODO: whats the real number? 25?
    // Number of G1 elements in the srs. (It is not possible to commit to polynomials of degree > N_max-1).
    static const size_t N_max = 1 << 10;

  public:
    /**
     * @brief Compute multivariate quotients q_k(X_0, ..., X_{k-1}) for f(X_0, ..., X_{d-1})
     * @details Given multilinear polynomial f = f(X_0, ..., X_{d-1}) for which f(u) = v, compute q_k such that:
     *
     *  f(X_0, ..., X_{d-1}) - v = \sum_{k=0}^{d-1} (X_k - u_k)q_k(X_0, ..., X_{k-1})
     *
     * The polynomials q_k can be computed explicitly as the difference of the partial evaluation of f in the last k
     * variables at, respectively, u'' = (u_k + 1, u_{k+1}, ..., u_{n-1}) and u' = (u_{n-k-1}, ..., u_{n-1}). I.e.
     *
     *  q_k(X_0, ..., X_{k-1}) = f(X_0,...,X_{k-1}, u'') - f(X_0,...,X_{k-1}, u')
     *
     * TODO(#739): This method has been designed for clarity at the expense of efficiency. Implement the more efficient
     * algorithm detailed in the latest versions of the ZeroMorph paper.
     * @param input_polynomial Multilinear polynomial f(X_0, ..., X_{d-1})
     * @param u_challenge Multivariate challenge u = (u_0, ..., u_{d-1})
     * @return std::vector<Polynomial> The quotients q_k
     */
    static std::vector<Polynomial> compute_multilinear_quotients(std::span<Fr> input_poly, std::span<Fr> u_challenge)
    {
        auto input_polynomial = Polynomial(input_poly);
        size_t N = input_polynomial.size();
        size_t log_N = numeric::get_msb(N);

        // Define the vector of quotients q_k, k = 0, ..., log_n-1
        std::vector<Polynomial> quotients;
        for (size_t k = 0; k < log_N; ++k) {
            size_t size = 1 << k;
            quotients.emplace_back(Polynomial(size));
        }

        // Note: we compute the q_k in reverse order, i.e. q_{n-1}, ..., q_0
        for (size_t k = 0; k < log_N; ++k) {
            // Define partial evaluation point u' = (u_{n-k-1}, ..., u_{n-1})
            auto partial_size = static_cast<std::ptrdiff_t>(k + 1);
            std::vector<Fr> u_partial(u_challenge.end() - partial_size, u_challenge.end());

            // Compute f' = f(X_0,...,X_{k-1}, u')
            auto f_1 = input_polynomial.partial_evaluate_mle(u_partial);

            // Increment first element to get altered partial evaluation point u'' = (u_k + 1, u_{k+1}, ..., u_{n-1})
            u_partial[0] += 1;

            // Compute f'' = f(X_0,...,X_{k-1}, u'')
            auto f_2 = input_polynomial.partial_evaluate_mle(u_partial);

            // Compute q_k = f''(X_0,...,X_{k-1}) - f'(X_0,...,X_{k-1})
            auto q_k = f_2;
            q_k -= f_1;

            quotients[log_N - k - 1] = q_k; // deg(q_k) = N - 1
        }

        return quotients;
    }

    /**
     * @brief Construct batched, lifted-degree univariate quotient
     *
     * @param quotients Polynomials q_k, interpreted as univariates; deg(q_k) = 2^k - 1
     * @param N
     * @return Polynomial
     */
    static Polynomial compute_batched_lifted_degree_quotient(std::vector<Polynomial>& quotients,
                                                             Fr y_challenge,
                                                             size_t N)
    {
        // Batched lifted degree quotient polynomial
        auto result = Polynomial(N);

        // Compute q = \sum_k y^k * X^{N - d_k - 1} * q_k
        size_t k = 0;
        auto scalar = Fr(1); // y^k
        for (auto& quotient : quotients) {
            // Accumulate y^k*q_k into q, at the index offset N - d_k - 1
            size_t deg_k = (1ULL << k) - 1;
            size_t offset = N - deg_k - 1;
            for (size_t idx = 0; idx < deg_k + 1; ++idx) {
                result[offset + idx] += scalar * quotient[idx];
            }
            scalar *= y_challenge; // update batching scalar y^k
            k++;
        }

        return result;
    }

    /**
     * @brief Compute partially evaluated degree check polynomial \zeta_x = q - \sum_k y^k * x^{N - d_k - 1} * q_k
     * @details Compute \zeta_x, where
     *
     *                          \zeta_x = q - \sum_k y^k * x^{N - d_k - 1} * q_k
     *
     * @param batched_quotient
     * @param quotients
     * @param y_challenge
     * @param x_challenge
     * @return Polynomial Degree check polynomial \zeta_x such that \zeta_x(x) = 0
     */
    static Polynomial compute_partially_evaluated_degree_check_polynomial(Polynomial& batched_quotient,
                                                                          std::vector<Polynomial>& quotients,
                                                                          Fr y_challenge,
                                                                          Fr x_challenge)
    {
        size_t N = batched_quotient.size();

        // Initialize partially evaluated degree check polynomial \zeta_x to \hat{q}
        auto result = batched_quotient;

        size_t k = 0;
        auto y_power = Fr(1); // y^k
        for (auto& quotient : quotients) {
            // Accumulate y^k * x^{N - d_k - 1} * q_k into \hat{q}
            size_t deg_k = (1 << k) - 1;
            auto x_power = x_challenge.pow(N - deg_k - 1);
            // size_t offset = N - deg_k - 1;
            for (size_t idx = 0; idx < deg_k + 1; ++idx) {
                result[idx] -= y_power * x_power * quotient[idx];
            }
            y_power *= y_challenge; // update batching scalar y^k
            k++;
        }

        return result;
    }

    /**
     * @brief Compute partially evaluated zeromorph identity polynomial Z_x
     * @details Compute Z_x, where
     *
     *     Z_x = f - v - \sum_k (x^{2^k}\Phi_{n-k-1}(x^{2^{k-1}}) - u_k\Phi_{n-k}(x^{2^k})) * q_k
     *
     * @param input_polynomial
     * @param quotients
     * @param v_evaluation
     * @param x_challenge
     * @return Polynomial
     */
    static Polynomial compute_partially_evaluated_zeromorph_identity_polynomial(Polynomial& input_polynomial,
                                                                                std::vector<Polynomial>& quotients,
                                                                                Fr v_evaluation,
                                                                                std::span<Fr> u_challenge,
                                                                                Fr x_challenge)
    {
        size_t N = input_polynomial.size();
        auto numerator = x_challenge.pow(N) - 1; // x^N - 1

        // Partially evaluated zeromorph identity polynomial Z_x
        auto result = input_polynomial;
        auto Phi_n_x = numerator / (x_challenge - 1);
        result[0] -= v_evaluation * Phi_n_x; // f - v * \Phi_n(x)

        size_t k = 0;
        auto x_power = x_challenge; // x^{2^k}
        for (auto& quotient : quotients) {
            x_power = x_challenge.pow(1 << k); // x^{2^k}

            auto phi_term_1 = numerator / (x_challenge.pow(1 << (k + 1)) - 1); // \Phi_{n-k-1}(x^{2^{k + 1}})
            auto phi_term_2 = numerator / (x_challenge.pow(1 << k) - 1);       // \Phi_{n-k}(x^{2^k})

            // x^{2^k} * \Phi_{n-k-1}(x^{2^{k+1}}) - u_k *  \Phi_{n-k}(x^{2^k})
            auto scalar = x_power * phi_term_1 - u_challenge[k] * phi_term_2;
            for (size_t idx = 0; idx < (1 << k); ++idx) {
                result[idx] -= scalar * quotient[idx];
            }
            k++;
        }

        return result;
    }

    /**
     * @brief Compute combined evaluation and degree-check quotient polynomial pi
     * @details Compute univariate quotient pi, where
     *
     *  pi = (q_\zeta + z*q_Z) X^{N_{max}-(N-1)}, with q_\zeta = \zeta_x/(X-x), q_Z = Z_x/(X-x)
     *
     * @param Z_x
     * @param zeta_x
     * @param x_challenge
     * @param z_challenge
     * @param N_max
     * @return Polynomial
     */
    static Polynomial compute_batched_evaluation_and_degree_check_quotient(Polynomial& zeta_x,
                                                                           Polynomial& Z_x,
                                                                           Fr x_challenge,
                                                                           Fr z_challenge)
    {
        // We cannot commit to polynomials with size > N_max
        size_t N = zeta_x.size();
        ASSERT(N <= N_max);

        // Compute q_{\zeta} and q_Z in place
        zeta_x.factor_roots(x_challenge);
        Z_x.factor_roots(x_challenge);

        // Compute batched quotient q_{\zeta} + z*q_Z
        auto batched_quotient = zeta_x;
        batched_quotient.add_scaled(Z_x, z_challenge);

        // TODO(ISSUE#): To complete the degree check, we need to commit to (q_{\zeta} + z*q_Z)*X^{N_max - N - 1}.
        // Verification then requires a pairing check similar to the standard KZG check but with [1]_2 replaced by
        // [X^{N_max - N -1}]_2. Two issues: A) we do not have an SRS with these G2 elements (so need to generate a fake
        // setup until we can do the real thing), and B) its not clear to me how to update our pairing algorithms to do
        // this type of pairing. For now, simply construct q_{\zeta} + z*q_Z without the shift and do a standard KZG
        // pairing check. When we're ready, all we have to do to make this fully legit is commit to the shift here and
        // update the pairing check accordingly. Note: When this is implemented properly, it doesnt make sense to store
        // the (massive) shifted polynomial of size N_max. Ideally would only store the unshifted version and just
        // compute the shifted commitment directly via a new method.
        auto batched_shifted_quotient = batched_quotient;

        return batched_shifted_quotient;
    }
};

template <typename Curve> class ZeroMorphVerifier {};

} // namespace proof_system::honk::pcs::zeromorph