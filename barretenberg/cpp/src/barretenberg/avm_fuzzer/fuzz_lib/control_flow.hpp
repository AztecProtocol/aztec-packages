#pragma once

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/program_block.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"
#include <vector>

struct ReturnOptions {
    uint8_t return_size;
    MemoryTagWrapper return_value_tag;
    uint16_t return_value_offset_index;

    MSGPACK_FIELDS(return_size, return_value_tag, return_value_offset_index);
};

/// @brief insert instruction block to the current block
struct InsertSimpleInstructionBlock {
    uint16_t instruction_block_idx;

    MSGPACK_FIELDS(instruction_block_idx);
};

/// @brief finalizes the current block with jump, creates a new block and sets it as the current block
struct JumpToNewBlock {
    uint16_t target_program_block_instruction_block_idx;

    MSGPACK_FIELDS(target_program_block_instruction_block_idx);
};

/// @brief finalizes the current block with jump if, creates two new blocks, sets the first as the then block and the
/// second as the else block, changes the current block to the then block
struct JumpIfToNewBlock {
    uint16_t then_program_block_instruction_block_idx;
    uint16_t else_program_block_instruction_block_idx;
    uint16_t condition_offset_index;

    MSGPACK_FIELDS(then_program_block_instruction_block_idx,
                   else_program_block_instruction_block_idx,
                   condition_offset_index);
};

using CFGInstruction = std::variant<InsertSimpleInstructionBlock, JumpToNewBlock, JumpIfToNewBlock>;
template <class... Ts> struct overloaded_cfg_instruction : Ts... {
    using Ts::operator()...;
};
template <class... Ts> overloaded_cfg_instruction(Ts...) -> overloaded_cfg_instruction<Ts...>;

inline std::ostream& operator<<(std::ostream& os, const CFGInstruction& instruction)
{
    std::visit(overloaded_cfg_instruction{ [&](InsertSimpleInstructionBlock arg) {
                                              os << "InsertSimpleInstructionBlock " << arg.instruction_block_idx;
                                          },
                                           [&](JumpToNewBlock arg) {
                                               os << "JumpToNewBlock "
                                                  << arg.target_program_block_instruction_block_idx;
                                           },
                                           [&](JumpIfToNewBlock arg) {
                                               os << "JumpIfToNewBlock " << arg.then_program_block_instruction_block_idx
                                                  << " " << arg.else_program_block_instruction_block_idx << " "
                                                  << arg.condition_offset_index;
                                           } },
               instruction);
    return os;
}

// TODO(defkit) make a graph for jumps, loops, etc.
class ControlFlow {
  private:
    ProgramBlock* current_block;
    /// @brief the entry block of the program
    ProgramBlock* start_block;
    std::vector<std::vector<FuzzInstruction>>* instruction_blocks;

    /// @brief add instructions to the current block from the instruction block at the given index
    /// taken modulo length of the instruction blocks vector
    void process_insert_simple_instruction_block(InsertSimpleInstructionBlock instruction);

    /// @brief terminates the current block with a jump and creates a new block
    /// @param instruction the instruction to process
    void process_jump_to_new_block(JumpToNewBlock instruction);

    /// @brief terminates the current block with a jump if and creates two new blocks, sets the first as the then block
    /// and the second as the else block, changes the current block to the then block
    /// @param instruction the instruction to process
    void process_jump_if_to_new_block(JumpIfToNewBlock instruction);

    /// @brief traverse the control flow graph using DFS
    /// @param start_block the start block
    /// @param reverse whether to traverse in reverse order. If true, the traversal will go to the predecessors of the
    /// current block, otherwise to the successors.
    /// @return the list of blocks in the order of traversal
    static std::vector<ProgramBlock*> dfs_traverse(ProgramBlock* start_block, bool reverse = false);

  public:
    ControlFlow(std::vector<std::vector<FuzzInstruction>>& instruction_blocks)
        : current_block(new ProgramBlock())
        , start_block(current_block)
        , instruction_blocks(&instruction_blocks)
    {}

    ~ControlFlow()
    {
        for (ProgramBlock* block : dfs_traverse(start_block)) {
            delete block;
        }
    }

    void process_cfg_instruction(CFGInstruction instruction);

    /// @brief build the bytecode, finalizing the current block with return
    std::vector<uint8_t> build_bytecode(const ReturnOptions& return_options);
};
