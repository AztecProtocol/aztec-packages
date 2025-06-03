#pragma once

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"

#include <cstdint>
#include <memory>
#include <variant>
#include <vector>

namespace bb::avm2::simulation {

// Possible types for an instruction's operand in its wire format.
// The counterpart TS file is: avm/serialization/instruction_serialization.ts.
// INDIRECT is parsed as UINT8 where the bits represent the operands that have indirect mem access.
enum class OperandType : uint8_t { INDIRECT8, INDIRECT16, TAG, UINT8, UINT16, UINT32, UINT64, UINT128, FF };

namespace testonly {

const std::unordered_map<WireOpCode, std::vector<OperandType>>& get_instruction_wire_formats();
const std::unordered_map<OperandType, uint32_t>& get_operand_type_sizes();

} // namespace testonly

using Operand = TaggedValue;

struct Instruction {
    WireOpCode opcode = WireOpCode::LAST_OPCODE_SENTINEL;
    uint16_t indirect = 0;
    std::vector<Operand> operands;

    std::string to_string() const;

    // Serialize the instruction according to the specification from OPCODE_WIRE_FORMAT.
    // There is no validation that the instructions operands comply to the format. Namely,
    // they are casted according to the operand variant specified in format (throw only in
    // truncation case). If the number of operands is larger than specified in format,
    // no error will be thrown neither.
    std::vector<uint8_t> serialize() const;

    size_t size_in_bytes() const;
    ExecutionOpCode get_exec_opcode() const;

    bool operator==(const Instruction& other) const = default;
};

enum class InstrDeserializationError : uint8_t {
    PC_OUT_OF_RANGE,
    OPCODE_OUT_OF_RANGE,
    INSTRUCTION_OUT_OF_RANGE,
    TAG_OUT_OF_RANGE,
    // FIXME: remove this once all execution opcodes are supported.
    // Also uncomment proper constraining of error in instr_fetching.pil.
    INVALID_EXECUTION_OPCODE,
};

/**
 * @brief Parsing of an instruction in the supplied bytecode at byte position pos. This
 *        checks that the WireOpCode value is in the defined range and extracts the operands
 *        for each WireOpCode based on the specification from OPCODE_WIRE_FORMAT.
 *
 * @param bytecode The bytecode to be parsed as a vector of bytes/uint8_t
 * @param pos Bytecode position
 * @throws runtime_error exception when the bytecode is invalid or pos is out-of-range
 * @return The instruction
 */
Instruction deserialize_instruction(std::span<const uint8_t> bytecode, size_t pos);

/**
 * @brief Check whether the instruction must have a tag operand and whether the operand
 *        value is in the value tag range. This is specified by OPCODE_WIRE_FORMAT. If
 *        the instruction does not have a valid wire opcode or the relevant tag operand
 *        is missing, we return false. However, we do not fully validate the instruction.
 *
 * @param instruction The instruction to be checked upon.
 * @return Boolean telling whether instruction complies with the tag specification.
 */
bool check_tag(const Instruction& instruction);

} // namespace bb::avm2::simulation
