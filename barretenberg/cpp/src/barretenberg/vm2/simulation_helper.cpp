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
#include "barretenberg/vm2/simulation/ecc.hpp"
#include "barretenberg/vm2/simulation/events/address_derivation_event.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/bitwise_event.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/events/class_id_derivation_event.hpp"
#include "barretenberg/vm2/simulation/events/ecc_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/events/sha256_event.hpp"
#include "barretenberg/vm2/simulation/events/siloing_event.hpp"
#include "barretenberg/vm2/simulation/execution.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/simulation/lib/raw_data_db.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"
#include "barretenberg/vm2/simulation/sha256.hpp"
#include "barretenberg/vm2/simulation/siloing.hpp"
#include "barretenberg/vm2/simulation/tx_execution.hpp"

namespace bb::avm2 {

using namespace bb::avm2::simulation;

namespace {

// Configuration for full simulation (for proving).
struct ProvingSettings {
    template <typename E> using DefaultEventEmitter = EventEmitter<E>;
    template <typename E> using DefaultDeduplicatingEventEmitter = DeduplicatingEventEmitter<E>;
};

// Configuration for fast simulation.
struct FastSettings {
    template <typename E> using DefaultEventEmitter = NoopEventEmitter<E>;
    template <typename E> using DefaultDeduplicatingEventEmitter = NoopEventEmitter<E>;
};

} // namespace

template <typename S> EventsContainer AvmSimulationHelper::simulate_with_settings()
{
    typename S::template DefaultEventEmitter<ExecutionEvent> execution_emitter;
    typename S::template DefaultEventEmitter<AluEvent> alu_emitter;
    typename S::template DefaultEventEmitter<BitwiseEvent> bitwise_emitter;
    typename S::template DefaultEventEmitter<MemoryEvent> memory_emitter;
    typename S::template DefaultEventEmitter<AddressingEvent> addressing_emitter;
    typename S::template DefaultEventEmitter<BytecodeRetrievalEvent> bytecode_retrieval_emitter;
    typename S::template DefaultEventEmitter<BytecodeHashingEvent> bytecode_hashing_emitter;
    typename S::template DefaultEventEmitter<BytecodeDecompositionEvent> bytecode_decomposition_emitter;
    typename S::template DefaultDeduplicatingEventEmitter<InstructionFetchingEvent> instruction_fetching_emitter;
    typename S::template DefaultEventEmitter<AddressDerivationEvent> address_derivation_emitter;
    typename S::template DefaultEventEmitter<ClassIdDerivationEvent> class_id_derivation_emitter;
    typename S::template DefaultEventEmitter<SiloingEvent> siloing_emitter;
    typename S::template DefaultEventEmitter<Sha256CompressionEvent> sha256_compression_emitter;
    typename S::template DefaultEventEmitter<EccAddEvent> ecc_add_emitter;
    typename S::template DefaultEventEmitter<Poseidon2HashEvent> poseidon2_hash_emitter;
    typename S::template DefaultEventEmitter<Poseidon2PermutationEvent> poseidon2_perm_emitter;

    HintedRawDataDB db(inputs.hints);
    AddressDerivation address_derivation(address_derivation_emitter);
    Poseidon2 poseidon2(poseidon2_hash_emitter, poseidon2_perm_emitter);
    BytecodeHasher bytecode_hasher(poseidon2, bytecode_hashing_emitter);
    ClassIdDerivation class_id_derivation(class_id_derivation_emitter);
    Siloing siloing(siloing_emitter);
    // TODO: I'm not using the siloing gadget yet here.
    // It should probably not be in bytecode_manager, but in sth related to the contract instance.
    TxBytecodeManager bytecode_manager(db,
                                       address_derivation,
                                       bytecode_hasher,
                                       class_id_derivation,
                                       bytecode_retrieval_emitter,
                                       bytecode_decomposition_emitter,
                                       instruction_fetching_emitter);
    ContextProvider context_provider(bytecode_manager, memory_emitter);

    Alu alu(alu_emitter);
    InstructionInfoDB instruction_info_db;
    Addressing addressing(instruction_info_db, addressing_emitter);
    ContextStack context_stack;
    Execution execution(alu, addressing, context_provider, context_stack, instruction_info_db, execution_emitter);
    TxExecution tx_execution(execution);
    Sha256 sha256(sha256_compression_emitter);
    Ecc ecc_add(ecc_add_emitter);

    tx_execution.simulate({ .enqueued_calls = inputs.enqueuedCalls });

    return { execution_emitter.dump_events(),
             alu_emitter.dump_events(),
             bitwise_emitter.dump_events(),
             memory_emitter.dump_events(),
             addressing_emitter.dump_events(),
             bytecode_retrieval_emitter.dump_events(),
             bytecode_hashing_emitter.dump_events(),
             bytecode_decomposition_emitter.dump_events(),
             instruction_fetching_emitter.dump_events(),
             address_derivation_emitter.dump_events(),
             class_id_derivation_emitter.dump_events(),
             siloing_emitter.dump_events(),
             sha256_compression_emitter.dump_events(),
             ecc_add_emitter.dump_events(),
             poseidon2_hash_emitter.dump_events(),
             poseidon2_perm_emitter.dump_events() };
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
