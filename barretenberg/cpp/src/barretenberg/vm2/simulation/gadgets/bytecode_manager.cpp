#include "barretenberg/vm2/simulation/gadgets/bytecode_manager.hpp"

#include <cassert>

#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/common/stringify.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

BytecodeId TxBytecodeManager::get_bytecode(const AztecAddress& address)
{
    BB_BENCH_NAME("TxBytecodeManager::get_bytecode");
    // Use shared ContractInstanceManager for contract instance retrieval and validation
    // This handles nullifier checks, address derivation, and update validation
    auto tree_states = merkle_db.get_tree_state();
    AppendOnlyTreeSnapshot before_snapshot = retrieved_bytecodes_tree_check.get_snapshot();

    BytecodeRetrievalEvent retrieval_event = {
        .bytecode_id = FF(0), // Use default ID for error cases
        .address = address,
        .nullifier_root = tree_states.nullifierTree.tree.root,
        .public_data_tree_root = tree_states.publicDataTree.tree.root,
        .retrieved_bytecodes_snapshot_before = before_snapshot,
        .retrieved_bytecodes_snapshot_after = before_snapshot,
    };

    auto maybe_instance = contract_instance_manager.get_contract_instance(address);

    if (!maybe_instance.has_value()) {
        retrieval_event.instance_not_found_error = true;
        // Contract instance not found - emit error event and throw
        retrieval_events.emit(std::move(retrieval_event));
        vinfo("Contract ", field_to_string(address), " is not deployed!");
        throw BytecodeRetrievalError("Contract " + field_to_string(address) + " is not deployed");
    }

    ContractInstance instance = maybe_instance.value();
    ContractClassId current_class_id = instance.current_class_id;
    retrieval_event.current_class_id = current_class_id;

    bool is_new_class = !retrieved_bytecodes_tree_check.contains(current_class_id);
    retrieval_event.is_new_class = is_new_class;

    uint32_t retrieved_bytecodes_count = retrieved_bytecodes_tree_check.size();

    if (is_new_class && retrieved_bytecodes_count >= MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS) {
        retrieval_event.limit_error = true;
        retrieval_events.emit(std::move(retrieval_event));
        throw BytecodeRetrievalError("Can't retrieve more than " +
                                     std::to_string(MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS) +
                                     " bytecodes per tx");
    }

    retrieved_bytecodes_tree_check.insert(current_class_id);
    AppendOnlyTreeSnapshot snapshot_after = retrieved_bytecodes_tree_check.get_snapshot();
    retrieval_event.retrieved_bytecodes_snapshot_after = snapshot_after;

    // Contract class retrieval and class ID validation
    std::optional<ContractClass> maybe_klass = contract_db.get_contract_class(current_class_id);
    // Note: we don't need to silo and check the class id because the deployer contract guarantees
    // that if a contract instance exists, the class has been registered.
    assert(maybe_klass.has_value());
    auto& klass = maybe_klass.value();
    retrieval_event.contract_class = klass; // WARNING: this class has the whole bytecode.
    debug("Bytecode for ", address, " successfully retrieved!");

    // Bytecode hashing and decomposition, deduplicated by bytecode_id (commitment)
    BytecodeId bytecode_id = klass.public_bytecode_commitment;
    retrieval_event.bytecode_id = bytecode_id;

    // Check if we've already processed this bytecode. If so, don't do hashing and decomposition again!
    if (bytecodes.contains(bytecode_id)) {
        // Already processed this bytecode - just emit retrieval event and return
        retrieval_events.emit(std::move(retrieval_event));
        return bytecode_id;
    }

    // First time seeing this bytecode - check hashing and decomposition
    bytecode_hasher.assert_public_bytecode_commitment(
        bytecode_id, klass.packed_bytecode, klass.public_bytecode_commitment);

    // We convert the bytecode to a shared_ptr because it will be shared by some events.
    auto shared_bytecode = std::make_shared<std::vector<uint8_t>>(std::move(klass.packed_bytecode));
    decomposition_events.emit({ .bytecode_id = bytecode_id, .bytecode = shared_bytecode });

    // We now save the bytecode so that we don't repeat this process.
    bytecodes.emplace(bytecode_id, std::move(shared_bytecode));

    retrieval_events.emit(std::move(retrieval_event));

    return bytecode_id;
}

Instruction TxBytecodeManager::read_instruction(const BytecodeId& bytecode_id, uint32_t pc)
{
    return read_instruction(bytecode_id, get_bytecode_data(bytecode_id), pc);
}

Instruction TxBytecodeManager::read_instruction(const BytecodeId& bytecode_id,
                                                std::shared_ptr<std::vector<uint8_t>> bytecode_ptr,
                                                uint32_t pc)
{
    BB_BENCH_NAME("TxBytecodeManager::read_instruction");

    // We'll be filling in the event as we progress.
    InstructionFetchingEvent instr_fetching_event;

    instr_fetching_event.bytecode_id = bytecode_id;
    instr_fetching_event.pc = pc;

    const auto& bytecode = *bytecode_ptr;
    instr_fetching_event.bytecode = std::move(bytecode_ptr);

    try {
        instr_fetching_event.instruction = deserialize_instruction(bytecode, pc);

        // If the following code is executed, no error was thrown in deserialize_instruction().
        if (!check_tag(instr_fetching_event.instruction)) {
            instr_fetching_event.error = InstrDeserializationError::TAG_OUT_OF_RANGE;
        };
    } catch (const InstrDeserializationError& error) {
        instr_fetching_event.error = error;
    }

    // We are showing whether bytecode_size > pc or not. If there is no fetching error,
    // we always have bytecode_size > pc.
    const auto bytecode_size = bytecode.size();
    const uint128_t pc_diff = bytecode_size > pc ? bytecode_size - pc - 1 : pc - bytecode_size;
    range_check.assert_range(pc_diff, AVM_PC_SIZE_IN_BITS);

    // The event will be deduplicated internally.
    fetching_events.emit(InstructionFetchingEvent(instr_fetching_event));

    // Communicate error to the caller.
    if (instr_fetching_event.error.has_value()) {
        throw InstructionFetchingError("Instruction fetching error: " +
                                       std::to_string(static_cast<int>(instr_fetching_event.error.value())));
    }

    return instr_fetching_event.instruction;
}

std::shared_ptr<std::vector<uint8_t>> TxBytecodeManager::get_bytecode_data(const BytecodeId& bytecode_id)
{
    return bytecodes.at(bytecode_id);
}

} // namespace bb::avm2::simulation
