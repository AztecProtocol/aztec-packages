#pragma once

#include <cstdint>
#include <unordered_map>

#include "barretenberg/vm2/common/opcodes.hpp"

namespace bb::avm2 {

constexpr size_t NUM_OP_DC_SELECTORS = 18;

struct ExecInstructionSpec {
    struct GasInfo {
        uint16_t base_l2;
        uint16_t base_da;
        uint16_t dyn_l2;
        uint16_t dyn_da;

        bool operator==(const GasInfo& other) const = default;
    };

    uint8_t num_addresses;
    GasInfo gas_cost;

    bool operator==(const ExecInstructionSpec& other) const = default;
};

// These are "extern" because the definition is in a different file.
// Note: in the circuit, we can choose to merge these tables.
extern const std::unordered_map<WireOpCode, ExecutionOpCode> OPCODE_MAP;
extern const std::unordered_map<ExecutionOpCode, ExecInstructionSpec> EXEC_INSTRUCTION_SPEC;
extern const std::unordered_map<WireOpCode, std::array<uint8_t, NUM_OP_DC_SELECTORS>> WireOpCode_DC_SELECTORS;

} // namespace bb::avm2