#pragma once

#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <variant>

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/vm2/common/field.hpp"
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

struct FDIV_8_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint8_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

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

struct NOT_8_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint8_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, result_offset);
};

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

/// @brief SET_16 instruction
struct SET_16_Instruction {
    MemoryTagWrapper value_tag;
    uint16_t offset;
    uint16_t value;
    MSGPACK_FIELDS(value_tag, offset, value);
};

/// @brief SET_32 instruction
struct SET_32_Instruction {
    MemoryTagWrapper value_tag;
    uint16_t offset;
    uint32_t value;
    MSGPACK_FIELDS(value_tag, offset, value);
};

/// @brief SET_64 instruction
struct SET_64_Instruction {
    MemoryTagWrapper value_tag;
    uint16_t offset;
    uint64_t value;
    MSGPACK_FIELDS(value_tag, offset, value);
};

/// @brief SET_128 instruction
struct SET_128_Instruction {
    MemoryTagWrapper value_tag;
    uint16_t offset;
    uint64_t value_low;
    uint64_t value_high;
    MSGPACK_FIELDS(value_tag, offset, value_low, value_high);
};

/// @brief SET_FF instruction
struct SET_FF_Instruction {
    MemoryTagWrapper value_tag;
    uint16_t offset;
    bb::avm2::FF value;
    MSGPACK_FIELDS(value_tag, offset, value);
};

/// @brief MOV_8 instruction: mem[dst_offset] = mem[src_offset]
struct MOV_8_Instruction {
    MemoryTagWrapper value_tag;
    uint16_t src_offset_index;
    uint8_t dst_offset;
    MSGPACK_FIELDS(value_tag, src_offset_index, dst_offset);
};

/// @brief MOV_16 instruction: mem[dst_offset] = mem[src_offset]
struct MOV_16_Instruction {
    MemoryTagWrapper value_tag;
    uint16_t src_offset_index;
    uint16_t dst_offset;
    MSGPACK_FIELDS(value_tag, src_offset_index, dst_offset);
};

/// @brief mem[result_offset] = mem[a_address] + mem[b_address] (16-bit)
struct ADD_16_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint16_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

/// @brief mem[result_offset] = mem[a_address] - mem[b_address] (16-bit)
struct SUB_16_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint16_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

/// @brief mem[result_offset] = mem[a_address] * mem[b_address] (16-bit)
struct MUL_16_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint16_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

/// @brief mem[result_offset] = mem[a_address] / mem[b_address] (16-bit)
struct DIV_16_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint16_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

struct FDIV_16_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint16_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

/// @brief mem[result_offset] = mem[a_address] == mem[b_address] (16-bit)
struct EQ_16_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint16_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

/// @brief mem[result_offset] = mem[a_address] < mem[b_address] (16-bit)
struct LT_16_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint16_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

/// @brief mem[result_offset] = mem[a_address] <= mem[b_address] (16-bit)
struct LTE_16_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint16_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

/// @brief mem[result_offset] = mem[a_address] & mem[b_address] (16-bit)
struct AND_16_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint16_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

/// @brief mem[result_offset] = mem[a_address] | mem[b_address] (16-bit)
struct OR_16_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint16_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

/// @brief mem[result_offset] = mem[a_address] ^ mem[b_address] (16-bit)
struct XOR_16_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint16_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

struct NOT_16_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, result_offset);
};

/// @brief mem[result_offset] = mem[a_address] << mem[b_address] (16-bit)
struct SHL_16_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint16_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

/// @brief mem[result_offset] = mem[a_address] >> mem[b_address] (16-bit)
struct SHR_16_Instruction {
    MemoryTagWrapper argument_tag;
    uint16_t a_offset_index;
    uint16_t b_offset_index;
    uint16_t result_offset;
    MSGPACK_FIELDS(argument_tag, a_offset_index, b_offset_index, result_offset);
};

/// @brief CAST_8: cast mem[src_offset_index] to target_tag and store at dst_offset
struct CAST_8_Instruction {
    MemoryTagWrapper src_tag;
    uint16_t src_offset_index;
    uint8_t dst_offset;
    MemoryTagWrapper target_tag;
    MSGPACK_FIELDS(src_tag, src_offset_index, dst_offset, target_tag);
};

/// @brief CAST_16: cast mem[src_offset_index] to target_tag and store at dst_offset
struct CAST_16_Instruction {
    MemoryTagWrapper src_tag;
    uint16_t src_offset_index;
    uint16_t dst_offset;
    MemoryTagWrapper target_tag;
    MSGPACK_FIELDS(src_tag, src_offset_index, dst_offset, target_tag);
};

/// @brief SSTORE: M[slot_offset_index] = slot; S[M[slotOffset]] = M[srcOffset]
struct SSTORE_Instruction {
    uint16_t src_offset_index;
    uint16_t slot_offset;
    bb::avm2::FF slot;
    MSGPACK_FIELDS(src_offset_index, slot_offset, slot);
};

/// @brief SLOAD: M[slot_offset] = slot; M[result_offset] = S[M[slotOffset]]
struct SLOAD_Instruction {
    uint16_t slot_index;  // index of the slot in memory_manager.storage_addresses
    uint16_t slot_offset; // address where we set slot value
    uint16_t result_offset;
    MSGPACK_FIELDS(slot_index, slot_offset, result_offset);
};

/// @brief GETENVVAR: M[result_offset] = getenvvar(type)
struct GETENVVAR_Instruction {
    uint16_t result_offset;
    // msgpack cannot pack enum classes, so we pack that as a uint8_t
    // 0 -> ADDRESS, 1 -> SENDER, 2 -> TRANSACTIONFEE, 3 -> CHAINID, 4 -> VERSION, 5 -> BLOCKNUMBER, 6 -> TIMESTAMP,
    // 7 -> BASEFEEPERDAGAS, 8 -> BASEFEEPERL2GAS, 9 -> ISSTATICCALL, 10 -> L2GASLEFT, 11 -> DAGASLEFT
    uint8_t type;
    MSGPACK_FIELDS(result_offset, type);
};

/// @brief EMITNULIFIER: inserts new nullifier to the nullifier tree
struct EMITNULLIFIER_Instruction {
    uint16_t nullifier_offset_index;
    MSGPACK_FIELDS(nullifier_offset_index);
};

/// @brief NULLIFIEREXISTS: checks if nullifier exists in the nullifier tree
/// Gets contract's address by GETENVVAR(0)
/// M[result_offset] = NULLIFIEREXISTS(M[nullifier_offset_index], GETENVVAR(0))
struct NULLIFIEREXISTS_Instruction {
    uint16_t nullifier_offset_index;
    uint16_t contract_address_offset; // absolute address where the contract address will be stored
    uint16_t result_offset;
    MSGPACK_FIELDS(nullifier_offset_index, contract_address_offset, result_offset);
};

/// @brief EMITNOTEHASH: M[note_hash_offset] = note_hash; emit note hash to the note hash tree
struct EMITNOTEHASH_Instruction {
    uint16_t note_hash_offset; // absolute address where the note hash will be stored
    bb::avm2::FF note_hash;
    MSGPACK_FIELDS(note_hash_offset, note_hash);
};

/// @brief NOTEHASHEXISTS:  M[result_offset] = NOTEHASHEXISTS(M[notehash_offset], M[leaf_index_offset])
/// len = length(memory_manager.emitted_note_hashes);
/// M[notehash_offset] = memory_manager.emitted_note_hashes[notehash_index % len];
/// M[leaf_index_offset] = notehash_index % len;
/// M[result_offset] = NOTEHASHEXISTS(M[notehash_offset], M[leaf_index_offset]);
struct NOTEHASHEXISTS_Instruction {
    // index of the note hash in the memory_manager.emitted_note_hashes
    uint16_t notehash_index;
    // absolute address where the note hash will be stored
    uint16_t notehash_offset;
    // absolute address where the leaf index will be stored
    uint16_t leaf_index_offset;
    // absolute address where the result will be stored
    uint16_t result_offset;
    MSGPACK_FIELDS(notehash_index, notehash_offset, leaf_index_offset, result_offset);
};

using FuzzInstruction = std::variant<ADD_8_Instruction,
                                     FDIV_8_Instruction,
                                     SET_8_Instruction,
                                     SET_16_Instruction,
                                     SET_32_Instruction,
                                     SET_64_Instruction,
                                     SET_128_Instruction,
                                     SET_FF_Instruction,
                                     MOV_8_Instruction,
                                     MOV_16_Instruction,
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
                                     SHR_8_Instruction,
                                     NOT_8_Instruction,
                                     ADD_16_Instruction,
                                     SUB_16_Instruction,
                                     MUL_16_Instruction,
                                     DIV_16_Instruction,
                                     FDIV_16_Instruction,
                                     EQ_16_Instruction,
                                     LT_16_Instruction,
                                     LTE_16_Instruction,
                                     AND_16_Instruction,
                                     OR_16_Instruction,
                                     XOR_16_Instruction,
                                     NOT_16_Instruction,
                                     SHL_16_Instruction,
                                     SHR_16_Instruction,
                                     CAST_8_Instruction,
                                     CAST_16_Instruction,
                                     SSTORE_Instruction,
                                     SLOAD_Instruction,
                                     GETENVVAR_Instruction,
                                     EMITNULLIFIER_Instruction,
                                     NULLIFIEREXISTS_Instruction,
                                     EMITNOTEHASH_Instruction,
                                     NOTEHASHEXISTS_Instruction>;

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
    std::visit(
        overloaded_instruction{
            [&](ADD_8_Instruction arg) {
                os << "ADD_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " " << arg.b_offset_index
                   << " " << static_cast<uint16_t>(arg.result_offset);
            },
            [&](SET_8_Instruction arg) {
                os << "SET_8_Instruction " << arg.value_tag << " " << static_cast<int>(arg.offset) << " "
                   << static_cast<int>(arg.value);
            },
            [&](SET_16_Instruction arg) {
                os << "SET_16_Instruction " << arg.value_tag << " " << arg.offset << " " << arg.value;
            },
            [&](SET_32_Instruction arg) {
                os << "SET_32_Instruction " << arg.value_tag << " " << arg.offset << " " << arg.value;
            },
            [&](SET_64_Instruction arg) {
                os << "SET_64_Instruction " << arg.value_tag << " " << arg.offset << " " << arg.value;
            },
            [&](SET_128_Instruction arg) {
                os << "SET_128_Instruction " << arg.value_tag << " " << arg.offset << " " << arg.value_high << " "
                   << arg.value_low;
            },
            [&](SET_FF_Instruction arg) {
                os << "SET_FF_Instruction " << arg.value_tag << " " << arg.offset << " " << arg.value;
            },
            [&](SUB_8_Instruction arg) {
                os << "SUB_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " " << arg.b_offset_index
                   << " " << static_cast<uint16_t>(arg.result_offset);
            },
            [&](MUL_8_Instruction arg) {
                os << "MUL_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " " << arg.b_offset_index
                   << " " << static_cast<uint16_t>(arg.result_offset);
            },
            [&](DIV_8_Instruction arg) {
                os << "DIV_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " " << arg.b_offset_index
                   << " " << static_cast<uint16_t>(arg.result_offset);
            },
            [&](FDIV_8_Instruction arg) {
                os << "FDIV_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                   << arg.b_offset_index << " " << static_cast<uint16_t>(arg.result_offset);
            },
            [&](EQ_8_Instruction arg) {
                os << "EQ_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " " << arg.b_offset_index
                   << " " << static_cast<uint16_t>(arg.result_offset);
            },
            [&](LT_8_Instruction arg) {
                os << "LT_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " " << arg.b_offset_index
                   << " " << static_cast<uint16_t>(arg.result_offset);
            },
            [&](LTE_8_Instruction arg) {
                os << "LTE_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " " << arg.b_offset_index
                   << " " << static_cast<uint16_t>(arg.result_offset);
            },
            [&](AND_8_Instruction arg) {
                os << "AND_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " " << arg.b_offset_index
                   << " " << static_cast<uint16_t>(arg.result_offset);
            },
            [&](OR_8_Instruction arg) {
                os << "OR_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " " << arg.b_offset_index
                   << " " << static_cast<uint16_t>(arg.result_offset);
            },
            [&](XOR_8_Instruction arg) {
                os << "XOR_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " " << arg.b_offset_index
                   << " " << static_cast<uint16_t>(arg.result_offset);
            },
            [&](SHL_8_Instruction arg) {
                os << "SHL_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " " << arg.b_offset_index
                   << " " << static_cast<uint16_t>(arg.result_offset);
            },
            [&](SHR_8_Instruction arg) {
                os << "SHR_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " " << arg.b_offset_index
                   << " " << static_cast<uint16_t>(arg.result_offset);
            },
            [&](NOT_8_Instruction arg) {
                os << "NOT_8_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                   << static_cast<uint16_t>(arg.result_offset);
            },
            [&](ADD_16_Instruction arg) {
                os << "ADD_16_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                   << arg.b_offset_index << " " << arg.result_offset;
            },
            [&](SUB_16_Instruction arg) {
                os << "SUB_16_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                   << arg.b_offset_index << " " << arg.result_offset;
            },
            [&](MUL_16_Instruction arg) {
                os << "MUL_16_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                   << arg.b_offset_index << " " << arg.result_offset;
            },
            [&](DIV_16_Instruction arg) {
                os << "DIV_16_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                   << arg.b_offset_index << " " << arg.result_offset;
            },
            [&](FDIV_16_Instruction arg) {
                os << "FDIV_16_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                   << arg.b_offset_index << " " << arg.result_offset;
            },
            [&](EQ_16_Instruction arg) {
                os << "EQ_16_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " " << arg.b_offset_index
                   << " " << arg.result_offset;
            },
            [&](LT_16_Instruction arg) {
                os << "LT_16_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " " << arg.b_offset_index
                   << " " << arg.result_offset;
            },
            [&](LTE_16_Instruction arg) {
                os << "LTE_16_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                   << arg.b_offset_index << " " << arg.result_offset;
            },
            [&](AND_16_Instruction arg) {
                os << "AND_16_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                   << arg.b_offset_index << " " << arg.result_offset;
            },
            [&](OR_16_Instruction arg) {
                os << "OR_16_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " " << arg.b_offset_index
                   << " " << arg.result_offset;
            },
            [&](XOR_16_Instruction arg) {
                os << "XOR_16_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                   << arg.b_offset_index << " " << arg.result_offset;
            },
            [&](NOT_16_Instruction arg) {
                os << "NOT_16_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                   << arg.result_offset;
            },
            [&](SHL_16_Instruction arg) {
                os << "SHL_16_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                   << arg.b_offset_index << " " << arg.result_offset;
            },
            [&](SHR_16_Instruction arg) {
                os << "SHR_16_Instruction " << arg.argument_tag << " " << arg.a_offset_index << " "
                   << arg.b_offset_index << " " << arg.result_offset;
            },
            [&](CAST_8_Instruction arg) {
                os << "CAST_8_Instruction " << arg.src_tag << " " << arg.src_offset_index << " "
                   << static_cast<int>(arg.dst_offset) << " " << arg.target_tag;
            },
            [&](CAST_16_Instruction arg) {
                os << "CAST_16_Instruction " << arg.src_tag << " " << arg.src_offset_index << " " << arg.dst_offset
                   << " " << arg.target_tag;
            },
            [&](MOV_8_Instruction arg) {
                os << "MOV_8_Instruction " << arg.value_tag << " " << arg.src_offset_index << " "
                   << static_cast<int>(arg.dst_offset);
            },
            [&](MOV_16_Instruction arg) {
                os << "MOV_16_Instruction " << arg.value_tag << " " << arg.src_offset_index << " " << arg.dst_offset;
            },
            [&](SSTORE_Instruction arg) {
                os << "SSTORE_Instruction " << arg.src_offset_index << " " << arg.slot_offset << " " << arg.slot;
            },
            [&](SLOAD_Instruction arg) {
                os << "SLOAD_Instruction " << arg.slot_index << " " << arg.slot_offset << " " << arg.result_offset;
            },
            [&](GETENVVAR_Instruction arg) {
                os << "GETENVVAR_Instruction " << arg.result_offset << " " << static_cast<int>(arg.type);
            },
            [&](EMITNULLIFIER_Instruction arg) { os << "EMITNULIFIER_Instruction " << arg.nullifier_offset_index; },
            [&](NULLIFIEREXISTS_Instruction arg) {
                os << "NULLIFIEREXISTS_Instruction " << arg.nullifier_offset_index << " " << arg.contract_address_offset
                   << " " << arg.result_offset;
            },
            [&](EMITNOTEHASH_Instruction arg) {
                os << "EMITNOTEHASH_Instruction " << arg.note_hash_offset << " " << arg.note_hash;
            },
            [&](NOTEHASHEXISTS_Instruction arg) {
                os << "NOTEHASHEXISTS_Instruction " << arg.notehash_index << " " << arg.notehash_offset << " "
                   << arg.leaf_index_offset << " " << arg.result_offset;
            },
            [&](auto) { os << "Unknown instruction"; },
        },
        instruction);
    return os;
}
