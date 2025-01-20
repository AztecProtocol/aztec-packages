#include "barretenberg/vm2/simulation_helper.hpp"

#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/addressing.hpp"
#include "barretenberg/vm2/simulation/alu.hpp"
#include "barretenberg/vm2/simulation/bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/context_stack.hpp"
#include "barretenberg/vm2/simulation/execution.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/simulation/lib/raw_data_db.hpp"
#include "barretenberg/vm2/simulation/siloing.hpp"
#include "barretenberg/vm2/simulation/tx_execution.hpp"

namespace bb::avm2 {

using namespace bb::avm2::simulation;

namespace {

// Configuration for full simulation (for proving).
struct ProvingSettings {
    using ExecutionEventEmitter = EventEmitter<ExecutionEvent>;
    using AluEventEmitter = EventEmitter<AluEvent>;
    using MemoryEventEmitter = EventEmitter<MemoryEvent>;
    using AddressingEventEmitter = EventEmitter<AddressingEvent>;
    using BytecodeRetrievalEventEmitter = EventEmitter<BytecodeRetrievalEvent>;
    using BytecodeHashingEventEmitter = EventEmitter<BytecodeHashingEvent>;
    using BytecodeDecompositionEventEmitter = EventEmitter<BytecodeDecompositionEvent>;
    using AddressDerivationEventEmitter = EventEmitter<AddressDerivationEvent>;
    using ClassIdDerivationEventEmitter = EventEmitter<ClassIdDerivationEvent>;
    using SiloingEventEmitter = EventEmitter<SiloingEvent>;
};

// Configuration for fast simulation.
struct FastSettings {
    using ExecutionEventEmitter = NoopEventEmitter<ExecutionEvent>;
    using AluEventEmitter = NoopEventEmitter<AluEvent>;
    using MemoryEventEmitter = NoopEventEmitter<MemoryEvent>;
    using AddressingEventEmitter = NoopEventEmitter<AddressingEvent>;
    using BytecodeRetrievalEventEmitter = NoopEventEmitter<BytecodeRetrievalEvent>;
    using BytecodeHashingEventEmitter = NoopEventEmitter<BytecodeHashingEvent>;
    using BytecodeDecompositionEventEmitter = NoopEventEmitter<BytecodeDecompositionEvent>;
    using AddressDerivationEventEmitter = NoopEventEmitter<AddressDerivationEvent>;
    using ClassIdDerivationEventEmitter = NoopEventEmitter<ClassIdDerivationEvent>;
    using SiloingEventEmitter = NoopEventEmitter<SiloingEvent>;
};

} // namespace

template <typename S> EventsContainer AvmSimulationHelper::simulate_with_settings()
{
    typename S::ExecutionEventEmitter execution_emitter;
    typename S::AluEventEmitter alu_emitter;
    typename S::MemoryEventEmitter memory_emitter;
    typename S::AddressingEventEmitter addressing_emitter;
    typename S::BytecodeRetrievalEventEmitter bytecode_retrieval_emitter;
    typename S::BytecodeHashingEventEmitter bytecode_hashing_emitter;
    typename S::BytecodeDecompositionEventEmitter bytecode_decomposition_emitter;
    typename S::AddressDerivationEventEmitter address_derivation_emitter;
    typename S::ClassIdDerivationEventEmitter class_id_derivation_emitter;
    typename S::SiloingEventEmitter siloing_emitter;

    HintedRawDataDB db(inputs.hints);
    AddressDerivation address_derivation(address_derivation_emitter);
    ClassIdDerivation class_id_derivation(class_id_derivation_emitter);
    Siloing siloing(siloing_emitter);
    // TODO: I'm not using the siloing gadget yet here.
    // It should probably not be in bytecode_manager, but in sth related to the contract instance.
    TxBytecodeManager bytecode_manager(db,
                                       address_derivation,
                                       class_id_derivation,
                                       bytecode_retrieval_emitter,
                                       bytecode_hashing_emitter,
                                       bytecode_decomposition_emitter);
    ContextProvider context_provider(bytecode_manager, memory_emitter);

    Alu alu(alu_emitter);
    InstructionInfoDB instruction_info_db;
    Addressing addressing(instruction_info_db, addressing_emitter);
    ContextStack context_stack;
    Execution execution(alu, addressing, context_provider, context_stack, instruction_info_db, execution_emitter);
    TxExecution tx_execution(execution);

    tx_execution.simulate({ .enqueued_calls = inputs.enqueuedCalls });

    return { execution_emitter.dump_events(),
             alu_emitter.dump_events(),
             memory_emitter.dump_events(),
             addressing_emitter.dump_events(),
             bytecode_retrieval_emitter.dump_events(),
             bytecode_hashing_emitter.dump_events(),
             bytecode_decomposition_emitter.dump_events(),
             address_derivation_emitter.dump_events(),
             class_id_derivation_emitter.dump_events(),
             siloing_emitter.dump_events() };
}

EventsContainer AvmSimulationHelper::simulate()
{
    return simulate_with_settings<ProvingSettings>();
}

void AvmSimulationHelper::simulate_fast()
{
    simulate_with_settings<FastSettings>();
}

} // namespace bb::avm2