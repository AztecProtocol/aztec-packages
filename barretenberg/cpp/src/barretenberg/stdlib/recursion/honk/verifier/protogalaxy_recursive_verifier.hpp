#pragma once
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/goblin_ultra_recursive.hpp"
#include "barretenberg/flavor/ultra_recursive.hpp"
#include "barretenberg/plonk/proof_system/types/proof.hpp"
#include "barretenberg/protogalaxy/folding_result.hpp"
#include "barretenberg/stdlib/recursion/honk/transcript/transcript.hpp"
#include "barretenberg/sumcheck/instance/instances.hpp"

namespace proof_system::plonk::stdlib::recursion::honk {
template <class VerifierInstances> class ProtoGalaxyRecursiveVerifier_ {
  public:
    using Flavor = typename VerifierInstances::Flavor;
    using FF = typename Flavor::FF;
    using Commitment = typename Flavor::Commitment;
    using GroupElement = typename Flavor::GroupElement;
    using Instance = typename VerifierInstances::Instance;
    using VerificationKey = typename Flavor::VerificationKey;
    using WitnessCommitments = typename Flavor::WitnessCommitments;
    using CommitmentLabels = typename Flavor::CommitmentLabels;
    using Builder = typename Flavor::CircuitBuilder;
    using RelationSeparator = typename Flavor::RelationSeparator;
    using PairingPoints = std::array<GroupElement, 2>;

    static constexpr size_t NUM_SUBRELATIONS = Flavor::NUM_SUBRELATIONS;

    VerifierInstances instances;

    CommitmentLabels commitment_labels;

    Builder* builder;
    std::shared_ptr<Transcript<Builder>> transcript;

    explicit ProtoGalaxyRecursiveVerifier_(Builder* builder)
        : instances(VerifierInstances())
        , builder(builder){};
    /**
     * @brief Given a new round challenge δ for each iteration of the full ProtoGalaxy protocol, compute the vector
     * [δ, δ^2,..., δ^t] where t = logn and n is the size of the instance.
     */
    static std::vector<FF> compute_round_challenge_pows(size_t log_instance_size, FF round_challenge)
    {
        std::vector<FF> pows(log_instance_size);
        pows[0] = round_challenge;
        for (size_t i = 1; i < log_instance_size; i++) {
            pows[i] = pows[i - 1].sqr();
        }
        return pows;
    }

    static std::vector<FF> update_gate_challenges(const FF perturbator_challenge,
                                                  const std::vector<FF>& gate_challenges,
                                                  const std::vector<FF>& round_challenges)
    {
        auto log_instance_size = gate_challenges.size();
        std::vector<FF> next_gate_challenges(log_instance_size);

        for (size_t idx = 0; idx < log_instance_size; idx++) {
            next_gate_challenges[idx] = gate_challenges[idx] + perturbator_challenge * round_challenges[idx];
        }
        return next_gate_challenges;
    }

    std::shared_ptr<Instance> get_accumulator() { return instances[0]; }

    /**
     * @brief Instatiate the instances and the transcript.
     *
     * @param fold_data The data transmitted via the transcript by the prover.
     */
    void prepare_for_folding();

    /**
     * @brief Instantiatied the accumulator (i.e. the relaxed instance) from the transcript.
     *
     */
    void receive_accumulator(const std::shared_ptr<Instance>&, const std::string&);

    /**
     * @brief Process the public data ϕ for the Instances to be folded.
     *
     */
    void receive_and_finalise_instance(const std::shared_ptr<Instance>&, const std::string&);

    /**
     * @brief Run the folding protocol on the verifier side to establish whether the public data ϕ of the new
     * accumulator, received from the prover is the same as that produced by the verifier.
     *
     */
    bool verify_folding_proof(std::vector<uint8_t> proof);

    static FF evaluate_perturbator(std::vector<FF> coeffs, FF z)
    {
        FF z_acc = FF(1);
        FF result = FF(0);
        for (size_t i = 0; i < coeffs.size(); i++) {
            result += coeffs[i] * z_acc;
            z_acc *= z;
        }
        return result;
    };
};

extern template class ProtoGalaxyRecursiveVerifier_<
    proof_system::honk::VerifierInstances_<proof_system::honk::flavor::UltraRecursive_<UltraCircuitBuilder>, 2>>;
extern template class ProtoGalaxyRecursiveVerifier_<
    proof_system::honk::VerifierInstances_<proof_system::honk::flavor::UltraRecursive_<GoblinUltraCircuitBuilder>, 2>>;
extern template class ProtoGalaxyRecursiveVerifier_<
    proof_system::honk::VerifierInstances_<proof_system::honk::flavor::GoblinUltraRecursive, 2>>;
} // namespace proof_system::plonk::stdlib::recursion::honk