#pragma once

#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <variant>

#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

using MemoryTag = bb::avm2::MemoryTag;

/// @brief Wrapper for MemoryTag to allow for msgpack packing and unpacking
struct MemoryTagWrapper {
    MemoryTag value;

    MemoryTagWrapper() = default;
    MemoryTagWrapper(MemoryTag v)
        : value(v)
    {}

    operator MemoryTag() const { return value; }

    void msgpack_pack(auto& packer) const
    {
        uint64_t value_to_serialize = static_cast<uint64_t>(this->value);
        packer.pack_bin(sizeof(value_to_serialize));
        packer.pack_bin_body((char*)&value_to_serialize, sizeof(value_to_serialize)); // NOLINT
    }

    void msgpack_unpack(msgpack::object const& o)
    {
        // Handle binary data unpacking
        if (o.type == msgpack::type::BIN) {
            auto bin = o.via.bin;
            if (bin.size == sizeof(uint64_t)) {
                uint64_t value_to_deserialize = 0;
                std::memcpy(&value_to_deserialize, bin.ptr, sizeof(value_to_deserialize));
                *this = MemoryTagWrapper(static_cast<MemoryTag>(value_to_deserialize));
            } else {
                throw std::runtime_error("Invalid binary data size for MemoryTag");
            }
        }
    }
};

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
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

/// @brief mem[result_offset] = mem[a_address] - mem[b_address]
struct SUB_8_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

/// @brief mem[result_offset] = mem[a_address] * mem[b_address]
struct MUL_8_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

/// @brief mem[result_offset] = mem[a_address] / mem[b_address]
struct DIV_8_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

// TODO(defkit) FDIV skipping for now

/// @brief mem[result_offset] = mem[a_address] == mem[b_address]
struct EQ_8_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

/// @brief mem[result_offset] = mem[a_address] < mem[b_address]
struct LT_8_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

/// @brief mem[result_offset] = mem[a_address] <= mem[b_address]
struct LTE_8_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

/// @brief mem[result_offset] = mem[a_address] & mem[b_address]
struct AND_8_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

/// @brief mem[result_offset] = mem[a_address] | mem[b_address]
struct OR_8_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

/// @brief mem[result_offset] = mem[a_address] ^ mem[b_address]
struct XOR_8_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

// TODO(defkit) not skipping for now
// struct NOT_8_Instruction {

/// @brief mem[result_offset] = mem[a_address] << mem[b_address]
struct SHL_8_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

/// @brief mem[result_offset] = mem[a_address] >> mem[b_address]
struct SHR_8_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

/// @brief SET_8 instruction
struct SET_8_Instruction {
    MemoryTagWrapper value_tag;
    uint8_t offset;
    uint8_t value;
    MSGPACK_FIELDS(value_tag, offset, value);
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
    os << std::to_string(tag);
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
