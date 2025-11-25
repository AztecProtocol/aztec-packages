// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/multilinear_batching/multilinear_batching_claims.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/ultra_honk/oink_prover.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

namespace bb {

class HypernovaFoldingProver {
  public:
    using Flavor = MegaFlavor;
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

    static constexpr size_t NUM_UNSHIFTED_ENTITIES = MegaFlavor::NUM_UNSHIFTED_ENTITIES;
    static constexpr size_t NUM_SHIFTED_ENTITIES = MegaFlavor::NUM_SHIFTED_ENTITIES;

    std::shared_ptr<Transcript> transcript;

    HypernovaFoldingProver(std::shared_ptr<Transcript>& transcript)
        : transcript(transcript) {};

    /**
     * @brief Turn an instance into an accumulator by running Sumcheck.
     *
     * @param instance
     * @return Accumulator
     */
    Accumulator instance_to_accumulator(const std::shared_ptr<ProverInstance>& instance,
                                        const std::shared_ptr<VerificationKey>& honk_vk = nullptr);

    /**
     * @brief Fold an instance into an accumulator. Folding happens in place.
     *
     * @param accumulator
     * @param instance
     * @return std::pair<HonkProof, Accumulator>
     */
    std::pair<HonkProof, Accumulator> fold(const Accumulator& accumulator,
                                           const std::shared_ptr<ProverInstance>& instance,
                                           const std::shared_ptr<VerificationKey>& honk_vk = nullptr);

    /**
     * @brief Export the proof contained in the transcript
     *
     * @return HonkProof
     */
    HonkProof export_proof() { return transcript->export_proof(); };

  private:
    /**
     * @brief Convert the output of the sumcheck run on the incoming instance into an accumulator.
     */
    Accumulator sumcheck_output_to_accumulator(MegaSumcheckOutput& sumcheck_output,
                                               const std::shared_ptr<ProverInstance>& instance,
                                               const std::shared_ptr<VerificationKey>& honk_vk);

    /**
     * @brief Batch prover polynomials. Batching happens in place into the first polynomial in the RefArray supplied.
     *
     * @tparam N
     * @param shiftable If it is set to true, then the polynomials are aggregated as shiftable polynomials
     */
    template <size_t N>
    static Polynomial<FF> batch_polynomials(RefArray<Polynomial<FF>, N> polynomials_to_batch,
                                            const size_t& full_batched_size,
                                            const std::vector<FF>& challenges);

    /**
     * @brief Generate the challenges required to batch the incoming instance with the accumulator
     */
    std::pair<std::vector<FF>, std::vector<FF>> get_batching_challenges();

    /**
     * @brief Utility to perform batch mul of commitments.
     */
    template <size_t N> Commitment batch_mul(const RefArray<Commitment, N>& _points, const std::vector<FF>& scalars);
};

} // namespace bb
