#pragma once

#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
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
 *
 * Let \f$ G \f$ be the masked concatenated Libra polynomial. Without masking, it is defined by concatenating Libra
 * constant term and the monomial coefficients of the Libra univariates \f$ g_i \f$ in the Lagrange basis over \f$ H
 * \f$. More explicitly, unmasked concatenated Libra polynomial is given by the following vector of coefficients:
 * \f[ \big( \text{libra_constant_term},  g_{0,0}, \ldots, g_{0,
 * \text{LIBRA_UNIVARIATES_LENGTH} - 1}, \ldots, g_{d-1, 0}, g_{d-1,  \text{LIBRA_UNIVARIATES_LENGTH} - 1} \big) \f],
 * where \f$ d = \text{log_circuit_size}\f$.
 * It is masked by adding \f$ (r_0 + r_1 X) Z_{H}(X)\f$, where \f$ Z_H(X) \f$ is the vanishing polynomial for \f$ H \f$.
 *
 * This class enables the prover to:
 *
 * - Open the commitment to concatenated Libra polynomial with zero-knowledge while proving correctness of the claimed
 * inner product. The concatenated polynomial is commited to during the construction of ZKSumcheckData structure.
 *
 * ### Inputs
 * The prover receives:
 * - **ZKSumcheckData:** Contains:
 *   - Monomial coefficients of the masked concatenated Libra polynomial \f$ G \f$.
 *   - Interpolation domain for a small subgroup \( H \subset \mathbb{F}^\ast \), where \(\mathbb{F} \) is the
 * ScalarField of a given curve.
 * - **Sumcheck challenges:** \( u_0, \ldots, u_{D-1} \), where \( D = \text{CONST_PROOF_SIZE_LOG_N} \).
 * - **Claimed inner product:** \( s = \text{claimed\_ipa\_eval} \), defined as:
 *   \f[
 *   s = \sum_{i=1}^{|H|} F(g^i) G(g^i),
 *   \f]
 *   where \( F(X) \) is the ``challenge`` polynomial constructed from the Sumcheck round challenges (see the formula
 * below) and \( G(X) \) is the concatenated Libra polynomial.
 *
 * ### Prover's Construction
 * 1. Define a polynomial \( A(X) \), called the **big sum polynomial**, which is analogous to the big product
 * polynomial used to prove claims about \f$ \prod_{h\in H} f(h) \cdot g(h) \f$. It is uniquely defined by the
 * following:
 *    - \( A(1) = 0 \),
 *    - \( A(g^i) = A(g^{i-1}) + F(g^{i-1}) G(g^{i-1}) \) for \( i = 1, \ldots, |H|-1 \).
 * 2. Mask \( A(X) \) by adding \( Z_H(X) R(X) \), where \( R(X) \) is a random polynomial of degree 3.
 * 3. Commit to \( A(X) \) and send the commitment to the verifier.
 *
 * ### Key Identity
 * \( A(X) \) is honestly constructed, i.e.
 *    - \f$ A_0 = 0\f$,
 *    - \f$ A_{i} = A_{i-1} + F_{i-1} * G_{i-1}\f$ (Lagrange coefficients over \f$ H \f$) for \f$ i = 1,\ldots, |H|\f$
 *    - \f$ A_{|H|} \f$ is equal to the claimed inner product \f$s\f$.
 * if and only if the following identity holds:
 * \f[ L_1(X) A(X) + (X - g^{-1}) (A(g \cdot X) - A(X) -
 * F(X) G(X)) + L_{|H|}(X) (A(X) - s) = Z_H(X) Q(X), \f] where \( Q(X) \) is the quotient of the left-hand side by \(
 * Z_H(X) \). The second summand is the translation of the second condition using the fact that the coefficients of \f$
 * A(gX) \f$ are given by a cyclic shift of the coefficients of \f$ A(X) \f$.
 *
 * The methods of this class allow the prover to compute \( A(X) \) and \( Q(X) \).
 *
 * After receiveing a random evaluation challenge \f$ r \f$ , the prover sends \f$ G(r), A(g\cdot r), A(r), Q(r) \f$ to
 * the verifier. In our case, \f$ r \f$ is the Gemini evaluation challenge, and this part is taken care of by Shplemini.
 */
template <typename Flavor> class SmallSubgroupIPAProver {
    using Curve = typename Flavor::Curve;
    using FF = typename Curve::ScalarField;
    // The size of a multiplicative subgroup in the ScalarField of a curve
    static constexpr size_t SUBGROUP_SIZE = Curve::SUBGROUP_SIZE;
    // Size of the polynomial to be divided by Z_H
    static constexpr size_t BATCHED_POLYNOMIAL_LENGTH = 2 * SUBGROUP_SIZE + 2;
    // Size of Q(X)
    static constexpr size_t QUOTIENT_LENGTH = SUBGROUP_SIZE + 2;
    // The length of a random polynomial to mask Prover's Sumcheck Univariates. In the case of BN254-based Flavors, we
    // send the coefficients of the univariates, hence we choose these value to be the max sumcheck univariate length
    // over Translator, Ultra, and Mega. In ECCVM, the Sumcheck prover will commit to its univariates, which reduces the
    // required length from 23 to 3.
    static constexpr size_t LIBRA_UNIVARIATES_LENGTH = (std::is_same_v<Curve, curve::BN254>) ? 9 : 3;
    // Fixed generator of H
    static constexpr FF subgroup_generator = Curve::subgroup_generator;

    // Interpolation domain {1, g, \ldots, g^{SUBGROUP_SIZE - 1}} used by ECCVM
    std::array<FF, SUBGROUP_SIZE> interpolation_domain;
    // We use IFFT over BN254 scalar field
    EvaluationDomain<FF> bn_evaluation_domain;

    // Monomial coefficients of the concatenated Libra masking polynomial extracted from ZKSumcheckData
    Polynomial<FF> concatenated_polynomial;
    // Lagrange coefficeints of the concatenated Libra masking polynomial = constant_term || g_0 || ... || g_{d-1}
    Polynomial<FF> libra_concatenated_lagrange_form;

    // Claimed evaluation s = constant_term + g_0(u_0) + ... + g_{d-1}(u_{d-1}), where g_i is the i'th Libra masking
    // univariate
    FF claimed_evaluation;

    // The polynomial obtained by concatenated powers of sumcheck challenges
    Polynomial<FF> challenge_polynomial;
    Polynomial<FF> challenge_polynomial_lagrange;

    // Big sum polynomial A(X)
    Polynomial<FF> big_sum_polynomial_unmasked;
    Polynomial<FF> big_sum_polynomial;
    std::array<FF, SUBGROUP_SIZE> big_sum_lagrange_coeffs;

    // The RHS of the key identity, denoted C(X) in the HackMD
    Polynomial<FF> batched_polynomial;

    // Quotient of the batched polynomial C(X) by the subgroup vanishing polynomial X^{|H|} - 1
    Polynomial<FF> batched_quotient;

  public:
    SmallSubgroupIPAProver(ZKSumcheckData<Flavor>& zk_sumcheck_data,
                           const std::vector<FF>& multivariate_challenge,
                           const FF claimed_ipa_eval,
                           std::shared_ptr<typename Flavor::Transcript> transcript,
                           std::shared_ptr<typename Flavor::CommitmentKey> commitment_key)
        : interpolation_domain(zk_sumcheck_data.interpolation_domain)
        , concatenated_polynomial(zk_sumcheck_data.libra_concatenated_monomial_form)
        , libra_concatenated_lagrange_form(zk_sumcheck_data.libra_concatenated_lagrange_form)
        , challenge_polynomial(SUBGROUP_SIZE)
        , challenge_polynomial_lagrange(SUBGROUP_SIZE)
        , big_sum_polynomial_unmasked(SUBGROUP_SIZE)
        , big_sum_polynomial(SUBGROUP_SIZE + 3) // + 3 to account for masking
        , batched_polynomial(BATCHED_POLYNOMIAL_LENGTH)
        , batched_quotient(QUOTIENT_LENGTH)

    {
        // Extract the evaluation domain computed by ZKSumcheckData
        if constexpr (std::is_same_v<Curve, curve::BN254>) {
            bn_evaluation_domain = std::move(zk_sumcheck_data.bn_evaluation_domain);
        }

        // Construct the challenge polynomial in Lagrange basis, compute its monomial coefficients
        compute_challenge_polynomial(multivariate_challenge);

        // Construct unmasked big sum polynomial in Lagrange basis, compute its monomial coefficients and mask it
        compute_big_sum_polynomial();

        // Send masked commitment [A + Z_H * R] to the verifier, where R is of degree 2
        transcript->template send_to_verifier("Libra:big_sum_commitment", commitment_key->commit(big_sum_polynomial));

        // Compute C(X)
        compute_batched_polynomial(claimed_ipa_eval);

        // Compute Q(X)
        compute_batched_quotient();

        // Send commitment [Q] to the verifier
        if (commitment_key) {
            transcript->template send_to_verifier("Libra:quotient_commitment",
                                                  commitment_key->commit(batched_quotient));
        }
    }

    // Getter to pass the witnesses to ShpleminiProver. Big sum polynomial is evaluated at 2 points (and is small)
    std::array<bb::Polynomial<FF>, NUM_LIBRA_EVALUATIONS> get_witness_polynomials() const
    {
        return { concatenated_polynomial, big_sum_polynomial, big_sum_polynomial, batched_quotient };
    }
    // Getters for test purposes
    const Polynomial<FF>& get_batched_polynomial() const { return batched_polynomial; }
    const Polynomial<FF>& get_challenge_polynomial() const { return challenge_polynomial; }

    /**
     * @brief Computes the challenge polynomial F(X) based on the provided multivariate challenges.
     *
     * This method generates a polynomial in both Lagrange basis and monomial basis from Sumcheck's
     * multivariate_challenge vector. The result is stored in `challenge_polynomial_lagrange` and
     * `challenge_polynomial`. The former is re-used in the computation of the big sum polynomial A(X)
     *
     * ### Lagrange Basis
     * The Lagrange basis polynomial is constructed as follows:
     * - Initialize the first coefficient as `1`.
     * - For each challenge index `idx_poly` in the `CONST_PROOF_SIZE_LOG_N` range, compute a sequence of coefficients
     *   recursively as powers of the corresponding multivariate challenge.
     * - Store these coefficients in `coeffs_lagrange_basis`.
     * More explicitly,
     * \f$ F = (1 , 1 , u_0, \ldots, u_0^{LIBRA_UNIVARIATES_LENGTH-1}, \ldots, 1, u_{D-1}, \ldots,
     * u_{D-1}^{LIBRA_UNVIARIATES_LENGTH-1} ) \f$ in the Lagrange basis over \f$ H \f$.
     *
     * ### Monomial Basis
     * If the curve is not `BN254`, the monomial polynomial is constructed directly using un-optimized Lagrange
     * interpolation. Otherwise, an IFFT is used to convert the Lagrange basis coefficients into monomial basis
     * coefficients.
     *
     * @param multivariate_challenge A vector of field elements used to compute the challenge polynomial.
     */
    void compute_challenge_polynomial(const std::vector<FF>& multivariate_challenge)
    {
        std::vector<FF> coeffs_lagrange_basis(SUBGROUP_SIZE);
        coeffs_lagrange_basis[0] = FF(1);

        for (size_t challenge_idx = 0; challenge_idx < CONST_PROOF_SIZE_LOG_N; challenge_idx++) {
            // We concatenate 1 with CONST_PROOF_SIZE_LOG_N Libra Univariates of length LIBRA_UNIVARIATES_LENGTH
            const size_t poly_to_concatenate_start = 1 + LIBRA_UNIVARIATES_LENGTH * challenge_idx;
            coeffs_lagrange_basis[poly_to_concatenate_start] = FF(1);
            for (size_t idx = 1 + poly_to_concatenate_start; idx < poly_to_concatenate_start + LIBRA_UNIVARIATES_LENGTH;
                 idx++) {
                // Recursively compute the powers of the challenge
                coeffs_lagrange_basis[idx] = coeffs_lagrange_basis[idx - 1] * multivariate_challenge[challenge_idx];
            }
        }

        challenge_polynomial_lagrange = Polynomial<FF>(coeffs_lagrange_basis);

        // Compute monomial coefficients
        if constexpr (!std::is_same_v<Curve, curve::BN254>) {
            challenge_polynomial = Polynomial<FF>(interpolation_domain, coeffs_lagrange_basis, SUBGROUP_SIZE);
        } else {
            std::vector<FF> challenge_polynomial_ifft(SUBGROUP_SIZE);
            polynomial_arithmetic::ifft(
                coeffs_lagrange_basis.data(), challenge_polynomial_ifft.data(), bn_evaluation_domain);
            challenge_polynomial = Polynomial<FF>(challenge_polynomial_ifft);
        }
    }

    /**
     * @brief Computes the big sum polynomial A(X)
     *
     * #### Lagrange Basis
     * - First, we recursively compute the coefficients of the unmasked big sum polynomial, i.e. we set the first
     * coefficient to `0`.
     * - For each i, the coefficient is updated as:
     *   \f$ \texttt{big_sum_lagrange_coeffs} (g^{i}) =
     *        \texttt{big_sum_lagrange_coeffs} (g^{i-1}) +
     *        \texttt{challenge_polynomial_lagrange[prev_idx]} (g^{i-1}) \cdot
     *        \texttt{libra_concatenated_lagrange_form[prev_idx]} (g^{i-1}) \f$
     * #### Masking Term
     * - A random polynomial of degree 2 is generated and added to the Big Sum Polynomial.
     * - The masking term is applied as \f$ Z_H(X) \cdot \texttt{masking_term} \f$, where \f$ Z_H(X) \f$ is the
     * vanishing polynomial.
     *
     */
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
        if constexpr (!std::is_same_v<Curve, curve::BN254>) {
            big_sum_polynomial_unmasked = Polynomial<FF>(interpolation_domain, big_sum_lagrange_coeffs, SUBGROUP_SIZE);
        } else {
            std::vector<FF> big_sum_ifft(SUBGROUP_SIZE);
            polynomial_arithmetic::ifft(big_sum_lagrange_coeffs.data(), big_sum_ifft.data(), bn_evaluation_domain);
            big_sum_polynomial_unmasked = Polynomial<FF>(big_sum_ifft);
        }
        //  Generate random masking_term of degree 2, add Z_H(X) * masking_term
        bb::Univariate<FF, 3> masking_term = bb::Univariate<FF, 3>::get_random();
        big_sum_polynomial += big_sum_polynomial_unmasked;

        for (size_t idx = 0; idx < masking_term.size(); idx++) {
            big_sum_polynomial.at(idx) -= masking_term.value_at(idx);
            big_sum_polynomial.at(idx + SUBGROUP_SIZE) += masking_term.value_at(idx);
        }
    };

    /**
     * @brief   Compute \f$ L_1(X) * A(X) + (X - 1/g) (A(gX) - A(X) - F(X) G(X)) + L_{|H|}(X)(A(X) - s) \f$, where \f$ g
     * \f$ is the fixed generator of \f$ H \f$.
     *
     */
    void compute_batched_polynomial(const FF& claimed_evaluation)
    {
        // Compute shifted big sum polynomial A(gX)
        Polynomial<FF> shifted_big_sum(SUBGROUP_SIZE + 3);

        for (size_t idx = 0; idx < SUBGROUP_SIZE + 3; idx++) {
            shifted_big_sum.at(idx) = big_sum_polynomial.at(idx) * interpolation_domain[idx % SUBGROUP_SIZE];
        }

        const auto& [lagrange_first, lagrange_last] =
            compute_lagrange_polynomials(interpolation_domain, bn_evaluation_domain);

        // Compute -F(X)*G(X), the negated product of challenge_polynomial and libra_concatenated_monomial_form
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
        for (size_t i = 0; i < big_sum_polynomial.size(); ++i) {
            for (size_t j = 0; j < SUBGROUP_SIZE; ++j) {
                batched_polynomial.at(i + j) += big_sum_polynomial.at(i) * (lagrange_first.at(j) + lagrange_last.at(j));
            }
        }
        // Subtract L_{|H|} * s
        for (size_t idx = 0; idx < SUBGROUP_SIZE; idx++) {
            batched_polynomial.at(idx) -= lagrange_last.at(idx) * claimed_evaluation;
        }
    }
    /**
     * @brief Compute monomial coefficients of the first and last Lagrange polynomials
     *
     * @param interpolation_domain
     * @param bn_evaluation_domain
     * @return std::array<Polynomial<FF>, 2>
     */
    std::array<Polynomial<FF>, 2> static compute_lagrange_polynomials(
        const std::array<FF, SUBGROUP_SIZE>& interpolation_domain, const EvaluationDomain<FF>& bn_evaluation_domain)
    {
        // Compute the monomial coefficients of L_1
        std::array<FF, SUBGROUP_SIZE> lagrange_coeffs;
        lagrange_coeffs[0] = FF(1);
        for (size_t idx = 1; idx < SUBGROUP_SIZE; idx++) {
            lagrange_coeffs[idx] = FF(0);
        }

        Polynomial<FF> lagrange_first_monomial(SUBGROUP_SIZE);
        if constexpr (!std::is_same_v<Curve, curve::BN254>) {
            lagrange_first_monomial = Polynomial<FF>(interpolation_domain, lagrange_coeffs, SUBGROUP_SIZE);
        } else {
            std::vector<FF> lagrange_first_ifft(SUBGROUP_SIZE);
            polynomial_arithmetic::ifft(lagrange_coeffs.data(), lagrange_first_ifft.data(), bn_evaluation_domain);
            lagrange_first_monomial = Polynomial<FF>(lagrange_first_ifft);
        }

        // Compute the monomial coefficients of L_{|H|}, the last Lagrange polynomial
        lagrange_coeffs[0] = FF(0);
        lagrange_coeffs[SUBGROUP_SIZE - 1] = FF(1);

        Polynomial<FF> lagrange_last_monomial;
        if constexpr (!std::is_same_v<Curve, curve::BN254>) {
            lagrange_last_monomial = Polynomial<FF>(interpolation_domain, lagrange_coeffs, SUBGROUP_SIZE);
        } else {
            std::vector<FF> lagrange_last_ifft(SUBGROUP_SIZE);
            polynomial_arithmetic::ifft(lagrange_coeffs.data(), lagrange_last_ifft.data(), bn_evaluation_domain);
            lagrange_last_monomial = Polynomial<FF>(lagrange_last_ifft);
        }

        return { lagrange_first_monomial, lagrange_last_monomial };
    }
    /** @brief Efficiently compute the quotient of batched_polynomial by Z_H = X ^ { | H | } - 1
     */
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

    static constexpr size_t LIBRA_UNIVARIATES_LENGTH = (std::is_same_v<Curve, curve::BN254>) ? 9 : 3;

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
    static bool check_evaluations_consistency(const std::array<FF, NUM_LIBRA_EVALUATIONS>& libra_evaluations,
                                              const FF& gemini_evaluation_challenge,
                                              const std::vector<FF>& multilinear_challenge,
                                              const FF& inner_product_eval_claim)
    {

        const FF subgroup_generator_inverse = Curve::subgroup_generator_inverse;

        // Compute the evaluation of the vanishing polynomia Z_H(X) at X = gemini_evaluation_challenge
        const FF vanishing_poly_eval = gemini_evaluation_challenge.pow(SUBGROUP_SIZE) - FF(1);

        bool gemini_challenge_in_small_subgroup = false;
        if constexpr (Curve::is_stdlib_type) {
            gemini_challenge_in_small_subgroup = (vanishing_poly_eval.get_value() == FF(0).get_value());
        } else {
            gemini_challenge_in_small_subgroup = (vanishing_poly_eval == FF(0));
        }

        // The probability of this event is negligible but it has to be processed correctly
        if (gemini_challenge_in_small_subgroup) {
            throw_or_abort("Gemini evaluation challenge is in the SmallSubgroup.");
        }
        // Construct the challenge polynomial from the sumcheck challenge, the verifier has to evaluate it on its own
        const std::vector<FF> challenge_polynomial_lagrange = compute_challenge_polynomial(multilinear_challenge);

        // Compute the evaluations of the challenge polynomial, Lagrange first, and Lagrange last for the fixed small
        // subgroup
        auto [challenge_poly, lagrange_first, lagrange_last] =
            compute_batched_barycentric_evaluations(challenge_polynomial_lagrange,
                                                    gemini_evaluation_challenge,
                                                    subgroup_generator_inverse,
                                                    vanishing_poly_eval);

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
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1186). Insecure pattern.
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
        std::vector<FF> challenge_polynomial_lagrange(SUBGROUP_SIZE);

        challenge_polynomial_lagrange[0] = FF{ 1 };

        // Populate the vector with the powers of the challenges
        for (size_t idx_poly = 0; idx_poly < CONST_PROOF_SIZE_LOG_N; idx_poly++) {
            size_t current_idx = 1 + LIBRA_UNIVARIATES_LENGTH * idx_poly;
            challenge_polynomial_lagrange[current_idx] = FF(1);
            for (size_t idx = 1; idx < LIBRA_UNIVARIATES_LENGTH; idx++) {
                // Recursively compute the powers of the challenge
                challenge_polynomial_lagrange[current_idx + idx] =
                    challenge_polynomial_lagrange[current_idx + idx - 1] * multivariate_challenge[idx_poly];
            }
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
                                                                     const FF& inverse_root_of_unity,
                                                                     const FF& vanishing_poly_eval)
    {
        std::array<FF, SUBGROUP_SIZE> denominators;
        FF one = FF{ 1 };
        FF numerator = vanishing_poly_eval;

        numerator *= one / FF(SUBGROUP_SIZE); // (r^n - 1) / n

        denominators[0] = r - one;
        FF work_root = inverse_root_of_unity; // g^{-1}
                                              //
        // Compute the denominators of the Lagrange polynomials evaluated at r
        for (size_t i = 1; i < SUBGROUP_SIZE; ++i) {
            denominators[i] = work_root * r;
            denominators[i] -= one; // r * g^{-i} - 1
            work_root *= inverse_root_of_unity;
        }

        // Invert/Batch invert denominators
        if constexpr (Curve::is_stdlib_type) {
            for (FF& denominator : denominators) {
                denominator = one / denominator;
            }
        } else {
            FF::batch_invert(&denominators[0], SUBGROUP_SIZE);
        }
        std::array<FF, 3> result;

        // Accumulate the evaluation of the polynomials given by `coeffs` vector
        result[0] = FF{ 0 };
        for (const auto& [coeff, denominator] : zip_view(coeffs, denominators)) {
            result[0] += coeff * denominator; // + coeffs_i * 1/(r * g^{-i}  - 1)
        }

        result[0] = result[0] * numerator;       // The evaluation of the polynomials given by its evaluations over H
        result[1] = denominators[0] * numerator; // Lagrange first evaluated at r
        result[2] = denominators[SUBGROUP_SIZE - 1] * numerator; // Lagrange last evaluated at r

        return result;
    }
};
} // namespace bb