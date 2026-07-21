// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#pragma once

#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/mega_kernel_flavor.hpp"
#include "barretenberg/flavor/mega_kernel_recursive_flavor.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_claims.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_verifier.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/sumcheck/sumcheck_output.hpp"
#include "barretenberg/ultra_honk/verifier_instance.hpp"

#include <optional>
#include <span>
#include <utility>
#include <vector>

namespace bb {

/**
 * @brief Stateful HyperNova folding verifier (native + recursive). Verifies a series of instances against a
 * starting accumulator and reduces them to one accumulator with a single multilinear batching proof.
 * @details See: chonk/README.md#hypernova-folding-details
 *
 * ## Lifecycle
 *
 * Construct → `accumulate_instance<InstanceFlavor>()` once per incoming proof → `finalize()` exactly once.
 * SINGLE-USE: construct a fresh verifier for each folding group
 */
template <bool IsRecursive_> class HypernovaFoldingVerifier {
  public:
    static constexpr bool IsRecursive = IsRecursive_;
    // Representative flavor: Curve/commitment/transcript shapes are common to the app and kernel flavors, so the kernel
    // one stands in for both.
    using BaseFlavor = std::conditional_t<IsRecursive, MegaKernelRecursiveFlavor, MegaKernelFlavor>;
    using FF = typename BaseFlavor::FF;
    using Curve = typename BaseFlavor::Curve;
    using Commitment = typename BaseFlavor::Commitment;
    using Transcript = typename BaseFlavor::Transcript;
    using Accumulator = MultilinearBatchingVerifierClaim<Curve>;
    using BatchingVerifier = MultilinearBatchingVerifier<IsRecursive>;
    using Proof = std::conditional_t<IsRecursive, stdlib::Proof<MegaCircuitBuilder>, HonkProof>;

    template <typename InstanceFlavor> using VerifierInstance = VerifierInstance_<InstanceFlavor>;

    HypernovaFoldingVerifier(std::shared_ptr<Transcript> transcript)
        : transcript(std::move(transcript))
    {}

    /**
     * @brief Verify the instance-to-accumulator sumcheck of one incoming proof and cache the resulting claim.
     * @return Whether the instance sumcheck passed. The claim is cached for finalize() regardless.
     */
    template <typename InstanceFlavor>
    bool accumulate_instance(const std::shared_ptr<VerifierInstance<InstanceFlavor>>& instance, const Proof& proof);

    /**
     * @brief Batch the previous accumulator (if any) and the cached claims into a single accumulator.
     * @details The previous accumulator is claim 0, followed by the cached per-instance claims in order. With a single
     * assembled claim there is nothing to batch: it is returned and the batching proof is ignored (it is
     * empty). With two or more, the MultilinearBatching proof is loaded onto the shared transcript and verified.
     * @return (verified, new_accumulator). For the single-claim case verified is true.
     */
    std::pair<bool, Accumulator> finalize(const Proof& batching_proof,
                                          std::optional<Accumulator> previous_accumulator = std::nullopt);

    // Read access to the per-instance claims accumulated so far
    const std::vector<Accumulator>& get_cached_claims() const { return cached_claims; }

  private:
    std::shared_ptr<Transcript> transcript;
    std::vector<Accumulator> cached_claims;

    /**
     * @brief Perform Oink + Sumcheck on the incoming instance, generating the challenges at which the polynomial
     * commitments have to be opened.
     */
    template <typename InstanceFlavor>
    SumcheckOutput<InstanceFlavor> sumcheck_on_incoming_instance(
        const std::shared_ptr<VerifierInstance<InstanceFlavor>>& instance,
        const Proof& proof,
        size_t num_public_inputs);

    /**
     * @brief Convert the output of the instance sumcheck into an accumulator claim.
     */
    template <typename InstanceFlavor>
    Accumulator sumcheck_output_to_accumulator(SumcheckOutput<InstanceFlavor>& sumcheck_output,
                                               const std::shared_ptr<VerifierInstance<InstanceFlavor>>& instance);

    /**
     * @brief Utility to perform batch mul of commitments.
     */
    template <size_t N> Commitment batch_mul(std::span<Commitment, N> _points, std::vector<FF>& scalars);
};

using HypernovaFoldingNativeVerifier = HypernovaFoldingVerifier<false>;
using HypernovaFoldingRecursiveVerifier = HypernovaFoldingVerifier<true>;

} // namespace bb
