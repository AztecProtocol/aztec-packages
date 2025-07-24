#include "barretenberg/vm2/simulation/bytecode_manager.hpp"

#include <cassert>

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
    auto bytecode_id = next_bytecode_id++;

    // Use shared ContractInstanceManager for contract instance retrieval and validation
    // This handles nullifier checks, address derivation, and update validation
    auto maybe_instance = contract_instance_manager.get_contract_instance(address);

    if (!maybe_instance.has_value()) {
        // Contract instance not found - emit error event and throw
        retrieval_events.emit({
            .bytecode_id = bytecode_id,
            .address = address,
            .error = true,
        });
        vinfo("Contract ", field_to_string(address), " is not deployed!");
        throw BytecodeNotFoundError(bytecode_id, "Contract " + field_to_string(address) + " is not deployed");
    }

    ContractClassId current_class_id = maybe_instance.value().current_class_id;

    // Contract class retrieval and class ID validation
    std::optional<ContractClass> maybe_klass = contract_db.get_contract_class(current_class_id);
    // Note: we don't need to silo and check the class id because the deployer contract guarrantees
    // that if a contract instance exists, the class has been registered.
    assert(maybe_klass.has_value());
    auto& klass = maybe_klass.value();
    info("Bytecode for ", address, " successfully retrieved!");

    // Bytecode hashing and decomposition
    FF bytecode_commitment = bytecode_hasher.compute_public_bytecode_commitment(bytecode_id, klass.packed_bytecode);
    (void)bytecode_commitment; // Avoid GCC unused parameter warning when asserts are disabled.
    assert(bytecode_commitment == klass.public_bytecode_commitment);
    // We convert the bytecode to a shared_ptr because it will be shared by some events.
    auto shared_bytecode = std::make_shared<std::vector<uint8_t>>(std::move(klass.packed_bytecode));
    decomposition_events.emit({ .bytecode_id = bytecode_id, .bytecode = shared_bytecode });

    // We now save the bytecode so that we don't repeat this process.
    bytecodes.emplace(bytecode_id, std::move(shared_bytecode));

    auto tree_states = merkle_db.get_tree_state();

    retrieval_events.emit({
        .bytecode_id = bytecode_id,
        .address = address,
        .current_class_id = current_class_id,
        .contract_class = klass, // WARNING: this class has the whole bytecode.
        .nullifier_root = tree_states.nullifierTree.tree.root,
        .public_data_tree_root = tree_states.publicDataTree.tree.root,
    });

    return bytecode_id;
}

Instruction TxBytecodeManager::read_instruction(BytecodeId bytecode_id, uint32_t pc)
{
    // We'll be filling in the event as we progress.
    InstructionFetchingEvent instr_fetching_event;

    auto it = bytecodes.find(bytecode_id);
    // This should never happen. It is supposed to be checked in execution.
    assert(it != bytecodes.end());

    instr_fetching_event.bytecode_id = bytecode_id;
    instr_fetching_event.pc = pc;

    auto bytecode_ptr = it->second;
    instr_fetching_event.bytecode = bytecode_ptr;

    const auto& bytecode = *bytecode_ptr;

    try {
        instr_fetching_event.instruction = deserialize_instruction(bytecode, pc);

        // If the following code is executed, no error was thrown in deserialize_instruction().
        if (!check_tag(instr_fetching_event.instruction)) {
            instr_fetching_event.error = InstrDeserializationError::TAG_OUT_OF_RANGE;
        };
    } catch (const InstrDeserializationError& error) {
        instr_fetching_event.error = error;
    }

    // FIXME: remove this once all execution opcodes are supported.
    if (!instr_fetching_event.error.has_value() &&
        !EXEC_INSTRUCTION_SPEC.contains(instr_fetching_event.instruction.get_exec_opcode())) {
        vinfo("Invalid execution opcode: ", instr_fetching_event.instruction.get_exec_opcode(), " at pc: ", pc);
        instr_fetching_event.error = InstrDeserializationError::INVALID_EXECUTION_OPCODE;
    }

    // We are showing whether bytecode_size > pc or not. If there is no fetching error,
    // we always have bytecode_size > pc.
    const auto bytecode_size = bytecode_ptr->size();
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

} // namespace bb::avm2::simulation
