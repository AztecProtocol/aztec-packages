#pragma once

#include "barretenberg/vm2/simulation/events/address_derivation_event.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/bitwise_event.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/events/class_id_derivation_event.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/events/field_gt_event.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/events/merkle_check_event.hpp"
#include "barretenberg/vm2/simulation/events/nullifier_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/events/poseidon2_event.hpp"
#include "barretenberg/vm2/simulation/events/public_data_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/events/sha256_event.hpp"
#include "barretenberg/vm2/simulation/events/siloing_event.hpp"
#include "barretenberg/vm2/simulation/events/to_radix_event.hpp"
#include "barretenberg/vm2/simulation/events/update_check.hpp"

namespace bb::avm2::simulation {

struct EventsContainer {
    EventEmitterInterface<ExecutionEvent>::Container execution;
    EventEmitterInterface<AluEvent>::Container alu;
    EventEmitterInterface<BitwiseEvent>::Container bitwise;
    EventEmitterInterface<MemoryEvent>::Container memory;
    EventEmitterInterface<BytecodeRetrievalEvent>::Container bytecode_retrieval;
    EventEmitterInterface<BytecodeHashingEvent>::Container bytecode_hashing;
    EventEmitterInterface<BytecodeDecompositionEvent>::Container bytecode_decomposition;
    EventEmitterInterface<InstructionFetchingEvent>::Container instruction_fetching;
    EventEmitterInterface<AddressDerivationEvent>::Container address_derivation;
    EventEmitterInterface<ClassIdDerivationEvent>::Container class_id_derivation;
    EventEmitterInterface<SiloingEvent>::Container siloing;
    EventEmitterInterface<Sha256CompressionEvent>::Container sha256_compression;
    EventEmitterInterface<EccAddEvent>::Container ecc_add;
    EventEmitterInterface<ScalarMulEvent>::Container scalar_mul;
    EventEmitterInterface<Poseidon2HashEvent>::Container poseidon2_hash;
    EventEmitterInterface<Poseidon2PermutationEvent>::Container poseidon2_permutation;
    EventEmitterInterface<ToRadixEvent>::Container to_radix;
    EventEmitterInterface<FieldGreaterThanEvent>::Container field_gt;
    EventEmitterInterface<MerkleCheckEvent>::Container merkle_check;
    EventEmitterInterface<RangeCheckEvent>::Container range_check;
    EventEmitterInterface<ContextStackEvent>::Container context_stack;
    EventEmitterInterface<PublicDataTreeCheckEvent>::Container public_data_tree_check_events;
    EventEmitterInterface<UpdateCheckEvent>::Container update_check_events;
    EventEmitterInterface<NullifierTreeCheckEvent>::Container nullifier_tree_check_events;
};

} // namespace bb::avm2::simulation
