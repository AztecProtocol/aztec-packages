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
    using Flavor = GoblinUltraFlavor;
    using FF = Flavor::FF;
    using FoldingOutput = FoldingResult<Flavor>;
    using FoldProof = std::vector<FF>;
    using Accumulator = std::shared_ptr<ProverInstance_<Flavor>>;
    using Instance = ProverInstance_<GoblinUltraFlavor>;
    using Composer = GoblinUltraComposer;

  public:
    using ClientCircuit = GoblinUltraCircuitBuilder; // can only be GoblinUltra
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
        merge(circuit);
        Composer composer;
        accumulator = composer.create_instance(circuit);
    }

    FoldProof accumulate(ClientCircuit& circuit)
    {
        merge(circuit);
        Composer composer;
        auto instance = composer.create_instance(circuit);
        std::vector<std::shared_ptr<Instance>> instances{ accumulator, instance };
        auto folding_prover = composer.create_folding_prover(instances);
        FoldingOutput output = folding_prover.fold_instances();
        accumulator = output.accumulator;
        return output.folding_data;
    }

    void merge(ClientCircuit& circuit_builder) { goblin.merge(circuit_builder); }
};
} // namespace bb