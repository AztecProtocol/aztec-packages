#pragma once

#include "barretenberg/commitment_schemes/utils/test_settings.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/eccvm/eccvm_translation_data.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/sumcheck/zk_sumcheck_data.hpp"

#include <array>
#include <vector>

namespace bb {

template <typename Flavor> class SmallSubgroupIPAProver {
    using Curve = typename Flavor::Curve;
    using FF = typename Curve::ScalarField;
    // The size of a multiplicative subgroup in the ScalarField of a curve
    static constexpr size_t SUBGROUP_SIZE = Curve::SUBGROUP_SIZE;
    // Size of the polynomial to be divided by Z_H
    static constexpr size_t BATCHED_POLYNOMIAL_LENGTH = 2 * SUBGROUP_SIZE + 2;
    // Size of Q(X)
    static constexpr size_t QUOTIENT_LENGTH = SUBGROUP_SIZE + 2;
    // The length of a random polynomial masking Prover's Sumcheck Univariates. In the case of BN254-based Flavors, we
    // send the coefficients of the univariates, hence we choose these value to be the max sumcheck univariate length
    // over Translator, Ultra, and Mega. In ECCVM, the Sumcheck prover will commit to its univariates, which reduces the
    // required length from 23 to 3.
    static constexpr size_t LIBRA_UNIVARIATES_LENGTH = Curve::LIBRA_UNIVARIATES_LENGTH;
    // Fixed generator of H
    static constexpr FF subgroup_generator = Curve::subgroup_generator;

    // The SmallSubgroupIPA claim
    FF claimed_inner_product;

    // Interpolation domain {1, g, \ldots, g^{SUBGROUP_SIZE - 1}} used by ECCVM
    std::array<FF, SUBGROUP_SIZE> interpolation_domain;
    // We use IFFT over BN254 scalar field
    EvaluationDomain<FF> bn_evaluation_domain;

    // Monomial coefficients of the concatenated Libra masking polynomial extracted from ZKSumcheckData
    Polynomial<FF> concatenated_polynomial;
    // Lagrange coefficeints of the concatenated Libra masking polynomial = constant_term || g_0 || ... || g_{d-1}
    Polynomial<FF> libra_concatenated_lagrange_form;

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

    std::shared_ptr<typename Flavor::Transcript> transcript;

  public:
    // Construct prover from ZKSumcheckData. Used by all ZK-Provers.
    SmallSubgroupIPAProver(ZKSumcheckData<Flavor>& zk_sumcheck_data,
                           const std::vector<FF>& multivariate_challenge,
                           const FF claimed_inner_product,
                           std::shared_ptr<typename Flavor::Transcript>& transcript);

    // Construct prover from TranslationData. Used by ECCVMProver.
    SmallSubgroupIPAProver(TranslationData<typename Flavor::Transcript>& translation_data,
                           const FF evaluation_challenge_x,
                           const FF batching_challenge_v,
                           const FF claimed_inner_product,
                           std::shared_ptr<typename Flavor::Transcript>& transcript);

    void prove(std::shared_ptr<typename Flavor::CommitmentKey>& commitment_key);

    // Getter to pass the witnesses to ShpleminiProver. Big sum polynomial is evaluated at 2 points (and is small)
    std::array<bb::Polynomial<FF>, NUM_SMALL_IPA_EVALUATIONS> get_witness_polynomials() const
    {
        return { concatenated_polynomial, big_sum_polynomial, big_sum_polynomial, batched_quotient };
    }
    // Getters for test purposes
    const Polynomial<FF>& get_batched_polynomial() const { return batched_polynomial; }
    const Polynomial<FF>& get_challenge_polynomial() const { return challenge_polynomial; }

    void compute_challenge_polynomial(const std::vector<FF>& multivariate_challenge);

    void compute_eccvm_challenge_polynomial(const FF evaluation_challenge_x, const FF batching_challenge_v);

    void compute_big_sum_polynomial();

    void compute_batched_polynomial();

    std::array<Polynomial<FF>, 2> static compute_lagrange_polynomials(
        const std::array<FF, SUBGROUP_SIZE>& interpolation_domain, const EvaluationDomain<FF>& bn_evaluation_domain);

    void compute_batched_quotient();

    static FF compute_claimed_inner_product(ZKSumcheckData<Flavor>& zk_sumcheck_data,
                                            const std::vector<FF>& multivariate_challenge,
                                            const size_t& log_circuit_size);

    static FF compute_claimed_translation_inner_product(TranslationData<typename Flavor::Transcript>& translation_data,
                                                        const FF& evaluation_challenge_x,
                                                        const FF& batching_challenge_v);
};

/**
 * @brief Verifier class for Small Subgroup IPA Prover.
 *
 * @details Checks the consistency of polynomial evaluations provided by the
 * prover against the values derived from the sumcheck challenge and a
 * random evaluation challenge.
 */
template <typename Curve> class SmallSubgroupIPAVerifier {
    using FF = typename Curve::ScalarField;

    static constexpr size_t SUBGROUP_SIZE = Curve::SUBGROUP_SIZE;

    // The length of a random polynomial masking Prover's Sumcheck
    // Univariates. In the case of BN254-based Flavors, we send the
    // coefficients of the univariates, hence we choose these value to be
    // the max sumcheck univariate length over Translator, Ultra, and Mega.
    // In ECCVM, the Sumcheck prover will commit to its univariates, which
    // reduces the required length from 23 to 3.
    static constexpr size_t LIBRA_UNIVARIATES_LENGTH = Curve::LIBRA_UNIVARIATES_LENGTH;

  public:
    /*!
     * @brief Verifies the consistency of polynomial evaluations provided by the
     * the prover.
     *
     * @details
     * Given a subgroup of \f$ \mathbb{F}^\ast \f$, its generator \f$ g\f$,
     * this function checks whether the following equation holds: \f[ L_1(r)
     * A(r) + (r - g^{-1}) \left( A(g*r) - A(r) - F(r) G(r) \right) +
     * L_{|H|}(r) \left( A(r) - s \right) = T(r) Z_H(r) \f] Where the
     * following are sent by the prover
     * - \f$ A(r), A(g\cdot r) \f$ are the evaluation of the "big sum
     * polynomial"
     * - \f$ G(r) \f$ is the evaluation of the concatenation of the
     * coefficients of the masking Libra polynomials
     *
     * - \f$ T(r) \f$ is the evaluation of the quotient of the left hand
     * side above by the vanishing polynomial for \f$H\f$ and the following
     * evaluations computed by the verifier
     * - \f$ L_1 \f$ and \f$ L_{|H|} \f$ are the Lagrange polynomials
     * corresponding to \f$ 1 \f$ and \f$ g^{-1} \f$.
     * - \f$ F(r) \f$ is the evaluation of a public polynomial formed from the challenges. It is specified by one of the
     * constructors below.
     * - \f$ Z_H(r) \f$ is the vanishing polynomial \f$ X^{|H|} - 1\f$
     * evaluated at the challenge point.
     *
     * @param small_ipa_evaluations An array of polynomial evaluations
     * containing:
     *   - \f$ G(r), A(g\cdot r), A(r), T(r) \f$.
     * @param small_ipa_eval_challenge The challenge point \f$ r \f$ at
     * which evaluations are verified.
     * @param challenge_polynomial Lagrange coefficients of \f$ F \f$.
     * @param inner_product_eval_claim The claimed inner proudct of the coefficients of
     * \f$G\f$ and \f$F\f$.
     * @return True if the consistency check passes, false otherwise.
     */
    static bool check_consistency(const std::array<FF, NUM_SMALL_IPA_EVALUATIONS>& small_ipa_evaluations,
                                  const FF& small_ipa_eval_challenge,
                                  const std::vector<FF>& challenge_polynomial,
                                  const FF& inner_product_eval_claim,
                                  const FF& vanishing_poly_eval)
    {
        handle_edge_cases(vanishing_poly_eval);
        // first, and Lagrange last for the fixed small subgroup
        auto [challenge_poly, lagrange_first, lagrange_last] = compute_batched_barycentric_evaluations(
            challenge_polynomial, small_ipa_eval_challenge, vanishing_poly_eval);

        const FF& concatenated_at_r = small_ipa_evaluations[0];
        const FF& big_sum_shifted_eval = small_ipa_evaluations[1];
        const FF& big_sum_eval = small_ipa_evaluations[2];
        const FF& quotient_eval = small_ipa_evaluations[3];

        // Compute the evaluation of
        // L_1(X) * A(X) + (X - 1/g) (A(gX) - A(X) - F(X) G(X)) +
        // L_{|H|}(X)(A(X) - s) - Z_H(X) * Q(X)
        FF diff = lagrange_first * big_sum_eval;
        diff += (small_ipa_eval_challenge - Curve::subgroup_generator_inverse) *
                (big_sum_shifted_eval - big_sum_eval - concatenated_at_r * challenge_poly);
        diff += lagrange_last * (big_sum_eval - inner_product_eval_claim) - vanishing_poly_eval * quotient_eval;

        if constexpr (Curve::is_stdlib_type) {
            if constexpr (std::is_same_v<Curve, stdlib::grumpkin<UltraCircuitBuilder>>) {
                // TODO(https://github.com/AztecProtocol/barretenberg/issues/1197)
                diff.self_reduce();
            }
            diff.assert_equal(FF(0));
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1186).
            // Insecure pattern.
            return (diff.get_value() == FF(0).get_value());
        } else {
            return (diff == FF(0));
        };
    };

    /**
     * @brief A method required by ZKSumcheck. The challenge polynomial is concatenated from the powers of the sumcheck
     * challenges.
     *
     * @param libra_evaluations Evaluations of the SmallSubgroupIPA witness polynomials when \f$ G \f$ is a
     * concatenation of a masking constant term and Libra univariates.
     * @param gemini_evaluation_challenge Random challenge \f$ r \f$ at which the Gemini fold polynomials are evaluated.
     * @param multilinear_challenge Sumcheck challenge \f$ (u_0, \ldots, u_{d-1})\f$.
     * @param inner_product_eval_claim Claimed inner product of \f$ F \f$ and \f$ G\f$.
     * @return true
     * @return false
     */
    static bool check_libra_evaluations_consistency(const std::array<FF, NUM_SMALL_IPA_EVALUATIONS>& libra_evaluations,
                                                    const FF& gemini_evaluation_challenge,
                                                    const std::vector<FF>& multilinear_challenge,
                                                    const FF& inner_product_eval_claim)
    {

        // Compute the evaluation of the vanishing polynomia Z_H(X) at X =
        // gemini_evaluation_challenge
        const FF vanishing_poly_eval = gemini_evaluation_challenge.pow(SUBGROUP_SIZE) - FF(1);

        return check_consistency(libra_evaluations,
                                 gemini_evaluation_challenge,
                                 compute_challenge_polynomial_coeffs<Curve>(multilinear_challenge),
                                 inner_product_eval_claim,
                                 vanishing_poly_eval);
    }
    /**
     * @brief A method required for the verification Translation Evaluations in the ECCVMVerifier. The challenge
     * polynomial is concatenated from the products \f$ x^i \cdot v^j\f$. See the corresponding method for details.
     *
     * @param small_ipa_evaluations Evaluations of the SmallSubgroupIPA witness polynomials when \f$ G \f$ is a
     * concatenation of the last MASKING_OFFSET entries in the NUM_TRANSLATION_EVALUATIONS polynomials.
     * @param evaluation_challenge A random challenge sampled to obtain `small_ipa_evaluations`
     * @param evaluation_challenge_x Evaluation challenge for NUM_TRANSLATION_EVALUATIONS univariate polynomials
     * @param batching_challenge_v A challenge used to batch the evaluations at \f$ x \f$ .
     * @param inner_product_eval_claim Claimed inner product of \f$ F \f$ and \f$ G\f$.
     */
    static bool check_eccvm_evaluations_consistency(
        const std::array<FF, NUM_SMALL_IPA_EVALUATIONS>& small_ipa_evaluations,
        const FF& evaluation_challenge,
        const FF& evaluation_challenge_x,
        const FF& batching_challenge_v,
        const FF& inner_product_eval_claim)
    {

        // Compute the evaluation of the vanishing polynomia Z_H(X) at `evaluation_challenge`
        const FF vanishing_poly_eval = evaluation_challenge.pow(SUBGROUP_SIZE) - FF(1);

        return check_consistency(small_ipa_evaluations,
                                 evaluation_challenge,
                                 compute_eccvm_challenge_coeffs<Curve>(evaluation_challenge_x, batching_challenge_v),
                                 inner_product_eval_claim,
                                 vanishing_poly_eval);
    }

    /**
     * @brief Check if the random evaluation challenge is in the SmallSubgroup.
     *
     * @param vanishing_poly_eval \f$ Z_H(r) = r^{\text{SUBGROUP_SIZE}} \f$.
     */
    static void handle_edge_cases(const FF& vanishing_poly_eval)
    {

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1194).
        // Handle edge cases in PCS
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1186).
        // Insecure pattern.
        bool evaluation_challenge_in_small_subgroup = false;
        if constexpr (Curve::is_stdlib_type) {
            evaluation_challenge_in_small_subgroup = (vanishing_poly_eval.get_value() == FF(0).get_value());
        } else {
            evaluation_challenge_in_small_subgroup = (vanishing_poly_eval == FF(0));
        }
        // The probability of this event is negligible but it has to be
        // processed correctly
        if (evaluation_challenge_in_small_subgroup) {
            throw_or_abort("Evaluation challenge is in the SmallSubgroup.");
        }
    }
    /**
     * @brief Efficient batch evaluation of the challenge polynomial,
     * Lagrange first, and Lagrange last
     *
     * @details It is a modification of \ref
     * bb::polynomial_arithmetic::compute_barycentric_evaluation
     * "compute_barycentric_evaluation" method that does not require
     * EvaluationDomain object and outputs the barycentric evaluation of a
     * polynomial along with the evaluations of the first and last Lagrange
     * polynomials. The interpolation domain is given by \f$ (1, g, g^2,
     * \ldots, g^{|H| -1 } )\f$
     *
     * @param coeffs Coefficients of the polynomial to be evaluated, in our
     * case it is the challenge polynomial
     * @param r Evaluation point, we are using the Gemini evaluation
     * challenge
     * @param inverse_root_of_unity Inverse of the generator of the subgroup
     * H
     * @return std::array<FF, 3>
     */
    static std::array<FF, 3> compute_batched_barycentric_evaluations(const std::vector<FF>& coeffs,
                                                                     const FF& r,
                                                                     const FF& vanishing_poly_eval)
    {
        FF one = FF{ 1 };

        // Construct the denominators of the Lagrange polynomials evaluated
        // at r
        std::array<FF, SUBGROUP_SIZE> denominators;
        FF running_power = one;
        for (size_t i = 0; i < SUBGROUP_SIZE; ++i) {
            denominators[i] = running_power * r - one; // r * g^{-i} - 1
            running_power *= Curve::subgroup_generator_inverse;
        }

        // Invert/Batch invert denominators
        if constexpr (Curve::is_stdlib_type) {
            std::transform(
                denominators.begin(), denominators.end(), denominators.begin(), [](FF& d) { return d.invert(); });
        } else {
            FF::batch_invert(&denominators[0], SUBGROUP_SIZE);
        }

        // Construct the evaluation of the polynomial using its evaluations
        // over H, Lagrange first evaluated at r, Lagrange last evaluated at
        // r
        FF numerator = vanishing_poly_eval * FF(SUBGROUP_SIZE).invert(); // (r^n - 1) / n
        std::array<FF, 3> result{ std::inner_product(coeffs.begin(), coeffs.end(), denominators.begin(), FF(0)),
                                  denominators[0],
                                  denominators[SUBGROUP_SIZE - 1] };
        std::transform(
            result.begin(), result.end(), result.begin(), [&](FF& denominator) { return denominator * numerator; });
        return result;
    }
};

/**
 * @brief Given the sumcheck multivariate challenge \f$ (u_0,\ldots,
 * u_{D-1})\f$, where \f$ D = \text{CONST_PROOF_SIZE_LOG_N}\f$, the verifier
 * has to construct and evaluate the polynomial whose coefficients are given
 * by \f$ (1, u_0, u_0^2, u_1,\ldots, 1, u_{D-1}, u_{D-1}^2) \f$. We spend
 * \f$ D \f$ multiplications to construct the coefficients.
 *
 * @param multivariate_challenge
 * @return Polynomial<FF>
 */
template <typename Curve>
static std::vector<typename Curve::ScalarField> compute_challenge_polynomial_coeffs(
    const std::vector<typename Curve::ScalarField>& multivariate_challenge)
{
    using FF = typename Curve::ScalarField;

    std::vector<FF> challenge_polynomial_lagrange(Curve::SUBGROUP_SIZE);
    static constexpr size_t libra_univariates_length = Curve::LIBRA_UNIVARIATES_LENGTH;

    challenge_polynomial_lagrange[0] = FF{ 1 };

    // Populate the vector with the powers of the challenges
    size_t round_idx = 0;
    for (auto challenge : multivariate_challenge) {
        size_t current_idx = 1 + libra_univariates_length * round_idx; // Compute the current index into the vector
        challenge_polynomial_lagrange[current_idx] = FF(1);
        for (size_t idx = current_idx + 1; idx < current_idx + libra_univariates_length; idx++) {
            // Recursively compute the powers of the challenge up to the
            // length of libra univariates
            challenge_polynomial_lagrange[idx] = challenge_polynomial_lagrange[idx - 1] * challenge;
        }
        round_idx++;
    }
    return challenge_polynomial_lagrange;
}

/**
 * @brief Denote \f$ M = \text{MASKING_OFFSET} \f$ and \f$ N =
 * NUM_SMALL_IPA_EVALUTIONS\f$. Given an evaluation challenge \f$ x \f$ and
 * a batching challenge \f$v\f$, compute the polynomial whose  coefficients
 * are given by the vector \f$ (1, x , x^2 , \ldots, x^{M - 1 }, v\cdot x,
 * \ldots, v^{N-1} \cdot x^{M-2}, v^{N-1}, \cdot x^{M-1}, 0, \ldots, 0)\f$
 * in the Lagrange basis over the Small Subgroup.
 *
 * @tparam FF
 * @param evaluation_challenge_x
 * @param batching_challenge_v
 * @param subgroup_size
 * @return std::vector<FF>
 */
template <typename Curve>
std::vector<typename Curve::ScalarField> compute_eccvm_challenge_coeffs(
    const typename Curve::ScalarField& evaluation_challenge_x, const typename Curve::ScalarField& batching_challenge_v)
{
    using FF = typename Curve::ScalarField;
    std::vector<FF> coeffs_lagrange_basis(Curve::SUBGROUP_SIZE, FF{ 0 });

    coeffs_lagrange_basis[0] = FF{ 1 };

    FF v_power = FF{ 1 };
    for (size_t poly_idx = 0; poly_idx < NUM_SMALL_IPA_EVALUATIONS; poly_idx++) {
        const size_t start = 1 + MASKING_OFFSET * poly_idx;
        coeffs_lagrange_basis[start] = v_power;

        for (size_t idx = start + 1; idx < start + MASKING_OFFSET; idx++) {
            coeffs_lagrange_basis[idx] = coeffs_lagrange_basis[idx - 1] * evaluation_challenge_x;
        }

        v_power *= batching_challenge_v;
    }

    return coeffs_lagrange_basis;
}
} // namespace bb
