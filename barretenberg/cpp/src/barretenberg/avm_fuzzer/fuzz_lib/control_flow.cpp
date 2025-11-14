#include "barretenberg/avm_fuzzer/fuzz_lib/control_flow.hpp"

std::vector<ProgramBlock*> ControlFlow::dfs_traverse(ProgramBlock* start_block, bool reverse)
{
    std::vector<ProgramBlock*> blocks;
    std::deque<ProgramBlock*> stack;
    std::set<ProgramBlock*> visited;

    stack.push_back(start_block);
    while (!stack.empty()) {
        ProgramBlock* current_block = stack.front();
        stack.pop_front();
        if (visited.contains(current_block)) {
            continue;
        }
        visited.insert(current_block);
        blocks.push_back(current_block);
        if (reverse) {
            for (ProgramBlock* predecessor : current_block->predecessors) {
                stack.push_front(predecessor);
            }
        } else {
            for (ProgramBlock* successor : current_block->successors) {
                stack.push_back(successor);
            }
        }
    }

    return blocks;
}

void ControlFlow::process_insert_simple_instruction_block(InsertSimpleInstructionBlock instruction)
{
    if (instruction_blocks->size() == 0) {
        return;
    }
    if (this->current_block->terminated) {
        return;
    }
    auto instruction_block = instruction_blocks->at(instruction.instruction_block_idx % instruction_blocks->size());
    for (const auto& instr : instruction_block) {
        current_block->process_instruction(instr);
    }
}

void ControlFlow::process_jump_to_new_block(JumpToNewBlock instruction)
{
    if (instruction_blocks->size() == 0) {
        return;
    }
    if (this->current_block->terminated) {
        return;
    }
    auto target_instruction_block =
        instruction_blocks->at(instruction.target_program_block_instruction_block_idx % instruction_blocks->size());
    ProgramBlock* target_block = new ProgramBlock();
    current_block->finalize_with_jump(target_block);
    for (const auto& instr : target_instruction_block) {
        target_block->process_instruction(instr);
    }
    current_block = target_block;
}

void ControlFlow::process_jump_if_to_new_block(JumpIfToNewBlock instruction)
{
    if (instruction_blocks->size() == 0) {
        return;
    }
    if (this->current_block->terminated) {
        return;
    }
    auto target_then_instruction_block =
        instruction_blocks->at(instruction.then_program_block_instruction_block_idx % instruction_blocks->size());
    auto target_else_instruction_block =
        instruction_blocks->at(instruction.else_program_block_instruction_block_idx % instruction_blocks->size());
    ProgramBlock* target_then_block = new ProgramBlock();
    ProgramBlock* target_else_block = new ProgramBlock();
    current_block->finalize_with_jump_if(target_then_block, target_else_block, instruction.condition_offset_index);
    for (const auto& instr : target_then_instruction_block) {
        target_then_block->process_instruction(instr);
    }
    for (const auto& instr : target_else_instruction_block) {
        target_else_block->process_instruction(instr);
    }
    current_block = target_then_block;
}

void ControlFlow::process_jump_to_block(JumpToBlock instruction)
{
    if (this->current_block->terminated) {
        return;
    }
    std::vector<ProgramBlock*> possible_target_blocks = get_reachable_blocks(current_block);
    if (possible_target_blocks.size() == 0) {
        return;
    }
    ProgramBlock* target_block =
        possible_target_blocks.at(instruction.target_block_idx % possible_target_blocks.size());
    current_block->finalize_with_jump(target_block, /*copy_memory_manager=*/false);
    std::vector<ProgramBlock*> non_terminated_blocks = get_non_terminated_blocks();
    if (non_terminated_blocks.size() == 0) {
        return;
    }
    current_block = non_terminated_blocks.at(0);
}

void ControlFlow::process_jump_if_to_block(JumpIfToBlock instruction)
{
    if (this->current_block->terminated) {
        return;
    }
    std::vector<ProgramBlock*> possible_target_blocks = get_reachable_blocks(current_block);
    if (possible_target_blocks.size() == 0) {
        return;
    }
    ProgramBlock* target_then_block =
        possible_target_blocks.at(instruction.target_then_block_idx % possible_target_blocks.size());
    ProgramBlock* target_else_block =
        possible_target_blocks.at(instruction.target_else_block_idx % possible_target_blocks.size());
    current_block->finalize_with_jump_if(
        target_then_block, target_else_block, instruction.condition_offset_index, /*copy_memory_manager=*/false);
    std::vector<ProgramBlock*> non_terminated_blocks = get_non_terminated_blocks();
    if (non_terminated_blocks.size() == 0) {
        return;
    }
    current_block = non_terminated_blocks.at(0);
}

void ControlFlow::process_finalize_with_return(FinalizeWithReturn instruction)
{
    if (this->current_block->terminated) {
        return;
    }
    current_block->finalize_with_return(instruction.return_options.return_size,
                                        instruction.return_options.return_value_tag,
                                        instruction.return_options.return_value_offset_index);
    std::vector<ProgramBlock*> non_terminated_blocks = get_non_terminated_blocks();
    if (non_terminated_blocks.size() == 0) {
        return;
    }
    current_block = non_terminated_blocks.at(0);
}

void ControlFlow::process_switch_to_non_terminated_block(SwitchToNonTerminatedBlock instruction)
{
    std::vector<ProgramBlock*> non_terminated_blocks = get_non_terminated_blocks();
    if (non_terminated_blocks.size() == 0) {
        return;
    }
    current_block = non_terminated_blocks.at(instruction.non_terminated_block_idx % non_terminated_blocks.size());
}
std::vector<ProgramBlock*> ControlFlow::get_non_terminated_blocks()
{
    std::vector<ProgramBlock*> blocks = dfs_traverse(start_block);
    std::vector<ProgramBlock*> non_terminated_blocks;
    std::copy_if(blocks.begin(), blocks.end(), std::back_inserter(non_terminated_blocks), [](ProgramBlock* block) {
        return !block->terminated;
    });
    return non_terminated_blocks;
}

std::vector<ProgramBlock*> ControlFlow::get_reachable_blocks(ProgramBlock* block)
{
    // traverse the graph in reverse order starting from the given block
    // if we jump to one of the blocks in the forbidden list, we create a loop
    std::vector<ProgramBlock*> forbidden_blocks = dfs_traverse(block, true);

    std::vector<ProgramBlock*> all_blocks = dfs_traverse(start_block);
    std::vector<ProgramBlock*> reachable_blocks;
    // filter all forbidden blocks from the list of all blocks
    std::copy_if(all_blocks.begin(),
                 all_blocks.end(),
                 std::back_inserter(reachable_blocks),
                 [forbidden_blocks](ProgramBlock* block) {
                     return std::find(forbidden_blocks.begin(), forbidden_blocks.end(), block) ==
                            forbidden_blocks.end();
                 });
    return reachable_blocks;
}

void ControlFlow::process_cfg_instruction(CFGInstruction instruction)
{
    std::visit(overloaded_cfg_instruction{
                   [&](InsertSimpleInstructionBlock arg) { process_insert_simple_instruction_block(arg); },
                   [&](JumpToNewBlock arg) { process_jump_to_new_block(arg); },
                   [&](JumpIfToNewBlock arg) { process_jump_if_to_new_block(arg); },
                   [&](JumpToBlock arg) { process_jump_to_block(arg); },
                   [&](JumpIfToBlock arg) { process_jump_if_to_block(arg); },
                   [&](FinalizeWithReturn arg) { process_finalize_with_return(arg); },
                   [&](SwitchToNonTerminatedBlock arg) { process_switch_to_non_terminated_block(arg); } },
               instruction);
}

// Helper function to create bytecode from a vector of instructions
std::vector<uint8_t> create_bytecode(const std::vector<bb::avm2::simulation::Instruction>& instructions)
{
    std::vector<uint8_t> bytecode;
    for (const auto& instruction : instructions) {
        auto serialized_instruction = instruction.serialize();
        bytecode.insert(bytecode.end(),
                        std::make_move_iterator(serialized_instruction.begin()),
                        std::make_move_iterator(serialized_instruction.end()));
    }
    return bytecode;
}

int predict_block_size(ProgramBlock* block)
{
    const int JMP_SIZE = 1 + 4;            // opcode + destination offset
    const int JMP_IF_SIZE = 1 + 1 + 2 + 4; // opcode  + direct/indirect + condition offset + destination offset
    auto bytecode_length = static_cast<int>(create_bytecode(block->get_instructions()).size());
    switch (block->successors.size()) {
    case 0:
        return bytecode_length; // finalized with return, already counted
    case 1:
        return bytecode_length + JMP_SIZE; // finalized with jump
    case 2: {
        // if boolean condition is not set adding SET_8 instruction to the bytecode
        if (!block->get_terminating_condition_value().has_value()) {
            for (uint16_t address = 0; address < 65535; address++) {
                // if the memory address is already in use, we skip it
                if (block->is_memory_address_set(address)) {
                    continue;
                }
                auto set_16_instruction =
                    SET_16_Instruction{ .value_tag = bb::avm2::MemoryTag::U1, .offset = address, .value = 0 };
                block->process_instruction(set_16_instruction);
                bytecode_length = static_cast<int>(create_bytecode(block->get_instructions()).size());
                break;
            }
        }
        return bytecode_length + JMP_IF_SIZE + JMP_SIZE; // finalized with jumpi
    }
    default:
        throw std::runtime_error("Unsupported number of successors for block");
    }
    throw std::runtime_error("Unreachable");
}

size_t find_block_idx(ProgramBlock* block, const std::vector<ProgramBlock*>& blocks)
{
    for (size_t i = 0; i < blocks.size(); i++) {
        if (blocks[i] == block) {
            return i;
        }
    }
    throw std::runtime_error("Block not found in the list");
}

std::vector<uint8_t> ControlFlow::build_bytecode(const ReturnOptions& return_options)
{
    // Step 1 "linarize" graph into a list of blocks
    std::vector<ProgramBlock*> blocks = dfs_traverse(start_block);

    // Step 2 terminate all non-terminated blocks with return
    for (ProgramBlock* block : blocks) {
        if (!block->terminated) {
            block->finalize_with_return(
                /*TODO(defkit) fix return size */ 1,
                return_options.return_value_tag,
                return_options.return_value_offset_index);
        }
    }

    // Step 3 calculate offsets for each block
    int last_offset = 0;
    for (ProgramBlock* block : blocks) {
        block->offset = last_offset;
        last_offset += predict_block_size(block);
    }

    // Step 4 terminate unterminated blocks with jumps with known offsets, get the bytecode for each block
    std::vector<std::vector<uint8_t>> block_bytecodes;
    for (ProgramBlock* block : blocks) {
        std::vector<bb::avm2::simulation::Instruction> instructions = block->get_instructions();
        switch (block->successors.size()) {
        case 0: // finalized with return
            // already terminated with return
            break;
        case 1: { // finalized with jump
            ProgramBlock* target_block = block->successors.at(0);
            size_t target_block_idx = find_block_idx(target_block, blocks);
            uint32_t jump_offset = static_cast<uint32_t>(blocks.at(target_block_idx)->offset);
            auto jump_instruction =
                bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::JUMP_32).operand(jump_offset).build();
            instructions.push_back(jump_instruction);
            break;
        }
        case 2: { // finalized with jumpi
            ProgramBlock* target_then_block = block->successors.at(0);
            ProgramBlock* target_else_block = block->successors.at(1);
            size_t target_then_block_idx = find_block_idx(target_then_block, blocks);
            size_t target_else_block_idx = find_block_idx(target_else_block, blocks);
            uint32_t jump_then_offset = static_cast<uint32_t>(blocks.at(target_then_block_idx)->offset);
            uint32_t jump_else_offset = static_cast<uint32_t>(blocks.at(target_else_block_idx)->offset);
            auto conditional_offset = block->get_terminating_condition_value();
            if (!conditional_offset.has_value()) {
                throw std::runtime_error("Condition value not found, should not happen");
            }
            auto jumpi_instruction = bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::JUMPI_32)
                                         .operand(conditional_offset.value())
                                         .operand(jump_then_offset)
                                         .build();
            auto jump_else_instruction =
                bb::avm2::testing::InstructionBuilder(bb::avm2::WireOpCode::JUMP_32).operand(jump_else_offset).build();
            instructions.push_back(jumpi_instruction);
            instructions.push_back(jump_else_instruction);
            break;
        }
        default:
            throw std::runtime_error("Unsupported number of successors for block");
        }
        block_bytecodes.push_back(create_bytecode(instructions));
    }

    // Step 5 concatenate all block bytecodes into a single bytecode vector
    std::vector<uint8_t> bytecode;
    for (const auto& block_bytecode : block_bytecodes) {
        bytecode.insert(bytecode.end(), block_bytecode.begin(), block_bytecode.end());
    }
    return bytecode;
}
