#pragma once

#include "barretenberg/constants.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"
#include "barretenberg/sumcheck/zk_sumcheck_data.hpp"

#include <array>
#include <chrono>
#include <optional>
#include <vector>

namespace bb {

/**
 * @brief This structure is created to contain various polynomials and constants required by ZK Sumcheck.
 *
 */
template <typename Flavor> class SmallSubgroupIPA {
    using Curve = typename Flavor::Curve;
    using FF = typename Flavor::FF;

    static constexpr size_t SUBGROUP_SIZE = Curve::SUBGROUP_SIZE;

    static constexpr size_t BATCHED_POLYNOMIAL_LENGTH = 2 * SUBGROUP_SIZE + 2;

    static constexpr size_t QUOTIENT_LENGTH = SUBGROUP_SIZE + 2;

    static constexpr FF subgroup_generator = Curve::SUBGROUP_GENERATOR;

    static constexpr size_t LIBRA_UNIVARIATES_LENGTH = 3;

  public:
    class SmallSubgroupIPAProver : public SmallSubgroupIPA {
        // Container for the Libra Univariates. Their number depends on the size of the circuit.
        using LibraUnivariates = std::vector<bb::Polynomial<FF>>;
        // Container for the evaluations of Libra Univariates that have to be proven.
        using ClaimedLibraEvaluations = std::vector<FF>;

        std::array<FF, SUBGROUP_SIZE> interpolation_domain;
        // to compute product in lagrange basis
        Polynomial<FF> concatenated_polynomial;
        Polynomial<FF> libra_concatenated_lagrange_form;
        std::vector<FF> multivariate_challenge;
        FF claimed_evaluation;
        Polynomial<FF> challenge_polynomial;
        Polynomial<FF> challenge_polynomial_lagrange;

        Polynomial<FF> big_sum_polynomial;
        Polynomial<FF> batched_polynomial;
        Polynomial<FF> batched_quotient;

        FF libra_total_sum;
        FF libra_running_sum;

        std::array<FF, SUBGROUP_SIZE> big_sum_lagrange_coeffs;

        // Main constructor
      public:
        SmallSubgroupIPAProver(ZKSumcheckData<Flavor> zk_sumcheck_data,
                               SumcheckOutput<Flavor> sumcheck_output,
                               std::shared_ptr<typename Flavor::Transcript> transcript,
                               std::shared_ptr<typename Flavor::CommitmentKey> commitment_key = nullptr)
            : interpolation_domain(zk_sumcheck_data.interpolation_domain)
            , concatenated_polynomial(zk_sumcheck_data.libra_concatenated_monomial_form)
            , libra_concatenated_lagrange_form(zk_sumcheck_data.libra_concatenated_lagrange_form)
            , multivariate_challenge(sumcheck_output.challenge)
            , claimed_evaluation(sumcheck_output.claimed_libra_evaluation)
            , challenge_polynomial(SUBGROUP_SIZE)           // public polynomial
            , big_sum_polynomial(SUBGROUP_SIZE + 3)         // includes masking
            , batched_polynomial(BATCHED_POLYNOMIAL_LENGTH) // batched polynomial, input to shplonk prover
            , batched_quotient(QUOTIENT_LENGTH)             // quotient of the batched polynomial by Z_H(X) = X^87 - 1

        {

            ASSERT(concatenated_polynomial.size() < SUBGROUP_SIZE + 3);

            compute_challenge_polynomial(sumcheck_output.challenge);

            compute_big_sum_polynomial();
            if (commitment_key) {
                transcript->template send_to_verifier("Libra:big_sum_commitment",
                                                      commitment_key->commit(big_sum_polynomial));
            }

            compute_batched_polynomial(claimed_evaluation);
            compute_batched_quotient();

            if (commitment_key) {
                transcript->template send_to_verifier("Libra:quotient_commitment",
                                                      commitment_key->commit(batched_quotient));
            }
        }

        std::array<bb::Polynomial<FF>, 4> get_witness_polynomials() const
        {
            return { concatenated_polynomial, big_sum_polynomial, big_sum_polynomial, batched_quotient };
        }

        // compute concatenated libra polynomial in lagrange basis, transform to monomial, add masking term Z_H(m_0 +
        // m_1 X)
        void compute_challenge_polynomial(const std::vector<FF>& multivariate_challenge)
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

        void compute_big_sum_polynomial()
        {
            big_sum_lagrange_coeffs[0] = 0;

            // Compute the big sum coefficients recursively
            for (size_t idx = 1; idx < SUBGROUP_SIZE; idx++) {
                size_t prev_idx = idx - 1;
                big_sum_lagrange_coeffs[idx] =
                    big_sum_lagrange_coeffs[prev_idx] +
                    challenge_polynomial_lagrange.at(prev_idx) * libra_concatenated_lagrange_form.at(prev_idx);
            };

            //  Get the coefficients in the monomial basis
            auto big_sum_polynomial_unmasked =
                Polynomial<FF>(interpolation_domain, big_sum_lagrange_coeffs, SUBGROUP_SIZE);

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

        void compute_batched_polynomial(const FF& claimed_evaluation)
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
            lagrange_coeffs[0] = FF(0);
            lagrange_coeffs[SUBGROUP_SIZE - 1] = FF(1);

            Polynomial<FF> lagrange_last_monomial(interpolation_domain, lagrange_coeffs, SUBGROUP_SIZE);

            // Compute -F(X)*G(X), the negated product of challenge_polynomial and libra_concatenated_monomial_form
            // Polynomial<FF> result(BATCHED_POLYNOMIAL_LENGTH);

            for (size_t i = 0; i < concatenated_polynomial.size(); ++i) {
                for (size_t j = 0; j < challenge_polynomial.size(); ++j) {
                    batched_polynomial.at(i + j) -= concatenated_polynomial.at(i) * challenge_polynomial.at(j);
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

            for (size_t idx = 0; idx < lagrange_last_monomial.size(); idx++) {
                batched_polynomial.at(idx) -= lagrange_last_monomial.at(idx) * claimed_evaluation;
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
    };
};
} // namespace bb
