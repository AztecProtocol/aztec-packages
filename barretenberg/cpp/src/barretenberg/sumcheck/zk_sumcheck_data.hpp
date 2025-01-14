#pragma once

#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include <array>
#include <optional>
#include <vector>

namespace bb {

/**
 * @brief This structure is created to contain various polynomials and constants required by ZK Sumcheck.
 *
 */
template <typename Flavor> struct ZKSumcheckData {
    using FF = typename Flavor::FF;
    /**
     * @brief The total algebraic degree of the Sumcheck relation \f$ F \f$ as a polynomial in Prover Polynomials
     * \f$P_1,\ldots, P_N\f$.
     */
    static constexpr size_t MAX_PARTIAL_RELATION_LENGTH = Flavor::MAX_PARTIAL_RELATION_LENGTH;

    /**
     * @brief The total algebraic degree of the Sumcheck relation \f$ F \f$ as a polynomial in Prover Polynomials
     * \f$P_1,\ldots, P_N\f$ <b> incremented by </b> 1, i.e. it is equal \ref MAX_PARTIAL_RELATION_LENGTH
     * "MAX_PARTIAL_RELATION_LENGTH + 1".
     */
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = Flavor::BATCHED_RELATION_PARTIAL_LENGTH;
    // The size of the LibraUnivariates. We ensure that they do not take extra space when Flavor runs non-ZK Sumcheck.
    // The size of the LibraUnivariates. We ensure that they do not take extra space when Flavor runs non-ZK Sumcheck.
    static constexpr size_t LIBRA_UNIVARIATES_LENGTH = Flavor::HasZK ? Flavor::BATCHED_RELATION_PARTIAL_LENGTH : 0;
    // Container for the Libra Univariates. Their number depends on the size of the circuit.
    using LibraUnivariates = std::vector<bb::Univariate<FF, LIBRA_UNIVARIATES_LENGTH>>;
    // Container for the evaluations of Libra Univariates that have to be proven.
    using ClaimedLibraEvaluations = std::vector<FF>;

    LibraUnivariates libra_univariates;
    LibraUnivariates libra_univariates_monomial;
    FF libra_scaling_factor{ 1 };
    FF libra_challenge;
    FF libra_running_sum;
    ClaimedLibraEvaluations libra_evaluations;

    // Default constructor
    ZKSumcheckData() = default;

    // Main constructor
    ZKSumcheckData(const size_t multivariate_d,
                   std::shared_ptr<typename Flavor::Transcript> transcript,
                   std::shared_ptr<typename Flavor::CommitmentKey> commitment_key = nullptr)
        : libra_univariates(generate_libra_univariates(multivariate_d))        // Created in Lagrange basis for Sumcheck
        , libra_univariates_monomial(transform_to_monomial(libra_univariates)) // Required for commiting and by Shplonk

    {

        // If proving_key is provided, commit to libra_univariates
        if (commitment_key != nullptr) {
            size_t idx = 0;
            for (auto& libra_univariate_monomial : libra_univariates_monomial) {
                auto libra_commitment = commitment_key->commit(Polynomial<FF>(libra_univariate_monomial));
                transcript->template send_to_verifier("Libra:commitment_" + std::to_string(idx), libra_commitment);
                idx++;
            }
        }
        // Compute the total sum of the Libra polynomials
        libra_scaling_factor = FF(1);
        FF libra_total_sum = compute_libra_total_sum(libra_univariates, libra_scaling_factor);

        // Send the Libra total sum to the transcript
        transcript->send_to_verifier("Libra:Sum", libra_total_sum);

        // Receive the Libra challenge from the transcript
        libra_challenge = transcript->template get_challenge<FF>("Libra:Challenge");

        // Initialize the Libra running sum
        libra_running_sum = libra_total_sum * libra_challenge;

        // Setup the Libra data
        setup_auxiliary_data(libra_univariates, libra_scaling_factor, libra_challenge, libra_running_sum);
    }

    /**
     * @brief Given number of univariate polynomials and the number of their evaluations meant to be hidden, this method
     * produces a vector of univariate polynomials of length Flavor::BATCHED_RELATION_PARTIAL_LENGTH with
     * independent uniformly random coefficients.
     *
     */
    static LibraUnivariates generate_libra_univariates(const size_t number_of_polynomials)
    {
        LibraUnivariates libra_full_polynomials(number_of_polynomials);

        for (auto& libra_polynomial : libra_full_polynomials) {
            libra_polynomial = bb::Univariate<FF, LIBRA_UNIVARIATES_LENGTH>::get_random();
        };
        return libra_full_polynomials;
    };

    /**
     * @brief Transform Libra univariates from Lagrange to monomial form
     *
     * @param libra_full_polynomials
     * @return LibraUnivariates
     */
    static LibraUnivariates transform_to_monomial(LibraUnivariates& libra_full_polynomials)
    {
        std::array<FF, LIBRA_UNIVARIATES_LENGTH> interpolation_domain;
        LibraUnivariates libra_univariates_monomial;
        libra_univariates_monomial.reserve(libra_full_polynomials.size());

        for (size_t idx = 0; idx < LIBRA_UNIVARIATES_LENGTH; idx++) {
            interpolation_domain[idx] = FF(idx);
        }

        for (auto& libra_polynomial : libra_full_polynomials) {

            // Use the efficient Lagrange interpolation
            Polynomial<FF> libra_polynomial_monomial(std::span<FF>(interpolation_domain),
                                                     std::span<FF>(libra_polynomial.evaluations),
                                                     LIBRA_UNIVARIATES_LENGTH);

            // To avoid storing Polynomials (coefficients are vectors), we define a univariate with the coefficients
            // interpolated above
            bb::Univariate<FF, LIBRA_UNIVARIATES_LENGTH> libra_univariate;
            for (size_t idx = 0; idx < LIBRA_UNIVARIATES_LENGTH; idx++) {
                libra_univariate.value_at(idx) = libra_polynomial_monomial[idx];
            }
            libra_univariates_monomial.push_back(libra_univariate);
        };
        return libra_univariates_monomial;
    };

    /**
     * @brief Compute the sum of the randomly sampled multivariate polynomial \f$ G = \sum_{i=0}^{n-1} g_i(X_i) \f$ over
     * the Boolean hypercube.
     *
     * @param libra_univariates
     * @param scaling_factor
     * @return FF
     */
    static FF compute_libra_total_sum(const LibraUnivariates& libra_univariates, FF& scaling_factor)
    {
        FF total_sum = 0;
        scaling_factor = scaling_factor / 2;

        for (auto& univariate : libra_univariates) {
            total_sum += univariate.value_at(0) + univariate.value_at(1);
            scaling_factor *= 2;
        }
        total_sum *= scaling_factor;

        return total_sum;
    }

    /**
     * @brief Set up Libra book-keeping table that simplifies the computation of Libra Round Univariates
     *
     * @details The array of Libra univariates is getting scaled
     * \f{align}{\texttt{libra_univariates} \gets \texttt{libra_univariates}\cdot \rho \cdot 2^{d-1}\f}
     * We also initialize
     * \f{align}{ \texttt{libra_running_sum} \gets \texttt{libra_total_sum} - \texttt{libra_univariates}_{0,0} -
     * \texttt{libra_univariates}_{0,1} \f}.
     * @param libra_table
     * @param libra_round_factor
     * @param libra_challenge
     */
    static void setup_auxiliary_data(auto& libra_univariates,
                                     FF& libra_scaling_factor,
                                     const FF libra_challenge,
                                     FF& libra_running_sum)
    {
        libra_scaling_factor *= libra_challenge; // \rho * 2^{d-1}
        for (auto& univariate : libra_univariates) {
            univariate *= libra_scaling_factor;
        };
        // subtract the contribution of the first libra univariate from libra total sum
        libra_running_sum += -libra_univariates[0].value_at(0) - libra_univariates[0].value_at(1);
        libra_running_sum *= FF(1) / FF(2);
    }
};
} // namespace bb
