#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/protogalaxy/folding_result.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/decider_keys.hpp"

namespace bb {
template <class DeciderVerificationKeys> class ProtogalaxyVerifier_ {
  public:
    using Flavor = typename DeciderVerificationKeys::Flavor;
    using Transcript = typename Flavor::Transcript;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using DeciderVK = typename DeciderVerificationKeys::DeciderVK;
    using VerificationKey = typename Flavor::VerificationKey;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using RelationSeparator = typename Flavor::RelationSeparator;

    static constexpr size_t NUM_SUBRELATIONS = Flavor::NUM_SUBRELATIONS;

    DeciderVerificationKeys keys_to_fold;

    std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>();

    ProtogalaxyVerifier_(const std::vector<std::shared_ptr<DeciderVK>>& keys)
        : keys_to_fold(DeciderVerificationKeys(keys)){};
    ~ProtogalaxyVerifier_() = default;

    /**
     * @brief Process the public data ϕ for the decider verification keys to be folded.
     */
    void run_oink_verifier_on_one_incomplete_key(const std::shared_ptr<DeciderVK>&, const std::string&);

    /**
     * @brief Instatiate the vks and the transcript.
     *
     * @param fold_data The data transmitted via the transcript by the prover.
     */
    void run_oink_verifier_on_each_incomplete_key(const std::vector<FF>&);

    /**
     * @brief Run the folding protocol on the verifier side to establish whether the public data ϕ of the new
     * accumulator, received from the prover is the same as that produced by the verifier.
     */
    std::shared_ptr<DeciderVK> verify_folding_proof(const std::vector<FF>&);
};

} // namespace bb
