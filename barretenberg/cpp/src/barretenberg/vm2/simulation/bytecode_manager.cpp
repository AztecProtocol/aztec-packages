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

namespace {

bool is_wire_opcode_valid(uint8_t w_opcode)
{
    return w_opcode < static_cast<uint8_t>(WireOpCode::LAST_OPCODE_SENTINEL);
}

} // namespace

BytecodeId TxBytecodeManager::get_bytecode(const AztecAddress& address)
{
    // Use shared ContractInstanceManager for contract instance retrieval and validation
    // This handles nullifier checks, address derivation, and update validation
    auto maybe_instance = contract_instance_manager.get_contract_instance(address);

    if (!maybe_instance.has_value()) {
        // Contract instance not found - emit error event and throw
        retrieval_events.emit({
            .bytecode_id = FF(0), // Use default ID for error case
            .address = address,
            .error = true,
        });
        vinfo("Contract ", field_to_string(address), " is not deployed!");
        throw BytecodeNotFoundError("Contract " + field_to_string(address) + " is not deployed");
    }

    ContractClassId current_class_id = maybe_instance.value().current_class_id;

    // Contract class retrieval and class ID validation
    std::optional<ContractClass> maybe_klass = contract_db.get_contract_class(current_class_id);
    // Note: we don't need to silo and check the class id because the deployer contract guarrantees
    // that if a contract instance exists, the class has been registered.
    assert(maybe_klass.has_value());
    auto& klass = maybe_klass.value();
    info("Bytecode for ", address, " successfully retrieved!");

    // Bytecode hashing and decomposition, deduplicated by bytecode_id (commitment)
    BytecodeId bytecode_id = klass.public_bytecode_commitment;

    // Check if we've already processed this bytecode. If so, don't do hashing and decomposition again!
    if (bytecodes.contains(bytecode_id)) {
        // Already processed this bytecode - just emit retrieval event and return
        auto tree_states = merkle_db.get_tree_state();
        retrieval_events.emit({
            .bytecode_id = bytecode_id,
            .address = address,
            .current_class_id = current_class_id,
            .contract_class = klass,
            .nullifier_root = tree_states.nullifierTree.tree.root,
            .public_data_tree_root = tree_states.publicDataTree.tree.root,
        });
        return bytecode_id;
    }

    // First time seeing this bytecode - do hashing and decomposition
    FF computed_commitment = bytecode_hasher.compute_public_bytecode_commitment(bytecode_id, klass.packed_bytecode);
    (void)computed_commitment; // Avoid GCC unused parameter warning when asserts are disabled.
    assert(computed_commitment == klass.public_bytecode_commitment);

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

    // The event will be deduplicated internally.
    fetching_events.emit(InstructionFetchingEvent(instr_fetching_event));

    // Communicate error to the caller.
    if (instr_fetching_event.error.has_value()) {
        throw InstructionFetchingError("Instruction fetching error: " +
                                       std::to_string(static_cast<int>(instr_fetching_event.error.value())));
    }

    return instr_fetching_event.instruction;
}

Instruction TxBytecodeManager::deserialize_instruction(std::span<const uint8_t> bytecode, size_t pos)
{
    const auto bytecode_length = static_cast<uint32_t>(bytecode.size());

    if (!gt.gt(bytecode_length, pos)) {
        vinfo("PC is out of range. Position: ", pos, " Bytecode length: ", bytecode_length);
        throw InstrDeserializationError::PC_OUT_OF_RANGE;
    }

    const uint8_t opcode_byte = bytecode[pos];

    if (!is_wire_opcode_valid(opcode_byte)) {
        vinfo("Invalid wire opcode byte: 0x", to_hex(opcode_byte), " at position: ", pos);
        throw InstrDeserializationError::OPCODE_OUT_OF_RANGE;
    }

    const auto opcode = static_cast<WireOpCode>(opcode_byte);
    const auto& inst_format = get_wire_opcode_format(opcode);

    const uint32_t instruction_size = WIRE_INSTRUCTION_SPEC.at(opcode).size_in_bytes;

    // Circuit leakage: We never read more than DECOMPOSE_WINDOW_SIZE number of bytes and
    // therefore comparison with instruction_size is performed with bytes_to_read.
    const uint32_t bytes_to_read = std::min(DECOMPOSE_WINDOW_SIZE, bytecode_length - static_cast<uint32_t>(pos));

    // We know we will encounter a parsing error, but continue processing because
    // we need the partial instruction to be parsed for witness generation.
    if (gt.gt(instruction_size, bytes_to_read)) {
        vinfo("Instruction does not fit in remaining bytecode. Wire opcode: ",
              opcode,
              " pos: ",
              pos,
              " instruction size: ",
              instruction_size,
              " bytecode length: ",
              bytecode_length);
        throw InstrDeserializationError::INSTRUCTION_OUT_OF_RANGE;
    }

    pos++; // move after opcode byte

    uint16_t indirect = 0;
    std::vector<Operand> operands;
    for (const OperandType op_type : inst_format) {
        const auto operand_size = get_operand_type_size_in_bytes(op_type);
        assert(pos + operand_size <= bytecode_length); // Guaranteed to hold due to
                                                       //  pos + instruction_size <= bytecode_length

        switch (op_type) {
        case OperandType::TAG:
        case OperandType::UINT8: {
            operands.emplace_back(Operand::from<uint8_t>(bytecode[pos]));
            break;
        }
        case OperandType::INDIRECT8: {
            indirect = bytecode[pos];
            break;
        }
        case OperandType::INDIRECT16: {
            uint16_t operand_u16 = 0;
            uint8_t const* pos_ptr = &bytecode[pos];
            serialize::read(pos_ptr, operand_u16);
            indirect = operand_u16;
            break;
        }
        case OperandType::UINT16: {
            uint16_t operand_u16 = 0;
            uint8_t const* pos_ptr = &bytecode[pos];
            serialize::read(pos_ptr, operand_u16);
            operands.emplace_back(Operand::from<uint16_t>(operand_u16));
            break;
        }
        case OperandType::UINT32: {
            uint32_t operand_u32 = 0;
            uint8_t const* pos_ptr = &bytecode[pos];
            serialize::read(pos_ptr, operand_u32);
            operands.emplace_back(Operand::from<uint32_t>(operand_u32));
            break;
        }
        case OperandType::UINT64: {
            uint64_t operand_u64 = 0;
            uint8_t const* pos_ptr = &bytecode[pos];
            serialize::read(pos_ptr, operand_u64);
            operands.emplace_back(Operand::from<uint64_t>(operand_u64));
            break;
        }
        case OperandType::UINT128: {
            uint128_t operand_u128 = 0;
            uint8_t const* pos_ptr = &bytecode[pos];
            serialize::read(pos_ptr, operand_u128);
            operands.emplace_back(Operand::from<uint128_t>(operand_u128));
            break;
        }
        case OperandType::FF: {
            FF operand_ff;
            uint8_t const* pos_ptr = &bytecode[pos];
            read(pos_ptr, operand_ff);
            operands.emplace_back(Operand::from<FF>(operand_ff));
        }
        }
        pos += operand_size;
    }

    return {
        .opcode = opcode,
        .indirect = indirect,
        .operands = std::move(operands),
    };
};

} // namespace bb::avm2::simulation
