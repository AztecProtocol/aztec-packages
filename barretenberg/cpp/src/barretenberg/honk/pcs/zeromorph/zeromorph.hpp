#pragma once
#include "barretenberg/polynomials/polynomial.hpp"

/**
 * @brief
 *
 */
namespace proof_system::honk::pcs::zeromorph {

/**
 * @brief Prover for ZeroMorph multilinear PCS
 *
 * @tparam Curve
 */
template <typename Curve> class ZeroMorphProver_ {
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using Polynomial = barretenberg::Polynomial<Fr>;

    // TODO(#742): Set this N_max to be the number of G1 elements in the mocked zeromorph SRS once it's in place. (Then,
    // eventually, set it based on the real SRS).
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
            quotients.emplace_back(Polynomial(size)); // degree 2^k - 1
        }

        // Compute the q_k in reverse order, i.e. q_{n-1}, ..., q_0
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

            quotients[log_N - k - 1] = q_k;
        }

        return quotients;
    }

    /**
     * @brief Construct batched, lifted-degree univariate quotient q = \sum_k y^k * X^{N - d_k - 1} * q_k
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
            // Rather than explicitly computing the shift X^{N - d_k - 1} * q_k, simply accumulate y^k*q_k into q, at
            // the index offset N - d_k - 1
            auto deg_k = static_cast<size_t>((1 << k) - 1);
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
        size_t log_N = quotients.size();

        // Initialize partially evaluated degree check polynomial \zeta_x to \hat{q}
        auto result = batched_quotient;

        auto y_power = Fr(1); // y^k
        for (size_t k = 0; k < log_N; ++k) {
            // Accumulate y^k * x^{N - d_k - 1} * q_k into \hat{q}
            auto deg_k = static_cast<size_t>((1 << k) - 1);
            auto x_power = x_challenge.pow(N - deg_k - 1); // x^{N - d_k - 1}

            result.add_scaled(quotients[k], -y_power * x_power);

            y_power *= y_challenge; // update batching scalar y^k
        }

        return result;
    }

    /**
     * @brief Compute partially evaluated zeromorph identity polynomial Z_x
     * @details Compute Z_x, where
     *
     *  Z_x = x * \sum_{i=0}^{m-1} f_i + \sum_{i=0}^{l-1} g_i - v * x * \Phi_n(x)
     *           - x * \sum_k (x^{2^k}\Phi_{n-k-1}(x^{2^{k-1}}) - u_k\Phi_{n-k}(x^{2^k})) * q_k
     *
     * @param input_polynomial
     * @param quotients
     * @param v_evaluation
     * @param x_challenge
     * @return Polynomial
     */
    static Polynomial compute_partially_evaluated_zeromorph_identity_polynomial_new(Polynomial& f_batched,
                                                                                    Polynomial& g_batched,
                                                                                    std::vector<Polynomial>& quotients,
                                                                                    Fr v_evaluation,
                                                                                    std::span<Fr> u_challenge,
                                                                                    Fr x_challenge)
    {
        size_t N = f_batched.size();
        size_t log_N = quotients.size();

        // Initialize Z_x with x * \sum_{i=0}^{m-1} f_i + \sum_{i=0}^{l-1} g_i
        auto result = Polynomial(N);
        result.add_scaled(f_batched, x_challenge);
        result += g_batched;

        // Compute Z_x -= v * x * \Phi_n(x)
        auto phi_numerator = x_challenge.pow(N) - 1; // x^N - 1
        auto phi_n_x = phi_numerator / (x_challenge - 1);
        result[0] -= v_evaluation * x_challenge * phi_n_x;

        // Add contribution from q_k polynomials
        auto x_power = x_challenge; // x^{2^k}
        for (size_t k = 0; k < log_N; ++k) {
            x_power = x_challenge.pow(1 << k); // x^{2^k}

            // \Phi_{n-k-1}(x^{2^{k + 1}})
            auto phi_term_1 = phi_numerator / (x_challenge.pow(1 << (k + 1)) - 1);

            // \Phi_{n-k}(x^{2^k})
            auto phi_term_2 = phi_numerator / (x_challenge.pow(1 << k) - 1);

            // x^{2^k} * \Phi_{n-k-1}(x^{2^{k+1}}) - u_k *  \Phi_{n-k}(x^{2^k})
            auto scalar = x_power * phi_term_1 - u_challenge[k] * phi_term_2;

            scalar *= x_challenge;
            scalar *= Fr(-1);

            result.add_scaled(quotients[k], scalar);
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

        // TODO(#742): To complete the degree check, we need to commit to (q_{\zeta} + z*q_Z)*X^{N_max - N - 1}.
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

/**
 * @brief Verifier for ZeroMorph multilinear PCS
 *
 * @tparam Curve
 */
template <typename Curve> class ZeroMorphVerifier_ {
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;

  public:
    /**
     * @brief Compute commitment to partially evaluated batched lifted degree quotient identity
     * @details Compute commitment C_{\zeta_x} = [\zeta_x]_1 using homomorphicity:
     *
     *  C_{\zeta_x} = [q]_1 - \sum_k y^k * x^{N - d_k - 1} * [q_k]_1
     *
     * @param C_q Commitment to batched lifted degree quotient
     * @param C_q_k Commitments to quotients q_k
     * @param y_challenge
     * @param x_challenge
     * @return Commitment
     */
    static Commitment compute_C_zeta_x(Commitment C_q, std::vector<Commitment>& C_q_k, Fr y_challenge, Fr x_challenge)
    {
        size_t log_N = C_q_k.size();
        size_t N = 1 << log_N;

        auto result = C_q;
        for (size_t k = 0; k < log_N; ++k) {
            auto deg_k = static_cast<size_t>((1 << k) - 1);
            // Compute scalar y^k * x^{N - deg_k - 1}
            auto scalar = y_challenge.pow(k);
            scalar *= x_challenge.pow(N - deg_k - 1);
            scalar *= Fr(-1);

            result = result + C_q_k[k] * scalar;
        }
        return result;
    }

    /**
     * @brief Compute commitment to partially evaluated ZeroMorph identity Z
     * @details Compute commitment C_{Z_x} = [Z_x]_1 using homomorphicity:
     *
     *  C_{Z_x} = x * \sum_{i=0}^{m-1} [f_i] + \sum_{i=0}^{l-1} [g_i] - C_v_x
     *              - x * \sum_k (x^{2^k}\Phi_{n-k-1}(x^{2^{k-1}}) - u_k\Phi_{n-k}(x^{2^k})) * [q_k]
     *
     * @param C_v_x v * x * \Phi_n(x) * [1]_1
     * @param f_commitments Commitments to unshifted polynomials [f_i]
     * @param g_commitments Commitments to to-be-shifted polynomials [g_i]
     * @param C_q_k Commitments to q_k
     * @param alpha
     * @param x_challenge
     * @param u_challenge multilinear challenge
     * @return Commitment
     */
    static Commitment compute_C_Z_x(Commitment C_v_x,
                                    std::vector<Commitment>& f_commitments,
                                    std::vector<Commitment>& g_commitments,
                                    std::vector<Commitment>& C_q_k,
                                    Fr alpha,
                                    Fr x_challenge,
                                    std::vector<Fr> u_challenge)
    {
        size_t log_N = C_q_k.size();
        size_t N = 1 << log_N;

        auto phi_numerator = x_challenge.pow(N) - 1; // x^N - 1
        // auto phi_n_x = phi_numerator / (x_challenge - 1);

        Commitment result = -C_v_x; // initialize with -C_{v,x}
        auto alpha_pow = Fr(1);
        // Add contribution x * \sum_{i=0}^{m-1} [f_i]
        for (auto& commitment : f_commitments) {
            auto scalar = x_challenge * alpha_pow;
            result = result + (commitment * scalar);
            alpha_pow *= alpha;
        }
        // Add contribution \sum_{i=0}^{l-1} [g_i]
        for (auto& commitment : g_commitments) {
            auto scalar = alpha_pow;
            result = result + (commitment * scalar);
            alpha_pow *= alpha;
        }

        // Add contribution from q_k commitments
        for (size_t k = 0; k < log_N; ++k) {
            // Compute scalar x^{2^k} * \Phi_{n-k-1}(x^{2^{k+1}}) - u_k *  \Phi_{n-k}(x^{2^k})
            auto x_pow_2k = x_challenge.pow(1 << k); // x^{2^k}

            // \Phi_{n-k-1}(x^{2^{k + 1}})
            auto phi_term_1 = phi_numerator / (x_challenge.pow(1 << (k + 1)) - 1);

            // \Phi_{n-k}(x^{2^k})
            auto phi_term_2 = phi_numerator / (x_challenge.pow(1 << k) - 1);

            auto scalar = x_pow_2k * phi_term_1;
            scalar -= u_challenge[k] * phi_term_2;
            scalar *= x_challenge;
            scalar *= Fr(-1);

            result = result + C_q_k[k] * scalar;
        }
        return result;
    }
};

} // namespace proof_system::honk::pcs::zeromorph