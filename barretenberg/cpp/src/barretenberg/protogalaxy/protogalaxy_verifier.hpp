// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/protogalaxy/folding_result.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/instances.hpp"

namespace bb {
template <class VerifierInstances> class ProtogalaxyVerifier_ {
  public:
    using Flavor = typename VerifierInstances::Flavor;
    using Transcript = typename Flavor::Transcript;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using VerifierInstance = typename VerifierInstances::VerifierInstance;
    using VerificationKey = typename Flavor::VerificationKey;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using SubrelationSeparators = typename Flavor::SubrelationSeparators;

    static constexpr size_t NUM_SUBRELATIONS = Flavor::NUM_SUBRELATIONS;

    VerifierInstances insts_to_fold;

    std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>();

    ProtogalaxyVerifier_(const std::vector<std::shared_ptr<VerifierInstance>>& insts,
                         const std::shared_ptr<Transcript>& transcript)
        : insts_to_fold(VerifierInstances(insts))
        , transcript(transcript) {};
    ~ProtogalaxyVerifier_() = default;

    /**
     * @brief Instatiate the verifier instances and the transcript.
     *
     * @param fold_data The data transmitted via the transcript by the prover.
     */
    void run_oink_verifier_on_each_incomplete_instance(const std::vector<FF>&);

    /**
     * @brief Run the folding protocol on the verifier side to establish whether the public data ϕ of the new
     * accumulator, received from the prover, is the same as that produced by the verifier.
     */
    std::shared_ptr<VerifierInstance> verify_folding_proof(const std::vector<FF>&);
};

} // namespace bb
