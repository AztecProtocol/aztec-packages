// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/goblin/translation_evaluations.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

/**
 * @brief A class designed to accept the ECCVM `Transcript Polynomials`, concatenate their masking terms in Lagrange
 * basis over the SmallSubgroup, and commit to the concatenation.
 *
 * @tparam Transcript
 */
template <typename Transcript> class TranslationData {
  public:
    using Flavor = ECCVMFlavor;
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;
    using Commitment = typename Flavor::Commitment;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using Polynomial = typename Flavor::Polynomial;
    static constexpr size_t SUBGROUP_SIZE = Flavor::Curve::SUBGROUP_SIZE;

    // A masking term of length 2 (degree 1) is required to mask [G] and G(r).
    static constexpr size_t WITNESS_MASKING_TERM_LENGTH = 2;
    static constexpr size_t MASKED_CONCATENATED_WITNESS_LENGTH = SUBGROUP_SIZE + WITNESS_MASKING_TERM_LENGTH;

    // M(X) whose Lagrange coefficients are given by (m_0||m_1|| ... || m_{NUM_TRANSLATION_EVALUATIONS-1} || 0 ||...||0)
    Polynomial concatenated_polynomial_lagrange;

    // M(X) + Z_H(X) * R(X), where R(X) is a random polynomial of length = WITNESS_MASKING_TERM_LENGTH
    Polynomial masked_concatenated_polynomial;

    // Interpolation domain {1, g, \ldots, g^{SUBGROUP_SIZE - 1}} required for Lagrange interpolation
    std::array<FF, SUBGROUP_SIZE> interpolation_domain;

    /**
     * @brief Given masked `transcript_polynomials` \f$ \tilde{T}_i(X)  = T_i(X) + X^{n - 1 -
     * \text{NUM_DISABLED_ROWS_IN_SUMCHECK}} \cdot m_i(X) \f$, for \f$ i = 0, \ldots,
     * \text{NUM_TRANSLATION_EVALUATIONS}-1\f$, we extract and concatenate their masking terms \f$ m_i\f$. Let \f$ M(X)
     * \f$ be the polynomial whose first \f$ \text{NUM_DISABLED_ROWS_IN_SUMCHECK}* \text{NUM_TRANSLATION_EVALUATIONS}\f$
     * Lagrange coefficients over \f$ H \f$ are given by the concatenation of \f$ m_i \f$ padded by zeroes. To mask \f$
     * M(X) \f$ and commit to the masked polynomial, we need to compute its coefficients in the monomial basis.
     *
     * An object of this class is fed to the SmallSubgroupIPA prover to establish the claims about the inner product of
     * Lagrange coefficients of \f$ M \f$ against the vectors of the following form.\f$(1, 1, x , x^2 ,
     * x^{\text{NUM_DISABLED_ROWS_IN_SUMCHECK} - 1}, v , v\cdot x ,\ldots, ... , v^{T - 1}, v^{T-1} x , v^{T-1} x^2 ,
     * v^{T-1} x^{\text{NUM_DISABLED_ROWS_IN_SUMCHECK} - 1} ).\f$
     *
     * @param transcript_polynomials
     * @param transcript
     * @param commitment_key
     */
    TranslationData(const RefVector<Polynomial>& transcript_polynomials,
                    const std::shared_ptr<Transcript>& transcript,
                    std::shared_ptr<CommitmentKey>& commitment_key)
        : concatenated_polynomial_lagrange(SUBGROUP_SIZE)
        , masked_concatenated_polynomial(MASKED_CONCATENATED_WITNESS_LENGTH)
    {
        // Reallocate the commitment key if necessary. This is an edge case with SmallSubgroupIPA since it has
        // polynomials that may exceed the circuit size.
        if (commitment_key->dyadic_size < MASKED_CONCATENATED_WITNESS_LENGTH) {
            commitment_key = std::make_shared<typename Flavor::CommitmentKey>(MASKED_CONCATENATED_WITNESS_LENGTH);
        }
        // Create interpolation domain required for Lagrange interpolation
        interpolation_domain[0] = FF{ 1 };

        for (size_t idx = 1; idx < SUBGROUP_SIZE; idx++) {
            interpolation_domain[idx] = interpolation_domain[idx - 1] * Flavor::Curve::subgroup_generator;
        }
        // Concatenate the last entries of the `transcript_polynomials`.
        compute_concatenated_polynomials(transcript_polynomials);

        // Commit to  M(X) + Z_H(X)*R(X), where R is a random polynomial of WITNESS_MASKING_TERM_LENGTH.
        transcript->template send_to_verifier("Translation:concatenated_masking_term_commitment",
                                              commitment_key->commit(masked_concatenated_polynomial));
    }
    /**
     * @brief   Let \f$ T = NUM_TRANSLATION_EVALUATIONS \f$ and let \f$ m_0, ..., m_{T-1}\f$ be the vectors of last \f$
     * \text{NUM_DISABLED_ROWS_IN_SUMCHECK} \f$  coeffs in each transcript poly \f$ \tilde{T}_i \f$,  we compute the
     * concatenation \f$ (m_0 || ... || m_{T-1})\f$ in Lagrange and monomial basis and mask the latter.
     *
     * @param transcript_polynomials
     */
    void compute_concatenated_polynomials(const RefVector<Polynomial>& transcript_polynomials)
    {
        const size_t circuit_size = transcript_polynomials[0].size();

        std::array<FF, SUBGROUP_SIZE> coeffs_lagrange_subgroup;

        for (size_t idx = 0; idx < SUBGROUP_SIZE; idx++) {
            coeffs_lagrange_subgroup[idx] = FF{ 0 };
        }

        // Extract the Lagrange coefficients of the concatenated masking term from the transcript polynomials
        for (size_t poly_idx = 0; poly_idx < NUM_TRANSLATION_EVALUATIONS; poly_idx++) {
            for (size_t idx = 0; idx < NUM_DISABLED_ROWS_IN_SUMCHECK; idx++) {
                size_t idx_to_populate = poly_idx * NUM_DISABLED_ROWS_IN_SUMCHECK + idx;
                coeffs_lagrange_subgroup[idx_to_populate] =
                    transcript_polynomials[poly_idx].at(circuit_size - NUM_DISABLED_ROWS_IN_SUMCHECK + idx);
            }
        }
        concatenated_polynomial_lagrange = Polynomial(coeffs_lagrange_subgroup);

        // Generate the masking term
        auto masking_scalars = bb::Univariate<FF, WITNESS_MASKING_TERM_LENGTH>::get_random();

        // Compute monomial coefficients of the concatenated polynomial
        Polynomial concatenated_monomial_form_unmasked(interpolation_domain, coeffs_lagrange_subgroup, SUBGROUP_SIZE);

        for (size_t idx = 0; idx < SUBGROUP_SIZE; idx++) {
            masked_concatenated_polynomial.at(idx) = concatenated_monomial_form_unmasked.at(idx);
        }

        // Mask the polynomial in monomial form.
        for (size_t idx = 0; idx < masking_scalars.size(); idx++) {
            masked_concatenated_polynomial.at(idx) -= masking_scalars.value_at(idx);
            masked_concatenated_polynomial.at(SUBGROUP_SIZE + idx) += masking_scalars.value_at(idx);
        }
    }
};
} // namespace bb
