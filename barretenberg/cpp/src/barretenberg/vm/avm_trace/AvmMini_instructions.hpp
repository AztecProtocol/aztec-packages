#pragma once

#include "barretenberg/vm/avm_trace/AvmMini_common.hpp"
#include "barretenberg/vm/avm_trace/AvmMini_opcode.hpp"
#include <cstdint>
#include <vector>

namespace bb::avm_trace {

class Instruction {
  public:
    OpCode op_code;
    std::vector<uint32_t> operands;
    AvmMemoryTag in_tag;

    Instruction() = delete;
    explicit Instruction(OpCode op_code, std::vector<uint32_t> operands, AvmMemoryTag in_tag)
        : op_code(op_code)
        , operands(std::move(operands))
        , in_tag(in_tag){};
};

} // namespace bb::avm_trace