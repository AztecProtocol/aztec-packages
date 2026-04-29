// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/hypernova/hypernova_decider_prover.hpp"
#include "barretenberg/common/bb_bench.hpp"

namespace bb {
HonkProof HypernovaDeciderProver::construct_proof(Accumulator& accumulator)
{
    BB_BENCH_NAME("HypernovaDeciderProver::construct_proof");
    vinfo("HypernovaFoldingDecider: prove PCS...");

    size_t dyadic_size = accumulator.dyadic_size;
    size_t actual_data_size =
        std::max(accumulator.non_shifted_polynomial.end_index(), accumulator.shifted_polynomial.end_index());
    CommitmentKey ck(actual_data_size);

    // Open the commitments with Shplemini
    PolynomialBatcher polynomial_batcher(dyadic_size, actual_data_size);
    polynomial_batcher.set_unshifted(RefVector(accumulator.non_shifted_polynomial));
    polynomial_batcher.set_to_be_shifted_by_one(RefVector(accumulator.shifted_polynomial));

    OpeningClaim prover_opening_claim;
    prover_opening_claim =
        ShpleminiProver::prove(dyadic_size, polynomial_batcher, accumulator.challenge, ck, transcript);

    vinfo("HypernovaFoldingDecider: executed multivariate-to-univariate reduction");

    Flavor::PCS::compute_opening_proof(ck, prover_opening_claim, transcript);
    vinfo("HypernovaFoldingDecider: computed PCS opening proof");

    return transcript->export_proof();
};
} // namespace bb
