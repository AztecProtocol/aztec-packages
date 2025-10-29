#pragma once

#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/program_block.hpp"
#include "barretenberg/serialize/msgpack.hpp"

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

using CFGInstruction = std::variant<InsertSimpleInstructionBlock>;
template <class... Ts> struct overloaded_cfg_instruction : Ts... {
    using Ts::operator()...;
};
template <class... Ts> overloaded_cfg_instruction(Ts...) -> overloaded_cfg_instruction<Ts...>;

inline std::ostream& operator<<(std::ostream& os, const CFGInstruction& instruction)
{
    std::visit(overloaded_cfg_instruction{ [&](InsertSimpleInstructionBlock arg) {
                   os << "InsertSimpleInstructionBlock " << arg.instruction_block_idx;
               } },
               instruction);
    return os;
}

// TODO(defkit) make a graph for jumps, loops, etc.
class ControlFlow {
  private:
    ProgramBlock current_block;
    std::vector<std::vector<FuzzInstruction>>* instruction_blocks;

    /// @brief add instructions to the current block from the instruction block at the given index
    /// taken modulo length of the instruction blocks vector
    void process_insert_simple_instruction_block(InsertSimpleInstructionBlock instruction);

  public:
    ControlFlow(std::vector<std::vector<FuzzInstruction>>& instruction_blocks)
        : instruction_blocks(&instruction_blocks)
    {}

    void process_cfg_instruction(CFGInstruction instruction);

    /// @brief build the bytecode, finalizing the current block with return
    std::vector<uint8_t> build_bytecode(const ReturnOptions& return_options);
};
