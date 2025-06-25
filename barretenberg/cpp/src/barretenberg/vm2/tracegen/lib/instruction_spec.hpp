#pragma once

#include <cstdint>
#include <unordered_map>

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"

namespace bb::avm2::tracegen {

enum class SubtraceSel : uint8_t {
    ALU,
    BITWISE,
    TORADIXBE,
    POSEIDON2PERM,
    ECC,
    DATACOPY,
    EXECUTION,
    KECCAKF1600,
};

struct SubtraceInfo {
    SubtraceSel subtrace_selector;
    uint128_t subtrace_operation_id;
};

// This builder is used to generate the register information based on the number of inputs and outputs.
// It encodes the information into a 16-bit integer based on the following scheme:
// (1) Each register's access is represented by 2 bits: a read/write bit and an is_active bit.
// (2) It is little-endian encoded where the least significant bit (LSB) is the active bit.
// (3) An input(read) register is therefore represented by 0b01, and an output(write) register is represented by 0b11.
//
// For example, if we have 2 inputs and 1 output:
//   Encoded Value = 53 ==> (0b110101)
class RegisterMemInfo {
  public:
    uint16_t encode() const { return encoded_register_info; }
    RegisterMemInfo& has_inputs(uint16_t num_inputs);
    RegisterMemInfo& has_outputs(uint16_t num_outputs);

    // Given a register index, returns if the register is active for this instruction
    bool is_active(size_t index) const;
    // Given a register index, returns if the register is used for writing to memory
    bool is_write(size_t index) const;

  private:
    uint16_t encoded_register_info = 0;
    uint16_t write_index = 0;
};

extern const std::unordered_map<ExecutionOpCode, SubtraceInfo> SUBTRACE_INFO_MAP;
extern const std::unordered_map<ExecutionOpCode, RegisterMemInfo> REGISTER_INFO_MAP;

} // namespace bb::avm2::tracegen
