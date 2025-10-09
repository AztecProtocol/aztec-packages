#pragma once
#include "barretenberg/vm2/common/memory_types.hpp"
#include <cstdint>
#include <variant>

template <typename T> struct Argument {
    /// @brief the index of the argument in the stored map
    /// The way we store used variables is a map of Tag: Vec[memory_address]
    /// The index of the argument in the stored vector, corresponding to the tag
    /// The index will be taken modulo the size of the vector
    /// If the corresponding vector is empty, the argument is invalid, we skip this op
    /// **Example**
    /// Stored variables map: { U8: [0, 1, 2], U32: [3, 4] }
    /// Argument {index: 100, variable_tag: U8} -> 100 % 3 = 1 -> 1st element of U8 vector = 1
    /// Argument {index: 100, variable_tag: U32} -> 100 % 2 = 0 -> 0th element of U32 vector = 3
    T offset_index;
    bb::avm2::MemoryTag argument_tag;
};

/// @brief ADD_8 instruction
/// argument_tag of the b and the result are ignored (will be used argument_tag of the a)
struct ADD_8_Instruction {
    Argument<uint8_t> a;
    Argument<uint8_t> b;
    Argument<uint8_t> result;
};

/// @brief SET_8 instruction
/// argument.offset_index is the direct memory address
struct SET_8_Instruction {
    Argument<uint8_t> argument;
    uint8_t value;
};

/// @brief RETURN instruction
struct RETURN_Instruction {
    uint8_t return_size;
    Argument<uint8_t> return_value_offset_index;
};

using Instruction = std::variant<ADD_8_Instruction, SET_8_Instruction, RETURN_Instruction>;
template <class... Ts> struct overloaded_instruction : Ts... {
    using Ts::operator()...;
};
template <class... Ts> overloaded_instruction(Ts...) -> overloaded_instruction<Ts...>;

class InstructionBuilder {
    static std::vector<uint8_t> build_instruction(Instruction instruction);
};
