#pragma once
#include "instruction.hpp"
#include "program_block.hpp"
#include <vector>

// TODO(defkit) make a graph for jumps, loops, etc.
class ControlFlow {
  private:
    std::vector<ProgramBlock*> program_blocks;
    ProgramBlock* current_block;

  public:
    ControlFlow();
    void add_instructions(std::vector<Instruction>& instructions);

    std::vector<uint8_t> build_bytecode();
};
