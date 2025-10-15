#pragma once
#include "instruction.hpp"
#include "program_block.hpp"
#include <vector>

// TODO(defkit) make a graph for jumps, loops, etc.
class ControlFlow {
  private:
    ProgramBlock current_block;

  public:
    /// @brief add instructions to the current block
    void add_instructions(std::vector<FuzzInstruction>& instructions);

    /// @brief build the bytecode, finalizing the current block with return
    std::vector<uint8_t> build_bytecode();
};
