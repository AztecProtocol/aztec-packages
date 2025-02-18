#pragma once
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/goblin/translation_evaluations.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

// We won't compile this class with Standard, but we will like want to compile it (at least for testing)
// with a flavor that uses the curve Grumpkin, or a flavor that does/does not have zk, etc.
template <typename Transcript> class TranslationData {
  public:
    using Flavor = ECCVMFlavor;
    using FF = typename Flavor::FF;
    using BF = typename Flavor::BF;
    using Commitment = typename Flavor::Commitment;
    using PCS = typename Flavor::PCS;
    using CommitmentKey = typename Flavor::CommitmentKey;
    using Polynomial = typename Flavor::Polynomial;
    using TranslationEvaluations = bb::TranslationEvaluations_<FF, BF>;
    static constexpr size_t SUBGROUP_SIZE = Flavor::Curve::SUBGROUP_SIZE;
    static constexpr size_t NUM_TRANSCRIPT_POLYNOMIALS = 5;

    Polynomial concatenated_masking_term;
    Polynomial concatenated_masking_term_lagrange;
    FF constant_term;

    std::array<FF, SUBGROUP_SIZE> interpolation_domain;

    TranslationData(const RefVector<Polynomial>& transcript_polynomials,
                    const std::shared_ptr<Transcript>& transcript,
                    const std::shared_ptr<CommitmentKey>& commitment_key)
        : concatenated_masking_term(SUBGROUP_SIZE + 2)
        , concatenated_masking_term_lagrange(SUBGROUP_SIZE)
        , constant_term(FF{ 0 })
    {
        // Create interpolation domain
        interpolation_domain[0] = FF{ 1 };

        for (size_t idx = 1; idx < SUBGROUP_SIZE; idx++) {
            interpolation_domain[idx] = interpolation_domain[idx - 1] * Flavor::Curve::subgroup_generator;
        }

        // Let m_0,..., m_4 be the vectors of last 4 coeffs in each transcript poly, we compute the concatenation
        // (constant_term || m_0 || ... || m_4) in Lagrange and monomial basis and mask the latter.
        compute_concatenated_polynomials(transcript_polynomials);

        // Commit to the concatenated masking term
        transcript->template send_to_verifier("Translation:masking_term_commitment",
                                              commitment_key->commit(concatenated_masking_term));
    };

    void compute_concatenated_polynomials(const RefVector<Polynomial>& transcript_polynomials)
    {
        const size_t circuit_size = transcript_polynomials[0].size();

        std::array<FF, SUBGROUP_SIZE> coeffs_lagrange_subgroup;
        coeffs_lagrange_subgroup[0] = constant_term;

        for (size_t idx = 1; idx < SUBGROUP_SIZE; idx++) {
            coeffs_lagrange_subgroup[idx] = FF{ 0 };
        }

        // Extract the Lagrange coefficients of the concatenated masking term from the transcript polynomials
        for (size_t poly_idx = 0; poly_idx < NUM_TRANSCRIPT_POLYNOMIALS; poly_idx++) {
            for (size_t idx = 0; idx < MASKING_OFFSET; idx++) {
                size_t idx_to_populate = 1 + poly_idx * MASKING_OFFSET + idx;
                coeffs_lagrange_subgroup[idx_to_populate] =
                    transcript_polynomials[poly_idx].at(circuit_size - MASKING_OFFSET + idx);
            }
        }
        concatenated_masking_term_lagrange = Polynomial(coeffs_lagrange_subgroup);

        // Generate the masking term
        bb::Univariate<FF, 2> masking_scalars = bb::Univariate<FF, 2>::get_random();

        // Compute monomial coefficients of the concatenated polynomial
        Polynomial concatenated_monomial_form_unmasked(interpolation_domain, coeffs_lagrange_subgroup, SUBGROUP_SIZE);

        for (size_t idx = 0; idx < SUBGROUP_SIZE; idx++) {
            concatenated_masking_term.at(idx) = concatenated_monomial_form_unmasked.at(idx);
        }

        // Mask the polynomial in monomial form
        for (size_t idx = 0; idx < masking_scalars.size(); idx++) {
            concatenated_masking_term.at(idx) -= masking_scalars.value_at(idx);
            concatenated_masking_term.at(SUBGROUP_SIZE + idx) += masking_scalars.value_at(idx);
        }
    }
};
} // namespace bb
