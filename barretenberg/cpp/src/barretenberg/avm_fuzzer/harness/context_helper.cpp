#include "context_helper.hpp"

#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/simulator.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/update_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/gadgets/context.hpp"
#include "barretenberg/vm2/simulation/gadgets/context_provider.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/interfaces/context.hpp"
#include "barretenberg/vm2/simulation/lib/raw_data_dbs.hpp"
#include "barretenberg/vm2/simulation/lib/side_effect_tracking_db.hpp"
#include "barretenberg/vm2/simulation/standalone/concrete_dbs.hpp"

namespace bb::avm2::fuzzing {

using namespace bb::avm2::simulation;

GadgetFuzzerContextHelper::GadgetFuzzerContextHelper(AztecAddress contract_address, bool is_static, uint32_t start_clk)
    : execution_id_manager(start_clk)
    , range_check(range_check_emitter)
    , field_gt(range_check, field_gt_emitter)
    , greater_than(field_gt, range_check, greater_than_emitter)
    , memory_provider(range_check, execution_id_manager, memory_emitter)
    , merkle_check(poseidon2, merkle_check_emitter)
    , poseidon2(execution_id_manager, greater_than, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter)
    , written_public_data_slots_tree_check(poseidon2,
                                           merkle_check,
                                           field_gt,
                                           build_public_data_slots_tree(),
                                           written_public_data_slots_tree_check_emitter)
    , retrieved_bytecodes_tree_check(
          poseidon2, merkle_check, field_gt, build_retrieved_bytecodes_tree(), retrieved_bytecodes_tree_check_emitter)

{
    global_variables = create_default_globals();
    hints.global_variables = global_variables;
    hints.tx = create_default_tx(contract_address, contract_address, {}, FF(0), is_static, GAS_LIMIT);

    HintedRawContractDB contract_db(hints);
    auto merkle_db = make_empty_merkle_db();

    BytecodeHasher bytecode_hasher(poseidon2, bytecode_hashing_emitter);
    CalldataHashingProvider calldata_hashing_provider(poseidon2, calldata_event_emitter);

    UpdateCheck update_check(
        poseidon2, range_check, greater_than, merkle_db, update_check_emitter, hints.global_variables);
    RetrievedBytecodesTreeCheck retrieved_bytecodes_tree_check(
        poseidon2, merkle_check, field_gt, build_retrieved_bytecodes_tree(), retrieved_bytecodes_tree_check_emitter);
    ContractInstanceManager contract_instance_manager(
        contract_db, merkle_db, update_check, field_gt, hints.protocol_contracts, contract_instance_retrieval_emitter);
    InternalCallStackManagerProvider internal_call_stack_manager_provider(internal_call_stack_emitter);
    tx_bytecode_manager = std::make_unique<TxBytecodeManager>(contract_db,
                                                              merkle_db,
                                                              bytecode_hasher,
                                                              range_check,
                                                              contract_instance_manager,
                                                              retrieved_bytecodes_tree_check,
                                                              bytecode_retrieval_emitter,
                                                              bytecode_decomposition_emitter,
                                                              instruction_fetching_emitter);

    MemoryProvider mem_provider(range_check, execution_id_manager, memory_emitter);
    context_provider = std::make_unique<ContextProvider>(*tx_bytecode_manager,
                                                         mem_provider,
                                                         calldata_hashing_provider,
                                                         internal_call_stack_manager_provider,
                                                         merkle_db,
                                                         written_public_data_slots_tree_check,
                                                         retrieved_bytecodes_tree_check,
                                                         side_effect_tracker,
                                                         hints.global_variables);
}

// A lighter version of ContextProvider::make_enqueued_context
std::unique_ptr<ContextInterface> GadgetFuzzerContextHelper::make_enqueued_fuzzing_context(AztecAddress address,
                                                                                           AztecAddress msg_sender,
                                                                                           bool is_static,
                                                                                           FF transaction_fee,
                                                                                           std::span<const FF> calldata,
                                                                                           Gas gas_limit,
                                                                                           Gas gas_used,
                                                                                           TransactionPhase phase)
{
    auto merkle_db = make_empty_merkle_db();
    // Note: not incremented between contexts
    uint32_t context_id = context_provider->get_next_context_id();
    return std::make_unique<EnqueuedCallContext>(
        context_id,
        address,
        msg_sender,
        transaction_fee,
        is_static,
        gas_limit,
        gas_used,
        global_variables,
        std::make_unique<BytecodeManager>(address, *tx_bytecode_manager),
        memory_provider.make_memory(static_cast<uint16_t>(context_id)),
        InternalCallStackManagerProvider(internal_call_stack_emitter).make_internal_call_stack_manager(context_id),
        merkle_db,
        written_public_data_slots_tree_check,
        retrieved_bytecodes_tree_check,
        side_effect_tracker,
        phase,
        calldata);
}

// A lighter version of ContextProvider::make_nested_context
std::unique_ptr<ContextInterface> GadgetFuzzerContextHelper::make_nested_fuzzing_context(
    AztecAddress address, AztecAddress msg_sender, ContextInterface& parent_context, bool is_static, Gas gas_limit)
{

    HintedRawMerkleDB raw_merkle_db(hints);
    PureMerkleDB base_merkle_db(
        hints.tx.non_revertible_accumulated_data.nullifiers[0], raw_merkle_db, written_public_data_slots_tree_check);
    // TODO(MW): Using below causes segfault (probably stack too deep) with external call gadget fuzzer
    // auto merkle_db = make_empty_merkle_db();
    // Note: not incremented between contexts
    uint32_t context_id = context_provider->get_next_context_id();
    return std::make_unique<NestedContext>(
        context_id,
        parent_context.get_address(),
        msg_sender,
        parent_context.get_transaction_fee(),
        is_static,
        gas_limit,
        parent_context.get_globals(),
        std::make_unique<BytecodeManager>(address, *tx_bytecode_manager),
        memory_provider.make_memory(static_cast<uint16_t>(context_id)),
        InternalCallStackManagerProvider(internal_call_stack_emitter).make_internal_call_stack_manager(context_id),
        base_merkle_db,
        written_public_data_slots_tree_check,
        retrieved_bytecodes_tree_check,
        side_effect_tracker,
        parent_context.get_phase(),
        parent_context,
        0,
        0);
}

PureMerkleDB GadgetFuzzerContextHelper::make_empty_merkle_db()
{
    // DBs: Just for now - TODO(MW) use fuzzing dbs?
    HintedRawMerkleDB raw_merkle_db(hints);
    PureMerkleDB base_merkle_db(
        hints.tx.non_revertible_accumulated_data.nullifiers[0], raw_merkle_db, written_public_data_slots_tree_check);
    return base_merkle_db;
}
} // namespace bb::avm2::fuzzing
