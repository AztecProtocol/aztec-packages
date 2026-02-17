// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once

#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_claims.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_verifier.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"

namespace bb {

/**
 * @brief HyperNova folding verifier (native + recursive). Verifies folding proofs and maintains accumulators.
 * @details See: chonk/README.md#hypernova-folding-details
 */
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
    using BatchingFlavor =
        std::conditional_t<IsRecursiveFlavor<Flavor>, MultilinearBatchingRecursiveFlavor, MultilinearBatchingFlavor>;
    using MultilinearBatchingVerifier = bb::MultilinearBatchingVerifier<BatchingFlavor>;
    using VerifierInstance = VerifierInstance_<Flavor>;

    using Proof = std::conditional_t<IsRecursiveFlavor<Flavor>, stdlib::Proof<MegaCircuitBuilder>, HonkProof>;

    static constexpr size_t NUM_UNSHIFTED_ENTITIES = MegaFlavor::NUM_UNSHIFTED_ENTITIES;
    static constexpr size_t NUM_SHIFTED_ENTITIES = MegaFlavor::NUM_SHIFTED_ENTITIES;

    HypernovaFoldingVerifier(std::shared_ptr<Transcript> transcript)
        : transcript(std::move(transcript)) {};

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
     * @param instance The verifier instance for the incoming circuit
     * @param proof The folding proof to verify
     * @return std::tuple<instance_sumcheck_verified, batching_sumcheck_verified, new_accumulator>
     *         - instance_sumcheck_verified: Did the Sumcheck on the incoming instance pass?
     *         - batching_sumcheck_verified: Did the MultilinearBatching Sumcheck pass?
     *         - new_accumulator: The combined accumulator (valid only if both checks pass)
     */
    std::tuple<bool, bool, Accumulator> verify_folding_proof(
        const std::shared_ptr<typename HypernovaFoldingVerifier::VerifierInstance>& instance, const Proof& proof);

  private:
    std::shared_ptr<Transcript> transcript;

    /**
     * @brief Perform sumcheck on the incoming instance.
     *
     * @details Executing this sumcheck we generate the random challenges at which the polynomial commitments have to be
     * opened.
     * @param num_public_inputs Number of public inputs (derived from proof size by caller)
     */
    SumcheckOutput<Flavor> sumcheck_on_incoming_instance(const std::shared_ptr<VerifierInstance>& instance,
                                                         const Proof& proof,
                                                         size_t num_public_inputs);

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
