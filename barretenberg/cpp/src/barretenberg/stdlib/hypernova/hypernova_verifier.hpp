// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_claims.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_verifier.hpp"
#include "barretenberg/stdlib/honk_verifier/oink_recursive_verifier.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/protogalaxy_verifier/recursive_verifier_instance.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb::stdlib::recursion::honk {
class HypernovaFoldingVerifier {
  public:
    using Builder = MegaCircuitBuilder;
    using Flavor = MegaRecursiveFlavor_<Builder>;
    using FF = Flavor::FF;
    using Curve = Flavor::Curve;
    using Commitment = Flavor::Commitment;
    using VerifierCommitments = Flavor::VerifierCommitments;
    using Transcript = Flavor::Transcript;
    using Proof = stdlib::Proof<Builder>;
    using Accumulator = MultilinearBatchingVerifierClaim<Curve>;
    using VerifierInstance = RecursiveVerifierInstance_<Flavor>;
    using OinkVerifier = OinkRecursiveVerifier_<Flavor>;
    using SumcheckVerifier = bb::SumcheckVerifier<Flavor>;
    using MegaSumcheckOutput = SumcheckOutput<Flavor>;
    using MultilinearBatchingVerifier = bb::MultilinearBatchingVerifier<MultilinearBatchingRecursiveFlavor>;

    std::shared_ptr<Transcript> transcript;

    HypernovaFoldingVerifier(std::shared_ptr<Transcript>& transcript)
        : transcript(transcript) {};

    /**
     * @brief Turn an instance into an accumulator by executing sumcheck.
     *
     * @param instance
     * @return std::pair<bool, Accumulator> Pair of sumcheck result and new accumulator.
     */
    std::pair<bool, Accumulator> instance_to_accumulator(Builder& builder,
                                                         const std::shared_ptr<VerifierInstance>& instance,
                                                         const Proof& proof);

    /**
     * @brief Verify folding proof. Return the new accumulator and the results of the two sumchecks.
     *
     * @param proof
     * @return std::tuple<bool, bool, Accumulator> Tuple of first and second sumcheck result, and new accumulator.
     */
    std::tuple<bool, bool, Accumulator> verify_folding_proof(
        Builder& builder,
        const std::shared_ptr<typename HypernovaFoldingVerifier::VerifierInstance>& instance,
        const Proof& proof);

  private:
    Accumulator sumcheck_output_to_accumulator(MegaSumcheckOutput& sumcheck_output,
                                               const std::shared_ptr<VerifierInstance>& instance);
};
} // namespace bb::stdlib::recursion::honk
