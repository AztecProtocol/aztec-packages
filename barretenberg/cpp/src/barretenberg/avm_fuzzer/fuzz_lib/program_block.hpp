/**
  Program block is a logical block of the program.
  This abstraction is used, because we want to know which variables are defined in the block.
  For example the following program:

  ```
    if (mem[1337]) {
        // BLOCK 1
        mem[1338] = 1;
    } else {
        // BLOCK 2
        mem[1339] = 2;
    }
    // BLOCK 3
  ```
  In the BLOCK 3 only one of {1338, 1339} is defined, so we cannot use them.
*/
#pragma once

#include <cstdint>
#include <map>
#include <optional>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/memory_manager.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

class ProgramBlock {
  private:
    MemoryManager memory_manager;
    std::vector<bb::avm2::simulation::Instruction> instructions;

    void process_add_8_instruction(ADD_8_Instruction instruction);
    void process_sub_8_instruction(SUB_8_Instruction instruction);
    void process_mul_8_instruction(MUL_8_Instruction instruction);
    void process_div_8_instruction(DIV_8_Instruction instruction);
    void process_eq_8_instruction(EQ_8_Instruction instruction);
    void process_lt_8_instruction(LT_8_Instruction instruction);
    void process_lte_8_instruction(LTE_8_Instruction instruction);
    void process_and_8_instruction(AND_8_Instruction instruction);
    void process_or_8_instruction(OR_8_Instruction instruction);
    void process_xor_8_instruction(XOR_8_Instruction instruction);
    void process_shl_8_instruction(SHL_8_Instruction instruction);
    void process_shr_8_instruction(SHR_8_Instruction instruction);
    void process_set_8_instruction(SET_8_Instruction instruction);
    void process_not_8_instruction(NOT_8_Instruction instruction);
    void process_fdiv_8_instruction(FDIV_8_Instruction instruction);
    void process_add_16_instruction(ADD_16_Instruction instruction);
    void process_sub_16_instruction(SUB_16_Instruction instruction);
    void process_mul_16_instruction(MUL_16_Instruction instruction);
    void process_div_16_instruction(DIV_16_Instruction instruction);
    void process_fdiv_16_instruction(FDIV_16_Instruction instruction);
    void process_eq_16_instruction(EQ_16_Instruction instruction);
    void process_lt_16_instruction(LT_16_Instruction instruction);
    void process_lte_16_instruction(LTE_16_Instruction instruction);
    void process_and_16_instruction(AND_16_Instruction instruction);
    void process_or_16_instruction(OR_16_Instruction instruction);
    void process_xor_16_instruction(XOR_16_Instruction instruction);
    void process_not_16_instruction(NOT_16_Instruction instruction);
    void process_shl_16_instruction(SHL_16_Instruction instruction);
    void process_shr_16_instruction(SHR_16_Instruction instruction);
    void process_cast_8_instruction(CAST_8_Instruction instruction);
    void process_cast_16_instruction(CAST_16_Instruction instruction);

  public:
    ProgramBlock() = default;
    /// @brief process the instruction
    /// @param instruction the instruction to process
    /// Updates `stored_variables` if the instruction writes to memory
    /// Updates `instructions` with the instruction
    /// If arguments of the instruction are not in stored_variables, the instruction is skipped
    void process_instruction(FuzzInstruction instruction);

    /// @brief finalize the program block with a return instruction
    /// Tries to find memory address with the given `return_value_tag`, if there are no such address (zero variables of
    /// such tag are stored), it sets the return address to 0
    void finalize_with_return(uint8_t return_size,
                              MemoryTagWrapper return_value_tag,
                              uint16_t return_value_offset_index);

    std::vector<bb::avm2::simulation::Instruction> get_instructions();
};
