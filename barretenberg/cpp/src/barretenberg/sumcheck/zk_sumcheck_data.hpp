#pragma once

#include "barretenberg/constants.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include <array>
#include <chrono>
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

    static constexpr size_t SUBGROUP_SIZE = 87;

    static constexpr size_t BATCHED_POLYNOMIAL_LENGTH = 2 * SUBGROUP_SIZE + 2;

    static constexpr size_t QUOTIENT_LENGTH = SUBGROUP_SIZE + 2;

    static constexpr FF grumpkin_subgroup_generator =
        FF(uint256_t("0x147c647c09fb639514909e9f0513f31ec1a523bf8a0880bc7c24fbc962a9586b"));

    static constexpr FF bn_254_subgroup_generator =
        FF(uint256_t("0x0434c9aa553ba64b2b3f7f0762c119ec87353b7813c54205c5ec13d97d1f944e"));
    /**
     * @brief The total algebraic degree of the Sumcheck relation \f$ F \f$ as a polynomial in Prover Polynomials
     * \f$P_1,\ldots, P_N\f$ <b> incremented by </b> 1, i.e. it is equal \ref MAX_PARTIAL_RELATION_LENGTH
     * "MAX_PARTIAL_RELATION_LENGTH + 1".
     */
    static constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = Flavor::BATCHED_RELATION_PARTIAL_LENGTH;
    // The size of the LibraUnivariates. We ensure that they do not take extra space when Flavor runs non-ZK Sumcheck.
    // The size of the LibraUnivariates. We ensure that they do not take extra space when Flavor runs non-ZK Sumcheck.
    static constexpr size_t LIBRA_UNIVARIATES_LENGTH = Flavor::HasZK ? 3 : 0;
    // Container for the Libra Univariates. Their number depends on the size of the circuit.
    using LibraUnivariates = std::vector<bb::Univariate<FF, LIBRA_UNIVARIATES_LENGTH>>;
    // Container for the evaluations of Libra Univariates that have to be proven.
    using ClaimedLibraEvaluations = std::vector<FF>;

    FF constant_term;
    std::array<FF, SUBGROUP_SIZE> interpolation_domain;
    // to compute product in lagrange basis
    Polynomial<FF> libra_concatenated_lagrange_form;
    Polynomial<FF> libra_concatenated_monomial_form;

    Polynomial<FF> challenge_polynomial;
    Polynomial<FF> challenge_polynomial_lagrange;

    Polynomial<FF> big_sum_polynomial;
    Polynomial<FF> batched_polynomial;
    Polynomial<FF> batched_quotient;

    LibraUnivariates libra_univariates;
    size_t log_circuit_size;
    LibraUnivariates libra_univariates_monomial;
    FF libra_scaling_factor{ 1 };
    FF libra_challenge;
    FF libra_total_sum;
    FF libra_running_sum;
    ClaimedLibraEvaluations libra_evaluations;
    std::array<FF, SUBGROUP_SIZE> big_sum_lagrange_coeffs;

    // Default constructor
    ZKSumcheckData() = default;

    // Main constructor
    ZKSumcheckData(const size_t multivariate_d,
                   std::shared_ptr<typename Flavor::Transcript> transcript,
                   std::shared_ptr<typename Flavor::CommitmentKey> commitment_key = nullptr)
        : constant_term(FF::random_element())
        , libra_concatenated_monomial_form(SUBGROUP_SIZE + 2) // includes masking
        , challenge_polynomial(SUBGROUP_SIZE)                 // public polynomial
        , big_sum_polynomial(SUBGROUP_SIZE + 3)               // includes masking
        , batched_polynomial(BATCHED_POLYNOMIAL_LENGTH)       // batched polynomial, input to shplonk prover
        , batched_quotient(QUOTIENT_LENGTH)                   // quotient of the batched polynomial by Z_H(X) = X^87 - 1
        , libra_univariates(generate_libra_univariates(multivariate_d)) // random univariates of degree 2
        , log_circuit_size(multivariate_d)
        , libra_univariates_monomial(transform_to_monomial(libra_univariates)) // Required for commiting and by Shplonk

    {
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
    static FF compute_libra_total_sum(const LibraUnivariates& libra_univariates,
                                      FF& scaling_factor,
                                      const FF& free_term)
    {
        FF total_sum = 0;
        scaling_factor = scaling_factor / 2;

        for (auto& univariate : libra_univariates) {
            total_sum += univariate.value_at(0) + univariate.value_at(1);
            scaling_factor *= 2;
        }
        total_sum *= scaling_factor;

        return total_sum + free_term * (1 << libra_univariates.size());
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

    // compute concatenated libra polynomial in lagrange basis, transform to monomial, add masking term Z_H(m_0 + m_1 X)
    void compute_concatenated_libra_polynomial()
    {
        // info(bn_254_subgroup_generator.pow(29 * 3));
        info("root of unity? ", grumpkin_subgroup_generator.pow(3 * 29));
        info("root of unity? ", grumpkin_subgroup_generator.pow(29));
        info("root of unity? ", grumpkin_subgroup_generator.pow(3));

        std::array<FF, SUBGROUP_SIZE> coeffs_lagrange_subgroup;
        coeffs_lagrange_subgroup[0] = constant_term;

        for (size_t idx = 1; idx < SUBGROUP_SIZE; idx++) {
            coeffs_lagrange_subgroup[idx] = FF{ 0 };
        }

        for (size_t poly_idx = 0; poly_idx < libra_univariates_monomial.size(); poly_idx++) {
            for (size_t idx = 0; idx < LIBRA_UNIVARIATES_LENGTH; idx++) {
                size_t idx_to_populate = 1 + poly_idx * LIBRA_UNIVARIATES_LENGTH + idx;
                coeffs_lagrange_subgroup[idx_to_populate] = libra_univariates_monomial[poly_idx].value_at(idx);
            }
        }

        // create evaluation domain using the generator
        for (size_t idx = 0; idx < SUBGROUP_SIZE; idx++) {
            interpolation_domain[idx] = grumpkin_subgroup_generator.pow(idx);
        }

        libra_concatenated_lagrange_form = Polynomial<FF>(coeffs_lagrange_subgroup);

        bb::Univariate<FF, 2> masking_scalars = bb::Univariate<FF, 2>::get_random();

        auto libra_concatenated_monomial_form_unmasked =
            Polynomial<FF>(interpolation_domain, coeffs_lagrange_subgroup, SUBGROUP_SIZE);

        for (size_t idx = 0; idx < SUBGROUP_SIZE; idx++) {
            libra_concatenated_monomial_form.at(idx) = libra_concatenated_monomial_form_unmasked.at(idx);
        }

        for (size_t idx = 0; idx < masking_scalars.size(); idx++) {
            libra_concatenated_monomial_form.at(idx) -= masking_scalars.value_at(idx);
            libra_concatenated_monomial_form.at(SUBGROUP_SIZE + idx) += masking_scalars.value_at(idx);
        }
    }
    void setup_challenge_polynomial(const std::vector<FF>& multivariate_challenge)
    {
        std::vector<FF> coeffs_lagrange_basis(SUBGROUP_SIZE);
        coeffs_lagrange_basis[0] = FF(1);

        for (size_t idx_poly = 0; idx_poly < CONST_PROOF_SIZE_LOG_N; idx_poly++) {
            for (size_t idx = 0; idx < LIBRA_UNIVARIATES_LENGTH; idx++) {
                size_t current_idx = 1 + LIBRA_UNIVARIATES_LENGTH * idx_poly + idx;
                coeffs_lagrange_basis[current_idx] = multivariate_challenge[idx_poly].pow(idx);
            }
        }
        challenge_polynomial_lagrange = Polynomial<FF>(coeffs_lagrange_basis);
        challenge_polynomial = Polynomial<FF>(interpolation_domain, coeffs_lagrange_basis, SUBGROUP_SIZE);
    }

    void setup_big_sum_polynomial()
    {
        // setup_challenge_polynomial(multivariate_challenge);

        big_sum_lagrange_coeffs[0] = 0;

        // Compute the big sum coefficients recursively
        for (size_t idx = 1; idx < SUBGROUP_SIZE; idx++) {
            size_t prev_idx = idx - 1;
            big_sum_lagrange_coeffs[idx] =
                big_sum_lagrange_coeffs[prev_idx] +
                challenge_polynomial_lagrange.at(prev_idx) * libra_concatenated_lagrange_form.at(prev_idx);
        };

        //  Get the coefficients in the monomial basis
        auto big_sum_polynomial_unmasked = Polynomial<FF>(interpolation_domain, big_sum_lagrange_coeffs, SUBGROUP_SIZE);

        //  Generate random masking_term of degree 2, add Z_H(X) * masking_term
        bb::Univariate<FF, 3> masking_term = bb::Univariate<FF, 3>::get_random();
        for (size_t idx = 0; idx < SUBGROUP_SIZE; idx++) {
            big_sum_polynomial.at(idx) = big_sum_polynomial_unmasked.at(idx);
        }

        for (size_t idx = 0; idx < masking_term.size(); idx++) {
            big_sum_polynomial.at(idx) -= masking_term.value_at(idx);
            big_sum_polynomial.at(idx + SUBGROUP_SIZE) += masking_term.value_at(idx);
        }
    };

    void compute_batched_polynomial()
    {
        // Compute shifted big sum polynomial A(gX)
        Polynomial<FF> shifted_big_sum(SUBGROUP_SIZE + 3);

        for (size_t idx = 0; idx < SUBGROUP_SIZE + 3; idx++) {
            shifted_big_sum.at(idx) = big_sum_polynomial.at(idx) * interpolation_domain[idx % SUBGROUP_SIZE];
        }
        // Compute the monomial coefficients of L_1, the first Lagrange polynomial
        std::array<FF, SUBGROUP_SIZE> lagrange_coeffs;
        lagrange_coeffs[0] = FF(1);
        for (size_t idx = 1; idx < SUBGROUP_SIZE; idx++) {
            lagrange_coeffs[idx] = FF(0);
        }

        Polynomial<FF> lagrange_first_monomial(interpolation_domain, lagrange_coeffs, SUBGROUP_SIZE);

        // Compute the monomial coefficients of L_{|H|}, the last Lagrange polynomial
        lagrange_coeffs[0] = 0;
        lagrange_coeffs[SUBGROUP_SIZE - 1] = 1;

        Polynomial<FF> lagrange_last_monomial(interpolation_domain, lagrange_coeffs, SUBGROUP_SIZE);

        // Compute -F(X)*G(X), the negated product of challenge_polynomial and libra_concatenated_monomial_form
        // Polynomial<FF> result(BATCHED_POLYNOMIAL_LENGTH);

        for (size_t i = 0; i < libra_concatenated_monomial_form.size(); ++i) {
            for (size_t j = 0; j < challenge_polynomial.size(); ++j) {
                batched_polynomial.at(i + j) -= libra_concatenated_monomial_form.at(i) * challenge_polynomial.at(j);
            }
        }

        // Compute - F(X) * G(X) + A(gX) - A(X)
        for (size_t idx = 0; idx < shifted_big_sum.size(); idx++) {
            batched_polynomial.at(idx) += shifted_big_sum.at(idx) - big_sum_polynomial.at(idx);
        }

        // Mutiply - F(X) * G(X) + A(gX) - A(X) by X-g:
        // 1. Multiply by X
        for (size_t idx = batched_polynomial.size() - 1; idx > 0; idx--) {
            batched_polynomial.at(idx) = batched_polynomial.at(idx - 1);
        }
        batched_polynomial.at(0) = FF(0);
        // 2. Subtract  1/g(A(gX) - A(X) - F(X) * G(X))
        for (size_t idx = 0; idx < batched_polynomial.size() - 1; idx++) {
            batched_polynomial.at(idx) -= batched_polynomial.at(idx + 1) * interpolation_domain[SUBGROUP_SIZE - 1];
        }

        // Add (L_1 + L_{|H|}) * A(X) to the result
        lagrange_first_monomial += lagrange_last_monomial;

        for (size_t i = 0; i < big_sum_polynomial.size(); ++i) {
            for (size_t j = 0; j < lagrange_first_monomial.size(); ++j) {
                batched_polynomial.at(i + j) += big_sum_polynomial.at(i) * lagrange_first_monomial.at(j);
            }
        }
        FF claimed_libra_evaluation = constant_term;
        for (FF& libra_eval : libra_evaluations) {
            claimed_libra_evaluation += libra_eval;
        }
        for (size_t idx = 0; idx < lagrange_last_monomial.size(); idx++) {
            batched_polynomial.at(idx) -= lagrange_last_monomial.at(idx) * claimed_libra_evaluation;
        }
    }

    // Compute the quotient of batched_polynomial by Z_H = X^{|H|} - 1
    void compute_batched_quotient()
    {

        auto remainder = batched_polynomial;
        for (size_t idx = BATCHED_POLYNOMIAL_LENGTH - 1; idx >= SUBGROUP_SIZE; idx--) {
            batched_quotient.at(idx - SUBGROUP_SIZE) = remainder.at(idx);
            remainder.at(idx - SUBGROUP_SIZE) += remainder.at(idx);
        }
    }

    void compute_witnesses_and_commit(const std::vector<FF> multivariate_challenge,
                                      std::shared_ptr<typename Flavor::Transcript> transcript,
                                      std::shared_ptr<typename Flavor::CommitmentKey> commitment_key)
    {
        setup_challenge_polynomial(multivariate_challenge);
        setup_big_sum_polynomial();

        transcript->template send_to_verifier("Libra:big_sum_commitment", commitment_key->commit(big_sum_polynomial));

        compute_batched_polynomial();
        compute_batched_quotient();

        transcript->template send_to_verifier("Libra:quotient_commitment", commitment_key->commit(batched_quotient));
    }
};

} // namespace bb
