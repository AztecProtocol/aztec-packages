#include "barretenberg/vm2/simulation_helper.hpp"

#include <cstdint>

#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

#include "barretenberg/vm2/simulation/interfaces/debug_log.hpp"
#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/simulation/lib/raw_data_dbs.hpp"

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
#include "barretenberg/vm2/simulation/gadgets/ecc.hpp"
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
#include "barretenberg/vm2/simulation/standalone/pure_memory.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_poseidon2.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_to_radix.hpp"
#include "barretenberg/vm2/simulation/standalone/written_public_data_slots_tree_check.hpp"

namespace bb::avm2 {

using namespace bb::avm2::simulation;

EventsContainer AvmSimulationHelper::simulate_for_witgen(const ExecutionHints& hints,
                                                         std::vector<PublicDataWrite> public_data_writes)
{
    BB_BENCH_NAME("AvmSimulationHelper::simulate_for_witgen");

    EventEmitter<ExecutionEvent> execution_emitter;
    DeduplicatingEventEmitter<AluEvent> alu_emitter;
    EventEmitter<BitwiseEvent> bitwise_emitter;
    EventEmitter<DataCopyEvent> data_copy_emitter;
    EventEmitter<MemoryEvent> memory_emitter;
    EventEmitter<BytecodeRetrievalEvent> bytecode_retrieval_emitter;
    EventEmitter<BytecodeHashingEvent> bytecode_hashing_emitter;
    EventEmitter<BytecodeDecompositionEvent> bytecode_decomposition_emitter;
    DeduplicatingEventEmitter<InstructionFetchingEvent> instruction_fetching_emitter;
    EventEmitter<AddressDerivationEvent> address_derivation_emitter;
    EventEmitter<ClassIdDerivationEvent> class_id_derivation_emitter;
    EventEmitter<SiloingEvent> siloing_emitter;
    EventEmitter<Sha256CompressionEvent> sha256_compression_emitter;
    EventEmitter<EccAddEvent> ecc_add_emitter;
    EventEmitter<ScalarMulEvent> scalar_mul_emitter;
    EventEmitter<EccAddMemoryEvent> ecc_add_memory_emitter;
    EventEmitter<Poseidon2HashEvent> poseidon2_hash_emitter;
    EventEmitter<Poseidon2PermutationEvent> poseidon2_perm_emitter;
    EventEmitter<Poseidon2PermutationMemoryEvent> poseidon2_perm_mem_emitter;
    EventEmitter<KeccakF1600Event> keccakf1600_emitter;
    EventEmitter<ToRadixEvent> to_radix_emitter;
    EventEmitter<ToRadixMemoryEvent> to_radix_memory_emitter;
    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_emitter;
    EventEmitter<MerkleCheckEvent> merkle_check_emitter;
    DeduplicatingEventEmitter<RangeCheckEvent> range_check_emitter;
    EventEmitter<ContextStackEvent> context_stack_emitter;
    EventEmitter<PublicDataTreeCheckEvent> public_data_tree_check_emitter;
    EventEmitter<UpdateCheckEvent> update_check_emitter;
    EventEmitter<NullifierTreeCheckEvent> nullifier_tree_check_emitter;
    EventEmitter<TxEvent> tx_event_emitter;
    EventEmitter<CalldataEvent> calldata_emitter;
    EventEmitter<InternalCallStackEvent> internal_call_stack_emitter;
    EventEmitter<NoteHashTreeCheckEvent> note_hash_tree_check_emitter;
    EventEmitter<WrittenPublicDataSlotsTreeCheckEvent> written_public_data_slots_tree_check_emitter;
    DeduplicatingEventEmitter<GreaterThanEvent> greater_than_emitter;
    EventEmitter<ContractInstanceRetrievalEvent> contract_instance_retrieval_emitter;
    EventEmitter<GetContractInstanceEvent> get_contract_instance_emitter;
    EventEmitter<L1ToL2MessageTreeCheckEvent> l1_to_l2_msg_tree_check_emitter;
    EventEmitter<EmitUnencryptedLogEvent> emit_unencrypted_log_emitter;
    EventEmitter<RetrievedBytecodesTreeCheckEvent> retrieved_bytecodes_tree_check_emitter;

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
    NoteHashTreeCheck note_hash_tree_check(
        hints.tx.nonRevertibleAccumulatedData.nullifiers[0], poseidon2, merkle_check, note_hash_tree_check_emitter);
    L1ToL2MessageTreeCheck l1_to_l2_msg_tree_check(merkle_check, l1_to_l2_msg_tree_check_emitter);
    EmitUnencryptedLog emit_unencrypted_log_component(execution_id_manager, greater_than, emit_unencrypted_log_emitter);
    Alu alu(greater_than, field_gt, range_check, alu_emitter);
    Bitwise bitwise(bitwise_emitter);
    Sha256 sha256(execution_id_manager, bitwise, greater_than, sha256_compression_emitter);
    KeccakF1600 keccakf1600(execution_id_manager, keccakf1600_emitter, bitwise, range_check, greater_than);

    Ecc ecc(execution_id_manager, greater_than, to_radix, ecc_add_emitter, scalar_mul_emitter, ecc_add_memory_emitter);
    AddressDerivation address_derivation(poseidon2, ecc, address_derivation_emitter);
    ClassIdDerivation class_id_derivation(poseidon2, class_id_derivation_emitter);
    HintedRawContractDB raw_contract_db(hints);
    HintedRawMerkleDB raw_merkle_db(hints);

    ContractDB contract_db(raw_contract_db, address_derivation, class_id_derivation, hints.protocolContracts);

    MerkleDB merkle_db(raw_merkle_db,
                       public_data_tree_check,
                       nullifier_tree_check,
                       note_hash_tree_check,
                       written_public_data_slots_tree_check,
                       l1_to_l2_msg_tree_check);
    merkle_db.add_checkpoint_listener(note_hash_tree_check);
    merkle_db.add_checkpoint_listener(nullifier_tree_check);
    merkle_db.add_checkpoint_listener(public_data_tree_check);
    merkle_db.add_checkpoint_listener(emit_unencrypted_log_component);

    UpdateCheck update_check(
        poseidon2, range_check, greater_than, merkle_db, update_check_emitter, hints.globalVariables);

    BytecodeHasher bytecode_hasher(poseidon2, bytecode_hashing_emitter);
    Siloing siloing(siloing_emitter);
    InstructionInfoDB instruction_info_db;

    ContractInstanceManager contract_instance_manager(
        contract_db, merkle_db, update_check, field_gt, hints.protocolContracts, contract_instance_retrieval_emitter);

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
                                     hints.globalVariables);
    DataCopy data_copy(execution_id_manager, greater_than, data_copy_emitter);

    // Create GetContractInstance opcode component
    GetContractInstance get_contract_instance(
        execution_id_manager, merkle_db, get_contract_instance_emitter, contract_instance_manager);

    NoopDebugLogger debug_log_component;

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
                        merkle_db);

    TxExecution tx_execution(execution,
                             context_provider,
                             merkle_db,
                             written_public_data_slots_tree_check,
                             retrieved_bytecodes_tree_check,
                             field_gt,
                             poseidon2,
                             tx_event_emitter);

    tx_execution.simulate(hints.tx);

    public_data_tree_check.generate_ff_gt_events_for_squashing(public_data_writes);

    return {
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
}

void AvmSimulationHelper::simulate_fast(const ExecutionHints& hints)
{
    BB_BENCH_NAME("AvmSimulationHelper::simulate_fast");

    // TODO(fcarreiro): These should come from the simulate call.
    bool user_requested_simulation = false;
    DebugLogLevel debug_log_level = DebugLogLevel::INFO;
    uint32_t max_debug_log_memory_reads = DEFAULT_MAX_DEBUG_LOG_MEMORY_READS;

    NoopEventEmitter<ExecutionEvent> execution_emitter;
    NoopEventEmitter<DataCopyEvent> data_copy_emitter;
    NoopEventEmitter<Sha256CompressionEvent> sha256_compression_emitter;
    NoopEventEmitter<EccAddEvent> ecc_add_emitter;
    NoopEventEmitter<ScalarMulEvent> scalar_mul_emitter;
    NoopEventEmitter<EccAddMemoryEvent> ecc_add_memory_emitter;
    NoopEventEmitter<KeccakF1600Event> keccakf1600_emitter;
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
    Sha256 sha256(execution_id_manager, bitwise, greater_than, sha256_compression_emitter);
    KeccakF1600 keccakf1600(execution_id_manager, keccakf1600_emitter, bitwise, range_check, greater_than);

    Ecc ecc(execution_id_manager, greater_than, to_radix, ecc_add_emitter, scalar_mul_emitter, ecc_add_memory_emitter);
    HintedRawContractDB raw_contract_db(hints);
    HintedRawMerkleDB raw_merkle_db(hints);

    PureContractDB contract_db(raw_contract_db);

    PureMerkleDB merkle_db(
        hints.tx.nonRevertibleAccumulatedData.nullifiers[0], raw_merkle_db, written_public_data_slots_tree_check);
    merkle_db.add_checkpoint_listener(emit_unencrypted_log_component);

    NoopUpdateCheck update_check;

    InstructionInfoDB instruction_info_db;

    ContractInstanceManager contract_instance_manager(
        contract_db, merkle_db, update_check, field_gt, hints.protocolContracts, contract_instance_retrieval_emitter);

    PureTxBytecodeManager bytecode_manager(contract_db, contract_instance_manager);
    PureExecutionComponentsProvider execution_components(greater_than, instruction_info_db);

    PureMemoryProvider memory_provider;
    CalldataHashingProvider calldata_hashing_provider(poseidon2, calldata_emitter);
    InternalCallStackManagerProvider internal_call_stack_manager_provider(internal_call_stack_emitter);
    ContextProvider context_provider(bytecode_manager,
                                     memory_provider,
                                     calldata_hashing_provider,
                                     internal_call_stack_manager_provider,
                                     merkle_db,
                                     written_public_data_slots_tree_check,
                                     retrieved_bytecodes_tree_check,
                                     hints.globalVariables);
    DataCopy data_copy(execution_id_manager, greater_than, data_copy_emitter);

    // Create GetContractInstance opcode component
    GetContractInstance get_contract_instance(
        execution_id_manager, merkle_db, get_contract_instance_emitter, contract_instance_manager);

    std::unique_ptr<DebugLoggerInterface> debug_log_component;
    if (user_requested_simulation) {
        debug_log_component = std::make_unique<DebugLogger>(
            debug_log_level, max_debug_log_memory_reads, [](const std::string& message) { info(message); });
    } else {
        debug_log_component = std::make_unique<NoopDebugLogger>();
    }

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
                              merkle_db);
    TxExecution tx_execution(execution,
                             context_provider,
                             merkle_db,
                             written_public_data_slots_tree_check,
                             retrieved_bytecodes_tree_check,
                             field_gt,
                             poseidon2,
                             tx_event_emitter);

    tx_execution.simulate(hints.tx);
}

} // namespace bb::avm2
