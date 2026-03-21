#pragma once
#include "barretenberg/flavor/mega_v2_flavor.hpp"
#include "barretenberg/multilinear_batching/multilinear_batching_claims.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

namespace bb {

/**
 * @brief HyperNova folding prover for MegaV2Flavor.
 *
 * @details Identical to HypernovaFoldingProver but uses MegaV2Flavor instead of MegaFlavor.
 * In a future refactor, both could be unified by templating HypernovaFoldingProver on Flavor.
 *
 * NOTE: The implementation (.cpp) reuses the same algorithms — the folding logic is
 * flavor-agnostic. Only the type aliases differ.
 */
class HypernovaV2FoldingProver {
  public:
    using Flavor = MegaV2Flavor;
    using FF = Flavor::FF;
    using Commitment = Flavor::Commitment;
    using ProverInstance = ProverInstance_<Flavor>;
    using Accumulator = MultilinearBatchingProverClaim;
    using VerificationKey = Flavor::VerificationKey;
    using VerifierCommitments = Flavor::VerifierCommitments;
    using MegaOinkProver = OinkProver<Flavor>;
    using MegaSumcheckProver = SumcheckProver<Flavor>;
    using MegaSumcheckOutput = SumcheckOutput<Flavor>;
    using Transcript = Flavor::Transcript;

    static constexpr size_t NUM_UNSHIFTED_ENTITIES = MegaV2Flavor::NUM_UNSHIFTED_ENTITIES;
    static constexpr size_t NUM_SHIFTED_ENTITIES = MegaV2Flavor::NUM_SHIFTED_ENTITIES;

    HypernovaV2FoldingProver(std::shared_ptr<Transcript> transcript)
        : transcript(std::move(transcript)) {};

    Accumulator instance_to_accumulator(const std::shared_ptr<ProverInstance>& instance,
                                        const std::shared_ptr<VerificationKey>& honk_vk = nullptr);

    std::pair<HonkProof, Accumulator> fold(Accumulator&& accumulator,
                                           const std::shared_ptr<ProverInstance>& instance,
                                           const std::shared_ptr<VerificationKey>& honk_vk = nullptr);

    HonkProof export_proof() { return transcript->export_proof(); };

  private:
    std::shared_ptr<Transcript> transcript;

    Accumulator sumcheck_output_to_accumulator(MegaSumcheckOutput& sumcheck_output,
                                               const std::shared_ptr<ProverInstance>& instance,
                                               const std::shared_ptr<VerificationKey>& honk_vk);

    template <size_t N>
    static Polynomial<FF> batch_polynomials(RefArray<Polynomial<FF>, N> polynomials_to_batch,
                                            const size_t& full_batched_size,
                                            const std::vector<FF>& challenges);

    std::pair<std::vector<FF>, std::vector<FF>> get_batching_challenges();

    template <size_t N> Commitment batch_mul(const RefArray<Commitment, N>& _points, const std::vector<FF>& scalars);
};

} // namespace bb
