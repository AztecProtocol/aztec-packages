#pragma once

#include "barretenberg/eccvm/eccvm_composer.hpp"
#include "barretenberg/flavor/goblin_ultra.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/proof_system/circuit_builder/eccvm/eccvm_circuit_builder.hpp"
#include "barretenberg/proof_system/circuit_builder/goblin_translator_circuit_builder.hpp"
#include "barretenberg/proof_system/circuit_builder/goblin_ultra_circuit_builder.hpp"
#include "barretenberg/proof_system/instance_inspector.hpp"
#include "barretenberg/stdlib/recursion/honk/verifier/merge_recursive_verifier.hpp"
#include "barretenberg/translator_vm/goblin_translator_composer.hpp"
#include "barretenberg/ultra_honk/merge_prover.hpp"
#include "barretenberg/ultra_honk/merge_verifier.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"

namespace bb {

class ClientIVC {

    struct Proof {
        Goblin::Proof goblin_proof;
        HonkProof decider_proof;
    };

  public:
    using Flavor = GoblinUltraFlavor;
    using FF = Flavor::FF;
    using FoldProof = std::vector<FF>;
    using Accumulator = std::shared_ptr<ProverInstance_<Flavor>>;
    using ClientCircuit = GoblinUltraCircuitBuilder; // can only be GoblinUltra

  private:
    using FoldingOutput = FoldingResult<Flavor>;
    using Instance = ProverInstance_<GoblinUltraFlavor>;
    using Composer = GoblinUltraComposer;

  public:
    Goblin goblin;
    Accumulator accumulator;

    ClientIVC()
    {
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/723):
        GoblinMockCircuits::perform_op_queue_interactions_for_mock_first_circuit(goblin.op_queue);
    }

  private:
  public:
    void initialize(ClientCircuit& circuit)
    {
        goblin.merge(circuit);
        Composer composer;
        accumulator = composer.create_instance(circuit);
    }

    FoldProof accumulate(ClientCircuit& circuit)
    {
        goblin.merge(circuit);
        Composer composer;
        auto instance = composer.create_instance(circuit);
        std::vector<std::shared_ptr<Instance>> instances{ accumulator, instance };
        auto folding_prover = composer.create_folding_prover(instances);
        FoldingOutput output = folding_prover.fold_instances();
        accumulator = output.accumulator;
        return output.folding_data;
    }

    Proof prove()
    {
        // Construct Goblin proof (merge, eccvm, translator)
        auto goblin_proof = goblin.prove();

        // Construct decider proof for final accumulator
        Composer composer;
        auto decider_prover = composer.create_decider_prover(accumulator);
        auto decider_proof = decider_prover.construct_proof();
        return { goblin_proof, decider_proof };
    }

    bool verify(Proof& proof)
    {
        // Goblin verification (merge, eccvm, translator)
        bool goblin_verified = goblin.verify(proof.goblin_proof);

        // Decider verification
        Composer composer;
        // NOTE: Use of member accumulator here will go away with removal of vkey from ProverInstance
        auto decider_verifier = composer.create_decider_verifier(accumulator);
        bool decision = decider_verifier.verify_proof(proof.decider_proof);
        return decision && goblin_verified;
    }
};
} // namespace bb