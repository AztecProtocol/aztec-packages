#pragma once

#include "hypernova_verifier.hpp"

namespace bb {

/**
 * @brief Test helper to create a recursive verifier accumulator from a native one
 * @details Converts all fields from native to stdlib types for recursive verification testing
 */
inline MultilinearBatchingVerifierClaim<bb::MegaKernelRecursiveFlavor::Curve> create_recursive_verifier_accumulator(
    MegaCircuitBuilder* builder,
    const MultilinearBatchingVerifierClaim<bb::MegaKernelFlavor::Curve>& native_accumulator)
{
    using Flavor = bb::MegaKernelRecursiveFlavor;
    using FF = Flavor::FF;
    using Commitment = Flavor::Commitment;
    using Accumulator = MultilinearBatchingVerifierClaim<Flavor::Curve>;

    Accumulator recursive_accumulator;

    for (const auto& native_challenge : native_accumulator.challenge) {
        recursive_accumulator.challenge.emplace_back(FF::from_witness(builder, native_challenge));
        recursive_accumulator.challenge.back().unset_free_witness_tag();
    }

    recursive_accumulator.non_shifted_evaluation = FF::from_witness(builder, native_accumulator.non_shifted_evaluation);
    recursive_accumulator.non_shifted_evaluation.unset_free_witness_tag();
    recursive_accumulator.shifted_evaluation = FF::from_witness(builder, native_accumulator.shifted_evaluation);
    recursive_accumulator.shifted_evaluation.unset_free_witness_tag();
    recursive_accumulator.non_shifted_commitment =
        Commitment::from_witness(builder, native_accumulator.non_shifted_commitment);
    recursive_accumulator.non_shifted_commitment.unset_free_witness_tag();
    recursive_accumulator.shifted_commitment = Commitment::from_witness(builder, native_accumulator.shifted_commitment);
    recursive_accumulator.shifted_commitment.unset_free_witness_tag();

    return recursive_accumulator;
}

} // namespace bb
