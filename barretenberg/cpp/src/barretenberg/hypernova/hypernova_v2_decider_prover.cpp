#include "barretenberg/hypernova/hypernova_v2_decider_prover.hpp"

namespace bb {
HonkProof HypernovaV2DeciderProver::construct_proof(Accumulator& accumulator)
{
    vinfo("HypernovaV2FoldingDecider: prove PCS...");

    size_t actual_size = accumulator.non_shifted_polynomial.virtual_size();
    CommitmentKey ck(actual_size);

    PolynomialBatcher polynomial_batcher(actual_size);
    polynomial_batcher.set_unshifted(RefVector(accumulator.non_shifted_polynomial));
    polynomial_batcher.set_to_be_shifted_by_one(RefVector(accumulator.shifted_polynomial));

    OpeningClaim prover_opening_claim;
    prover_opening_claim =
        ShpleminiProver::prove(actual_size, polynomial_batcher, accumulator.challenge, ck, transcript);

    Flavor::PCS::compute_opening_proof(ck, prover_opening_claim, transcript);

    return transcript->export_proof();
};
} // namespace bb
