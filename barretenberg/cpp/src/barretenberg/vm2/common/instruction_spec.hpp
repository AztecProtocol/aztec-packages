#pragma once

#include <cstdint>
#include <unordered_map>

#include "barretenberg/vm2/common/opcodes.hpp"

namespace bb::avm2 {

struct InstructionSpec {
    struct GasInfo {
        uint16_t base_l2;
        uint16_t base_da;
        uint16_t dyn_l2;
        uint16_t dyn_da;

        bool operator==(const GasInfo& other) const = default;
    };

    uint8_t num_addresses;
    GasInfo gas_cost;

    bool operator==(const InstructionSpec& other) const = default;
};

// These are "extern" because the definition is in a different file.
// Note: in the circuit, we can choose to merge both tables.
extern const std::unordered_map<ExecutionOpCode, InstructionSpec> INSTRUCTION_SPEC;
extern const std::unordered_map<WireOpCode, ExecutionOpCode> OPCODE_MAP;

} // namespace bb::avm2