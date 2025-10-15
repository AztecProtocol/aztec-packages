// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/hypernova/hypernova_decider_verifier.hpp"

namespace bb {

template <typename Flavor>
HypernovaDeciderVerifier<Flavor>::PairingPoints HypernovaDeciderVerifier<Flavor>::verify_proof(
    Accumulator& accumulator, const HypernovaDeciderVerifier::Proof& proof)
{
    vinfo("HypernovaDeciderVerifier: verifying PCS proof...");
    transcript->load_proof(proof);

    // Construct generator based on whether we are in-circuit or not
    Commitment generator;
    if constexpr (IsRecursiveFlavor<Flavor>) {
        generator = Commitment::one(accumulator.non_shifted_commitment.get_context());
    } else {
        generator = Commitment::one();
    }

    // Execute Shplemini verifier
    ClaimBatcher claim_batcher{ .unshifted = ClaimBatch{ RefVector(accumulator.non_shifted_commitment),
                                                         RefVector(accumulator.non_shifted_evaluation) },
                                .shifted = ClaimBatch{ RefVector(accumulator.shifted_commitment),
                                                       RefVector(accumulator.shifted_evaluation) } };
    std::vector<FF> padding_indicator_array(Flavor::VIRTUAL_LOG_N, 1);
    const auto opening_claim = ShpleminiVerifier::compute_batch_opening_claim(
        padding_indicator_array, claim_batcher, accumulator.challenge, generator, transcript);

    auto pairing_points = PCS::reduce_verify_batch_opening_claim(opening_claim, transcript);

    if constexpr (IsRecursiveFlavor<Flavor>) {
        return pairing_points;
    } else {
        // Native pairing points contain affine elements
        return { typename Curve::AffineElement(pairing_points[0]), typename Curve::AffineElement(pairing_points[1]) };
    }
};

template class HypernovaDeciderVerifier<MegaFlavor>;
template class HypernovaDeciderVerifier<MegaRecursiveFlavor_<MegaCircuitBuilder>>;
}; // namespace bb
