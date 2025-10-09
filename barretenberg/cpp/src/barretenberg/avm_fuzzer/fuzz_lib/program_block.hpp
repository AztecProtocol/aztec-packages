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

#include "barretenberg/vm2/common/memory_types.hpp"
#include <cstdint>
#include <map>
#include <optional>
#include <vector>

#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "instruction.hpp"

class ProgramBlock {
  private:
    // map of Tag -> vector of memory addresses
    std::map<bb::avm2::MemoryTag, std::vector<uint32_t>> stored_variables;

    std::vector<bb::avm2::simulation::Instruction> instructions;

    std::optional<uint32_t> get_variable_by_tag_and_index(bb::avm2::MemoryTag tag, uint32_t index);

    void process_add_8_instruction(ADD_8_Instruction instruction);
    void process_set_8_instruction(SET_8_Instruction instruction);

  public:
    ProgramBlock();
    /// @brief process the instruction
    /// @param instruction the instruction to process
    /// Updates `stored_variables` if the instruction writes to memory
    /// Updates `instructions` with the instruction
    /// If arguments of the instruction are not in stored_variables, the instruction is skipped
    void process_instruction(Instruction instruction);
};
