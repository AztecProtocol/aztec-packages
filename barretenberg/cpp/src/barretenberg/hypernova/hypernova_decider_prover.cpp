// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/hypernova/hypernova_decider_prover.hpp"

namespace bb {
HonkProof HypernovaDeciderProver::construct_proof(const CommitmentKey& ck, Accumulator& accumulator)
{
    vinfo("HypernovaFoldingDecider: prove PCS...");

    size_t actual_size = accumulator.non_shifted_polynomial.virtual_size();

    // Open the commitments with Shplemini
    PolynomialBatcher polynomial_batcher(actual_size);
    polynomial_batcher.set_unshifted(RefVector(accumulator.non_shifted_polynomial));
    polynomial_batcher.set_to_be_shifted_by_one(RefVector(accumulator.shifted_polynomial));

    OpeningClaim prover_opening_claim;
    prover_opening_claim =
        ShpleminiProver::prove(actual_size, polynomial_batcher, accumulator.challenge, ck, transcript);

    vinfo("HypernovaFoldingDecider: executed multivariate-to-univariate reduction");

    Flavor::PCS::compute_opening_proof(ck, prover_opening_claim, transcript);
    vinfo("HypernovaFoldingDecider: computed PCS opening proof");

    return transcript->export_proof();
};
} // namespace bb
