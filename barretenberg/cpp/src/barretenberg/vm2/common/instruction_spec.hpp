#pragma once

#include <array>
#include <cstdint>
#include <optional>
#include <unordered_map>

#include "barretenberg/vm2/common/opcodes.hpp"

namespace bb::avm2 {

constexpr size_t NUM_OP_DC_SELECTORS = 18;

struct ExecInstructionSpec {
    struct GasInfo {
        uint16_t opcode_gas; // Base l2 gas is computed as opcode_gas + addressing_gas
        uint16_t base_da;
        uint16_t dyn_l2;
        uint16_t dyn_da;

        bool operator==(const GasInfo& other) const = default;
    };

    uint8_t num_addresses;
    GasInfo gas_cost;

    bool operator==(const ExecInstructionSpec& other) const = default;
};

struct WireInstructionSpec {
    ExecutionOpCode exec_opcode;
    uint32_t size_in_bytes;
    std::array<uint8_t, NUM_OP_DC_SELECTORS> op_dc_selectors;
    std::optional<uint8_t>
        tag_operand_idx; // Index of relevant operand in vector of operands as defined in WireOpCode_WIRE_FORMAT

    bool operator==(const WireInstructionSpec& other) const = default;
};

// These are "extern" because the definition is in a different file.
// Note: in the circuit, we can choose to merge both tables.
extern const std::unordered_map<ExecutionOpCode, ExecInstructionSpec> EXEC_INSTRUCTION_SPEC;
extern const std::unordered_map<WireOpCode, WireInstructionSpec> WIRE_INSTRUCTION_SPEC;

} // namespace bb::avm2
