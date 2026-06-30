// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
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
    Commitment masked_concatenated_commitment;

    // Interpolation domain {1, g, \ldots, g^{SUBGROUP_SIZE - 1}} required for Lagrange interpolation
    std::array<FF, SUBGROUP_SIZE> interpolation_domain;

    /**
     * @brief Let \f$ s = \text{TRACE\_OFFSET} \f$ and \f$ T = \text{NUM\_TRANSLATION\_EVALUATIONS} \f$.
     * Given masked transcript polynomials \f$ \tilde{T}_i(X) \f$ for \f$ i = 0, \ldots, T-1 \f$,
     * we extract their first \f$ s \f$ coefficients (the masking terms \f$ m_i \f$) and concatenate them.
     * Let \f$ M(X) \f$ be the polynomial whose first \f$ s \cdot T \f$ Lagrange coefficients over \f$ H \f$
     * are given by \f$ (m_0 \| \ldots \| m_{T-1}) \f$ padded by zeroes.
     *
     * An object of this class is fed to the SmallSubgroupIPA prover to establish claims about the inner product of
     * Lagrange coefficients of \f$ M \f$ against vectors of the form
     * \f$(1, x, \ldots, x^{s-1},\; v, vx, \ldots, v^{T-1} x^{s-1})\f$.
     *
     * @param transcript_polynomials
     * @param transcript
     * @param commitment_key
     */
    TranslationData(const RefVector<Polynomial>& transcript_polynomials,
                    const std::shared_ptr<Transcript>& transcript,
                    CommitmentKey& commitment_key)
        : concatenated_polynomial_lagrange(SUBGROUP_SIZE)
        , masked_concatenated_polynomial(MASKED_CONCATENATED_WITNESS_LENGTH)
    {
        // Reallocate the commitment key if necessary. This is an edge case with SmallSubgroupIPA since it has
        // polynomials that may exceed the circuit size.
        if (commitment_key.srs_size < MASKED_CONCATENATED_WITNESS_LENGTH) {
            commitment_key = typename Flavor::CommitmentKey(MASKED_CONCATENATED_WITNESS_LENGTH);
        }
        // Create interpolation domain required for Lagrange interpolation
        interpolation_domain[0] = FF{ 1 };

        for (size_t idx = 1; idx < SUBGROUP_SIZE; idx++) {
            interpolation_domain[idx] = interpolation_domain[idx - 1] * Flavor::Curve::subgroup_generator;
        }
        // Concatenate the last entries of the `transcript_polynomials`.
        compute_concatenated_polynomials(transcript_polynomials);

        // Commit to  M(X) + Z_H(X)*R(X), where R is a random polynomial of WITNESS_MASKING_TERM_LENGTH.
        masked_concatenated_commitment = commitment_key.commit(masked_concatenated_polynomial);
        transcript->send_to_verifier("Translation:concatenated_masking_term_commitment",
                                     masked_concatenated_commitment);
    }
    /**
     * @brief Extract the first \f$ s = \text{TRACE\_OFFSET} \f$ coefficients from each of the \f$ T \f$ transcript
     * polynomials, concatenate them as \f$ (m_0 \| \ldots \| m_{T-1}) \f$, and mask the result.
     *
     * @param transcript_polynomials
     */
    void compute_concatenated_polynomials(const RefVector<Polynomial>& transcript_polynomials)
    {
        std::array<FF, SUBGROUP_SIZE> coeffs_lagrange_subgroup;

        for (size_t idx = 0; idx < SUBGROUP_SIZE; idx++) {
            coeffs_lagrange_subgroup[idx] = FF{ 0 };
        }

        // Extract the masking terms from the head of the transcript polynomials (top-of-trace masking)
        // Positions 0..TRACE_OFFSET-1 contain: zero row (pos 0), masking values (pos 1,2,3)
        constexpr size_t coeffs_per_poly = Flavor::TRACE_OFFSET;
        for (size_t poly_idx = 0; poly_idx < NUM_TRANSLATION_EVALUATIONS; poly_idx++) {
            for (size_t idx = 0; idx < coeffs_per_poly; idx++) {
                size_t idx_to_populate = poly_idx * coeffs_per_poly + idx;
                coeffs_lagrange_subgroup[idx_to_populate] = transcript_polynomials[poly_idx][idx];
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
