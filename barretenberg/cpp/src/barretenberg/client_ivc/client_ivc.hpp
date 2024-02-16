#pragma once

#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"

namespace bb {

/**
 * @brief The IVC interface to be used by the aztec client for private function execution
 * @details Combines Protogalaxy with Goblin to accumulate one circuit instance at a time with efficient EC group
 * operations
 *
 */
class ClientIVC {

  public:
    using Flavor = GoblinUltraFlavor;
    using VerificationKey = Flavor::VerificationKey;
    using FF = Flavor::FF;
    using FoldProof = std::vector<FF>;
    using ProverAccumulator = std::shared_ptr<ProverInstance_<Flavor>>;
    using VerifierAccumulator = std::shared_ptr<VerifierInstance_<Flavor>>;
    using VerifierInstance = VerifierInstance_<GoblinUltraFlavor>;
    using ProverInstance = ProverInstance_<GoblinUltraFlavor>;
    using ClientCircuit = GoblinUltraCircuitBuilder; // can only be GoblinUltra

    // A full proof for the IVC scheme
    struct Proof {
        FoldProof fold_proof; // final fold proof
        HonkProof decider_proof;
        Goblin::Proof goblin_proof;
    };

    struct FoldOutput {
        FoldProof fold_proof;
        std::shared_ptr<VerificationKey> inst_vk;
    };

  private:
    using ProverFoldOutput = FoldingResult<GoblinUltraFlavor>;
    using Composer = GoblinUltraComposer;

  public:
    Goblin goblin;
    ProverFoldOutput prover_fold_output;
    ProverAccumulator prover_accumulator;

    // keep the instance or instances around if we're folding more of them so we can compute the verification key
    std::shared_ptr<ProverInstance> prover_instance;

    std::array<std::shared_ptr<VerificationKey>, 4> vks;

    ClientIVC();

    void initialize(ClientCircuit& circuit);

    FoldProof accumulate(ClientCircuit& circuit);

    Proof prove();

    bool verify(Proof& proof, const std::vector<VerifierAccumulator>& verifier_instances);

    HonkProof decider_prove() const;

    void decider_prove_and_verify(const VerifierAccumulator&) const;

    VerifierAccumulator get_verifier_accumulator();
    std::shared_ptr<VerifierInstance> get_verifier_instance() const;

    void precompute_folding_verification_keys();
};
} // namespace bb