#pragma once
#include "barretenberg/vm2/common/memory_types.hpp"
#include <cstdint>
#include <variant>

using MemoryTag = bb::avm2::MemoryTag;

/// Docs to offset_index struct fields
/// The way we store used variables is a map of Tag: Vec[memory_address]
/// The index of the argument in the stored vector, corresponding to the tag
/// The index will be taken modulo the size of the vector
/// If the corresponding vector is empty, the argument is invalid, we skip this op
/// **Example**
/// Stored variables map: { U8: [0, 1, 2], U32: [3, 4] }
/// {offset_index: 100, variable_tag: U8} -> 100 % 3 = 1 -> 1st element of U8 vector = 1
/// {offset_index: 100, variable_tag: U32} -> 100 % 2 = 0 -> 0th element of U32 vector = 3

/// @brief mem[result_offset] = mem[a_address] + mem[b_address]
struct ADD_8_Instruction {
    MemoryTag argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
};

/// @brief mem[result_offset] = mem[a_address] - mem[b_address]
struct SUB_8_Instruction {
    MemoryTag argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
};

/// @brief mem[result_offset] = mem[a_address] * mem[b_address]
struct MUL_8_Instruction {
    MemoryTag argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
};

/// @brief mem[result_offset] = mem[a_address] / mem[b_address]
struct DIV_8_Instruction {
    MemoryTag argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
};

// TODO(defkit) FDIV skipping for now

/// @brief mem[result_offset] = mem[a_address] == mem[b_address]
struct EQ_8_Instruction {
    MemoryTag argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
};

/// @brief mem[result_offset] = mem[a_address] < mem[b_address]
struct LT_8_Instruction {
    MemoryTag argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
};

/// @brief mem[result_offset] = mem[a_address] <= mem[b_address]
struct LTE_8_Instruction {
    MemoryTag argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
};

/// @brief mem[result_offset] = mem[a_address] & mem[b_address]
struct AND_8_Instruction {
    MemoryTag argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
};

/// @brief mem[result_offset] = mem[a_address] | mem[b_address]
struct OR_8_Instruction {
    MemoryTag argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
};

/// @brief mem[result_offset] = mem[a_address] ^ mem[b_address]
struct XOR_8_Instruction {
    MemoryTag argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
};

// TODO(defkit) not skipping for now
// struct NOT_8_Instruction {

/// @brief mem[result_offset] = mem[a_address] << mem[b_address]
struct SHL_8_Instruction {
    MemoryTag argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
};

/// @brief mem[result_offset] = mem[a_address] >> mem[b_address]
struct SHR_8_Instruction {
    MemoryTag argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
};

/// @brief SET_8 instruction
struct SET_8_Instruction {
    // TODO(defkit) need this? SET_8 seems to set only u8
    MemoryTag value_tag;
    uint8_t offset;
    uint8_t value;
};

using FuzzInstruction = std::variant<ADD_8_Instruction,
                                     SET_8_Instruction,
                                     SUB_8_Instruction,
                                     MUL_8_Instruction,
                                     DIV_8_Instruction,
                                     EQ_8_Instruction,
                                     LT_8_Instruction,
                                     LTE_8_Instruction,
                                     AND_8_Instruction,
                                     OR_8_Instruction,
                                     XOR_8_Instruction,
                                     SHL_8_Instruction,
                                     SHR_8_Instruction>;

template <class... Ts> struct overloaded_instruction : Ts... {
    using Ts::operator()...;
};
template <class... Ts> overloaded_instruction(Ts...) -> overloaded_instruction<Ts...>;

inline std::ostream& operator<<(std::ostream& os, const MemoryTag& tag)
{
    switch (tag) {
    case MemoryTag::U1:
        os << "U1";
        break;
    case MemoryTag::U8:
        os << "U8";
        break;
    case MemoryTag::U16:
        os << "U16";
        break;
    case MemoryTag::U32:
        os << "U32";
        break;
    case MemoryTag::U64:
        os << "U64";
        break;
    case MemoryTag::U128:
        os << "U128";
        break;
    case MemoryTag::FF:
        os << "FF";
        break;
    default:
        os << "Unknown";
        break;
    }
    return os;
}

inline std::ostream& operator<<(std::ostream& os, const FuzzInstruction& instruction)
{
    std::visit(overloaded_instruction{
                   [&](ADD_8_Instruction arg) {
                       os << "ADD_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                          << arg.b_offset_index << " " << static_cast<uint16_t>(arg.result_offset);
                   },
                   [&](SET_8_Instruction arg) {
                       os << "SET_8_Instruction " << arg.value_tag << " " << static_cast<int>(arg.offset) << " "
                          << static_cast<int>(arg.value);
                   },
                   [&](SUB_8_Instruction arg) {
                       os << "SUB_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                          << arg.b_offset_index << " " << static_cast<uint16_t>(arg.result_offset);
                   },
                   [&](MUL_8_Instruction arg) {
                       os << "MUL_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                          << arg.b_offset_index << " " << static_cast<uint16_t>(arg.result_offset);
                   },
                   [&](DIV_8_Instruction arg) {
                       os << "DIV_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                          << arg.b_offset_index << " " << static_cast<uint16_t>(arg.result_offset);
                   },
                   [&](EQ_8_Instruction arg) {
                       os << "EQ_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                          << arg.b_offset_index << " " << static_cast<uint16_t>(arg.result_offset);
                   },
                   [&](LT_8_Instruction arg) {
                       os << "LT_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                          << arg.b_offset_index << " " << static_cast<uint16_t>(arg.result_offset);
                   },
                   [&](LTE_8_Instruction arg) {
                       os << "LTE_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                          << arg.b_offset_index << " " << static_cast<uint16_t>(arg.result_offset);
                   },
                   [&](AND_8_Instruction arg) {
                       os << "AND_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                          << arg.b_offset_index << " " << static_cast<uint16_t>(arg.result_offset);
                   },
                   [&](OR_8_Instruction arg) {
                       os << "OR_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                          << arg.b_offset_index << " " << static_cast<uint16_t>(arg.result_offset);
                   },
                   [&](XOR_8_Instruction arg) {
                       os << "XOR_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                          << arg.b_offset_index << " " << static_cast<uint16_t>(arg.result_offset);
                   },
                   [&](SHL_8_Instruction arg) {
                       os << "SHL_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                          << arg.b_offset_index << " " << static_cast<uint16_t>(arg.result_offset);
                   },
                   [&](SHR_8_Instruction arg) {
                       os << "SHR_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                          << arg.b_offset_index << " " << static_cast<uint16_t>(arg.result_offset);
                   },
                   [&](auto) { os << "Unknown instruction"; },
               },
               instruction);
    return os;
}
