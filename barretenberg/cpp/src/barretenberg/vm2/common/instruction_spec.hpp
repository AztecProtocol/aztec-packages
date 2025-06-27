#pragma once

#include <array>
#include <cstdint>
#include <optional>
#include <unordered_map>
#include <vector>

#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"

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

    // This builder is used to generate the register information based on the number of inputs and outputs.
    // Output will always come last.
    class RegisterInfo {
      public:
        RegisterInfo& add_input(std::optional<ValueTag> tag = std::nullopt);
        RegisterInfo& add_inputs(const std::vector<std::optional<ValueTag>>& tags);
        RegisterInfo& add_output();

        size_t num_inputs() const { return inputs.size(); }
        size_t num_outputs() const { return has_output ? 1 : 0; }
        size_t total_registers() const { return num_inputs() + num_outputs(); }

        // Given a register index, returns if the register is active for this instruction
        bool is_active(size_t index) const;
        // Given a register index, returns if the register is used for writing to memory
        bool is_write(size_t index) const;
        // Given a register index, returns if the tag check is needed.
        bool need_tag_check(size_t index) const;
        // Given a register index, returns the expected tag for this instruction.
        std::optional<ValueTag> expected_tag(size_t index) const;

        static constexpr auto ANY_TAG = std::nullopt;

        bool operator==(const RegisterInfo& other) const = default;

      private:
        std::vector<std::optional<ValueTag>> inputs;
        bool has_output = false;
    };

    uint8_t num_addresses;
    GasInfo gas_cost;
    RegisterInfo register_info;

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
