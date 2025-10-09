#include "barretenberg/vm2/common/memory_types.hpp"
#include <cstdint>
#include <variant>

struct Argument {
    /// @brief the index of the argument in the stored map
    /// The way we store used variables is a map of Tag: Vec[memory_address]
    /// The index of the argument in the stored vector, corresponding to the tag
    /// The index will be taken modulo the size of the vector
    /// If the corresponding vector is empty, the argument is invalid, we skip this op
    /// **Example**
    /// Stored variables map: { U8: [0, 1, 2], U32: [3, 4] }
    /// Argument {index: 100, variable_tag: U8} -> 100 % 3 = 1 -> 1st element of U8 vector = 1
    /// Argument {index: 100, variable_tag: U32} -> 100 % 2 = 0 -> 0th element of U32 vector = 3
    uint32_t offset_index;
    bb::avm2::MemoryTag argument_tag;
};

/// @brief ADD_8 instruction
/// argument_tag of the b and the result are ignored (will be used argument_tag of the a)
struct ADD_8_Instruction {
    Argument a;
    Argument b;
    Argument result;
};

/// @brief SET_8 instruction
struct SET_8_Instruction {
    Argument argument;
    bb::avm2::FF value;
};

using Instruction = std::variant<ADD_8_Instruction, SET_8_Instruction>;
template <class... Ts> struct overloaded_instruction : Ts... {
    using Ts::operator()...;
};
template <class... Ts> overloaded_instruction(Ts...) -> overloaded_instruction<Ts...>;

class InstructionBuilder {
    static std::vector<uint8_t> build_instruction(Instruction instruction);
};
