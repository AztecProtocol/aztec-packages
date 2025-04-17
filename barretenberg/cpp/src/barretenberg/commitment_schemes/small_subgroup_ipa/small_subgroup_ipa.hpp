// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/utils/test_settings.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/eccvm/eccvm_translation_data.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/sumcheck/zk_sumcheck_data.hpp"
#include "small_subgroup_ipa_utils.hpp"

#include <array>
#include <vector>

namespace bb {
/**
 * @brief A Curve-agnostic ZK protocol to prove inner products of small vectors.
 *
 * @details Implementation of the protocol described in [Ariel's HackMD](https://hackmd.io/xYHn1qqvQjey1yJutcuXdg).
 * Although we could in principle prove statements about a general witness polynomial \f$ G \f$ and a challenge
 * polynomial \f$ F \f$ and a claim that \f$ \langle F, G \rangle = s \f$, we specialize to the following cases:
 *
 * - \f$ G \f$ is obtained by concatenating Libra polynomials used in ZK-Sumcheck. \f$ F \f$ is a concatenation of the
 *   consecutive powers of the sumcheck challenge entries. See details below and in the corresponding method's docs.
 *
 * - \f$ G \f$ is a concatenation of last NUM_DISABLED_ROWS_IN_SUMCHECK coefficients of NUM_TRANSLATION_EVALUATIONS
 * polynomials fed to TranslationData constructor. \f$ F \f$ consists of products \f$ x^i \cdot v^j \f$. See details
 * below in the corresponding method's docs.
 *
 * ## Constructing SmallSubgroupIPAProver
 *
 * In both cases, we extract the witness polynomial \f$ G \f$ from the input. The main difference is in the construction
 * of the challenge polynomial \f$ F \f$. Once \f$ F\f$ is computed by the corresponding method, we could call the
 * common \ref prove method on an object of this class.
 *
 * ### ZKSumcheckData Specifics
 *
 * Let \f$ G \f$ be the masked concatenated Libra polynomial. Without masking, it is defined by concatenating Libra
 * constant term and the monomial coefficients of the Libra univariates \f$ g_i \f$ in the Lagrange basis over \f$ H
 * \f$. More explicitly, unmasked concatenated Libra polynomial is given by the following vector of coefficients:
 * \f{align}{
 *   \big( \text{libra_constant_term},  g_{0,0}, \ldots, g_{0,
 *   \text{LIBRA_UNIVARIATES_LENGTH} - 1}, \ldots, g_{d-1, 0}, \ldots, g_{d-1,  \text{LIBRA_UNIVARIATES_LENGTH} - 1}
 * \big) \f}, where \f$ d = \text{log_circuit_size}\f$. It is masked by adding \f$ (r_0 + r_1 X) Z_{H}(X)\f$, where \f$
 * Z_H(X) \f$ is the vanishing polynomial for \f$ H \f$.
 *
 * ### TranslationData Specifics
 *
 * Let \f$ G \f$ be the concatenated polynomial from the TranslationData class. Without masking, it is defined by
 * concatenating NUM_TRANSLATION_EVALUATIONS polynomials of size NUM_DISABLED_ROWS_IN_SUMCHECK in the Lagrange
 * basis over \f$ H \f$. It is masked by adding \f$ (r_0 + r_1 X) Z_{H}(X)\f$, where \f$ Z_H(X) \f$ is the vanishing
 * polynomial for \f$ H \f$.
 *
 * ### This class enables the prover to:
 *
 * - Compute the derived witnesses \f$ A \f$ (= Grand Sum Polynomial) and \f$ Q \f$ (= Grand Sum Identity Quotient)
 * required to prove the correctness of the claimed inner product while preserving ZK. For details, see \ref prove
 * method docs. Note that the concatenated polynomial \f$ G \f$ is committed to during the construction of the
 * ZKSumcheckData or TranslationData object.
 *
 */
template <typename Flavor> class SmallSubgroupIPAProver {
    using Curve = typename Flavor::Curve;
    using FF = typename Curve::ScalarField;
    // The size of a multiplicative subgroup in the ScalarField of a curve
    static constexpr size_t SUBGROUP_SIZE = Curve::SUBGROUP_SIZE;

    // A masking term of length 2 (degree 1) is required to mask [G] and G(r).
    static constexpr size_t WITNESS_MASKING_TERM_LENGTH = 2;
    static constexpr size_t MASKED_CONCATENATED_WITNESS_LENGTH = SUBGROUP_SIZE + WITNESS_MASKING_TERM_LENGTH;

    // A masking term of length 3 (degree 2) is required to mask [A], A(r), and A(g*r)
    static constexpr size_t GRAND_SUM_MASKING_TERM_LENGTH = 3;
    static constexpr size_t MASKED_GRAND_SUM_LENGTH = SUBGROUP_SIZE + GRAND_SUM_MASKING_TERM_LENGTH;

    // Length of the big sum identity polynomial C. It is equal to the length of the highest degree term X * F(X) * G(X)
    static constexpr size_t GRAND_SUM_IDENTITY_LENGTH = MASKED_CONCATENATED_WITNESS_LENGTH + SUBGROUP_SIZE;

    // Length of the big sum identity quotient Q(X) = length(C) - length(Z_H) + 1
    static constexpr size_t QUOTIENT_LENGTH = GRAND_SUM_IDENTITY_LENGTH - SUBGROUP_SIZE;

    // The length of a random polynomial masking Prover's Sumcheck Univariates. In the case of BN254-based Flavors, we
    // send the coefficients of the univariates, hence we choose these value to be the max sumcheck univariate length
    // over Translator, Ultra, and Mega. In ECCVM, the Sumcheck prover will commit to its univariates, which reduces the
    // required length from 23 to 3.
    static constexpr size_t LIBRA_UNIVARIATES_LENGTH = Curve::LIBRA_UNIVARIATES_LENGTH;
    // Fixed generator of H
    static constexpr FF subgroup_generator = Curve::subgroup_generator;

    // Interpolation domain {1, g, \ldots, g^{SUBGROUP_SIZE - 1}} used by ECCVM
    std::array<FF, SUBGROUP_SIZE> interpolation_domain;
    // We use IFFT over BN254 scalar field
    EvaluationDomain<FF> bn_evaluation_domain;

    // Monomial coefficients of the concatenated polynomial extracted from ZKSumcheckData or TranslationData
    Polynomial<FF> concatenated_polynomial;
    // Lagrange coefficeints of the concatenated polynomial
    Polynomial<FF> concatenated_lagrange_form;

    // The polynomial obtained by concatenated powers of sumcheck challenges or the productcs of
    // `evaluation_challenge_x` and `batching_challenge_v`
    Polynomial<FF> challenge_polynomial;
    Polynomial<FF> challenge_polynomial_lagrange;

    // Grand sum polynomial A(X)
    Polynomial<FF> grand_sum_polynomial_unmasked;
    Polynomial<FF> grand_sum_polynomial;
    std::array<FF, SUBGROUP_SIZE> grand_sum_lagrange_coeffs;

    // The RHS of the key identity, denoted C(X) in the HackMD
    Polynomial<FF> grand_sum_identity_polynomial;

    // Quotient of the grand sum identity polynomial C(X) by the vanishing polynomial Z_H = X^{|H|} - 1
    Polynomial<FF> grand_sum_identity_quotient;

    // Either "Translation:" or "Libra:".
    std::string label_prefix;

    std::shared_ptr<typename Flavor::Transcript> transcript;
    std::shared_ptr<typename Flavor::CommitmentKey> commitment_key;

  public:
    // The SmallSubgroupIPA claim
    FF claimed_inner_product{ 0 };

    // Default constructor to initialize all polynomials, transcript, and commitment key.
    SmallSubgroupIPAProver(const std::shared_ptr<typename Flavor::Transcript>& transcript,
                           std::shared_ptr<typename Flavor::CommitmentKey>& commitment_key);

    // Construct prover from ZKSumcheckData. Used by all ZK Provers.
    SmallSubgroupIPAProver(ZKSumcheckData<Flavor>& zk_sumcheck_data,
                           const std::vector<FF>& multivariate_challenge,
                           const FF claimed_inner_product,
                           const std::shared_ptr<typename Flavor::Transcript>& transcript,
                           std::shared_ptr<typename Flavor::CommitmentKey>& commitment_key);

    // Construct prover from TranslationData. Used by ECCVMProver.
    SmallSubgroupIPAProver(TranslationData<typename Flavor::Transcript>& translation_data,
                           const FF evaluation_challenge_x,
                           const FF batching_challenge_v,
                           const std::shared_ptr<typename Flavor::Transcript>& transcript,
                           std::shared_ptr<typename Flavor::CommitmentKey>& commitment_key);

    void prove();

    void compute_challenge_polynomial(const std::vector<FF>& multivariate_challenge);

    void compute_eccvm_challenge_polynomial(const FF evaluation_challenge_x, const FF batching_challenge_v);

    void compute_grand_sum_polynomial();

    void compute_grand_sum_identity_polynomial();

    std::array<Polynomial<FF>, 2> static compute_lagrange_first_and_last(
        const std::array<FF, SUBGROUP_SIZE>& interpolation_domain, const EvaluationDomain<FF>& bn_evaluation_domain);

    void compute_grand_sum_identity_quotient();

    static FF compute_claimed_inner_product(ZKSumcheckData<Flavor>& zk_sumcheck_data,
                                            const std::vector<FF>& multivariate_challenge,
                                            const size_t& log_circuit_size);

    FF compute_claimed_translation_inner_product(TranslationData<typename Flavor::Transcript>& translation_data);

    Polynomial<FF> static compute_monomial_coefficients(std::span<FF> lagrange_coeffs,
                                                        const std::array<FF, SUBGROUP_SIZE>& interpolation_domain,
                                                        const EvaluationDomain<FF>& bn_evaluation_domain);

    // Getter to pass the witnesses to ShpleminiProver. Grand sum polynomial appears twice, because it is evaluated at 2
    // points (and is small).
    std::array<bb::Polynomial<FF>, NUM_SMALL_IPA_EVALUATIONS> get_witness_polynomials() const
    {
        return { concatenated_polynomial, grand_sum_polynomial, grand_sum_polynomial, grand_sum_identity_quotient };
    }
    // Getters for test purposes
    const Polynomial<FF>& get_batched_polynomial() const { return grand_sum_identity_polynomial; }
    const Polynomial<FF>& get_challenge_polynomial() const { return challenge_polynomial; }

    std::array<FF, NUM_SMALL_IPA_EVALUATIONS> evaluation_points(const FF& small_ipa_evaluation_challenge)
    {
        return compute_evaluation_points(small_ipa_evaluation_challenge, Curve::subgroup_generator);
    }

    std::array<std::string, NUM_SMALL_IPA_EVALUATIONS> evaluation_labels()
    {
        return get_evaluation_labels(label_prefix);
    };
};

/*!
 * @brief Verifies the consistency of polynomial evaluations provided by the
 * the prover.
 *
 * @details
 * Given a subgroup of \f$ \mathbb{F}^\ast \f$, its generator \f$ g\f$, this function checks whether the following
 * equation holds: \f[ L_1(r) A(r) + (r - g^{-1}) \left( A(g*r) - A(r) - F(r) G(r) \right) + L_{|H|}(r) \left( A(r) - s
 * \right) = T(r) Z_H(r) \f]
 * where the following evaluations are sent by the prover:
 * - \f$ A(r), A(g\cdot r) \f$ are the evaluations of the "grand sum polynomial"
 * - \f$ G(r) \f$ is the evaluation of the witness polynomial
 * - \f$ Q(r) \f$ is the evaluation of the quotient of the big sum identity polynomial by the vanishing polynomial for
 * \f$H\f$; and the following  evaluations are computed by the verifier
 * - \f$ L_1(r) \f$ and \f$ L_{|H|}(r) \f$ are the evaluations of Lagrange polynomials corresponding to \f$ 1 \f$ and
 * \f$ g^{-1} \f$.
 * - \f$ F(r) \f$ is the evaluation of a public polynomial formed from the challenges.
 * - \f$ Z_H(r) \f$ is the vanishing polynomial \f$ X^{|H|} - 1\f$  evaluated at the challenge point.
 *
 */
template <typename Curve> class SmallSubgroupIPAVerifier {
    using FF = typename Curve::ScalarField;

    static constexpr size_t SUBGROUP_SIZE = Curve::SUBGROUP_SIZE;

    // The verifier has to evaluate 3 polynomials on its own, namely, the challenge polynomial F, Lagrange first
    // L_1, and Lagrange last L_{H}.
    static constexpr size_t NUM_BARYCENTRIC_EVALUATIONS = 3;

    // The length of a random polynomial masking Prover's Sumcheck Univariates. In the case of BN254-based Flavors, we
    // send the coefficients of the univariates, hence we choose these value to be the max sumcheck univariate length
    // over Translator, UltraZK, and MegaZK. In ECCVM, the Sumcheck prover will commit to its univariates, which reduces
    // the required length from 23 to 3.
    static constexpr size_t LIBRA_UNIVARIATES_LENGTH = Curve::LIBRA_UNIVARIATES_LENGTH;

  public:
    /**
     * @brief Generic consistency check agnostic to challenge polynomial \f$ F\f$.
     *
     * @param small_ipa_evaluations \f$ G(r) \f$ , \f$ A(g* r) \f$, \f$ A(r) \f$ , \f$ Q(r)\f$.
     * @param small_ipa_eval_challenge
     * @param challenge_polynomial The polynomial \f$ F \f$ that the verifier computes and evaluates on its own.
     * @param inner_product_eval_claim \f$ <F,G> \f$ where the polynomials are treated as vectors of coefficients (in
     * Lagrange basis).
     * @param vanishing_poly_eval \f$ Z_H(r) \f$
     * @return true
     * @return false
     */
    static bool check_consistency(const std::array<FF, NUM_SMALL_IPA_EVALUATIONS>& small_ipa_evaluations,
                                  const FF& small_ipa_eval_challenge,
                                  const std::vector<FF>& challenge_polynomial,
                                  const FF& inner_product_eval_claim,
                                  const FF& vanishing_poly_eval)
    {
        // Check if Z_H(r) = 0.
        handle_edge_cases(vanishing_poly_eval);
        // Compute evaluations at r of F, Lagrange first, and Lagrange last for the fixed small subgroup
        auto [challenge_poly, lagrange_first, lagrange_last] = compute_batched_barycentric_evaluations(
            challenge_polynomial, small_ipa_eval_challenge, vanishing_poly_eval);

        const FF& concatenated_at_r = small_ipa_evaluations[0];
        const FF& grand_sum_shifted_eval = small_ipa_evaluations[1];
        const FF& grand_sum_eval = small_ipa_evaluations[2];
        const FF& quotient_eval = small_ipa_evaluations[3];

        // Compute the evaluation of L_1(X) * A(X) + (X - 1/g) (A(gX) - A(X) - F(X) G(X)) + L_{|H|}(X)(A(X) - s) -
        // Z_H(X) * Q(X)
        FF diff = lagrange_first * grand_sum_eval;
        diff += (small_ipa_eval_challenge - Curve::subgroup_generator_inverse) *
                (grand_sum_shifted_eval - grand_sum_eval - concatenated_at_r * challenge_poly);
        diff += lagrange_last * (grand_sum_eval - inner_product_eval_claim) - vanishing_poly_eval * quotient_eval;

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
     * concatenation of the last NUM_DISABLED_ROWS_IN_SUMCHECK entries in the NUM_TRANSLATION_EVALUATIONS polynomials.
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
     * @param vanishing_poly_eval \f$ Z_H(r) = r^{\text{SUBGROUP_SIZE}} - 1 \f$.
     */
    static void handle_edge_cases(const FF& vanishing_poly_eval)
    {

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1194). Handle edge cases in PCS
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1186). Insecure pattern.
        bool evaluation_challenge_in_small_subgroup = false;
        if constexpr (Curve::is_stdlib_type) {
            evaluation_challenge_in_small_subgroup = (vanishing_poly_eval.get_value() == FF(0).get_value());
        } else {
            evaluation_challenge_in_small_subgroup = (vanishing_poly_eval == FF(0));
        }
        // The probability of this event is negligible but it has to be processed correctly
        if (evaluation_challenge_in_small_subgroup) {
            throw_or_abort("Evaluation challenge is in the SmallSubgroup.");
        }
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
     * @param r Evaluation point, we are using the Gemini evaluation challenge
     * @param inverse_root_of_unity Inverse of the generator of the subgroup H
     * @return std::array<FF, NUM_BARYCENTRIC_EVALUATIONS>
     */
    static std::array<FF, NUM_BARYCENTRIC_EVALUATIONS> compute_batched_barycentric_evaluations(
        const std::vector<FF>& coeffs, const FF& r, const FF& vanishing_poly_eval)
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

        // Construct the evaluation of the polynomial using its evaluations over H, Lagrange first evaluated at r,
        // Lagrange last evaluated at r
        FF numerator = vanishing_poly_eval * FF(SUBGROUP_SIZE).invert(); // (r^n - 1) / n
        std::array<FF, NUM_BARYCENTRIC_EVALUATIONS> result{
            std::inner_product(coeffs.begin(), coeffs.end(), denominators.begin(), FF(0)),
            denominators[0],
            denominators[SUBGROUP_SIZE - 1]
        };
        std::transform(
            result.begin(), result.end(), result.begin(), [&](FF& denominator) { return denominator * numerator; });
        return result;
    }
    static std::array<FF, NUM_SMALL_IPA_EVALUATIONS> evaluation_points(const FF& small_ipa_evaluation_challenge)
    {
        return compute_evaluation_points<FF>(small_ipa_evaluation_challenge, Curve::subgroup_generator);
    }
    static std::array<std::string, NUM_SMALL_IPA_EVALUATIONS> evaluation_labels(const std::string& label_prefix)
    {
        return get_evaluation_labels(label_prefix);
    };
};

/**
 * @brief Given the sumcheck multivariate challenge \f$ (u_0,\ldots, u_{D-1})\f$, where \f$ D =
 * \text{CONST_PROOF_SIZE_LOG_N}\f$, the verifier has to construct and evaluate the polynomial whose coefficients are
 * given by \f$ (1, u_0, u_0^2, u_1,\ldots, 1, u_{D-1}, u_{D-1}^2) \f$. We spend \f$ D \f$ multiplications to construct
 * the coefficients.
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
        size_t current_idx = 1 + libra_univariates_length * round_idx;
        challenge_polynomial_lagrange[current_idx] = FF(1);
        for (size_t idx = current_idx + 1; idx < current_idx + libra_univariates_length; idx++) {
            // Recursively compute the powers of the challenge up to the length of libra univariates
            challenge_polynomial_lagrange[idx] = challenge_polynomial_lagrange[idx - 1] * challenge;
        }
        round_idx++;
    }
    return challenge_polynomial_lagrange;
}

/**
 * @brief Denote \f$ M = \text{NUM_DISABLED_ROWS_IN_SUMCHECK} \f$ and \f$ N = NUM_SMALL_IPA_EVALUTIONS\f$. Given an
 * evaluation challenge \f$ x \f$ and a batching challenge \f$v\f$, compute the polynomial whose  coefficients are given
 * by the vector \f$ (1, x , x^2 , \ldots, x^{M - 1 }, v\cdot x, \ldots, v^{N-1} \cdot x^{M-2}, v^{N-1}, \cdot x^{M-1},
 * 0, \ldots, 0)\f$ in the Lagrange basis over the Small Subgroup.
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

    FF v_power = FF{ 1 };
    for (size_t poly_idx = 0; poly_idx < NUM_TRANSLATION_EVALUATIONS; poly_idx++) {
        const size_t start = NUM_DISABLED_ROWS_IN_SUMCHECK * poly_idx;
        coeffs_lagrange_basis[start] = v_power;

        for (size_t idx = start + 1; idx < start + NUM_DISABLED_ROWS_IN_SUMCHECK; idx++) {
            coeffs_lagrange_basis[idx] = coeffs_lagrange_basis[idx - 1] * evaluation_challenge_x;
        }

        v_power *= batching_challenge_v;
    }

    return coeffs_lagrange_basis;
}
} // namespace bb
