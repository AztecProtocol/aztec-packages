#pragma once

#include "barretenberg/constants.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/sumcheck/zk_sumcheck_data.hpp"

#include <array>
#include <vector>

namespace bb {

/**
 * @brief Small Subgroup IPA Prover for Zero-Knowledge Opening of Libra Polynomials.
 *
 * @details Implements a less general version of the protocol described in
 * [Ariel's HackMD](https://hackmd.io/xYHn1qqvQjey1yJutcuXdg). This version is specialized for making
 * commitments and openings of Libra polynomials zero-knowledge.
 *
 * ### Overview
 * This class enables the prover to:
 *
 * - Open the commitment to concatenated Libra polynomial with zero-knowledge while proving correctness of the claimed
 * inner product. The concatenated polynomial is commited to during the construction of ZKSumcheckData structure.
 *
 * ### Inputs
 * The prover receives:
 * - **ZKSumcheckData:** Contains:
 *   - Concatenated coefficients of the masking term and \( d \) random Libra univariates of degree 3.
 *   - Monomial coefficients of the masked concatenated Libra polynomial denoted by \( G \) .
 *   - Interpolation domain for a small subgroup \( H \subset \mathbb{F}^\ast \).
 * - **Sumcheck challenges:** \( u_0, \ldots, u_{D-1} \), where \( D = \text{CONST_PROOF_SIZE_LOG_N} \).
 * - **Claimed inner product:** \( s = \text{claimed\_ipa\_eval} \), defined as:
 *   \f[
 *   s = \sum_{i=1}^{|H|} F(g^i) G(g^i),
 *   \f]
 *   where \( F(X) \) is the challenge polynomial and \( G(X) \) is the concatenated Libra polynomial.
 *
 * ### Prover's Construction
 * 1. Define a polynomial \( A(X) \), called the **big sum polynomial**, satisfying:
 *    - \( A(1) = 0 \),
 *    - \( A(g^i) = A(g^{i-1}) + F(g^{i-1}) G(g^{i-1}) \) for \( i = 1, \ldots, |H|-1 \).
 * 2. Mask \( A(X) \) by adding \( Z_H(X) R(X) \), where \( R(X) \) is a random polynomial of degree 3.
 * 3. Commit to \( A(X) \) and send the commitment to the verifier.
 *
 * ### Key Identity
 * If \( A(X) \) is honestly constructed, the following identity holds:
 * \f[
 * L_1(X) A(X) + (X - g^{-1}) (A(g \cdot X) - A(X) - F(X) G(X)) + L_{|H|}(X) (A(X) - s) = Z_H(X) Q(X),
 * \f]
 * where \( Q(X) \) is the quotient of the left-hand side by \( Z_H(X) \).
 *
 * The methods of this class allow the prover to compute \( A(X) \) and \( Q(X) \).
 *
 * After receiveing a random evaluation challenge \f$ r \f$ , the prover sends \f$ G(r), A(g\cdot r), A(r), Q(r) \f$ to
 * the verifier. In our case, \f$ r \f$ is the Gemini evaluation challenge, and this part is taken care of by Shplemini.
 */
template <typename Curve, typename Transcript, typename CommitmentKey> class SmallSubgroupIPAProver {
    using FF = typename Curve::ScalarField;

    static constexpr size_t SUBGROUP_SIZE = Curve::SUBGROUP_SIZE;

    static constexpr size_t BATCHED_POLYNOMIAL_LENGTH = 2 * SUBGROUP_SIZE + 2;

    static constexpr size_t QUOTIENT_LENGTH = SUBGROUP_SIZE + 2;

    static constexpr size_t LIBRA_UNIVARIATES_LENGTH = 3;

    static constexpr FF subgroup_generator = Curve::SUBGROUP_GENERATOR;

    // Interpolation domain {1, g, \ldots, g^{SUBGROUP_SIZE - 1}}
    std::array<FF, SUBGROUP_SIZE> interpolation_domain;

    // Monomial coefficients of the concatenated Libra masking polynomial
    Polynomial<FF> concatenated_polynomial;
    // Lagrange coefficeints of the concatenated Libra masking polynomial = constant_term || g_0 || ... || g_{d-1}
    Polynomial<FF> libra_concatenated_lagrange_form;

    // Claimed evaluation s = constant_term + g_0(u_0) + ... + g_{d-1}(u_{d-1})
    FF claimed_evaluation;

    Polynomial<FF> challenge_polynomial;
    Polynomial<FF> challenge_polynomial_lagrange;
    Polynomial<FF> big_sum_polynomial;
    std::array<FF, SUBGROUP_SIZE> big_sum_lagrange_coeffs;

    Polynomial<FF> batched_polynomial;

    // Quotient of the batched polynomial by the subgroup vanishing polynomial X^{|H|} - 1
    Polynomial<FF> batched_quotient;

  public:
    SmallSubgroupIPAProver(ZKSumcheckData<Curve, Transcript, CommitmentKey>& zk_sumcheck_data,
                           const std::vector<FF>& multivariate_challenge,
                           const FF claimed_ipa_eval,
                           std::shared_ptr<Transcript> transcript,
                           std::shared_ptr<CommitmentKey> commitment_key = nullptr)
        : interpolation_domain(zk_sumcheck_data.interpolation_domain)
        , concatenated_polynomial(zk_sumcheck_data.libra_concatenated_monomial_form)
        , libra_concatenated_lagrange_form(zk_sumcheck_data.libra_concatenated_lagrange_form)
        , challenge_polynomial(SUBGROUP_SIZE)
        , challenge_polynomial_lagrange(SUBGROUP_SIZE)  // public polynomial
        , big_sum_polynomial(SUBGROUP_SIZE + 3)         // includes masking
        , batched_polynomial(BATCHED_POLYNOMIAL_LENGTH) // batched polynomial, input to shplonk prover
        , batched_quotient(QUOTIENT_LENGTH)             // quotient of the batched polynomial by Z_H(X) = X^87 - 1

    {

        ASSERT(concatenated_polynomial.size() < SUBGROUP_SIZE + 3);

        compute_challenge_polynomial(multivariate_challenge);

        compute_big_sum_polynomial();
        if (commitment_key) {
            transcript->template send_to_verifier("Libra:big_sum_commitment",
                                                  commitment_key->commit(big_sum_polynomial));
        }

        compute_batched_polynomial(claimed_ipa_eval);
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

    //
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

    /**
     * @brief   Compute \f$ L_1(X) * A(X) + (X - 1/g) (A(gX) - A(X) - F(X) G(X)) + L_{|H|}(X)(A(X) - s) \f$
     *
     */
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

/**
 * @brief Verifier class for Small Subgroup IPA Prover.
 *
 * @details Checks the consistency of polynomial evaluations provided by the prover against
 * the values derived from the sumcheck challenge and a random evaluation challenge.
 */
template <typename Curve> class SmallSubgroupIPAVerifier {
    using FF = typename Curve::ScalarField;

    static constexpr size_t SUBGROUP_SIZE = Curve::SUBGROUP_SIZE;

    static constexpr size_t LIBRA_UNIVARIATES_LENGTH = 3;

  public:
    /*!
     * @brief Verifies the consistency of polynomial evaluations provided by the prover.
     *
     * @details
     * Given a subgroup of \f$ \mathbb{F}^\ast \f$, its generator \f$ g\f$, this function checks whether the following
     * equation holds:
     * \f[ L_1(r) A(r) + (r - g^{-1}) \left( A(g*r) - A(r) - F(r) G(r) \right) + L_{|H|}(r) \left( A(r) - s
     * \right) = T(r) Z_H(r) \f] Where the following are sent by the prover
     * - \f$ A(r), A(g\cdot r) \f$ are the evaluation of the "big sum polynomial"
     * - \f$ G(r) \f$ is the evaluation of the concatenation of the coefficients of the masking Libra polynomials
     *
     * - \f$ T(r) \f$ is the evaluation of the quotient of the left hand side above by the vanishing polynomial for
     * \f$H\f$
     * and the following evaluations computed by the verifier
     * - \f$ L_1 \f$ and \f$ L_{|H|} \f$ are the Lagrange polynomials corresponding to \f$ 1 \f$ and \f$ g^{-1} \f$.
     * - \f$ F(r) \f$ is the evaluation of the polynomial obtained by concatenating powers of sumcheck round challenges
     * - \f$ Z_H(r) \f$ is the vanishing polynomial \f$ X^{|H|} - 1\f$ evaluated at the challenge point.
     *
     * @param libra_evaluations A vector of polynomial evaluations containing:
     *   - \f$ G(r), A(g\cdot r), A(r), T(r) \f$.
     * @param gemini_evaluation_challenge The challenge point \f$ r \f$ at which evaluations are verified.
     * @param multilinear_challenge A vector of sumcheck round challenges.
     * @param eval_claim The claimed inner proudct of the coefficients of \f$G\f$ and \f$F\f$.
     * @return True if the consistency check passes, false otherwise.
     */
    static bool evaluations_consistency_check(const std::vector<FF>& libra_evaluations,
                                              const FF& gemini_evaluation_challenge,
                                              const std::vector<FF>& multilinear_challenge,
                                              const FF& inner_product_eval_claim)
    {

        static const FF subgroup_generator_inverse = FF(1) / Curve::SUBGROUP_GENERATOR;

        // Compute the evaluation of the vanishing polynomia Z_H(X) at X = gemini_evaluation_challenge
        const FF vanishing_poly_eval = gemini_evaluation_challenge.pow(SUBGROUP_SIZE) - FF(1);

        // Construct the challenge polynomial from the sumcheck challenge, the verifier has to evaluate it on its own
        const std::vector<FF> challenge_polynomial_lagrange = compute_challenge_polynomial(multilinear_challenge);

        // Compute the evaluations of the challenge polynomial, Lagrange first, and Lagrange last for the fixed small
        // subgroup
        auto [challenge_poly, lagrange_first, lagrange_last] = compute_batched_barycentric_evaluations(
            challenge_polynomial_lagrange, gemini_evaluation_challenge, subgroup_generator_inverse);

        const FF& concatenated_at_r = libra_evaluations[0];
        const FF& big_sum_shifted_eval = libra_evaluations[1];
        const FF& big_sum_eval = libra_evaluations[2];
        const FF& quotient_eval = libra_evaluations[3];

        // Compute the evaluation of
        // L_1(X) * A(X) + (X - 1/g) (A(gX) - A(X) - F(X) G(X)) + L_{|H|}(X)(A(X) - s) - Z_H(X) * Q(X)
        FF diff = lagrange_first * big_sum_eval;
        diff += (gemini_evaluation_challenge - subgroup_generator_inverse) *
                (big_sum_shifted_eval - big_sum_eval - concatenated_at_r * challenge_poly);
        diff += lagrange_last * (big_sum_eval - inner_product_eval_claim) - vanishing_poly_eval * quotient_eval;

        if constexpr (Curve::is_stdlib_type) {
            return (diff.get_value() == FF(0).get_value());
        } else {
            return (diff == FF(0));
        };
    }

    /**
     * @brief Given the sumcheck multivariate challenge \f$ (u_0,\ldots, u_{D-1})\f$, where \f$ D =
     * \text{CONST_PROOF_SIZE_LOG_N}\f$, the verifier has to construct and evaluate the polynomial whose
     * coefficients are given by \f$ (1, u_0, u_0^2, u_1,\ldots, 1, u_{D-1}, u_{D-1}^2) \f$. We spend \f$ D \f$
     * multiplications to construct the coefficients.
     *
     * @param multivariate_challenge
     * @return Polynomial<FF>
     */
    static std::vector<FF> compute_challenge_polynomial(const std::vector<FF>& multivariate_challenge)
    {
        ASSERT(LIBRA_UNIVARIATES_LENGTH == 3);

        std::vector<FF> challenge_polynomial_lagrange(SUBGROUP_SIZE);

        challenge_polynomial_lagrange[0] = FF{ 1 };
        FF challenge_sqr = FF{ 1 };

        // Populate the vector with the powers of the challenges
        for (size_t poly_idx = 0; poly_idx < CONST_PROOF_SIZE_LOG_N; poly_idx++) {
            challenge_sqr = multivariate_challenge[poly_idx] * multivariate_challenge[poly_idx];

            challenge_polynomial_lagrange[1 + poly_idx * LIBRA_UNIVARIATES_LENGTH] = FF{ 1 };
            challenge_polynomial_lagrange[2 + poly_idx * LIBRA_UNIVARIATES_LENGTH] = multivariate_challenge[poly_idx];
            challenge_polynomial_lagrange[3 + poly_idx * LIBRA_UNIVARIATES_LENGTH] = challenge_sqr;
        }

        return challenge_polynomial_lagrange;
    }

    /**
     * @brief Efficient batch evaluation of the challenge polynomial, Lagrange first, and Lagrange last
     *
     * @details It is a modification of \ref bb::polynomial_arithmetic::compute_barycentric_evaluation
     * "compute_barycentric_evaluation" method that does not require EvaluationDomain object and outputs the barycentric
     * evaluation of a polynomial along with the evaluations of the first and last Lagrange polynomials. The
     * interpolation domain is given by \f$ (1, g, g^2, \ldots, g^{|H| -1 } )\f$
     *
     * @param coeffs Coefficients of the polynomial to be evaluated, in our case it is the challenge polynomial
     * @param z Evaluation point, we are using the Gemini evaluation challenge
     * @param inverse_root_of_unity Inverse of the generator of the subgroup H
     * @return std::array<FF, 3>
     */
    static std::array<FF, 3> compute_batched_barycentric_evaluations(const std::vector<FF>& coeffs,
                                                                     const FF& r,
                                                                     const FF& inverse_root_of_unity)
    {
        std::array<FF, SUBGROUP_SIZE> denominators;
        FF one = FF{ 1 };
        FF numerator = r;

        numerator = numerator.pow(SUBGROUP_SIZE) - one;
        numerator *= one / FF(SUBGROUP_SIZE); // (r^n - 1) / n

        denominators[0] = r - one;
        FF work_root = inverse_root_of_unity; // g^{-1}
                                              //
        // Compute the evaluations of the Lagrange polynomials for H
        for (size_t i = 1; i < SUBGROUP_SIZE; ++i) {
            denominators[i] = work_root * r;
            denominators[i] -= one; // r * g^{-i} - 1
            work_root *= inverse_root_of_unity;
        }
        if constexpr (Curve::is_stdlib_type) {
            for (FF& denominator : denominators) {
                denominator = one / denominator;
            }
        } else {
            FF::batch_invert(&denominators[0], SUBGROUP_SIZE);
        }
        std::array<FF, 3> result;
        result[0] = FF{ 0 };
        for (size_t i = 0; i < SUBGROUP_SIZE; ++i) {
            FF temp = coeffs[i] * denominators[i]; // coeffs_i * 1/(r * g^{-i}  - 1)
            result[0] = result[0] + temp;
        }

        result[0] = result[0] * numerator;       // The evaluation of the polynomials given by its evaluations over H
        result[1] = denominators[0] * numerator; // Lagrange first evaluated at r
        result[2] = denominators[SUBGROUP_SIZE - 1] * numerator; // Lagrange last evaluated at r

        return result;
    }
};
} // namespace bb
