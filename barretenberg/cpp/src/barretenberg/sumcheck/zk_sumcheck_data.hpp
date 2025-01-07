#pragma once

#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include <array>
#include <vector>

namespace bb {

/**
 * @brief This structure is created to contain various polynomials and constants required by ZK Sumcheck.
 *
 */
template <typename Flavor> struct ZKSumcheckData {
    using Curve = typename Flavor::Curve;
    using FF = typename Curve::ScalarField;

    static constexpr size_t SUBGROUP_SIZE = Curve::SUBGROUP_SIZE;

    static constexpr FF subgroup_generator = Curve::subgroup_generator;

    // The size of the LibraUnivariates. We ensure that they do not take extra space when Flavor runs non-ZK Sumcheck.
    static constexpr size_t LIBRA_UNIVARIATES_LENGTH = (std::is_same_v<Curve, curve::BN254>) ? 9 : 3;

    static constexpr FF one_half = FF(1) / FF(2);

    // Container for the evaluations of Libra Univariates that have to be proven.
    using ClaimedLibraEvaluations = std::vector<FF>;

    FF constant_term;

    EvaluationDomain<FF> bn_evaluation_domain = EvaluationDomain<FF>();
    std::array<FF, SUBGROUP_SIZE> interpolation_domain;
    // to compute product in lagrange basis
    Polynomial<FF> libra_concatenated_lagrange_form;
    Polynomial<FF> libra_concatenated_monomial_form;

    std::vector<Polynomial<FF>> libra_univariates{};
    size_t log_circuit_size{ 0 };
    FF libra_scaling_factor{ 1 };
    FF libra_challenge;
    FF libra_total_sum;
    FF libra_running_sum;
    ClaimedLibraEvaluations libra_evaluations;

    // Default constructor
    ZKSumcheckData() = default;

    // Main constructor
    ZKSumcheckData(const size_t multivariate_d,
                   std::shared_ptr<typename Flavor::Transcript> transcript,
                   std::shared_ptr<typename Flavor::CommitmentKey> commitment_key = nullptr)
        : constant_term(FF::random_element())
        , libra_concatenated_monomial_form(SUBGROUP_SIZE + 2)           // includes masking
        , libra_univariates(generate_libra_univariates(multivariate_d)) // random univariates of degree 2
        , log_circuit_size(multivariate_d)

    {
        create_interpolation_domain();

        compute_concatenated_libra_polynomial();

        // If proving_key is provided, commit to the concatenated and masked libra polynomial
        if (commitment_key != nullptr) {
            auto libra_commitment = commitment_key->commit(libra_concatenated_monomial_form);
            transcript->template send_to_verifier("Libra:concatenation_commitment", libra_commitment);
        }
        // Compute the total sum of the Libra polynomials
        libra_scaling_factor = FF(1);
        libra_total_sum = compute_libra_total_sum(libra_univariates, libra_scaling_factor, constant_term);

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
    static std::vector<Polynomial<FF>> generate_libra_univariates(const size_t number_of_polynomials)
    {
        std::vector<Polynomial<FF>> libra_full_polynomials(number_of_polynomials);

        for (auto& libra_polynomial : libra_full_polynomials) {
            libra_polynomial = Polynomial<FF>::random(LIBRA_UNIVARIATES_LENGTH);
        };
        return libra_full_polynomials;
    };

    /**
     * @brief Compute the sum of the randomly sampled multivariate polynomial \f$ G = \sum_{i=0}^{n-1} g_i(X_i) \f$ over
     * the Boolean hypercube.
     *
     * @param libra_univariates
     * @param scaling_factor
     * @return FF
     */
    static FF compute_libra_total_sum(const std::vector<Polynomial<FF>>& libra_univariates,
                                      FF& scaling_factor,
                                      const FF& constant_term)
    {
        FF total_sum = 0;
        scaling_factor *= one_half;

        for (auto& univariate : libra_univariates) {
            total_sum += univariate.evaluate(FF(0)) + univariate.evaluate(FF(1));
            scaling_factor *= 2;
        }
        total_sum *= scaling_factor;

        return total_sum + constant_term * (1 << libra_univariates.size());
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
        libra_running_sum += -libra_univariates[0].evaluate(FF(0)) - libra_univariates[0].evaluate(FF(1));
        libra_running_sum *= one_half;
    }

    /**
     * @brief Create a interpolation domain object and initialize the evaluation domain in the case of BN254 scalar
     * field
     *
     */
    void create_interpolation_domain()
    {
        if constexpr (std::is_same_v<Curve, curve::BN254>) {
            bn_evaluation_domain = EvaluationDomain<FF>(SUBGROUP_SIZE, SUBGROUP_SIZE);
            if (bn_evaluation_domain.size > 0) {
                bn_evaluation_domain.compute_lookup_table();
            }
        }

        interpolation_domain[0] = FF{ 1 };
        for (size_t idx = 1; idx < SUBGROUP_SIZE; idx++) {
            interpolation_domain[idx] = interpolation_domain[idx - 1] * subgroup_generator;
        }
    }

    /** @brief  Compute concatenated libra polynomial in lagrange basis, transform to monomial, add masking term Z_H(m_0
     * + m_1
     *
     */
    void compute_concatenated_libra_polynomial()
    {
        std::array<FF, SUBGROUP_SIZE> coeffs_lagrange_subgroup;
        coeffs_lagrange_subgroup[0] = constant_term;

        for (size_t idx = 1; idx < SUBGROUP_SIZE; idx++) {
            coeffs_lagrange_subgroup[idx] = FF{ 0 };
        }

        for (size_t poly_idx = 0; poly_idx < log_circuit_size; poly_idx++) {
            for (size_t idx = 0; idx < LIBRA_UNIVARIATES_LENGTH; idx++) {
                size_t idx_to_populate = 1 + poly_idx * LIBRA_UNIVARIATES_LENGTH + idx;
                coeffs_lagrange_subgroup[idx_to_populate] = libra_univariates[poly_idx].at(idx);
            }
        }

        libra_concatenated_lagrange_form = Polynomial<FF>(coeffs_lagrange_subgroup);

        bb::Univariate<FF, 2> masking_scalars = bb::Univariate<FF, 2>::get_random();

        Polynomial<FF> libra_concatenated_monomial_form_unmasked(SUBGROUP_SIZE);
        if constexpr (!std::is_same_v<Curve, curve::BN254>) {
            libra_concatenated_monomial_form_unmasked =
                Polynomial<FF>(interpolation_domain, coeffs_lagrange_subgroup, SUBGROUP_SIZE);
        } else {
            std::vector<FF> coeffs_lagrange_subgroup_ifft(SUBGROUP_SIZE);
            polynomial_arithmetic::ifft(
                coeffs_lagrange_subgroup.data(), coeffs_lagrange_subgroup_ifft.data(), bn_evaluation_domain);
            libra_concatenated_monomial_form_unmasked = Polynomial<FF>(coeffs_lagrange_subgroup_ifft);
        }

        for (size_t idx = 0; idx < SUBGROUP_SIZE; idx++) {
            libra_concatenated_monomial_form.at(idx) = libra_concatenated_monomial_form_unmasked.at(idx);
        }

        for (size_t idx = 0; idx < masking_scalars.size(); idx++) {
            libra_concatenated_monomial_form.at(idx) -= masking_scalars.value_at(idx);
            libra_concatenated_monomial_form.at(SUBGROUP_SIZE + idx) += masking_scalars.value_at(idx);
        }
    }
};

} // namespace bb
