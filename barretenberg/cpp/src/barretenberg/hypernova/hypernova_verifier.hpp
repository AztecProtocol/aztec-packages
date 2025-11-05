// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================
#pragma once

#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/hypernova/types.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_claims.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_verifier.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"

namespace bb {

template <typename Flavor_> class HypernovaFoldingVerifier {
  public:
    using Flavor = Flavor_;
    using FF = Flavor::FF;
    using Curve = Flavor::Curve;
    using Commitment = Flavor::Commitment;
    using VerifierCommitments = Flavor::VerifierCommitments;
    using Transcript = Flavor::Transcript;
    using Accumulator = MultilinearBatchingVerifierClaim<Curve>;
    using OinkVerifier = bb::OinkVerifier<Flavor>;
    using SumcheckVerifier = bb::SumcheckVerifier<Flavor>;
    using MegaSumcheckOutput = SumcheckOutput<Flavor>;
    // Types conditionally assigned based on the Flavor being recursive
    using MultilinearBatchingVerifier =
        std::conditional_t<IsRecursiveFlavor<Flavor>,
                           typename HypernovaRecursiveTypes::MultilinearBatchingVerifier,
                           typename HypernovaNativeTypes::MultilinearBatchingVerifier>;
    using VerifierInstance = std::conditional_t<IsRecursiveFlavor<Flavor>,
                                                typename HypernovaRecursiveTypes::VerifierInstance,
                                                typename HypernovaNativeTypes::VerifierInstance>;
    using Proof = std::conditional_t<IsRecursiveFlavor<Flavor>,
                                     typename HypernovaRecursiveTypes::Proof,
                                     typename HypernovaNativeTypes::Proof>;

    static constexpr size_t NUM_UNSHIFTED_ENTITIES = MegaFlavor::NUM_UNSHIFTED_ENTITIES;
    static constexpr size_t NUM_SHIFTED_ENTITIES = MegaFlavor::NUM_SHIFTED_ENTITIES;

    std::shared_ptr<Transcript> transcript;

    HypernovaFoldingVerifier(const std::shared_ptr<Transcript>& transcript)
        : transcript(transcript) {};

    /**
     * @brief Turn an instance into an accumulator by executing sumcheck.
     *
     * @param instance
     * @return std::pair<bool, Accumulator> Pair of sumcheck result and new accumulator.
     */
    std::pair<bool, Accumulator> instance_to_accumulator(const std::shared_ptr<VerifierInstance>& instance,
                                                         const Proof& proof);

    /**
     * @brief Verify folding proof. Return the new accumulator and the results of the two sumchecks.
     *
     * @param proof
     * @return std::tuple<bool, bool, Accumulator> Tuple of first and second sumcheck result, and new accumulator.
     */
    std::tuple<bool, bool, Accumulator> verify_folding_proof(
        const std::shared_ptr<typename HypernovaFoldingVerifier::VerifierInstance>& instance, const Proof& proof);

  private:
    /**
     * @brief Perform sumcheck on the incoming instance.
     *
     * @details Executing this sumcheck we generate the random challenges at which the polynomial commitments have to be
     * opened.
     */
    SumcheckOutput<Flavor> sumcheck_on_incoming_instance(const std::shared_ptr<VerifierInstance>& instance,
                                                         const Proof& proof);

    /**
     * @brief Generate the challenges required to batch the incoming instance with the accumulator
     */
    std::pair<std::vector<FF>, std::vector<FF>> get_batching_challenges();

    /**
     * @brief Convert the output of the sumcheck run on the incoming instance into an accumulator.
     */
    Accumulator sumcheck_output_to_accumulator(MegaSumcheckOutput& sumcheck_output,
                                               const std::shared_ptr<VerifierInstance>& instance);

    /**
     * @brief Utility to perform batch mul of commitments.
     */
    template <size_t N> Commitment batch_mul(const RefArray<Commitment, N>& _points, const std::vector<FF>& scalars);
};
} // namespace bb
