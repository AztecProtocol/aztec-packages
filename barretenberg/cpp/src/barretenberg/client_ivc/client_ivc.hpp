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
    using FF = Flavor::FF;
    using FoldProof = std::vector<FF>;
    using Accumulator = std::shared_ptr<ProverInstance_<Flavor>>;
    using ClientCircuit = GoblinUltraCircuitBuilder; // can only be GoblinUltra

    // A full proof for the IVC scheme
    struct Proof {
        Goblin::Proof goblin_proof;
        FoldProof fold_proof; // final fold proof
        HonkProof decider_proof;
    };

  private:
    using FoldingOutput = FoldingResult<Flavor>;
    using Instance = ProverInstance_<GoblinUltraFlavor>;
    using Composer = GoblinUltraComposer;

  public:
    Goblin goblin;
    FoldingOutput fold_output;

    ClientIVC()
    {
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/723):
        GoblinMockCircuits::perform_op_queue_interactions_for_mock_first_circuit(goblin.op_queue);
    }

    /**
     * @brief Initialize the IVC with a first circuit
     * @details Initializes the accumulator and performs the initial goblin merge
     *
     * @param circuit
     */
    void initialize(ClientCircuit& circuit)
    {
        goblin.merge(circuit); // Construct new merge proof
        Composer composer;
        fold_output.accumulator = composer.create_instance(circuit);
    }

    /**
     * @brief Accumulate a circuit into the IVC scheme
     * @details Performs goblin merge, generates circuit instance, folds into accumulator and constructs a folding proof
     *
     * @param circuit Circuit to be accumulated/folded
     * @return FoldProof
     */
    FoldProof accumulate(ClientCircuit& circuit)
    {
        goblin.merge(circuit); // Add recursive merge verifier and construct new merge proof
        Composer composer;
        auto instance = composer.create_instance(circuit);
        std::vector<std::shared_ptr<Instance>> instances{ fold_output.accumulator, instance };
        auto folding_prover = composer.create_folding_prover(instances);
        fold_output = folding_prover.fold_instances();
        return fold_output.folding_data;
    }

    /**
     * @brief Construct a proof for the IVC, which, if verified, fully establishes its correctness
     *
     * @return Proof
     */
    Proof prove()
    {
        // Construct Goblin proof (merge, eccvm, translator)
        auto goblin_proof = goblin.prove();

        // Construct decider proof for the final accumulator
        Composer composer;
        auto decider_prover = composer.create_decider_prover(fold_output.accumulator);
        auto decider_proof = decider_prover.construct_proof();
        return { goblin_proof, fold_output.folding_data, decider_proof };
    }

    /**
     * @brief Verify a full proof of the IVC
     *
     * @param proof
     * @return bool
     */
    bool verify(Proof& proof)
    {
        // Goblin verification (merge, eccvm, translator)
        bool goblin_verified = goblin.verify(proof.goblin_proof);

        // Decider verification
        Composer composer;
        auto folding_verifier = composer.create_folding_verifier();
        bool folding_verified = folding_verifier.verify_folding_proof(proof.fold_proof);
        // NOTE: Use of member accumulator here will go away with removal of vkey from ProverInstance
        auto decider_verifier = composer.create_decider_verifier(fold_output.accumulator);
        bool decision = decider_verifier.verify_proof(proof.decider_proof);
        return goblin_verified && folding_verified && decision;
    }
};
} // namespace bb