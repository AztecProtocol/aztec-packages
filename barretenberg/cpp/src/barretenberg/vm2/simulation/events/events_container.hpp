#pragma once

#include "barretenberg/vm2/simulation/events/address_derivation_event.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/events/class_id_derivation_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/events/siloing_event.hpp"

namespace bb::avm2::simulation {

struct EventsContainer {
    EventEmitterInterface<ExecutionEvent>::Container execution;
    EventEmitterInterface<AluEvent>::Container alu;
    EventEmitterInterface<MemoryEvent>::Container memory;
    EventEmitterInterface<AddressingEvent>::Container addressing;
    EventEmitterInterface<BytecodeRetrievalEvent>::Container bytecode_retrieval;
    EventEmitterInterface<BytecodeHashingEvent>::Container bytecode_hashing;
    EventEmitterInterface<BytecodeDecompositionEvent>::Container bytecode_decomposition;
    EventEmitterInterface<AddressDerivationEvent>::Container address_derivation;
    EventEmitterInterface<ClassIdDerivationEvent>::Container class_id_derivation;
    EventEmitterInterface<SiloingEvent>::Container siloing;
};

} // namespace bb::avm2::simulation