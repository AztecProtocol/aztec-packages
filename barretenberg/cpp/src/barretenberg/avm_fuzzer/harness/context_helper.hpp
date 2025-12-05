#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/gadgets/bytecode_hashing.hpp"
#include "barretenberg/vm2/simulation/gadgets/bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/gadgets/calldata_hashing.hpp"
#include "barretenberg/vm2/simulation/gadgets/contract_instance_manager.hpp"
#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/internal_call_stack_manager.hpp"
#include "barretenberg/vm2/simulation/gadgets/merkle_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/update_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/written_public_data_slots_tree_check.hpp"
#include "barretenberg/vm2/simulation/interfaces/context.hpp"
#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/lib/side_effect_tracker.hpp"

namespace bb::avm2::fuzzing {

using namespace bb::avm2::simulation;

/**
 * @brief Sets up gadgets and instance managers to provide a
 * context for fuzzing. NOTE: rudimentary set up for testing, should likely be merged
 * with TestSimulator in fuzz_lib in future
 *
 * TODO(MW): I just set the ones I needed to be accessed as public, with others in private and
 * gadgets in the constructor - will clean this up
 *
 * @param contract_address The address to be configured in the context
 * @param is_static Whether this call is static (defaults to false)
 * @param phase The phase (defaults to APP_LOGIC)
 * @param start_clk The starting clk (defaults to 0)
 * @return A context interface to be passed to fuzzed gadgets
 */
class GadgetFuzzerContextHelper {
  public:
    GadgetFuzzerContextHelper(AztecAddress contract_address = AztecAddress(0),
                              bool is_static = false,
                              TransactionPhase phase = TransactionPhase::APP_LOGIC,
                              uint32_t start_clk = 0);
    // Commonly used emitters:
    DeduplicatingEventEmitter<RangeCheckEvent> range_check_emitter;
    DeduplicatingEventEmitter<GreaterThanEvent> greater_than_emitter;
    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_emitter;

    // Commonly used gadgets:
    ExecutionIdManager execution_id_manager;
    RangeCheck range_check;
    FieldGreaterThan field_gt;
    GreaterThan greater_than;
    // Side effect tracker:
    SideEffectTracker side_effect_tracker;

    // Context:

    std::unique_ptr<simulation::ContextInterface> context;

  private:
    // Emitters:
    EventEmitter<MemoryEvent> memory_emitter;
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    EventEmitter<Poseidon2PermutationMemoryEvent> perm_mem_event_emitter;
    EventEmitter<UpdateCheckEvent> update_check_emitter;
    EventEmitter<MerkleCheckEvent> merkle_check_emitter;
    EventEmitter<ContractInstanceRetrievalEvent> contract_instance_retrieval_emitter;
    EventEmitter<WrittenPublicDataSlotsTreeCheckEvent> written_public_data_slots_tree_check_emitter;
    EventEmitter<BytecodeRetrievalEvent> bytecode_retrieval_emitter;
    EventEmitter<BytecodeHashingEvent> bytecode_hashing_emitter;
    EventEmitter<BytecodeDecompositionEvent> bytecode_decomposition_emitter;
    EventEmitter<RetrievedBytecodesTreeCheckEvent> retrieved_bytecodes_tree_check_emitter;
    EventEmitter<CalldataEvent> calldata_event_emitter;
    EventEmitter<InternalCallStackEvent> internal_call_stack_emitter;
    DeduplicatingEventEmitter<InstructionFetchingEvent> instruction_fetching_emitter;

    // Gadgets:
    MerkleCheck merkle_check;
    Poseidon2 poseidon2;
    WrittenPublicDataSlotsTreeCheck written_public_data_slots_tree_check;
};

std::unique_ptr<simulation::ContextInterface> make_fuzzing_context(
    AztecAddress& contract_address, TransactionPhase phase = TransactionPhase::APP_LOGIC);

} // namespace bb::avm2::fuzzing
