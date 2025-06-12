// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/commitment_schemes/utils/test_settings.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/eccvm/eccvm_translation_data.hpp"
#include "barretenberg/ext/starknet/stdlib_circuit_builders/ultra_starknet_zk_flavor.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_zk_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_zk_flavor.hpp"
#include "barretenberg/sumcheck/zk_sumcheck_data.hpp"
#include "barretenberg/translator_vm/translator_flavor.hpp"

#include <array>
#include <vector>

namespace bb {

// Default constructor to initialize all common members.
template <typename Flavor>
SmallSubgroupIPAProver<Flavor>::SmallSubgroupIPAProver(const std::shared_ptr<typename Flavor::Transcript>& transcript,
                                                       typename Flavor::CommitmentKey& commitment_key)
    : interpolation_domain{}
    , concatenated_polynomial(MASKED_CONCATENATED_WITNESS_LENGTH)
    , concatenated_lagrange_form(SUBGROUP_SIZE)
    , challenge_polynomial(SUBGROUP_SIZE)
    , challenge_polynomial_lagrange(SUBGROUP_SIZE)
    , grand_sum_polynomial_unmasked(SUBGROUP_SIZE)
    , grand_sum_polynomial(MASKED_GRAND_SUM_LENGTH)
    , grand_sum_identity_polynomial(GRAND_SUM_IDENTITY_LENGTH)
    , grand_sum_identity_quotient(QUOTIENT_LENGTH)
    , transcript(transcript)
{
    // Reallocate the commitment key if necessary. This is an edge case with SmallSubgroupIPA since it has
    // polynomials that may exceed the circuit size.
    if (commitment_key.dyadic_size < MASKED_GRAND_SUM_LENGTH) {
        commitment_key = typename Flavor::CommitmentKey(MASKED_GRAND_SUM_LENGTH);
    };
    this->commitment_key = commitment_key;
};

/**
 * @brief Construct SmallSubgroupIPAProver from a ZKSumcheckData object and a sumcheck evaluation challenge.
 *
 * @param zk_sumcheck_data Contains the witness polynomial \f$ G \f$ called Libra concatenated polynomial.
 * @param multivariate_challenge \f$ (u_0,\ldots, u_{d-1})\f$, needed to compute the challenge polynomial \f$ F \f$.
 * @param claimed_inner_product The inner product of \f$ G \f$ and the challenge polynomial \f$ F \f$.
 */
template <typename Flavor>
SmallSubgroupIPAProver<Flavor>::SmallSubgroupIPAProver(ZKSumcheckData<Flavor>& zk_sumcheck_data,
                                                       const std::vector<FF>& multivariate_challenge,
                                                       const FF claimed_inner_product,
                                                       const std::shared_ptr<typename Flavor::Transcript>& transcript,
                                                       typename Flavor::CommitmentKey& commitment_key)
    : SmallSubgroupIPAProver(transcript, commitment_key)
{
    this->claimed_inner_product = claimed_inner_product;
    interpolation_domain = zk_sumcheck_data.interpolation_domain;
    concatenated_polynomial = zk_sumcheck_data.libra_concatenated_monomial_form;
    concatenated_lagrange_form = zk_sumcheck_data.libra_concatenated_lagrange_form;

    label_prefix = "Libra:";
    // Extract the evaluation domain computed by ZKSumcheckData
    if constexpr (std::is_same_v<Curve, curve::BN254>) {
        bn_evaluation_domain = std::move(zk_sumcheck_data.bn_evaluation_domain);
    }

    // Construct the challenge polynomial in Lagrange basis, compute its monomial coefficients
    compute_challenge_polynomial(multivariate_challenge);
}

/**
 * @brief Construct SmallSubgroupIPAProver from a TranslationData object and two challenges. It is Grumkin-specific.
 *
 * @param translation_data Contains the witness polynomial \f$ G \f$ which is a concatenation of last
 * NUM_DISABLED_ROWS_IN_SUMCHECK coefficients of NUM_TRANSLATION_EVALUATIONS polynomials fed to TranslationData
 * constructor.
 * @param evaluation_challenge_x A challenge used to evaluate the univariates fed to TranslationData.
 * @param batching_challenge_v A challenge used to batch the evaluations at \f$ x \f$. Both challenges are required to
 * compute the challenge polynomial \f$ F \f$.
 * @param claimed_inner_product The inner product of \f$ G \f$ and the challenge polynomial \f$ F \f$.
 */
template <typename Flavor>
SmallSubgroupIPAProver<Flavor>::SmallSubgroupIPAProver(TranslationData<typename Flavor::Transcript>& translation_data,
                                                       const FF evaluation_challenge_x,
                                                       const FF batching_challenge_v,
                                                       const std::shared_ptr<typename Flavor::Transcript>& transcript,
                                                       typename Flavor::CommitmentKey& commitment_key)
    : SmallSubgroupIPAProver(transcript, commitment_key)

{
    // TranslationData is Grumpkin-specific
    if constexpr (IsAnyOf<Flavor, ECCVMFlavor, GrumpkinSettings>) {
        label_prefix = "Translation:";
        interpolation_domain = translation_data.interpolation_domain;
        concatenated_polynomial = translation_data.masked_concatenated_polynomial;
        concatenated_lagrange_form = translation_data.concatenated_polynomial_lagrange;

        // Construct the challenge polynomial in Lagrange basis, compute its monomial coefficients
        compute_eccvm_challenge_polynomial(evaluation_challenge_x, batching_challenge_v);

        // The prover computes the inner product of the challenge polynomial and the concatenation of
        // the masking terms. This value is used to "denoise" the masked batched evaluation of
        // `translation_polynomials` contained in `translation_data`.
        claimed_inner_product = compute_claimed_translation_inner_product(translation_data);
        transcript->send_to_verifier(label_prefix + "masking_term_eval", claimed_inner_product);
    }
}

/**
 * @brief Compute the derived witnesses \f$ A \f$ and \f$ Q \f$ and commit to them.
 * @details
 * 1. Define **grand sum polynomial** \f$ A(X) \f$ by \f$ A_i = \sum_{j=0}^i F_i \cdot G_i \f$, where the coefficients
 * are computed in the Lagrange basis over \f$ H \f$. Note that it is analogous to the grand product polynomial used
 * to prove claims about \f$ \prod_{h\in H} F(h) \cdot G(h) \f$.
 * \f$ A \f$ is uniquely defined by the following properties:
 *    - \f$ A(1) = 0 \f$,
 *    - \f$ A(g^i) = A(g^{i-1}) + F(g^{i-1}) G(g^{i-1}) \f$ for \f$ i = 1, \ldots, |H|-1 \f$.
 * 2. Mask \f$ A(X) \f$ by adding \f$ Z_H(X) R(X) \f$, where \f$ R(X) \f$ is a random polynomial of degree 3.
 * 3. Commit to \f$ A(X) + Z_H(X) \cdot R(X) \f$ and send the commitment to the verifier.
 *
 * ### Grand Sum Identity
 *
 * \f$ A(X) \f$ is honestly constructed, i.e.
 *    - \f$ A_0 = 0\f$,
 *    - \f$ A_{i} = A_{i-1} + F_{i-1} * G_{i-1}\f$ (Lagrange coefficients over \f$ H \f$) for \f$ i = 1,\ldots, |H|\f$
 *    - \f$ A_{|H|} \f$ is equal to the claimed inner product \f$s\f$.
 * if and only if the following identity holds:
 * \f{align}{ L_1(X) A(X) + (X - g^{-1}) (A(g \cdot X) - A(X) -
 * F(X) G(X)) + L_{|H|}(X) (A(X) - s) = Z_H(X) Q(X), \f} where \f$ Q(X) \f$ is the quotient of the left-hand side
 * by \f$ Z_H(X) \f$. The second summand is the translation of the second condition using the fact that the coefficients
 * of \f$ A(gX) \f$ are given by a cyclic shift of the coefficients of \f$ A(X) \f$.
 *
 * The methods of this class allow the prover to compute \f$ A(X) \f$ and \f$ Q(X) \f$.
 *
 * After receiving a random evaluation challenge \f$ r \f$, the prover will send \f$ G(r), A(g\cdot r), A(r), Q(r) \f$
 * to the verifier. In the ZKSumcheckData case, \f$ r \f$ is the Gemini evaluation challenge, and this further part is
 * taken care of by Shplemini. In the TranslationData case, \f$ r \f$ is an evaluation challenge that will be sampled in
 * the translation evaluations sub-protocol of ECCVM.
 */
template <typename Flavor> void SmallSubgroupIPAProver<Flavor>::prove()
{

    // Construct unmasked grand sum polynomial in Lagrange basis, compute its monomial coefficients and mask it
    compute_grand_sum_polynomial();

    // Send masked commitment [A + Z_H * R] to the verifier, where R is of degree 2
    transcript->template send_to_verifier(label_prefix + "grand_sum_commitment",
                                          commitment_key.commit(grand_sum_polynomial));

    // Compute C(X)
    compute_grand_sum_identity_polynomial();

    // Compute Q(X)
    compute_grand_sum_identity_quotient();

    // Send commitment [Q] to the verifier
    transcript->template send_to_verifier(label_prefix + "quotient_commitment",
                                          commitment_key.commit(grand_sum_identity_quotient));
}

/**
 * @brief Computes the challenge polynomial F(X) based on the provided multivariate challenges.
 *
 * This method generates a polynomial in both Lagrange basis and monomial basis from Sumcheck's
 * multivariate_challenge vector. The result is stored in `challenge_polynomial_lagrange` and
 * `challenge_polynomial`. The former is re-used in the computation of the grand sum polynomial A(X)
 *
 * ### Lagrange Basis
 * The Lagrange basis polynomial is constructed as follows:
 * - Initialize the first coefficient as `1`.
 * - For each challenge index `idx_poly` in the `CONST_PROOF_SIZE_LOG_N` range, compute a sequence of coefficients
 *   recursively as powers of the corresponding multivariate challenge.
 * - Store these coefficients in `coeffs_lagrange_basis`.
 * More explicitly,
 * \f$ F = (1 , 1 , u_0, \ldots, u_0^{\text{LIBRA_UNIVARIATES_LENGTH}-1}, \ldots, 1, u_{D-1}, \ldots,
 * u_{D-1}^{\text{LIBRA_UNIVARIATES_LENGTH}-1} ) \f$ in the Lagrange basis over \f$ H \f$.
 *
 * ### Monomial Basis
 * If the curve is not `BN254`, the monomial polynomial is constructed directly using un-optimized Lagrange
 * interpolation. Otherwise, an IFFT is used to convert the Lagrange basis coefficients into monomial basis
 * coefficients.
 *
 * @param multivariate_challenge A vector of field elements used to compute the challenge polynomial.
 */
template <typename Flavor>
void SmallSubgroupIPAProver<Flavor>::compute_challenge_polynomial(const std::vector<FF>& multivariate_challenge)
{
    std::vector<FF> coeffs_lagrange_basis =
        compute_challenge_polynomial_coeffs<typename Flavor::Curve>(multivariate_challenge);

    challenge_polynomial_lagrange = Polynomial<FF>(coeffs_lagrange_basis);

    // Compute monomial coefficients
    challenge_polynomial =
        compute_monomial_coefficients(coeffs_lagrange_basis, interpolation_domain, bn_evaluation_domain);
}
/**
 * @brief Compute a (public) challenge polynomial from the evaluation and batching challenges.
 * @details While proving the batched evaluation of the masking term used to blind the ECCVM Transcript wires, the
 * prover needs to compute the polynomial whose coefficients in the Lagrange basis over the small subgroup are given
 * by \f$ (1, x , \ldots, x^{\text{NUM_DISABLED_ROWS_IN_SUMCHECK} - 1}, v, x \cdot v, \ldots,
 * x^{\text{NUM_DISABLED_ROWS_IN_SUMCHECK} - 1}\cdot v^{\text{NUM_TRANSLATION_EVALUATIONS} - 1}, 0, \ldots, 0) \f$.
 * @param evaluation_challenge_x
 * @param batching_challenge_v
 */
template <typename Flavor>
void SmallSubgroupIPAProver<Flavor>::compute_eccvm_challenge_polynomial(const FF evaluation_challenge_x,
                                                                        const FF batching_challenge_v)
{

    std::vector<FF> coeffs_lagrange_basis =
        compute_eccvm_challenge_coeffs<typename Flavor::Curve>(evaluation_challenge_x, batching_challenge_v);

    challenge_polynomial_lagrange = Polynomial<FF>(coeffs_lagrange_basis);

    // Compute monomial coefficients
    challenge_polynomial = Polynomial<FF>(interpolation_domain, coeffs_lagrange_basis, SUBGROUP_SIZE);
}
/**
 * @brief Computes the grand sum polynomial \f$ A(X) \f$.
 *
 * #### Lagrange Basis
 * - First, we recursively compute the coefficients of the unmasked grand sum polynomial, i.e. we set the first
 * coefficient to `0`.
 * - For each i, the coefficient is updated as:
 *   \f$ \texttt{grand_sum_lagrange_coeffs} (g^{i}) =
 *        \texttt{grand_sum_lagrange_coeffs} (g^{i-1}) +
 *        \texttt{challenge_polynomial_lagrange[prev_idx]} (g^{i-1}) \cdot
 *        \texttt{concatenated_lagrange_form[prev_idx]} (g^{i-1}) \f$
 * #### Masking Term
 * - A random polynomial of degree 2 is generated and added to the Grand Sum Polynomial.
 * - The masking term is applied as \f$ Z_H(X) \cdot \texttt{masking_term} \f$, where \f$ Z_H(X) \f$ is the
 * vanishing polynomial.
 *
 */
template <typename Flavor> void SmallSubgroupIPAProver<Flavor>::compute_grand_sum_polynomial()
{
    grand_sum_lagrange_coeffs[0] = 0;

    // Compute the grand sum coefficients recursively
    for (size_t idx = 1; idx < SUBGROUP_SIZE; idx++) {
        size_t prev_idx = idx - 1;
        grand_sum_lagrange_coeffs[idx] =
            grand_sum_lagrange_coeffs[prev_idx] +
            challenge_polynomial_lagrange.at(prev_idx) * concatenated_lagrange_form.at(prev_idx);
    };

    //  Get the coefficients in the monomial basis
    grand_sum_polynomial_unmasked =
        compute_monomial_coefficients(grand_sum_lagrange_coeffs, interpolation_domain, bn_evaluation_domain);

    //  Generate random masking_term of degree 2
    auto masking_term = bb::Univariate<FF, GRAND_SUM_MASKING_TERM_LENGTH>::get_random();

    grand_sum_polynomial += grand_sum_polynomial_unmasked;
    // Since Z_H(X) = X^|H| - 1, its product with the masking term R(X) is given by X^{H}*R(X) - R(X). Therefore
    // to mask A, we subtract the coefficients of R from the first GRAND_SUM_MASKING_TERM_LENGTH coefficients
    // of A and by set the coefficients A_{i+SUBGROUP_SIZE} to be equal to R_i
    for (size_t idx = 0; idx < GRAND_SUM_MASKING_TERM_LENGTH; idx++) {
        grand_sum_polynomial.at(idx) -= masking_term.value_at(idx);
        grand_sum_polynomial.at(idx + SUBGROUP_SIZE) += masking_term.value_at(idx);
    }
};

/**
 * @brief   Compute \f$ L_1(X) * A(X) + (X - 1/g) (A(gX) - A(X) - F(X) G(X)) + L_{|H|}(X)(A(X) - s) \f$, where \f$ g
 * \f$ is the fixed generator of \f$ H \f$.
 *
 */
template <typename Flavor> void SmallSubgroupIPAProver<Flavor>::compute_grand_sum_identity_polynomial()
{
    // Compute shifted grand sum polynomial A(gX)
    Polynomial<FF> shifted_grand_sum(MASKED_GRAND_SUM_LENGTH);

    for (size_t idx = 0; idx < MASKED_GRAND_SUM_LENGTH; idx++) {
        shifted_grand_sum.at(idx) = grand_sum_polynomial.at(idx) * interpolation_domain[idx % SUBGROUP_SIZE];
    }

    const auto& [lagrange_first, lagrange_last] =
        compute_lagrange_first_and_last(interpolation_domain, bn_evaluation_domain);

    // Compute -F(X)*G(X), the negated product of challenge_polynomial and concatenated_polynomial
    for (size_t i = 0; i < MASKED_CONCATENATED_WITNESS_LENGTH; ++i) {
        for (size_t j = 0; j < SUBGROUP_SIZE; ++j) {
            grand_sum_identity_polynomial.at(i + j) -= concatenated_polynomial.at(i) * challenge_polynomial.at(j);
        }
    }

    // Compute - F(X) * G(X) + A(gX) - A(X)
    for (size_t idx = 0; idx < MASKED_GRAND_SUM_LENGTH; idx++) {
        grand_sum_identity_polynomial.at(idx) += shifted_grand_sum.at(idx) - grand_sum_polynomial.at(idx);
    }

    // Mutiply - F(X) * G(X) + A(gX) - A(X) by X-g:
    // 1. Multiply by X
    for (size_t idx = GRAND_SUM_IDENTITY_LENGTH - 1; idx > 0; idx--) {
        grand_sum_identity_polynomial.at(idx) = grand_sum_identity_polynomial.at(idx - 1);
    }
    grand_sum_identity_polynomial.at(0) = FF(0);
    // 2. Subtract  1/g(A(gX) - A(X) - F(X) * G(X))
    for (size_t idx = 0; idx < GRAND_SUM_IDENTITY_LENGTH - 1; idx++) {
        grand_sum_identity_polynomial.at(idx) -=
            grand_sum_identity_polynomial.at(idx + 1) * interpolation_domain[SUBGROUP_SIZE - 1];
    }

    // Add (L_1 + L_{|H|}) * A(X) to the result
    for (size_t i = 0; i < MASKED_GRAND_SUM_LENGTH; ++i) {
        for (size_t j = 0; j < SUBGROUP_SIZE; ++j) {
            grand_sum_identity_polynomial.at(i + j) +=
                grand_sum_polynomial.at(i) * (lagrange_first.at(j) + lagrange_last.at(j));
        }
    }
    // Subtract L_{|H|} * s
    for (size_t idx = 0; idx < SUBGROUP_SIZE; idx++) {
        grand_sum_identity_polynomial.at(idx) -= lagrange_last.at(idx) * claimed_inner_product;
    }
}
/**
 * @brief Compute monomial coefficients of the first and last Lagrange polynomials
 *
 * @param interpolation_domain
 * @param bn_evaluation_domain
 * @return std::array<Polynomial<FF>, 2>
 */
template <typename Flavor>
std::array<Polynomial<typename Flavor::Curve::ScalarField>, 2> SmallSubgroupIPAProver<
    Flavor>::compute_lagrange_first_and_last(const std::array<FF, SUBGROUP_SIZE>& interpolation_domain,
                                             const EvaluationDomain<FF>& bn_evaluation_domain)
{
    // Compute the monomial coefficients of L_1
    std::array<FF, SUBGROUP_SIZE> lagrange_coeffs;
    lagrange_coeffs[0] = FF(1);
    for (size_t idx = 1; idx < SUBGROUP_SIZE; idx++) {
        lagrange_coeffs[idx] = FF(0);
    }

    Polynomial<FF> lagrange_first_monomial =
        compute_monomial_coefficients(lagrange_coeffs, interpolation_domain, bn_evaluation_domain);

    // Compute the monomial coefficients of L_{|H|}, the last Lagrange polynomial
    lagrange_coeffs[0] = FF(0);
    lagrange_coeffs[SUBGROUP_SIZE - 1] = FF(1);

    Polynomial<FF> lagrange_last_monomial =
        compute_monomial_coefficients(lagrange_coeffs, interpolation_domain, bn_evaluation_domain);

    return { lagrange_first_monomial, lagrange_last_monomial };
}

/** @brief Efficiently compute the quotient of the grand sum identity polynomial \f$ C \f$ by  \f$ Z_H = X ^ { | H | } -
 * 1\f$.
 */
template <typename Flavor> void SmallSubgroupIPAProver<Flavor>::compute_grand_sum_identity_quotient()
{

    auto remainder = grand_sum_identity_polynomial;
    for (size_t idx = GRAND_SUM_IDENTITY_LENGTH - 1; idx >= SUBGROUP_SIZE; idx--) {
        grand_sum_identity_quotient.at(idx - SUBGROUP_SIZE) = remainder.at(idx);
        remainder.at(idx - SUBGROUP_SIZE) += remainder.at(idx);
    }
}

/**
 * @brief For test purposes: Compute the sum of the Libra constant term and Libra univariates evaluated at Sumcheck
 * challenges.
 *
 * @param zk_sumcheck_data Contains Libra constant term and scaled Libra univariates
 * @param multivariate_challenge Sumcheck challenge
 * @param log_circuit_size
 */
template <typename Flavor>
typename Flavor::Curve::ScalarField SmallSubgroupIPAProver<Flavor>::compute_claimed_inner_product(
    ZKSumcheckData<Flavor>& zk_sumcheck_data,
    const std::vector<FF>& multivariate_challenge,
    const size_t& log_circuit_size)
{
    const FF libra_challenge_inv = zk_sumcheck_data.libra_challenge.invert();
    // Compute claimed inner product similarly to the SumcheckProver
    FF claimed_inner_product = FF{ 0 };
    size_t idx = 0;
    for (const auto& univariate : zk_sumcheck_data.libra_univariates) {
        claimed_inner_product += univariate.evaluate(multivariate_challenge[idx]);
        idx++;
    }
    // Libra Univariates are mutiplied by the Libra challenge in setup_auxiliary_data(), needs to be undone
    claimed_inner_product *= libra_challenge_inv / FF(1 << (log_circuit_size - 1));
    claimed_inner_product += zk_sumcheck_data.constant_term;
    return claimed_inner_product;
}

/**
 * @brief For test purposes: compute the batched evaluation of the last NUM_DISABLED_ROWS_IN_SUMCHECK rows of the ECCVM
 * transcript polynomials `Op`, `Px`, `Py`, `z1`, `z2`.
 *
 * @param translation_data Contains concatenated ECCVM Transcript polynomials.
 * @param evaluation_challenge_x We evaluate the transcript polynomials at x as univariates.
 * @param batching_challenge_v The evaluations at x are batched using v.
 */
template <typename Flavor>
typename Flavor::Curve::ScalarField SmallSubgroupIPAProver<Flavor>::compute_claimed_translation_inner_product(
    TranslationData<typename Flavor::Transcript>& translation_data)
{
    FF claimed_inner_product{ 0 };
    if constexpr (IsAnyOf<Flavor, ECCVMFlavor, GrumpkinSettings>) {
        for (size_t idx = 0; idx < SUBGROUP_SIZE; idx++) {
            claimed_inner_product +=
                translation_data.concatenated_polynomial_lagrange.at(idx) * challenge_polynomial_lagrange.at(idx);
        }
    }
    return claimed_inner_product;
}

/**
 * @brief Given a vector of coefficients of a polynomial in the Lagrange basis over \f$ H \f$, compute its coefficients
 * in the monomial basis. We use IFFT over BN254 ScalarField and a generic method compute_efficient_interpolation, which
 * has quadratic complexity and has to be used with caution.
 *
 */
template <typename Flavor>
Polynomial<typename Flavor::Curve::ScalarField> SmallSubgroupIPAProver<Flavor>::compute_monomial_coefficients(
    std::span<FF> lagrange_coeffs,
    const std::array<FF, SUBGROUP_SIZE>& interpolation_domain,
    const EvaluationDomain<FF>& bn_evaluation_domain)
{
    using FF = typename Flavor::Curve::ScalarField;
    if constexpr (!std::is_same_v<typename Flavor::Curve, curve::BN254>) {
        return Polynomial<FF>(interpolation_domain, lagrange_coeffs, SUBGROUP_SIZE);
    } else {
        std::vector<FF> lagrange_last_ifft(SUBGROUP_SIZE);
        polynomial_arithmetic::ifft<FF>(lagrange_coeffs.data(), lagrange_last_ifft.data(), bn_evaluation_domain);
        return Polynomial<FF>(lagrange_last_ifft);
    }
}

// Instantiate with ZK Flavors
template class SmallSubgroupIPAProver<ECCVMFlavor>;
template class SmallSubgroupIPAProver<TranslatorFlavor>;
template class SmallSubgroupIPAProver<MegaZKFlavor>;
template class SmallSubgroupIPAProver<UltraZKFlavor>;
template class SmallSubgroupIPAProver<UltraKeccakZKFlavor>;
#ifdef STARKNET_GARAGA_FLAVORS
template class SmallSubgroupIPAProver<UltraStarknetZKFlavor>;
#endif

// Instantiations used in tests
template class SmallSubgroupIPAProver<BN254Settings>;
template class SmallSubgroupIPAProver<GrumpkinSettings>;

} // namespace bb
