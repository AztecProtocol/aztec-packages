#include "context_helper.hpp"

#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/simulator.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/update_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/context_provider.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/lib/raw_data_dbs.hpp"
#include "barretenberg/vm2/simulation/lib/side_effect_tracking_db.hpp"
#include "barretenberg/vm2/simulation/standalone/concrete_dbs.hpp"

namespace bb::avm2::fuzzing {

using namespace bb::avm2::simulation;

GadgetFuzzerContextHelper::GadgetFuzzerContextHelper(AztecAddress contract_address,
                                                     bool is_static,
                                                     TransactionPhase phase,
                                                     uint32_t start_clk)
    : execution_id_manager(start_clk)
    , range_check(range_check_emitter)
    , field_gt(range_check, field_gt_emitter)
    , greater_than(field_gt, range_check, greater_than_emitter)
    , merkle_check(poseidon2, merkle_check_emitter)
    , poseidon2(execution_id_manager, greater_than, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter)
    , written_public_data_slots_tree_check(poseidon2,
                                           merkle_check,
                                           field_gt,
                                           build_public_data_slots_tree(),
                                           written_public_data_slots_tree_check_emitter)
{

    bb::avm2::ExecutionHints hints;
    hints.global_variables = create_default_globals();
    hints.tx = create_default_tx(contract_address, contract_address, {}, FF(0), is_static, GAS_LIMIT);

    // DBs: Just for now - TODO(MW) use fuzzing dbs?
    HintedRawContractDB contract_db(hints);
    HintedRawMerkleDB raw_merkle_db(hints);
    PureMerkleDB base_merkle_db(
        hints.tx.non_revertible_accumulated_data.nullifiers[0], raw_merkle_db, written_public_data_slots_tree_check);
    SideEffectTrackingDB merkle_db(
        hints.tx.non_revertible_accumulated_data.nullifiers[0], base_merkle_db, side_effect_tracker);

    BytecodeHasher bytecode_hasher(poseidon2, bytecode_hashing_emitter);
    CalldataHashingProvider calldata_hashing_provider(poseidon2, calldata_event_emitter);

    UpdateCheck update_check(
        poseidon2, range_check, greater_than, merkle_db, update_check_emitter, hints.global_variables);
    RetrievedBytecodesTreeCheck retrieved_bytecodes_tree_check(
        poseidon2, merkle_check, field_gt, build_retrieved_bytecodes_tree(), retrieved_bytecodes_tree_check_emitter);
    ContractInstanceManager contract_instance_manager(
        contract_db, merkle_db, update_check, field_gt, hints.protocol_contracts, contract_instance_retrieval_emitter);
    InternalCallStackManagerProvider internal_call_stack_manager_provider(internal_call_stack_emitter);
    TxBytecodeManager bytecode_manager(contract_db,
                                       merkle_db,
                                       bytecode_hasher,
                                       range_check,
                                       contract_instance_manager,
                                       retrieved_bytecodes_tree_check,
                                       bytecode_retrieval_emitter,
                                       bytecode_decomposition_emitter,
                                       instruction_fetching_emitter);

    MemoryProvider mem_provider(range_check, execution_id_manager, memory_emitter);
    ContextProvider context_provider(bytecode_manager,
                                     mem_provider,
                                     calldata_hashing_provider,
                                     internal_call_stack_manager_provider,
                                     merkle_db,
                                     written_public_data_slots_tree_check,
                                     retrieved_bytecodes_tree_check,
                                     side_effect_tracker,
                                     hints.global_variables);

    context = context_provider.make_enqueued_context(contract_address,
                                                     contract_address,
                                                     FF(0),
                                                     {},
                                                     is_static,
                                                     hints.tx.gas_settings.gas_limits,
                                                     hints.tx.gas_used_by_private,
                                                     phase);
}

} // namespace bb::avm2::fuzzing
