// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/hypernova/hypernova_decider_verifier.hpp"
#include "barretenberg/commitment_schemes/claim_batcher.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/flavor/mega_app_flavor.hpp"
#include "barretenberg/flavor/mega_app_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_recursive_flavor.hpp"
#include "barretenberg/flavor/mega_recursive_flavor.hpp"

namespace bb {

template <typename Flavor>
HypernovaDeciderVerifier<Flavor>::PairingPoints HypernovaDeciderVerifier<Flavor>::verify_proof(
    Accumulator& accumulator, const HypernovaDeciderVerifier::Proof& proof)
{
    using ShpleminiVerifier = bb::ShpleminiVerifier_<Curve, Flavor::HasZK>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;

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
    auto opening_claim =
        ShpleminiVerifier::compute_batch_opening_claim(claim_batcher, accumulator.challenge, generator, transcript)
            .batch_opening_claim;

    if constexpr (IsRecursiveFlavor<Flavor>) {
        PairingPoints pairing_points(PCS::reduce_verify_batch_opening_claim(std::move(opening_claim), transcript));
        return pairing_points;
    } else {
        auto pairing_points = PCS::reduce_verify_batch_opening_claim(std::move(opening_claim), transcript);
        return { typename Curve::AffineElement(pairing_points.P0()),
                 typename Curve::AffineElement(pairing_points.P1()) };
    }
};

template class HypernovaDeciderVerifier<MegaAppFlavor>;
template class HypernovaDeciderVerifier<MegaKernelFlavor>;
template class HypernovaDeciderVerifier<MegaAppRecursiveFlavor>;
template class HypernovaDeciderVerifier<MegaKernelRecursiveFlavor>;
}; // namespace bb
