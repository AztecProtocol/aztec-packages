// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/stdlib/hypernova/hypernova_decider_verifier.hpp"

namespace bb::stdlib::recursion::honk {
HypernovaDeciderVerifier::PairingPoints HypernovaDeciderVerifier::verify_pcs_proof(
    Builder& builder, Accumulator& accumulator, const HypernovaDeciderVerifier::Proof& proof)
{
    vinfo("HypernovaDeciderVerifier: verifying PCS proof...");
    transcript->load_proof(proof);

    std::vector<FF> padding_indicator_array(Flavor::VIRTUAL_LOG_N, 1);

    // Execute Shplemini verifier
    ClaimBatcher claim_batcher{ .unshifted = ClaimBatch{ RefVector(accumulator.non_shifted_commitment),
                                                         RefVector(accumulator.non_shifted_evaluation) },
                                .shifted = ClaimBatch{ RefVector(accumulator.shifted_commitment),
                                                       RefVector(accumulator.shifted_evaluation) } };
    const auto opening_claim = ShpleminiVerifier::compute_batch_opening_claim(
        padding_indicator_array, claim_batcher, accumulator.challenge, Commitment::one(&builder), transcript);

    return PCS::reduce_verify_batch_opening_claim(opening_claim, transcript);
};
}; // namespace bb::stdlib::recursion::honk
