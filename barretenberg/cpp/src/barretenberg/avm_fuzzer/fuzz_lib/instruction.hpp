#pragma once

#include <cstdint>
#include <cstring>
#include <optional>
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

enum class AddressingMode : uint8_t {
    Direct = 0,
    Indirect = 1,
    Relative = 2,
    IndirectRelative = 3,
};

/// @brief Wrapper for AddressingMode to allow for msgpack packing and unpacking
struct AddressingModeWrapper {
    AddressingMode value;

    AddressingModeWrapper() = default;
    AddressingModeWrapper(AddressingMode v)
        : value(v)
    {}

    operator AddressingMode() const { return value; }

    void msgpack_pack(auto& packer) const
    {
        uint8_t value_to_serialize = static_cast<uint8_t>(this->value);
        packer.pack_bin(sizeof(value_to_serialize));
        packer.pack_bin_body((char*)&value_to_serialize, sizeof(value_to_serialize)); // NOLINT
    }

    void msgpack_unpack(msgpack::object const& o)
    {
        // Handle binary data unpacking
        if (o.type == msgpack::type::BIN) {
            auto bin = o.via.bin;
            if (bin.size == sizeof(uint8_t)) {
                uint8_t value_to_deserialize = 0;
                std::memcpy(&value_to_deserialize, bin.ptr, sizeof(value_to_deserialize));
                *this = AddressingModeWrapper(static_cast<AddressingMode>(value_to_deserialize));
            } else {
                throw std::runtime_error("Invalid binary data size for AddressingMode");
            }
        }
    }
};

/// @brief Variable reference
/// Used to resolve a tracked variable address from memory_manager
/// @example
/// VariableRef {U8, index: 15, mode: IndirectRelative, pointer_address: 50, pointer_value: 10, base_offset: 3}
/// If memory_manager resolved DIRECT address 100 for tag U8,
/// We set M[50] = 10, M[0] = 3
/// We want to resolve address 100 in IndirectRelative values, so we get M[50] + M[0] = 13
/// So we will try to resolve the address 100 - 13 = 87
struct VariableRef {
    MemoryTagWrapper tag;
    /// @brief Index of the variable in the memory_manager.stored_variables map
    uint32_t index = 0;

    /// @brief A seed for the generation of the pointer address
    /// Used for Indirect/IndirectRelative modes only
    uint16_t pointer_address_seed = 0;

    /// @brief A seed for the generation of the base offset
    /// Used for Relative/IndirectRelative modes only
    /// Sets M[0] = base_offset
    uint32_t base_offset_seed = 0;
    AddressingModeWrapper mode = AddressingMode::Direct;

    /// @brief Raw operand value for decompiled bytecode
    /// When set, this exact value is used as the operand instead of computing from seeds.
    /// This ensures byte-perfect reconstruction of decompiled bytecode.
    std::optional<uint32_t> raw_operand = std::nullopt;

    MSGPACK_FIELDS(tag, index, pointer_address_seed, base_offset_seed, mode, raw_operand);
};

struct AddressRef {
    uint32_t address = 0;

    /// @brief A seed for the generation of the pointer address
    /// Used for Indirect/IndirectRelative modes only
    uint16_t pointer_address_seed = 0;

    /// @brief A seed for the generation of the base offset
    /// Used for Relative/IndirectRelative modes only
    /// Sets M[0] = base_offset
    uint32_t base_offset_seed = 0;
    AddressingModeWrapper mode = AddressingMode::Direct;

    /// @brief Raw operand value for decompiled bytecode
    /// When set, this exact value is used as the operand instead of computing from seeds.
    /// This ensures byte-perfect reconstruction of decompiled bytecode.
    std::optional<uint32_t> raw_operand = std::nullopt;

    MSGPACK_FIELDS(address, pointer_address_seed, base_offset_seed, mode, raw_operand);
};

using ParamRef = std::variant<VariableRef, AddressRef>;

/// @brief Output of resolving an address in the memory manager
/// In order to resolve a given absolute address with a given addressing mode,
/// we might have needed to override the base pointer or to
/// make use of indirection via a pointer address, or both.
struct ResolvedAddress {
    uint32_t absolute_address = 0;
    uint32_t operand_address = 0;
    std::optional<uint32_t> base_pointer = std::nullopt;
    std::optional<uint32_t> pointer_address = std::nullopt;
};

/// @brief mem[result_offset] = mem[a_address] + mem[b_address]
struct ADD_8_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] - mem[b_address]
struct SUB_8_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] * mem[b_address]
struct MUL_8_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] / mem[b_address]
struct DIV_8_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

struct FDIV_8_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] == mem[b_address]
struct EQ_8_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] < mem[b_address]
struct LT_8_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] <= mem[b_address]
struct LTE_8_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] & mem[b_address]
struct AND_8_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] | mem[b_address]
struct OR_8_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] ^ mem[b_address]
struct XOR_8_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

struct NOT_8_Instruction {
    ParamRef a_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] << mem[b_address]
struct SHL_8_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] >> mem[b_address]
struct SHR_8_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief SET_8 instruction
struct SET_8_Instruction {
    MemoryTagWrapper value_tag;
    AddressRef result_address;
    uint8_t value;
    MSGPACK_FIELDS(value_tag, result_address, value);
};

/// @brief SET_16 instruction
struct SET_16_Instruction {
    MemoryTagWrapper value_tag;
    AddressRef result_address;
    uint16_t value;
    MSGPACK_FIELDS(value_tag, result_address, value);
};

/// @brief SET_32 instruction
struct SET_32_Instruction {
    MemoryTagWrapper value_tag;
    AddressRef result_address;
    uint32_t value;
    MSGPACK_FIELDS(value_tag, result_address, value);
};

/// @brief SET_64 instruction
struct SET_64_Instruction {
    MemoryTagWrapper value_tag;
    AddressRef result_address;
    uint64_t value;
    MSGPACK_FIELDS(value_tag, result_address, value);
};

/// @brief SET_128 instruction
struct SET_128_Instruction {
    MemoryTagWrapper value_tag;
    AddressRef result_address;
    uint64_t value_low;
    uint64_t value_high;
    MSGPACK_FIELDS(value_tag, result_address, value_low, value_high);
};

/// @brief SET_FF instruction
struct SET_FF_Instruction {
    MemoryTagWrapper value_tag;
    AddressRef result_address;
    bb::avm2::FF value;
    MSGPACK_FIELDS(value_tag, result_address, value);
};

/// @brief MOV_8 instruction: mem[dst_offset] = mem[src_offset]
struct MOV_8_Instruction {
    MemoryTagWrapper value_tag;
    ParamRef src_address;
    AddressRef result_address;
    MSGPACK_FIELDS(value_tag, src_address, result_address);
};

/// @brief MOV_16 instruction: mem[dst_offset] = mem[src_offset]
struct MOV_16_Instruction {
    MemoryTagWrapper value_tag;
    ParamRef src_address;
    AddressRef result_address;
    MSGPACK_FIELDS(value_tag, src_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] + mem[b_address] (16-bit)
struct ADD_16_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] - mem[b_address] (16-bit)
struct SUB_16_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] * mem[b_address] (16-bit)
struct MUL_16_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] / mem[b_address] (16-bit)
struct DIV_16_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

struct FDIV_16_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] == mem[b_address] (16-bit)
struct EQ_16_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] < mem[b_address] (16-bit)
struct LT_16_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] <= mem[b_address] (16-bit)
struct LTE_16_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] & mem[b_address] (16-bit)
struct AND_16_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] | mem[b_address] (16-bit)
struct OR_16_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] ^ mem[b_address] (16-bit)
struct XOR_16_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

struct NOT_16_Instruction {
    ParamRef a_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] << mem[b_address] (16-bit)
struct SHL_16_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief mem[result_offset] = mem[a_address] >> mem[b_address] (16-bit)
struct SHR_16_Instruction {
    ParamRef a_address;
    ParamRef b_address;
    AddressRef result_address;
    MSGPACK_FIELDS(a_address, b_address, result_address);
};

/// @brief CAST_8: cast mem[src_offset_index] to target_tag and store at dst_offset
struct CAST_8_Instruction {
    MemoryTagWrapper src_tag;
    ParamRef src_address;
    AddressRef result_address;
    MemoryTagWrapper target_tag;
    MSGPACK_FIELDS(src_tag, src_address, result_address, target_tag);
};

/// @brief CAST_16: cast mem[src_offset_index] to target_tag and store at dst_offset
struct CAST_16_Instruction {
    MemoryTagWrapper src_tag;
    ParamRef src_address;
    AddressRef result_address;
    MemoryTagWrapper target_tag;
    MSGPACK_FIELDS(src_tag, src_address, result_address, target_tag);
};

/// @brief SSTORE: M[slot_offset_index] = slot; S[M[slotOffset]] = M[srcOffset]
struct SSTORE_Instruction {
    ParamRef src_address;
    AddressRef result_address;
    bb::avm2::FF slot;
    MSGPACK_FIELDS(src_address, result_address, slot);
};

/// @brief SLOAD: M[slot_offset] = slot; M[result_offset] = S[M[slotOffset]]
struct SLOAD_Instruction {
    uint16_t slot_index;     // index of the slot in memory_manager.storage_addresses
    AddressRef slot_address; // address where we set slot value
    AddressRef result_address;
    MSGPACK_FIELDS(slot_index, slot_address, result_address);
};

/// @brief GETENVVAR: M[result_offset] = getenvvar(type)
struct GETENVVAR_Instruction {
    AddressRef result_address;
    // msgpack cannot pack enum classes, so we pack that as a uint8_t
    // 0 -> ADDRESS, 1 -> SENDER, 2 -> TRANSACTIONFEE, 3 -> CHAINID, 4 -> VERSION, 5 -> BLOCKNUMBER, 6 -> TIMESTAMP,
    // 7 -> BASEFEEPERDAGAS, 8 -> BASEFEEPERL2GAS, 9 -> ISSTATICCALL, 10 -> L2GASLEFT, 11 -> DAGASLEFT
    uint8_t type;
    MSGPACK_FIELDS(result_address, type);
};

/// @brief EMITNULIFIER: inserts new nullifier to the nullifier tree
struct EMITNULLIFIER_Instruction {
    ParamRef nullifier_address;
    MSGPACK_FIELDS(nullifier_address);
};

/// @brief NULLIFIEREXISTS: checks if nullifier exists in the nullifier tree
/// Gets contract's address by GETENVVAR(0)
/// M[result_offset] = NULLIFIEREXISTS(M[nullifier_offset_index], GETENVVAR(0))
struct NULLIFIEREXISTS_Instruction {
    ParamRef nullifier_address;
    AddressRef contract_address_address; // absolute address where the contract address will be stored
    AddressRef result_address;
    MSGPACK_FIELDS(nullifier_address, contract_address_address, result_address);
};

/// @brief L1TOL2MSGEXISTS: Check if a L1 to L2 message exists
/// M[result_address] = L1TOL2MSGEXISTS(M[msg_hash_address], M[leaf_index_address])
struct L1TOL2MSGEXISTS_Instruction {
    ParamRef msg_hash_address;   // FF: the message hash
    ParamRef leaf_index_address; // U64: leaf index in the message tree
    AddressRef result_address;   // result (U1)
    MSGPACK_FIELDS(msg_hash_address, leaf_index_address, result_address);
};

/// @brief EMITNOTEHASH: M[note_hash_offset] = note_hash; emit note hash to the note hash tree
struct EMITNOTEHASH_Instruction {
    AddressRef note_hash_address; // absolute address where the note hash will be stored
    bb::avm2::FF note_hash;
    MSGPACK_FIELDS(note_hash_address, note_hash);
};

/// @brief NOTEHASHEXISTS:  M[result_offset] = NOTEHASHEXISTS(M[notehash_offset], M[leaf_index_offset])
/// len = length(memory_manager.emitted_note_hashes);
/// M[notehash_offset] = unique_note_hash(CONTRACT_ADDRESS, memory_manager.emitted_note_hashes[notehash_index % len]);
/// M[leaf_index_offset] = notehash_index % len;
/// M[result_offset] = NOTEHASHEXISTS(M[notehash_offset], M[leaf_index_offset]);
struct NOTEHASHEXISTS_Instruction {
    // index of the note hash in the memory_manager.emitted_note_hashes
    uint16_t notehash_index;
    // absolute address where the note hash will be stored
    AddressRef notehash_address;
    // absolute address where the leaf index will be stored
    AddressRef leaf_index_address;
    // absolute address where the result will be stored
    AddressRef result_address;
    MSGPACK_FIELDS(notehash_index, notehash_address, leaf_index_address, result_address);
};

/// @brief CALLDATACOPY: M[dstOffset:dstOffset+M[copySizeOffset]] =
/// calldata[M[cdStartOffset]:M[cdStartOffset]+M[copySizeOffset]]
struct CALLDATACOPY_Instruction {
    AddressRef dst_address;
    uint8_t copy_size;
    AddressRef copy_size_address; // where copy size will be stored
    uint16_t cd_start;
    AddressRef cd_start_address; // where cd start will be stored
    MSGPACK_FIELDS(dst_address, copy_size, copy_size_address, cd_start, cd_start_address);
};

struct SENDL2TOL1MSG_Instruction {
    bb::avm2::FF recipient;
    AddressRef recipient_address;
    bb::avm2::FF content;
    AddressRef content_address;
    MSGPACK_FIELDS(recipient, recipient_address, content, content_address);
};

struct EMITUNENCRYPTEDLOG_Instruction {
    uint8_t log_size;
    AddressRef log_size_address;
    std::vector<bb::avm2::FF> log_values;
    uint16_t log_values_address_start;
    MSGPACK_FIELDS(log_size, log_size_address, log_values);
};

/// @brief CALL: call function by index (resolved by contract db proxy)
/// All addresses are DIRECT, because this opcode is already way too heavy
struct CALL_Instruction {
    uint16_t function_index;
    uint16_t address_offset; // where the function address will be stored
    uint32_t l2_gas;
    uint16_t l2_gas_address;
    uint32_t da_gas;
    uint16_t da_gas_address;
    uint16_t arg_size_offset; // where calldata.size() will be stored
    uint16_t args_offset;     // where the args will be stored
    std::vector<bb::avm2::FF> args;
    bool is_static_call; // use STATICCALL/CALL opcodes
    MSGPACK_FIELDS(function_index,
                   address_offset,
                   l2_gas,
                   l2_gas_address,
                   da_gas,
                   da_gas_address,
                   arg_size_offset,
                   args_offset,
                   args,
                   is_static_call);
};

/// @brief RAW_CALL: Raw CALL/STATICCALL instruction from decompiled bytecode
/// Wire format: [INDIRECT16, l2GasOffset, daGasOffset, addrOffset, argsOffset, argsSizeOffset]
/// Used for byte-perfect reconstruction of bytecode - no semantic processing
struct RAW_CALL_Instruction {
    AddressRef l2_gas_address;
    AddressRef da_gas_address;
    AddressRef addr_address;
    AddressRef args_address;
    AddressRef args_size_address;
    bool is_static_call;
    MSGPACK_FIELDS(l2_gas_address, da_gas_address, addr_address, args_address, args_size_address, is_static_call);
};

/// @brief: RETURNDATASIZE + RETURNDATACOPY:
// M[copySizeOffset] = nestedReturndata.size()
// M[dstOffset:dstOffset+M[copySizeOffset]] =
/// nestedReturndata[M[rdStartOffset]:M[rdStartOffset]+M[copySizeOffset]]
/// All addresses are DIRECT
struct RETURNDATASIZE_WITH_RETURNDATACOPY_Instruction {
    uint16_t copy_size_offset;
    uint16_t dst_address;
    uint32_t rd_start;
    uint16_t rd_start_offset;
    MSGPACK_FIELDS(copy_size_offset, dst_address, rd_start, rd_start_offset);
};

struct GETCONTRACTINSTANCE_Instruction {
    uint16_t contract_index;             // index of the contract in the contract db
    AddressRef contract_address_address; // where the contract address will be stored
    AddressRef dst_address;
    uint8_t member_enum; // taken modulo 3. 0 -> DEPLOYER, 1 -> CLASS_ID, 2 -> INIT_HASH
    MSGPACK_FIELDS(contract_index, contract_address_address, dst_address, member_enum);
};

struct SUCCESSCOPY_Instruction {
    AddressRef dst_address;
    MSGPACK_FIELDS(dst_address);
};

struct ECADD_Instruction {
    ParamRef p1_x;
    ParamRef p1_y;
    ParamRef p1_infinite;
    ParamRef p2_x;
    ParamRef p2_y;
    ParamRef p2_infinite;
    AddressRef result;
    MSGPACK_FIELDS(p1_x, p1_y, p1_infinite, p2_x, p2_y, p2_infinite, result);
};

/// @brief POSEIDON2PERM: Perform Poseidon2 permutation on 4 FF values
/// M[dst_address:dst_address+4] = poseidon2_perm(M[src_address:src_address+4])
struct POSEIDON2PERM_Instruction {
    ParamRef src_address;
    AddressRef dst_address;
    MSGPACK_FIELDS(src_address, dst_address);
};

/// @brief KECCAKF1600: Perform Keccak-f[1600] permutation on 25 U64 values
/// M[dst_address:dst_address+25] = keccakf1600(M[src_address:src_address+25])
struct KECCAKF1600_Instruction {
    ParamRef src_address;
    AddressRef dst_address;
    MSGPACK_FIELDS(src_address, dst_address);
};

/// @brief SHA256COMPRESSION: Perform SHA256 compression
/// M[dst_address:dst_address+8] = sha256_compression(M[state_address:state_address+8],
/// M[input_address:input_address+16])
struct SHA256COMPRESSION_Instruction {
    ParamRef state_address;
    ParamRef input_address;
    AddressRef dst_address;
    MSGPACK_FIELDS(state_address, input_address, dst_address);
};

/// @brief TORADIXBE: Convert a field element to a vector of limbs in big-endian radix representation
/// M[dst_address:dst_address+num_limbs] = to_radix_be(M[value_address], radix, num_limbs)
struct TORADIXBE_Instruction {
    ParamRef value_address;       // FF: value to convert
    ParamRef radix_address;       // U32: the radix/base
    ParamRef num_limbs_address;   // U32: number of output limbs
    ParamRef output_bits_address; // U1: whether output is bits
    AddressRef dst_address;       // destination for limbs
    bool is_output_bits;          // known at generation time for memory tracking (U1 if true, U8 if false)
    MSGPACK_FIELDS(value_address, radix_address, num_limbs_address, output_bits_address, dst_address, is_output_bits);
};

// ============================================================================
// Control Flow Instructions (opaque - serialize directly for decompiler)
// These instructions are used by the bytecode decompiler to preserve
// bytecode equivalence when decompiling and recompiling.
// ============================================================================

/// @brief JUMP_32: Unconditional jump to destination PC
struct JUMP_32_Instruction {
    uint32_t destination; // Raw PC offset from bytecode
    MSGPACK_FIELDS(destination);
};

/// @brief JUMPI_32: Conditional jump based on condition at memory offset
struct JUMPI_32_Instruction {
    AddressRef condition_address; // Memory address of condition (with addressing mode)
    uint32_t destination;         // Jump target if condition is true
    MSGPACK_FIELDS(condition_address, destination);
};

/// @brief RETURN: Return from execution with data
struct RETURN_Instruction {
    AddressRef return_data_size_address; // Memory address containing size
    AddressRef return_data_address;      // Memory address of return data start
    MSGPACK_FIELDS(return_data_size_address, return_data_address);
};

/// @brief REVERT_8: Revert execution (8-bit operands)
struct REVERT_8_Instruction {
    AddressRef return_data_size_address;
    AddressRef return_data_address;
    MSGPACK_FIELDS(return_data_size_address, return_data_address);
};

/// @brief REVERT_16: Revert execution (16-bit operands)
struct REVERT_16_Instruction {
    AddressRef return_data_size_address;
    AddressRef return_data_address;
    MSGPACK_FIELDS(return_data_size_address, return_data_address);
};

/// @brief INTERNALCALL: Call internal function at destination PC
struct INTERNALCALL_Instruction {
    uint32_t destination; // Target PC of internal function
    MSGPACK_FIELDS(destination);
};

/// @brief INTERNALRETURN: Return from internal function call
struct INTERNALRETURN_Instruction {
    // No operands - use empty MSGPACK_FIELDS
    uint8_t _dummy = 0; // Placeholder for msgpack serialization
    MSGPACK_FIELDS(_dummy);
};

// ============================================================================
// Raw Instructions (for byte-perfect bytecode reconstruction from decompiler)
// ============================================================================

/// @brief RAW_RETURNDATASIZE: [INDIRECT8, dstOffset]
struct RAW_RETURNDATASIZE_Instruction {
    AddressRef dst_address;
    MSGPACK_FIELDS(dst_address);
};

/// @brief RAW_RETURNDATACOPY: [INDIRECT8, dstOffset, rdStartOffset, copySizeOffset]
struct RAW_RETURNDATACOPY_Instruction {
    AddressRef dst_address;
    AddressRef rd_start_address;
    AddressRef copy_size_address;
    MSGPACK_FIELDS(dst_address, rd_start_address, copy_size_address);
};

/// @brief RAW_L1TOL2MSGEXISTS: [INDIRECT8, msgKeyOffset, msgLeafIndexOffset, resultOffset]
struct RAW_L1TOL2MSGEXISTS_Instruction {
    AddressRef msg_key_address;
    AddressRef msg_leaf_index_address;
    AddressRef result_address;
    MSGPACK_FIELDS(msg_key_address, msg_leaf_index_address, result_address);
};

/// @brief RAW_GETCONTRACTINSTANCE: [INDIRECT8, addrOffset, resultOffset, memberIndex]
struct RAW_GETCONTRACTINSTANCE_Instruction {
    AddressRef addr_address;
    AddressRef result_address;
    uint8_t member_index;
    MSGPACK_FIELDS(addr_address, result_address, member_index);
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
                                     L1TOL2MSGEXISTS_Instruction,
                                     EMITNOTEHASH_Instruction,
                                     NOTEHASHEXISTS_Instruction,
                                     CALLDATACOPY_Instruction,
                                     SENDL2TOL1MSG_Instruction,
                                     EMITUNENCRYPTEDLOG_Instruction,
                                     CALL_Instruction,
                                     RAW_CALL_Instruction,
                                     RETURNDATASIZE_WITH_RETURNDATACOPY_Instruction,
                                     GETCONTRACTINSTANCE_Instruction,
                                     SUCCESSCOPY_Instruction,
                                     ECADD_Instruction,
                                     POSEIDON2PERM_Instruction,
                                     KECCAKF1600_Instruction,
                                     SHA256COMPRESSION_Instruction,
                                     TORADIXBE_Instruction>;
// Control flow instructions (for decompiler)
JUMP_32_Instruction, JUMPI_32_Instruction, RETURN_Instruction, REVERT_8_Instruction, REVERT_16_Instruction,
    INTERNALCALL_Instruction, INTERNALRETURN_Instruction,
    // Raw instructions for byte-perfect bytecode reconstruction
    RAW_RETURNDATASIZE_Instruction, RAW_RETURNDATACOPY_Instruction, RAW_L1TOL2MSGEXISTS_Instruction,
    RAW_GETCONTRACTINSTANCE_Instruction > ;

template <class... Ts> struct overloaded : Ts... {
    using Ts::operator()...;
};
template <class... Ts> overloaded(Ts...) -> overloaded<Ts...>;

inline std::ostream& operator<<(std::ostream& os, const MemoryTag& tag)
{
    os << std::to_string(tag);
    return os;
}

inline std::ostream& operator<<(std::ostream& os, const VariableRef& variable)
{
    os << "VariableRef " << variable.tag << " " << variable.index << " " << variable.base_offset_seed << " "
       << static_cast<int>(static_cast<AddressingMode>(variable.mode));
    return os;
}

inline std::ostream& operator<<(std::ostream& os, const AddressRef& result_address)
{
    os << "AddressRef " << result_address.address << " "
       << static_cast<int>(static_cast<AddressingMode>(result_address.mode));
    return os;
}

inline std::ostream& operator<<(std::ostream& os, const ParamRef& param)
{
    std::visit([&](auto&& arg) { os << arg; }, param);
    return os;
}

inline std::ostream& operator<<(std::ostream& os, const FuzzInstruction& instruction)
{
    std::visit(
        overloaded{
            [&](ADD_8_Instruction arg) {
                os << "ADD_8_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](SET_8_Instruction arg) {
                os << "SET_8_Instruction " << arg.value_tag << " " << arg.result_address << " " << arg.value;
            },
            [&](SET_16_Instruction arg) {
                os << "SET_16_Instruction " << arg.value_tag << " " << arg.result_address << " " << arg.value;
            },
            [&](SET_32_Instruction arg) {
                os << "SET_32_Instruction " << arg.value_tag << " " << arg.result_address << " " << arg.value;
            },
            [&](SET_64_Instruction arg) {
                os << "SET_64_Instruction " << arg.value_tag << " " << arg.result_address << " " << arg.value;
            },
            [&](SET_128_Instruction arg) {
                os << "SET_128_Instruction " << arg.value_tag << " " << arg.result_address << " " << arg.value_high
                   << " " << arg.value_low;
            },
            [&](SET_FF_Instruction arg) {
                os << "SET_FF_Instruction " << arg.value_tag << " " << arg.result_address << " " << arg.value;
            },
            [&](SUB_8_Instruction arg) {
                os << "SUB_8_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](MUL_8_Instruction arg) {
                os << "MUL_8_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](DIV_8_Instruction arg) {
                os << "DIV_8_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](FDIV_8_Instruction arg) {
                os << "FDIV_8_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](EQ_8_Instruction arg) {
                os << "EQ_8_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](LT_8_Instruction arg) {
                os << "LT_8_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](LTE_8_Instruction arg) {
                os << "LTE_8_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](AND_8_Instruction arg) {
                os << "AND_8_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](OR_8_Instruction arg) {
                os << "OR_8_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](XOR_8_Instruction arg) {
                os << "XOR_8_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](SHL_8_Instruction arg) {
                os << "SHL_8_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](SHR_8_Instruction arg) {
                os << "SHR_8_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](NOT_8_Instruction arg) { os << "NOT_8_Instruction " << arg.a_address << " " << arg.result_address; },
            [&](ADD_16_Instruction arg) {
                os << "ADD_16_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](SUB_16_Instruction arg) {
                os << "SUB_16_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](MUL_16_Instruction arg) {
                os << "MUL_16_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](DIV_16_Instruction arg) {
                os << "DIV_16_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](FDIV_16_Instruction arg) {
                os << "FDIV_16_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](EQ_16_Instruction arg) {
                os << "EQ_16_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](LT_16_Instruction arg) {
                os << "LT_16_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](LTE_16_Instruction arg) {
                os << "LTE_16_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](AND_16_Instruction arg) {
                os << "AND_16_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](OR_16_Instruction arg) {
                os << "OR_16_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](XOR_16_Instruction arg) {
                os << "XOR_16_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](NOT_16_Instruction arg) { os << "NOT_16_Instruction " << arg.a_address << " " << arg.result_address; },
            [&](SHL_16_Instruction arg) {
                os << "SHL_16_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](SHR_16_Instruction arg) {
                os << "SHR_16_Instruction " << arg.a_address << " " << arg.b_address << " " << arg.result_address;
            },
            [&](CAST_8_Instruction arg) {
                os << "CAST_8_Instruction " << arg.src_tag << " " << arg.src_address << " " << arg.result_address << " "
                   << arg.target_tag;
            },
            [&](CAST_16_Instruction arg) {
                os << "CAST_16_Instruction " << arg.src_tag << " " << arg.src_address << " " << arg.result_address
                   << " " << arg.target_tag;
            },
            [&](MOV_8_Instruction arg) {
                os << "MOV_8_Instruction " << arg.value_tag << " " << arg.src_address << " " << arg.result_address;
            },
            [&](MOV_16_Instruction arg) {
                os << "MOV_16_Instruction " << arg.value_tag << " " << arg.src_address << " " << arg.result_address;
            },
            [&](SSTORE_Instruction arg) {
                os << "SSTORE_Instruction " << arg.src_address << " " << arg.result_address << " " << arg.slot;
            },
            [&](SLOAD_Instruction arg) { os << "SLOAD_Instruction " << arg.slot_address << " " << arg.result_address; },
            [&](GETENVVAR_Instruction arg) {
                os << "GETENVVAR_Instruction " << arg.result_address << " " << static_cast<int>(arg.type);
            },
            [&](EMITNULLIFIER_Instruction arg) { os << "EMITNULIFIER_Instruction " << arg.nullifier_address; },
            [&](NULLIFIEREXISTS_Instruction arg) {
                os << "NULLIFIEREXISTS_Instruction " << arg.nullifier_address << " " << arg.contract_address_address
                   << " " << arg.result_address;
            },
            [&](L1TOL2MSGEXISTS_Instruction arg) {
                os << "L1TOL2MSGEXISTS_Instruction " << arg.msg_hash_address << " " << arg.leaf_index_address << " "
                   << arg.result_address;
            },
            [&](EMITNOTEHASH_Instruction arg) {
                os << "EMITNOTEHASH_Instruction " << arg.note_hash_address << " " << arg.note_hash;
            },
            [&](NOTEHASHEXISTS_Instruction arg) {
                os << "NOTEHASHEXISTS_Instruction " << arg.notehash_address << " " << arg.notehash_address << " "
                   << arg.leaf_index_address << " " << arg.result_address;
            },
            [&](CALLDATACOPY_Instruction arg) {
                os << "CALLDATACOPY_Instruction " << arg.dst_address << " " << static_cast<int>(arg.copy_size) << " "
                   << arg.copy_size_address << " " << arg.cd_start_address << " " << arg.cd_start_address;
            },
            [&](SENDL2TOL1MSG_Instruction arg) {
                os << "SENDL2TOL1MSG_Instruction " << arg.recipient << " " << arg.recipient_address << " "
                   << arg.content << " " << arg.content_address;
            },
            [&](EMITUNENCRYPTEDLOG_Instruction arg) {
                os << "EMITUNENCRYPTEDLOG_Instruction " << arg.log_size << " " << arg.log_size_address << " ";
                for (const auto& value : arg.log_values) {
                    os << value << " ";
                }
                os << std::endl;
            },
            [&](CALL_Instruction arg) {
                os << "CALL_Instruction " << arg.function_index << " " << arg.address_offset << " " << arg.l2_gas << " "
                   << arg.l2_gas_address << " " << arg.da_gas << " " << arg.da_gas_address << " " << arg.arg_size_offset
                   << " " << arg.args.size() << " " << arg.is_static_call;
            },
            [&](RETURNDATASIZE_WITH_RETURNDATACOPY_Instruction arg) {
                os << "RETURNDATASIZE_WITH_RETURNDATACOPY_Instruction " << arg.copy_size_offset << " "
                   << arg.dst_address << " " << arg.rd_start_offset;
            },
            [&](ECADD_Instruction arg) {
                os << "ECADD_Instruction " << arg.p1_x << " " << arg.p1_y << " " << arg.p1_infinite << " " << arg.p2_x
                   << " " << arg.p2_y << " " << arg.p2_infinite << " " << arg.result;
            },
            [&](POSEIDON2PERM_Instruction arg) {
                os << "POSEIDON2PERM_Instruction " << arg.src_address << " " << arg.dst_address;
            },
            [&](KECCAKF1600_Instruction arg) {
                os << "KECCAKF1600_Instruction " << arg.src_address << " " << arg.dst_address;
            },
            [&](SHA256COMPRESSION_Instruction arg) {
                os << "SHA256COMPRESSION_Instruction " << arg.state_address << " " << arg.input_address << " "
                   << arg.dst_address;
            },
            [&](TORADIXBE_Instruction arg) {
                os << "TORADIXBE_Instruction " << arg.value_address << " " << arg.radix_address << " "
                   << arg.num_limbs_address << " " << arg.output_bits_address << " " << arg.dst_address << " "
                   << arg.is_output_bits;
            },
            // Control flow instructions
            [&](JUMP_32_Instruction arg) { os << "JUMP_32_Instruction dest=" << arg.destination; },
            [&](JUMPI_32_Instruction arg) {
                os << "JUMPI_32_Instruction cond=" << arg.condition_address << " dest=" << arg.destination;
            },
            [&](RETURN_Instruction arg) {
                os << "RETURN_Instruction size_off=" << arg.return_data_size_address
                   << " data_off=" << arg.return_data_address;
            },
            [&](REVERT_8_Instruction arg) {
                os << "REVERT_8_Instruction size_off=" << arg.return_data_size_address
                   << " data_off=" << arg.return_data_address;
            },
            [&](REVERT_16_Instruction arg) {
                os << "REVERT_16_Instruction size_off=" << arg.return_data_size_address
                   << " data_off=" << arg.return_data_address;
            },
            [&](INTERNALCALL_Instruction arg) { os << "INTERNALCALL_Instruction dest=" << arg.destination; },
            [&](INTERNALRETURN_Instruction) { os << "INTERNALRETURN_Instruction"; },
            [&](auto) { os << "Unknown instruction"; },
        },
        instruction);
    return os;
}
