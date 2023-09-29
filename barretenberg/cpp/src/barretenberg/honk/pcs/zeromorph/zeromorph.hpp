#pragma once
// #include "barretenberg/honk/pcs/claim.hpp"
// #include "barretenberg/honk/pcs/commitment_key.hpp"
// #include "barretenberg/honk/pcs/verification_key.hpp"
// #include "barretenberg/honk/transcript/transcript.hpp"
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

  public:
    /**
     * @brief Compute multivariate quotients q_k(X_0, ..., X_{k-1}) for f(X_0, ..., X_{d-1})
     * @details Given multilinear polynomial f = f(X_0, ..., X_{d-1}) for which f(u) = v, compute q_k such that:
     *
     *  f(X_0, ..., X_{d-1}) - v = \sum_{k=0}^{d-1} (X_k - u_k)q_k(X_0, ..., X_{k-1})
     *
     * @param input_polynomial Multilinear polynomial f(X_0, ..., X_{d-1})
     * @param u_challenge Multivariate challenge u = (u_0, ..., u_{d-1})
     * @return std::vector<Polynomial>
     */
    static std::vector<Polynomial> compute_multivariate_quotients(std::span<Fr> input_polynomial,
                                                                  std::span<Fr> u_challenge)
    {
        size_t N = input_polynomial.size();
        size_t log_N = numeric::get_msb(N);

        // Define the vector of quotients q_k, k = 0, ..., log_n-1
        std::vector<Polynomial> quotients;
        quotients.reserve(log_N);

        // WORKTODO: Actually compute the q_k here!
        for (size_t k = 0; k < log_N; ++k) {
            (void)u_challenge;
            // Note: in reality we want polys of size 2^k but for convenience use size n for now
            // quotient = Polynomial(1 << k); // deg(q_k) = 2^k - 1
            quotients.emplace_back(Polynomial(N)); // deg(q_k) = N - 1
            // add an arbitrary non-zero coefficient to each poly to avoid point at infinity
            quotients[k][0] = Fr::random_element();
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
            size_t deg_k = (1 << k) - 1;
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
     * @param N
     * @return Polynomial Degree check polynomial \zeta_x such that \zeta_x(x) = 0
     */
    static Polynomial compute_partially_evaluated_degree_check_polynomial(
        Polynomial& batched_quotient, std::vector<Polynomial>& quotients, Fr y_challenge, Fr x_challenge, size_t N)
    {
        (void)batched_quotient;
        (void)y_challenge;
        (void)x_challenge;

        // Partially evaluated degree check polynomial \zeta_x
        auto result = Polynomial(N);

        // WORKTODO: Compute partially evaluated degree check polynomial q - \sum_k y^k * x^{N - d_k - 1} * q_k
        for (auto& quotient : quotients) {
            // Simply add y^k*x^{N - d_k - 1}q_k into q
            (void)quotient;
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
                                                                                Fr x_challenge)
    {
        (void)input_polynomial;
        (void)v_evaluation;
        (void)x_challenge;
        size_t N = input_polynomial.size();

        // Partially evaluated zeromorph identity polynomial Z_x
        auto result = Polynomial(N);

        // WORKTODO: Compute partially evaluated degree check polynomial q - \sum_k y^k * x^{N - d_k - 1} * q_k
        for (auto& quotient : quotients) {
            (void)quotient;
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
    static Polynomial compute_batched_evaluation_and_degree_check_quotient(
        Polynomial& Z_x, Polynomial& zeta_x, Fr x_challenge, Fr z_challenge, size_t N_max)
    {
        (void)Z_x;
        (void)zeta_x;
        (void)x_challenge;
        (void)z_challenge;
        (void)N_max;

        size_t N = Z_x.size();

        // Partially evaluated zeromorph identity polynomial Z_x
        auto result = Polynomial(N);

        return result;
    }
};

template <typename Curve> class ZeroMorphVerifier {};

} // namespace proof_system::honk::pcs::zeromorph