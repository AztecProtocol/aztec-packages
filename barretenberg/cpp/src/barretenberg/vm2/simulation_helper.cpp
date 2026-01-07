#include "barretenberg/vm2/simulation_helper.hpp"

#include <cstdint>

#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/interfaces/debug_log.hpp"
#include "barretenberg/vm2/simulation/interfaces/update_check.hpp"
#include "barretenberg/vm2/simulation/lib/call_stack_metadata_collector.hpp"
#include "barretenberg/vm2/simulation/lib/db_types.hpp"
#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/lib/hinting_dbs.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/simulation/lib/public_inputs_builder.hpp"
#include "barretenberg/vm2/simulation/lib/raw_data_dbs.hpp"
#include "barretenberg/vm2/simulation/lib/side_effect_tracker.hpp"
#include "barretenberg/vm2/simulation/lib/side_effect_tracking_db.hpp"

// Events.
#include "barretenberg/vm2/simulation/events/address_derivation_event.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/bitwise_event.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/events/class_id_derivation_event.hpp"
#include "barretenberg/vm2/simulation/events/contract_instance_retrieval_event.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/execution_event.hpp"
#include "barretenberg/vm2/simulation/events/field_gt_event.hpp"
#include "barretenberg/vm2/simulation/events/get_contract_instance_event.hpp"
#include "barretenberg/vm2/simulation/events/keccakf1600_event.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/events/merkle_check_event.hpp"
#include "barretenberg/vm2/simulation/events/nullifier_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/events/public_data_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/events/sha256_event.hpp"
#include "barretenberg/vm2/simulation/events/siloing_event.hpp"
#include "barretenberg/vm2/simulation/events/to_radix_event.hpp"
#include "barretenberg/vm2/simulation/events/tx_events.hpp"
#include "barretenberg/vm2/simulation/events/update_check.hpp"

// Gadgets.
#include "barretenberg/vm2/simulation/gadgets/addressing.hpp"
#include "barretenberg/vm2/simulation/gadgets/alu.hpp"
#include "barretenberg/vm2/simulation/gadgets/bitwise.hpp"
#include "barretenberg/vm2/simulation/gadgets/bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/gadgets/calldata_hashing.hpp"
#include "barretenberg/vm2/simulation/gadgets/concrete_dbs.hpp"
#include "barretenberg/vm2/simulation/gadgets/context.hpp"
#include "barretenberg/vm2/simulation/gadgets/contract_instance_manager.hpp"
#include "barretenberg/vm2/simulation/gadgets/data_copy.hpp"
#include "barretenberg/vm2/simulation/gadgets/ecc.hpp"
#include "barretenberg/vm2/simulation/gadgets/emit_unencrypted_log.hpp"
#include "barretenberg/vm2/simulation/gadgets/execution.hpp"
#include "barretenberg/vm2/simulation/gadgets/execution_components.hpp"
#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/get_contract_instance.hpp"
#include "barretenberg/vm2/simulation/gadgets/gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/keccakf1600.hpp"
#include "barretenberg/vm2/simulation/gadgets/memory.hpp"
#include "barretenberg/vm2/simulation/gadgets/merkle_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/sha256.hpp"
#include "barretenberg/vm2/simulation/gadgets/siloing.hpp"
#include "barretenberg/vm2/simulation/gadgets/to_radix.hpp"
#include "barretenberg/vm2/simulation/gadgets/tx_execution.hpp"
#include "barretenberg/vm2/simulation/gadgets/update_check.hpp"
#include "barretenberg/vm2/simulation/gadgets/written_public_data_slots_tree_check.hpp"

// Standalone.
#include "barretenberg/vm2/simulation/standalone/concrete_dbs.hpp"
#include "barretenberg/vm2/simulation/standalone/debug_log.hpp"
#include "barretenberg/vm2/simulation/standalone/hybrid_execution.hpp"
#include "barretenberg/vm2/simulation/standalone/noop_update_check.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_alu.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_bitwise.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_execution_components.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_gt.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_keccakf1600.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_memory.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_poseidon2.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_sha256.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_to_radix.hpp"
#include "barretenberg/vm2/simulation/standalone/written_public_data_slots_tree_check.hpp"

namespace bb::avm2 {

using namespace bb::avm2::simulation;

namespace {

PublicTxEffect extract_public_tx_effect(const TxExecutionResult& tx_execution_result,
                                        const SideEffectTrackerInterface& side_effect_tracker)
{
    PublicTxEffect public_tx_effect;
    const auto& side_effects = side_effect_tracker.get_side_effects();
    public_tx_effect.transaction_fee = tx_execution_result.transaction_fee;
    public_tx_effect.note_hashes = side_effects.note_hashes;
    public_tx_effect.nullifiers = side_effects.nullifiers;
    public_tx_effect.l2_to_l1_msgs = side_effects.l2_to_l1_messages;
    public_tx_effect.public_logs = side_effects.public_logs.to_logs();

    // We need to copy the storage writes slot to value in the order of the slots by insertion.
    for (uint32_t i = 0; i < side_effects.storage_writes_slots_by_insertion.size(); i++) {
        const auto& slot = side_effects.storage_writes_slots_by_insertion.at(i);
        const auto& value = side_effects.storage_writes_slot_to_value.at(slot);
        public_tx_effect.public_data_writes.push_back(PublicDataWrite{ .leaf_slot = slot, .value = value });
    }

    return public_tx_effect;
}

} // namespace

// Internal helper function for event-generating simulation (with full gadgets).
// NOTE: Some of the config parameters are ignored in this function.
template <template <typename> class DefaultEventEmitter, template <typename> class DefaultDeduplicatingEventEmitter>
std::tuple<EventsContainer, TxSimulationResult> AvmSimulationHelper::simulate_for_witgen_internal(
    ContractDBInterface& raw_contract_db,
    LowLevelMerkleDBInterface& raw_merkle_db,
    const PublicSimulatorConfig& config,
    const Tx& tx,
    const GlobalVariables& global_variables,
    const ProtocolContracts& protocol_contracts)
{
    BB_BENCH_NAME("AvmSimulationHelper::simulate_for_witgen_internal");

    DefaultEventEmitter<ExecutionEvent> execution_emitter;
    DefaultDeduplicatingEventEmitter<AluEvent> alu_emitter;
    DefaultDeduplicatingEventEmitter<BitwiseEvent> bitwise_emitter;
    DefaultEventEmitter<DataCopyEvent> data_copy_emitter;
    DefaultEventEmitter<MemoryEvent> memory_emitter;
    DefaultEventEmitter<BytecodeRetrievalEvent> bytecode_retrieval_emitter;
    DefaultEventEmitter<BytecodeHashingEvent> bytecode_hashing_emitter;
    DefaultEventEmitter<BytecodeDecompositionEvent> bytecode_decomposition_emitter;
    DefaultDeduplicatingEventEmitter<InstructionFetchingEvent> instruction_fetching_emitter;
    DefaultEventEmitter<AddressDerivationEvent> address_derivation_emitter;
    DefaultEventEmitter<ClassIdDerivationEvent> class_id_derivation_emitter;
    DefaultEventEmitter<SiloingEvent> siloing_emitter;
    DefaultEventEmitter<Sha256CompressionEvent> sha256_compression_emitter;
    DefaultEventEmitter<EccAddEvent> ecc_add_emitter;
    DefaultEventEmitter<ScalarMulEvent> scalar_mul_emitter;
    DefaultEventEmitter<EccAddMemoryEvent> ecc_add_memory_emitter;
    DefaultEventEmitter<Poseidon2HashEvent> poseidon2_hash_emitter;
    DefaultEventEmitter<Poseidon2PermutationEvent> poseidon2_perm_emitter;
    DefaultEventEmitter<Poseidon2PermutationMemoryEvent> poseidon2_perm_mem_emitter;
    DefaultEventEmitter<KeccakF1600Event> keccakf1600_emitter;
    DefaultEventEmitter<ToRadixEvent> to_radix_emitter;
    DefaultEventEmitter<ToRadixMemoryEvent> to_radix_memory_emitter;
    DefaultDeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_emitter;
    DefaultEventEmitter<MerkleCheckEvent> merkle_check_emitter;
    DefaultDeduplicatingEventEmitter<RangeCheckEvent> range_check_emitter;
    DefaultEventEmitter<ContextStackEvent> context_stack_emitter;
    DefaultEventEmitter<PublicDataTreeCheckEvent> public_data_tree_check_emitter;
    DefaultEventEmitter<UpdateCheckEvent> update_check_emitter;
    DefaultEventEmitter<NullifierTreeCheckEvent> nullifier_tree_check_emitter;
    DefaultEventEmitter<TxEvent> tx_event_emitter;
    DefaultEventEmitter<CalldataEvent> calldata_emitter;
    DefaultEventEmitter<InternalCallStackEvent> internal_call_stack_emitter;
    DefaultEventEmitter<NoteHashTreeCheckEvent> note_hash_tree_check_emitter;
    DefaultEventEmitter<WrittenPublicDataSlotsTreeCheckEvent> written_public_data_slots_tree_check_emitter;
    DefaultDeduplicatingEventEmitter<GreaterThanEvent> greater_than_emitter;
    DefaultEventEmitter<ContractInstanceRetrievalEvent> contract_instance_retrieval_emitter;
    DefaultEventEmitter<GetContractInstanceEvent> get_contract_instance_emitter;
    DefaultEventEmitter<L1ToL2MessageTreeCheckEvent> l1_to_l2_msg_tree_check_emitter;
    DefaultEventEmitter<EmitUnencryptedLogEvent> emit_unencrypted_log_emitter;
    DefaultEventEmitter<RetrievedBytecodesTreeCheckEvent> retrieved_bytecodes_tree_check_emitter;

    ExecutionIdManager execution_id_manager(1);
    RangeCheck range_check(range_check_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_emitter);
    GreaterThan greater_than(field_gt, range_check, greater_than_emitter);
    ToRadix to_radix(execution_id_manager, greater_than, to_radix_emitter, to_radix_memory_emitter);
    Poseidon2 poseidon2(
        execution_id_manager, greater_than, poseidon2_hash_emitter, poseidon2_perm_emitter, poseidon2_perm_mem_emitter);
    MerkleCheck merkle_check(poseidon2, merkle_check_emitter);
    PublicDataTreeCheck public_data_tree_check(
        poseidon2, merkle_check, field_gt, execution_id_manager, public_data_tree_check_emitter);
    WrittenPublicDataSlotsTreeCheck written_public_data_slots_tree_check(poseidon2,
                                                                         merkle_check,
                                                                         field_gt,
                                                                         build_public_data_slots_tree(),
                                                                         written_public_data_slots_tree_check_emitter);
    RetrievedBytecodesTreeCheck retrieved_bytecodes_tree_check(
        poseidon2, merkle_check, field_gt, build_retrieved_bytecodes_tree(), retrieved_bytecodes_tree_check_emitter);
    NullifierTreeCheck nullifier_tree_check(poseidon2, merkle_check, field_gt, nullifier_tree_check_emitter);

    // The protocol requires at least one non-revertible nullifier in the transaction (used for uniqueness of note
    // hashes).
    if (tx.non_revertible_accumulated_data.nullifiers.empty()) {
        throw std::runtime_error("Non-revertible nullifiers are empty in the transaction.");
    }

    NoteHashTreeCheck note_hash_tree_check(
        tx.non_revertible_accumulated_data.nullifiers.at(0), poseidon2, merkle_check, note_hash_tree_check_emitter);
    L1ToL2MessageTreeCheck l1_to_l2_msg_tree_check(merkle_check, l1_to_l2_msg_tree_check_emitter);
    EmitUnencryptedLog emit_unencrypted_log_component(execution_id_manager, greater_than, emit_unencrypted_log_emitter);
    Alu alu(greater_than, field_gt, range_check, alu_emitter);
    Bitwise bitwise(bitwise_emitter);
    Sha256 sha256(execution_id_manager, bitwise, greater_than, sha256_compression_emitter);
    KeccakF1600 keccakf1600(execution_id_manager, keccakf1600_emitter, bitwise, range_check, greater_than);

    Ecc ecc(execution_id_manager, greater_than, to_radix, ecc_add_emitter, scalar_mul_emitter, ecc_add_memory_emitter);
    AddressDerivation address_derivation(poseidon2, ecc, address_derivation_emitter);
    ClassIdDerivation class_id_derivation(poseidon2, class_id_derivation_emitter);

    ContractDB contract_db(raw_contract_db, address_derivation, class_id_derivation, protocol_contracts);

    MerkleDB base_merkle_db(raw_merkle_db,
                            public_data_tree_check,
                            nullifier_tree_check,
                            note_hash_tree_check,
                            written_public_data_slots_tree_check,
                            l1_to_l2_msg_tree_check);
    base_merkle_db.add_checkpoint_listener(note_hash_tree_check);
    base_merkle_db.add_checkpoint_listener(nullifier_tree_check);
    base_merkle_db.add_checkpoint_listener(public_data_tree_check);
    // This one is only needed for events.
    base_merkle_db.add_checkpoint_listener(emit_unencrypted_log_component);

    // Side effect tracking is only strictly needed for logs and L2-to-L1 messages.
    SideEffectTracker side_effect_tracker;

    SideEffectTrackingDB merkle_db(
        tx.non_revertible_accumulated_data.nullifiers.at(0), base_merkle_db, side_effect_tracker);

    UpdateCheck update_check(poseidon2, range_check, greater_than, merkle_db, update_check_emitter, global_variables);

    BytecodeHasher bytecode_hasher(poseidon2, bytecode_hashing_emitter);
    Siloing siloing(siloing_emitter);
    InstructionInfoDB instruction_info_db;

    ContractInstanceManager contract_instance_manager(
        contract_db, merkle_db, update_check, field_gt, protocol_contracts, contract_instance_retrieval_emitter);

    TxBytecodeManager bytecode_manager(contract_db,
                                       merkle_db,
                                       bytecode_hasher,
                                       range_check,
                                       contract_instance_manager,
                                       retrieved_bytecodes_tree_check,
                                       bytecode_retrieval_emitter,
                                       bytecode_decomposition_emitter,
                                       instruction_fetching_emitter);
    ExecutionComponentsProvider execution_components(greater_than, instruction_info_db);

    MemoryProvider memory_provider(range_check, execution_id_manager, memory_emitter);
    CalldataHashingProvider calldata_hashing_provider(poseidon2, calldata_emitter);
    InternalCallStackManagerProvider internal_call_stack_manager_provider(internal_call_stack_emitter);
    ContextProvider context_provider(bytecode_manager,
                                     memory_provider,
                                     calldata_hashing_provider,
                                     internal_call_stack_manager_provider,
                                     merkle_db,
                                     written_public_data_slots_tree_check,
                                     retrieved_bytecodes_tree_check,
                                     side_effect_tracker,
                                     global_variables);
    DataCopy data_copy(execution_id_manager, greater_than, data_copy_emitter);

    // Create GetContractInstance opcode component
    GetContractInstance get_contract_instance(
        execution_id_manager, merkle_db, get_contract_instance_emitter, contract_instance_manager);

    NoopDebugLogger debug_log_component;
    auto call_stack_metadata_collector =
        config.collect_call_metadata ? static_cast<std::unique_ptr<CallStackMetadataCollectorInterface>>(
                                           std::make_unique<CallStackMetadataCollector>(config.collection_limits))
                                     : static_cast<std::unique_ptr<CallStackMetadataCollectorInterface>>(
                                           std::make_unique<NoopCallStackMetadataCollector>());

    Execution execution(alu,
                        bitwise,
                        data_copy,
                        poseidon2,
                        ecc,
                        to_radix,
                        sha256,
                        execution_components,
                        context_provider,
                        instruction_info_db,
                        execution_id_manager,
                        execution_emitter,
                        context_stack_emitter,
                        keccakf1600,
                        greater_than,
                        get_contract_instance,
                        emit_unencrypted_log_component,
                        debug_log_component,
                        merkle_db,
                        *call_stack_metadata_collector);

    TxExecution tx_execution(execution,
                             context_provider,
                             contract_db,
                             merkle_db,
                             written_public_data_slots_tree_check,
                             retrieved_bytecodes_tree_check,
                             side_effect_tracker,
                             field_gt,
                             poseidon2,
                             *call_stack_metadata_collector,
                             tx_event_emitter);

    PublicInputsBuilder public_inputs_builder;
    public_inputs_builder.extract_inputs(tx, global_variables, protocol_contracts, config.prover_id, raw_merkle_db);

    TxExecutionResult tx_execution_result = tx_execution.simulate(tx);

    public_inputs_builder.extract_outputs(raw_merkle_db,
                                          // TODO(MW): Use of billed_gas is a bit misleading - we want public + private
                                          // - teardown, which is stored as billed gas here/in ts:
                                          tx_execution_result.gas_used.billed_gas,
                                          tx_execution_result.transaction_fee,
                                          tx_execution_result.revert_code != RevertCode::OK,
                                          side_effect_tracker.get_side_effects());

    public_data_tree_check.generate_ff_gt_events_for_squashing(
        side_effect_tracker.get_side_effects().storage_writes_slots_by_insertion);

    EventsContainer events = {
        tx_event_emitter.dump_events(),
        execution_emitter.dump_events(),
        alu_emitter.dump_events(),
        bitwise_emitter.dump_events(),
        memory_emitter.dump_events(),
        bytecode_retrieval_emitter.dump_events(),
        bytecode_hashing_emitter.dump_events(),
        bytecode_decomposition_emitter.dump_events(),
        instruction_fetching_emitter.dump_events(),
        address_derivation_emitter.dump_events(),
        class_id_derivation_emitter.dump_events(),
        siloing_emitter.dump_events(),
        sha256_compression_emitter.dump_events(),
        ecc_add_emitter.dump_events(),
        scalar_mul_emitter.dump_events(),
        ecc_add_memory_emitter.dump_events(),
        poseidon2_hash_emitter.dump_events(),
        poseidon2_perm_emitter.dump_events(),
        poseidon2_perm_mem_emitter.dump_events(),
        keccakf1600_emitter.dump_events(),
        to_radix_emitter.dump_events(),
        to_radix_memory_emitter.dump_events(),
        field_gt_emitter.dump_events(),
        greater_than_emitter.dump_events(),
        merkle_check_emitter.dump_events(),
        range_check_emitter.dump_events(),
        context_stack_emitter.dump_events(),
        public_data_tree_check_emitter.dump_events(),
        update_check_emitter.dump_events(),
        nullifier_tree_check_emitter.dump_events(),
        data_copy_emitter.dump_events(),
        calldata_emitter.dump_events(),
        internal_call_stack_emitter.dump_events(),
        note_hash_tree_check_emitter.dump_events(),
        written_public_data_slots_tree_check_emitter.dump_events(),
        contract_instance_retrieval_emitter.dump_events(),
        get_contract_instance_emitter.dump_events(),
        l1_to_l2_msg_tree_check_emitter.dump_events(),
        emit_unencrypted_log_emitter.dump_events(),
        retrieved_bytecodes_tree_check_emitter.dump_events(),
    };

    TxSimulationResult tx_simulation_result = {
        .gas_used = tx_execution_result.gas_used,
        .revert_code = tx_execution_result.revert_code,
        .public_tx_effect = extract_public_tx_effect(tx_execution_result, side_effect_tracker),
        .call_stack_metadata = call_stack_metadata_collector->dump_call_stack_metadata(),
        .logs = debug_log_component.dump_logs(),
        .public_inputs =
            config.collect_public_inputs ? std::make_optional(public_inputs_builder.build()) : std::nullopt,
    };

    return { std::move(events), std::move(tx_simulation_result) };
}

// Internal helper function for fast simulation.
TxSimulationResult AvmSimulationHelper::simulate_fast_internal(ContractDBInterface& raw_contract_db,
                                                               LowLevelMerkleDBInterface& raw_merkle_db,
                                                               const PublicSimulatorConfig& config,
                                                               const Tx& tx,
                                                               const GlobalVariables& global_variables,
                                                               const ProtocolContracts& protocol_contracts,
                                                               CancellationTokenPtr cancellation_token)
{
    BB_BENCH_NAME("AvmSimulationHelper::simulate_fast_internal");

    NoopEventEmitter<ExecutionEvent> execution_emitter;
    NoopEventEmitter<DataCopyEvent> data_copy_emitter;
    NoopEventEmitter<EccAddEvent> ecc_add_emitter;
    NoopEventEmitter<ScalarMulEvent> scalar_mul_emitter;
    NoopEventEmitter<EccAddMemoryEvent> ecc_add_memory_emitter;
    NoopEventEmitter<FieldGreaterThanEvent> field_gt_emitter;
    NoopEventEmitter<MerkleCheckEvent> merkle_check_emitter;
    NoopEventEmitter<RangeCheckEvent> range_check_emitter;
    NoopEventEmitter<ContextStackEvent> context_stack_emitter;
    NoopEventEmitter<TxEvent> tx_event_emitter;
    NoopEventEmitter<CalldataEvent> calldata_emitter;
    NoopEventEmitter<InternalCallStackEvent> internal_call_stack_emitter;
    NoopEventEmitter<ContractInstanceRetrievalEvent> contract_instance_retrieval_emitter;
    NoopEventEmitter<GetContractInstanceEvent> get_contract_instance_emitter;
    NoopEventEmitter<EmitUnencryptedLogEvent> emit_unencrypted_log_emitter;
    NoopEventEmitter<RetrievedBytecodesTreeCheckEvent> retrieved_bytecodes_tree_check_emitter;
    NoopEventEmitter<UpdateCheckEvent> update_check_emitter;

    ExecutionIdManager execution_id_manager(1);
    RangeCheck range_check(range_check_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_emitter);
    PureGreaterThan greater_than;
    PureToRadix to_radix;
    PurePoseidon2 poseidon2;
    MerkleCheck merkle_check(poseidon2, merkle_check_emitter);
    PureWrittenPublicDataSlotsTreeCheck written_public_data_slots_tree_check(poseidon2);
    RetrievedBytecodesTreeCheck retrieved_bytecodes_tree_check(
        poseidon2, merkle_check, field_gt, build_retrieved_bytecodes_tree(), retrieved_bytecodes_tree_check_emitter);
    EmitUnencryptedLog emit_unencrypted_log_component(execution_id_manager, greater_than, emit_unencrypted_log_emitter);
    PureAlu alu;
    PureBitwise bitwise;
    PureSha256 sha256;
    PureKeccakF1600 keccakf1600;

    Ecc ecc(execution_id_manager, greater_than, to_radix, ecc_add_emitter, scalar_mul_emitter, ecc_add_memory_emitter);

    SideEffectTracker side_effect_tracker;
    PureContractDB contract_db(raw_contract_db);

    // The protocol requires at least one non-revertible nullifier in the transaction (used for uniqueness of note
    // hashes).
    if (tx.non_revertible_accumulated_data.nullifiers.empty()) {
        throw std::runtime_error("Non-revertible nullifiers are empty in the transaction.");
    }

    PureMerkleDB base_merkle_db(
        tx.non_revertible_accumulated_data.nullifiers.at(0), raw_merkle_db, written_public_data_slots_tree_check);
    SideEffectTrackingDB merkle_db(

        tx.non_revertible_accumulated_data.nullifiers.at(0), base_merkle_db, side_effect_tracker);

    NoopUpdateCheck update_check;
    InstructionInfoDB instruction_info_db;

    ContractInstanceManager contract_instance_manager(
        contract_db, merkle_db, update_check, field_gt, protocol_contracts, contract_instance_retrieval_emitter);
    PureTxBytecodeManager tx_bytecode_manager(contract_db, contract_instance_manager);

    PureExecutionComponentsProvider execution_components(greater_than, instruction_info_db);

    PureMemoryProvider memory_provider;
    CalldataHashingProvider calldata_hashing_provider(poseidon2, calldata_emitter);
    InternalCallStackManagerProvider internal_call_stack_manager_provider(internal_call_stack_emitter);
    ContextProvider context_provider(tx_bytecode_manager,
                                     memory_provider,
                                     calldata_hashing_provider,
                                     internal_call_stack_manager_provider,
                                     merkle_db,
                                     written_public_data_slots_tree_check,
                                     retrieved_bytecodes_tree_check,
                                     side_effect_tracker,
                                     global_variables);
    DataCopy data_copy(execution_id_manager, greater_than, data_copy_emitter);

    // Create GetContractInstance opcode component
    GetContractInstance get_contract_instance(
        execution_id_manager, merkle_db, get_contract_instance_emitter, contract_instance_manager);

    std::unique_ptr<DebugLoggerInterface> debug_log_component = [&config]() -> std::unique_ptr<DebugLoggerInterface> {
        if (config.collect_debug_logs) {
            // TODO(fcarreiro): add debug log level?
            const DebugLogLevel debug_log_level = DebugLogLevel::INFO;
            return std::make_unique<DebugLogger>(debug_log_level,
                                                 config.collection_limits.max_debug_log_memory_reads,
                                                 [](const std::string& message) { vinfo(message); });
        } else {
            return std::make_unique<NoopDebugLogger>();
        }
    }();
    auto call_stack_metadata_collector =
        config.collect_call_metadata ? static_cast<std::unique_ptr<CallStackMetadataCollectorInterface>>(
                                           std::make_unique<CallStackMetadataCollector>(config.collection_limits))
                                     : static_cast<std::unique_ptr<CallStackMetadataCollectorInterface>>(
                                           std::make_unique<NoopCallStackMetadataCollector>());

    HybridExecution execution(alu,
                              bitwise,
                              data_copy,
                              poseidon2,
                              ecc,
                              to_radix,
                              sha256,
                              execution_components,
                              context_provider,
                              instruction_info_db,
                              execution_id_manager,
                              execution_emitter,
                              context_stack_emitter,
                              keccakf1600,
                              greater_than,
                              get_contract_instance,
                              emit_unencrypted_log_component,
                              *debug_log_component,
                              merkle_db,
                              *call_stack_metadata_collector,
                              cancellation_token);
    TxExecution tx_execution(execution,
                             context_provider,
                             contract_db,
                             merkle_db,
                             written_public_data_slots_tree_check,
                             retrieved_bytecodes_tree_check,
                             side_effect_tracker,
                             field_gt,
                             poseidon2,
                             *call_stack_metadata_collector,
                             tx_event_emitter,
                             config.skip_fee_enforcement);

    PublicInputsBuilder public_inputs_builder;
    public_inputs_builder.extract_inputs(tx, global_variables, protocol_contracts, config.prover_id, raw_merkle_db);

    // This triggers all the work.
    TxExecutionResult tx_execution_result = tx_execution.simulate(tx);

    public_inputs_builder.extract_outputs(raw_merkle_db,
                                          // TODO(MW): Use of billed_gas is a bit misleading - we want public + private
                                          // - teardown, which is stored as billed gas here/in ts:
                                          tx_execution_result.gas_used.billed_gas,
                                          tx_execution_result.transaction_fee,
                                          tx_execution_result.revert_code != RevertCode::OK,
                                          side_effect_tracker.get_side_effects());

    return {
        // Simulation.
        .gas_used = tx_execution_result.gas_used,
        .revert_code = tx_execution_result.revert_code,
        .public_tx_effect = extract_public_tx_effect(tx_execution_result, side_effect_tracker),
        .call_stack_metadata = call_stack_metadata_collector->dump_call_stack_metadata(),
        .logs = debug_log_component->dump_logs(),
        // Proving request data.
        .public_inputs =
            config.collect_public_inputs ? std::make_optional(public_inputs_builder.build()) : std::nullopt,
        .hints = std::nullopt, // NOTE: hints are injected by the caller.
    };
}

/************************************
 * Entry points
 ************************************/

TxSimulationResult AvmSimulationHelper::simulate_fast_with_existing_ws(
    simulation::ContractDBInterface& raw_contract_db,
    const world_state::WorldStateRevision& world_state_revision,
    world_state::WorldState& ws,
    const PublicSimulatorConfig& config,
    const Tx& tx,
    const GlobalVariables& global_variables,
    const ProtocolContracts& protocol_contracts,
    CancellationTokenPtr cancellation_token)
{
    // For collecting hints, use the other method.
    BB_ASSERT(!config.collect_hints && "Use simulate_for_hint_collection instead");

    // Create PureRawMerkleDB with the provided WorldState instance and cancellation token
    PureRawMerkleDB raw_merkle_db(world_state_revision, ws, /*cache_tree_roots=*/true, cancellation_token);

    return simulate_fast_internal(
        raw_contract_db, raw_merkle_db, config, tx, global_variables, protocol_contracts, cancellation_token);
}

TxSimulationResult AvmSimulationHelper::simulate_for_hint_collection(
    simulation::ContractDBInterface& raw_contract_db,
    const world_state::WorldStateRevision& world_state_revision,
    world_state::WorldState& ws,
    const PublicSimulatorConfig& config,
    const Tx& tx,
    const GlobalVariables& global_variables,
    const ProtocolContracts& protocol_contracts,
    CancellationTokenPtr cancellation_token)
{
    // If you are not collecting hints, don't use this method.
    BB_ASSERT(config.collect_hints && "Use simulate_fast_with_existing_ws instead");

    // Create PureRawMerkleDB with the provided WorldState instance and cancellation token
    PureRawMerkleDB raw_merkle_db(world_state_revision, ws, /*cache_tree_roots=*/true, cancellation_token);

    auto starting_tree_roots = raw_merkle_db.get_tree_roots();
    HintingContractsDB hinting_contract_db(raw_contract_db);
    HintingRawDB hinting_merkle_db(raw_merkle_db);

    // We use NoopEventEmitters here because we don't want to collect events.
    auto [/* unused */ events_, tx_result] = simulate_for_witgen_internal<NoopEventEmitter, NoopEventEmitter>(
        hinting_contract_db, hinting_merkle_db, config, tx, global_variables, protocol_contracts);

    ExecutionHints collected_hints = ExecutionHints{ .global_variables = global_variables,
                                                     .tx = tx,
                                                     .protocol_contracts = protocol_contracts,
                                                     .starting_tree_roots = starting_tree_roots };
    hinting_contract_db.dump_hints(collected_hints);
    hinting_merkle_db.dump_hints(collected_hints);

    tx_result.hints = std::move(collected_hints);

    // Need to std::move to avoid copying (due to structured bindings).
    // This was fixed in C++23 via http://wg21.link/P2266R3.
    return std::move(tx_result);
}

EventsContainer AvmSimulationHelper::simulate_for_witgen(const ExecutionHints& hints)
{
    // TODO(fcarreiro): decide if we want to pass a config here.
    const PublicSimulatorConfig config{};

    HintedRawContractDB raw_contract_db(hints);
    HintedRawMerkleDB raw_merkle_db(hints);

    // We use EventEmitters and DeduplicatingEventEmitters here because we want to collect events.
    auto [events, /* unused */ tx_result_] = simulate_for_witgen_internal<EventEmitter, DeduplicatingEventEmitter>(
        raw_contract_db, raw_merkle_db, config, hints.tx, hints.global_variables, hints.protocol_contracts);

    // Need to std::move to avoid copying (due to structured bindings).
    // This was fixed in C++23 via http://wg21.link/P2266R3.
    return std::move(events);
}

TxSimulationResult AvmSimulationHelper::simulate_fast_with_hinted_dbs(const ExecutionHints& hints,
                                                                      const PublicSimulatorConfig& config)
{
    HintedRawContractDB raw_contract_db(hints);
    HintedRawMerkleDB raw_merkle_db(hints);
    return simulate_fast_internal(
        raw_contract_db, raw_merkle_db, config, hints.tx, hints.global_variables, hints.protocol_contracts);
}

} // namespace bb::avm2
