// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/mega_recursive_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/protogalaxy/folding_result.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/protogalaxy_verifier/recursive_verifier_instances.hpp"
#include "barretenberg/stdlib/transcript/transcript.hpp"
#include "barretenberg/ultra_honk/instances.hpp"

namespace bb::stdlib::recursion::honk {
template <class VerifierInstances> class ProtogalaxyRecursiveVerifier_ {
  public:
    using Flavor = typename VerifierInstances::Flavor;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using VerifierInstance = typename VerifierInstances::VerifierInstance;
    using VKAndHash = typename Flavor::VKAndHash;

    using Builder = typename Flavor::CircuitBuilder;
    using Transcript = bb::BaseTranscript<bb::stdlib::recursion::honk::StdlibTranscriptParams<Builder>>;

    static constexpr size_t NUM_SUBRELATIONS = Flavor::NUM_SUBRELATIONS;

    Builder* builder;

    VerifierInstances insts_to_fold;

    std::shared_ptr<Transcript> transcript = std::make_shared<Transcript>();

    ProtogalaxyRecursiveVerifier_(Builder* builder,
                                  const std::shared_ptr<VerifierInstance>& accumulator,
                                  const std::vector<std::shared_ptr<VKAndHash>>& vk_and_hashs,
                                  const std::shared_ptr<Transcript>& transcript)
        : builder(builder)
        , insts_to_fold(VerifierInstances(builder, accumulator, vk_and_hashs))
        , transcript(transcript) {};

    ProtogalaxyRecursiveVerifier_(Builder* builder,
                                  const std::shared_ptr<VerifierInstance>& accumulator,
                                  const std::shared_ptr<VerifierInstance>& incoming_instance,
                                  const std::shared_ptr<Transcript>& transcript)
        : builder(builder)
        , insts_to_fold(VerifierInstances(builder, accumulator, incoming_instance))
        , transcript(transcript) {};

    /**
     * @brief Process the public data ϕ for the decider verification keys to be folded.
     */
    void run_oink_verifier_on_each_incomplete_instance(const std::vector<FF>&);

    /**
     * @brief Run the folding protocol on the verifier side to establish whether the public data ϕ of the new
     * accumulator, received from the prover is the same as that produced by the verifier.
     *
     * @details In the recursive setting this function doesn't return anything because the equality checks performed by
     * the recursive verifier, ensuring the folded ϕ*, e* and β* on the verifier side correspond to what has been sent
     * by the prover, are expressed as constraints.
     *
     */
    std::shared_ptr<VerifierInstance> verify_folding_proof(const stdlib::Proof<Builder>&);
};

} // namespace bb::stdlib::recursion::honk
