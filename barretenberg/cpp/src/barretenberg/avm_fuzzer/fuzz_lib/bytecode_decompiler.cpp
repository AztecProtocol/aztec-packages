#include "barretenberg/avm_fuzzer/fuzz_lib/bytecode_decompiler.hpp"

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

#include <span>
#include <stdexcept>
#include <string>

namespace bb::avm_fuzzer {

// Custom exception for decompilation errors with detailed info
class DecompilationError : public std::runtime_error {
  public:
    DecompilationError(const std::string& msg)
        : std::runtime_error(msg)
    {}
};

namespace {

using namespace bb::avm2;
using simulation::Instruction;

// ============================================================================
// Addressing Mode Extraction Helpers
// ============================================================================

// Extract addressing mode from INDIRECT8 byte (1 bit per operand: bit = indirect flag)
AddressingMode get_addressing_mode_8(uint8_t indirect, size_t operand_idx)
{
    bool is_indirect = (indirect >> operand_idx) & 1;
    return is_indirect ? AddressingMode::Indirect : AddressingMode::Direct;
}

// Extract addressing mode from INDIRECT16 (2 bits per operand: bit0=indirect, bit1=relative)
AddressingMode get_addressing_mode_16(uint16_t indirect, size_t operand_idx)
{
    uint8_t bits = (indirect >> (operand_idx * 2)) & 0b11;
    switch (bits) {
    case 0b00:
        return AddressingMode::Direct;
    case 0b01:
        return AddressingMode::Indirect;
    case 0b10:
        return AddressingMode::Relative;
    case 0b11:
        return AddressingMode::IndirectRelative;
    default:
        return AddressingMode::Direct;
    }
}

// ============================================================================
// Decompiler-Specific Ref Constructors
// These store raw_operand to ensure byte-perfect bytecode reconstruction
// ============================================================================

// Create VariableRef for decompiled bytecode (8-bit operand)
VariableRef make_var_ref_8(MemoryTag tag, uint8_t address, AddressingMode mode)
{
    return VariableRef{ .tag = MemoryTagWrapper(tag),
                        .index = address,
                        .pointer_address_seed = 0,
                        .base_offset_seed = 0,
                        .mode = AddressingModeWrapper(mode),
                        .raw_operand = address };
}

// Create VariableRef for decompiled bytecode (16-bit operand)
VariableRef make_var_ref_16(MemoryTag tag, uint16_t address, AddressingMode mode)
{
    return VariableRef{ .tag = MemoryTagWrapper(tag),
                        .index = address,
                        .pointer_address_seed = 0,
                        .base_offset_seed = 0,
                        .mode = AddressingModeWrapper(mode),
                        .raw_operand = address };
}

// Create AddressRef for decompiled bytecode (8-bit operand)
AddressRef make_addr_ref_8(uint8_t address, AddressingMode mode)
{
    return AddressRef{ .address = address,
                       .pointer_address_seed = 0,
                       .base_offset_seed = 0,
                       .mode = AddressingModeWrapper(mode),
                       .raw_operand = address };
}

// Create AddressRef for decompiled bytecode (16-bit operand)
AddressRef make_addr_ref_16(uint16_t address, AddressingMode mode)
{
    return AddressRef{ .address = address,
                       .pointer_address_seed = 0,
                       .base_offset_seed = 0,
                       .mode = AddressingModeWrapper(mode),
                       .raw_operand = address };
}

// Map a vm2 Instruction to a FuzzInstruction
FuzzInstruction map_vm2_to_fuzz(const Instruction& instr)
{
    // Helper lambdas to extract operands with proper types
    // NOTE: INDIRECT bytes are NOT in the operands vector - they set instr.indirect instead
    // So operands[0] is the first non-indirect operand
    auto get_u8 = [&](size_t i) { return instr.operands[i].to<uint8_t>(); };
    auto get_u16 = [&](size_t i) { return instr.operands[i].to<uint16_t>(); };
    auto get_u32 = [&](size_t i) { return instr.operands[i].to<uint32_t>(); };
    auto get_u64 = [&](size_t i) { return instr.operands[i].to<uint64_t>(); };
    auto get_u128 = [&](size_t i) { return instr.operands[i].to<uint128_t>(); };
    auto get_ff = [&](size_t i) { return instr.operands[i].to<FF>(); };
    auto get_tag = [&](size_t i) { return static_cast<MemoryTag>(instr.operands[i].to<uint8_t>()); };

    // Helper to get addressing mode for INDIRECT8 opcodes (most opcodes)
    auto mode8 = [&](size_t i) { return get_addressing_mode_8(static_cast<uint8_t>(instr.indirect), i); };
    // Helper to get addressing mode for INDIRECT16 opcodes (CALL, STATICCALL, etc.)
    // NOTE: Currently unused - CALL/STATICCALL have complex FuzzInstruction structure
    // that doesn't map directly from wire format. Will be used when those are added.
    auto mode16 = [&](size_t i) { return get_addressing_mode_16(instr.indirect, i); };
    (void)mode16;

    switch (instr.opcode) {
    // ==========================
    // Arithmetic 8-bit variants
    // ==========================
    // Wire format: [indirect, a, b, dst] → operands: [a, b, dst]
    case WireOpCode::ADD_8:
        return ADD_8_Instruction{ .a_address = make_var_ref_8(MemoryTag::FF, get_u8(0), mode8(0)),
                                  .b_address = make_var_ref_8(MemoryTag::FF, get_u8(1), mode8(1)),
                                  .result_address = make_addr_ref_8(get_u8(2), mode8(2)) };
    case WireOpCode::SUB_8:
        return SUB_8_Instruction{ .a_address = make_var_ref_8(MemoryTag::FF, get_u8(0), mode8(0)),
                                  .b_address = make_var_ref_8(MemoryTag::FF, get_u8(1), mode8(1)),
                                  .result_address = make_addr_ref_8(get_u8(2), mode8(2)) };
    case WireOpCode::MUL_8:
        return MUL_8_Instruction{ .a_address = make_var_ref_8(MemoryTag::FF, get_u8(0), mode8(0)),
                                  .b_address = make_var_ref_8(MemoryTag::FF, get_u8(1), mode8(1)),
                                  .result_address = make_addr_ref_8(get_u8(2), mode8(2)) };
    case WireOpCode::DIV_8:
        return DIV_8_Instruction{ .a_address = make_var_ref_8(MemoryTag::FF, get_u8(0), mode8(0)),
                                  .b_address = make_var_ref_8(MemoryTag::FF, get_u8(1), mode8(1)),
                                  .result_address = make_addr_ref_8(get_u8(2), mode8(2)) };
    case WireOpCode::FDIV_8:
        return FDIV_8_Instruction{ .a_address = make_var_ref_8(MemoryTag::FF, get_u8(0), mode8(0)),
                                   .b_address = make_var_ref_8(MemoryTag::FF, get_u8(1), mode8(1)),
                                   .result_address = make_addr_ref_8(get_u8(2), mode8(2)) };
    case WireOpCode::EQ_8:
        return EQ_8_Instruction{ .a_address = make_var_ref_8(MemoryTag::FF, get_u8(0), mode8(0)),
                                 .b_address = make_var_ref_8(MemoryTag::FF, get_u8(1), mode8(1)),
                                 .result_address = make_addr_ref_8(get_u8(2), mode8(2)) };
    case WireOpCode::LT_8:
        return LT_8_Instruction{ .a_address = make_var_ref_8(MemoryTag::FF, get_u8(0), mode8(0)),
                                 .b_address = make_var_ref_8(MemoryTag::FF, get_u8(1), mode8(1)),
                                 .result_address = make_addr_ref_8(get_u8(2), mode8(2)) };
    case WireOpCode::LTE_8:
        return LTE_8_Instruction{ .a_address = make_var_ref_8(MemoryTag::FF, get_u8(0), mode8(0)),
                                  .b_address = make_var_ref_8(MemoryTag::FF, get_u8(1), mode8(1)),
                                  .result_address = make_addr_ref_8(get_u8(2), mode8(2)) };
    case WireOpCode::AND_8:
        return AND_8_Instruction{ .a_address = make_var_ref_8(MemoryTag::FF, get_u8(0), mode8(0)),
                                  .b_address = make_var_ref_8(MemoryTag::FF, get_u8(1), mode8(1)),
                                  .result_address = make_addr_ref_8(get_u8(2), mode8(2)) };
    case WireOpCode::OR_8:
        return OR_8_Instruction{ .a_address = make_var_ref_8(MemoryTag::FF, get_u8(0), mode8(0)),
                                 .b_address = make_var_ref_8(MemoryTag::FF, get_u8(1), mode8(1)),
                                 .result_address = make_addr_ref_8(get_u8(2), mode8(2)) };
    case WireOpCode::XOR_8:
        return XOR_8_Instruction{ .a_address = make_var_ref_8(MemoryTag::FF, get_u8(0), mode8(0)),
                                  .b_address = make_var_ref_8(MemoryTag::FF, get_u8(1), mode8(1)),
                                  .result_address = make_addr_ref_8(get_u8(2), mode8(2)) };
    case WireOpCode::SHL_8:
        return SHL_8_Instruction{ .a_address = make_var_ref_8(MemoryTag::FF, get_u8(0), mode8(0)),
                                  .b_address = make_var_ref_8(MemoryTag::FF, get_u8(1), mode8(1)),
                                  .result_address = make_addr_ref_8(get_u8(2), mode8(2)) };
    case WireOpCode::SHR_8:
        return SHR_8_Instruction{ .a_address = make_var_ref_8(MemoryTag::FF, get_u8(0), mode8(0)),
                                  .b_address = make_var_ref_8(MemoryTag::FF, get_u8(1), mode8(1)),
                                  .result_address = make_addr_ref_8(get_u8(2), mode8(2)) };
    // NOT_8: wire [indirect, src, dst] → operands [src, dst]
    case WireOpCode::NOT_8:
        return NOT_8_Instruction{ .a_address = make_var_ref_8(MemoryTag::FF, get_u8(0), mode8(0)),
                                  .result_address = make_addr_ref_8(get_u8(1), mode8(1)) };

    // ==========================
    // Arithmetic 16-bit variants
    // ==========================
    // Wire format: [indirect, a, b, dst] → operands: [a, b, dst]
    case WireOpCode::ADD_16:
        return ADD_16_Instruction{ .a_address = make_var_ref_16(MemoryTag::FF, get_u16(0), mode8(0)),
                                   .b_address = make_var_ref_16(MemoryTag::FF, get_u16(1), mode8(1)),
                                   .result_address = make_addr_ref_16(get_u16(2), mode8(2)) };
    case WireOpCode::SUB_16:
        return SUB_16_Instruction{ .a_address = make_var_ref_16(MemoryTag::FF, get_u16(0), mode8(0)),
                                   .b_address = make_var_ref_16(MemoryTag::FF, get_u16(1), mode8(1)),
                                   .result_address = make_addr_ref_16(get_u16(2), mode8(2)) };
    case WireOpCode::MUL_16:
        return MUL_16_Instruction{ .a_address = make_var_ref_16(MemoryTag::FF, get_u16(0), mode8(0)),
                                   .b_address = make_var_ref_16(MemoryTag::FF, get_u16(1), mode8(1)),
                                   .result_address = make_addr_ref_16(get_u16(2), mode8(2)) };
    case WireOpCode::DIV_16:
        return DIV_16_Instruction{ .a_address = make_var_ref_16(MemoryTag::FF, get_u16(0), mode8(0)),
                                   .b_address = make_var_ref_16(MemoryTag::FF, get_u16(1), mode8(1)),
                                   .result_address = make_addr_ref_16(get_u16(2), mode8(2)) };
    case WireOpCode::FDIV_16:
        return FDIV_16_Instruction{ .a_address = make_var_ref_16(MemoryTag::FF, get_u16(0), mode8(0)),
                                    .b_address = make_var_ref_16(MemoryTag::FF, get_u16(1), mode8(1)),
                                    .result_address = make_addr_ref_16(get_u16(2), mode8(2)) };
    case WireOpCode::EQ_16:
        return EQ_16_Instruction{ .a_address = make_var_ref_16(MemoryTag::FF, get_u16(0), mode8(0)),
                                  .b_address = make_var_ref_16(MemoryTag::FF, get_u16(1), mode8(1)),
                                  .result_address = make_addr_ref_16(get_u16(2), mode8(2)) };
    case WireOpCode::LT_16:
        return LT_16_Instruction{ .a_address = make_var_ref_16(MemoryTag::FF, get_u16(0), mode8(0)),
                                  .b_address = make_var_ref_16(MemoryTag::FF, get_u16(1), mode8(1)),
                                  .result_address = make_addr_ref_16(get_u16(2), mode8(2)) };
    case WireOpCode::LTE_16:
        return LTE_16_Instruction{ .a_address = make_var_ref_16(MemoryTag::FF, get_u16(0), mode8(0)),
                                   .b_address = make_var_ref_16(MemoryTag::FF, get_u16(1), mode8(1)),
                                   .result_address = make_addr_ref_16(get_u16(2), mode8(2)) };
    case WireOpCode::AND_16:
        return AND_16_Instruction{ .a_address = make_var_ref_16(MemoryTag::FF, get_u16(0), mode8(0)),
                                   .b_address = make_var_ref_16(MemoryTag::FF, get_u16(1), mode8(1)),
                                   .result_address = make_addr_ref_16(get_u16(2), mode8(2)) };
    case WireOpCode::OR_16:
        return OR_16_Instruction{ .a_address = make_var_ref_16(MemoryTag::FF, get_u16(0), mode8(0)),
                                  .b_address = make_var_ref_16(MemoryTag::FF, get_u16(1), mode8(1)),
                                  .result_address = make_addr_ref_16(get_u16(2), mode8(2)) };
    case WireOpCode::XOR_16:
        return XOR_16_Instruction{ .a_address = make_var_ref_16(MemoryTag::FF, get_u16(0), mode8(0)),
                                   .b_address = make_var_ref_16(MemoryTag::FF, get_u16(1), mode8(1)),
                                   .result_address = make_addr_ref_16(get_u16(2), mode8(2)) };
    case WireOpCode::SHL_16:
        return SHL_16_Instruction{ .a_address = make_var_ref_16(MemoryTag::FF, get_u16(0), mode8(0)),
                                   .b_address = make_var_ref_16(MemoryTag::FF, get_u16(1), mode8(1)),
                                   .result_address = make_addr_ref_16(get_u16(2), mode8(2)) };
    case WireOpCode::SHR_16:
        return SHR_16_Instruction{ .a_address = make_var_ref_16(MemoryTag::FF, get_u16(0), mode8(0)),
                                   .b_address = make_var_ref_16(MemoryTag::FF, get_u16(1), mode8(1)),
                                   .result_address = make_addr_ref_16(get_u16(2), mode8(2)) };
    // NOT_16: wire [indirect, src, dst] → operands [src, dst]
    case WireOpCode::NOT_16:
        return NOT_16_Instruction{ .a_address = make_var_ref_16(MemoryTag::FF, get_u16(0), mode8(0)),
                                   .result_address = make_addr_ref_16(get_u16(1), mode8(1)) };

    // ==========================
    // CAST instructions
    // ==========================
    // CAST_8: wire [indirect, src, dst, tag] → operands [src, dst, tag]
    case WireOpCode::CAST_8: {
        MemoryTag src_tag = MemoryTag::FF;
        MemoryTag target_tag = get_tag(2);
        return CAST_8_Instruction{ .src_tag = MemoryTagWrapper(src_tag),
                                   .src_address = make_var_ref_8(src_tag, get_u8(0), mode8(0)),
                                   .result_address = make_addr_ref_8(get_u8(1), mode8(1)),
                                   .target_tag = MemoryTagWrapper(target_tag) };
    }
    // CAST_16: wire [indirect, src, dst, tag] → operands [src, dst, tag]
    case WireOpCode::CAST_16: {
        MemoryTag src_tag = MemoryTag::FF;
        MemoryTag target_tag = get_tag(2);
        return CAST_16_Instruction{ .src_tag = MemoryTagWrapper(src_tag),
                                    .src_address = make_var_ref_16(src_tag, get_u16(0), mode8(0)),
                                    .result_address = make_addr_ref_16(get_u16(1), mode8(1)),
                                    .target_tag = MemoryTagWrapper(target_tag) };
    }

    // ==========================
    // SET instructions
    // ==========================
    // SET_8: wire [indirect, dst, tag, val] → operands [dst, tag, val]
    case WireOpCode::SET_8:
        return SET_8_Instruction{ .value_tag = MemoryTagWrapper(get_tag(1)),
                                  .result_address = make_addr_ref_8(get_u8(0), mode8(0)),
                                  .value = get_u8(2) };
    // SET_16: wire [indirect, dst, tag, val] → operands [dst, tag, val]
    case WireOpCode::SET_16:
        return SET_16_Instruction{ .value_tag = MemoryTagWrapper(get_tag(1)),
                                   .result_address = make_addr_ref_16(get_u16(0), mode8(0)),
                                   .value = get_u16(2) };
    // SET_32: wire [indirect, dst, tag, val] → operands [dst, tag, val]
    case WireOpCode::SET_32:
        return SET_32_Instruction{ .value_tag = MemoryTagWrapper(get_tag(1)),
                                   .result_address = make_addr_ref_16(get_u16(0), mode8(0)),
                                   .value = get_u32(2) };
    // SET_64: wire [indirect, dst, tag, val] → operands [dst, tag, val]
    case WireOpCode::SET_64:
        return SET_64_Instruction{ .value_tag = MemoryTagWrapper(get_tag(1)),
                                   .result_address = make_addr_ref_16(get_u16(0), mode8(0)),
                                   .value = get_u64(2) };
    // SET_128: wire [indirect, dst, tag, val] → operands [dst, tag, val]
    case WireOpCode::SET_128: {
        uint128_t value = get_u128(2);
        return SET_128_Instruction{ .value_tag = MemoryTagWrapper(get_tag(1)),
                                    .result_address = make_addr_ref_16(get_u16(0), mode8(0)),
                                    .value_low = static_cast<uint64_t>(value),
                                    .value_high = static_cast<uint64_t>(value >> 64) };
    }
    // SET_FF: wire [indirect, dst, tag, val] → operands [dst, tag, val]
    case WireOpCode::SET_FF:
        return SET_FF_Instruction{ .value_tag = MemoryTagWrapper(get_tag(1)),
                                   .result_address = make_addr_ref_16(get_u16(0), mode8(0)),
                                   .value = get_ff(2) };

    // ==========================
    // MOV instructions
    // ==========================
    // MOV_8: wire [indirect, src, dst] → operands [src, dst]
    case WireOpCode::MOV_8:
        return MOV_8_Instruction{ .value_tag = MemoryTagWrapper(MemoryTag::FF),
                                  .src_address = make_var_ref_8(MemoryTag::FF, get_u8(0), mode8(0)),
                                  .result_address = make_addr_ref_8(get_u8(1), mode8(1)) };
    // MOV_16: wire [indirect, src, dst] → operands [src, dst]
    case WireOpCode::MOV_16:
        return MOV_16_Instruction{ .value_tag = MemoryTagWrapper(MemoryTag::FF),
                                   .src_address = make_var_ref_16(MemoryTag::FF, get_u16(0), mode8(0)),
                                   .result_address = make_addr_ref_16(get_u16(1), mode8(1)) };

    // ==========================
    // Control Flow Instructions
    // ==========================
    // JUMP_32: wire [dst] → operands [dst] (no indirect)
    case WireOpCode::JUMP_32:
        return JUMP_32_Instruction{ .destination = get_u32(0) };
    // JUMPI_32: wire [indirect, cond, dst] → operands [cond, dst]
    case WireOpCode::JUMPI_32:
        return JUMPI_32_Instruction{ .condition_address = make_addr_ref_16(get_u16(0), mode8(0)),
                                     .destination = get_u32(1) };
    // RETURN: wire [indirect, size_offset, data_offset] → operands [size_offset, data_offset]
    case WireOpCode::RETURN:
        return RETURN_Instruction{ .return_data_size_address = make_addr_ref_16(get_u16(0), mode8(0)),
                                   .return_data_address = make_addr_ref_16(get_u16(1), mode8(1)) };
    // REVERT_8: wire [indirect, size_offset, data_offset] → operands [size_offset, data_offset]
    case WireOpCode::REVERT_8:
        return REVERT_8_Instruction{ .return_data_size_address = make_addr_ref_8(get_u8(0), mode8(0)),
                                     .return_data_address = make_addr_ref_8(get_u8(1), mode8(1)) };
    // REVERT_16: wire [indirect, size_offset, data_offset] → operands [size_offset, data_offset]
    case WireOpCode::REVERT_16:
        return REVERT_16_Instruction{ .return_data_size_address = make_addr_ref_16(get_u16(0), mode8(0)),
                                      .return_data_address = make_addr_ref_16(get_u16(1), mode8(1)) };
    // INTERNALCALL: wire [dst] → operands [dst] (no indirect)
    case WireOpCode::INTERNALCALL:
        return INTERNALCALL_Instruction{ .destination = get_u32(0) };
    // INTERNALRETURN: wire [] → operands [] (no operands)
    case WireOpCode::INTERNALRETURN:
        return INTERNALRETURN_Instruction{};

    // ==========================
    // Environment Instructions
    // ==========================
    // GETENVVAR_16: wire [indirect, dst, type] → operands [dst, type]
    case WireOpCode::GETENVVAR_16:
        return GETENVVAR_Instruction{ .result_address = make_addr_ref_16(get_u16(0), mode8(0)), .type = get_u8(1) };

    // ==========================
    // Storage Instructions
    // ==========================
    // SLOAD: wire [indirect, slot, dst] → operands [slot, dst]
    case WireOpCode::SLOAD:
        return SLOAD_Instruction{ .slot_index = 0,
                                  .slot_address = make_addr_ref_16(get_u16(0), mode8(0)),
                                  .result_address = make_addr_ref_16(get_u16(1), mode8(1)) };
    // SSTORE: wire [indirect, src, slot] → operands [src, slot]
    case WireOpCode::SSTORE:
        return SSTORE_Instruction{ .src_address = make_var_ref_16(MemoryTag::FF, get_u16(0), mode8(0)),
                                   .result_address = make_addr_ref_16(get_u16(1), mode8(1)),
                                   .slot = FF::zero() };

    // ==========================
    // Calldata Instructions
    // ==========================
    // CALLDATACOPY: wire [indirect, dst, cdStart, copySize] → operands [dst, cdStart, copySize]
    case WireOpCode::CALLDATACOPY:
        return CALLDATACOPY_Instruction{ .dst_address = make_addr_ref_16(get_u16(0), mode8(0)),
                                         .copy_size = 0,
                                         .copy_size_address = make_addr_ref_16(get_u16(2), mode8(2)),
                                         .cd_start = 0,
                                         .cd_start_address = make_addr_ref_16(get_u16(1), mode8(1)) };

    // ==========================
    // Note/Nullifier Instructions
    // ==========================
    // EMITNULLIFIER: wire [indirect, nullifier] → operands [nullifier]
    case WireOpCode::EMITNULLIFIER:
        return EMITNULLIFIER_Instruction{ .nullifier_address = make_var_ref_16(MemoryTag::FF, get_u16(0), mode8(0)) };
    // EMITNOTEHASH: wire [indirect, notehash] → operands [notehash]
    case WireOpCode::EMITNOTEHASH:
        return EMITNOTEHASH_Instruction{ .note_hash_address = make_addr_ref_16(get_u16(0), mode8(0)),
                                         .note_hash = FF::zero() };
    // NULLIFIEREXISTS: wire [indirect, nullifier, address, result] → operands [nullifier, address, result]
    case WireOpCode::NULLIFIEREXISTS:
        return NULLIFIEREXISTS_Instruction{ .nullifier_address = make_var_ref_16(MemoryTag::FF, get_u16(0), mode8(0)),
                                            .contract_address_address = make_addr_ref_16(get_u16(1), mode8(1)),
                                            .result_address = make_addr_ref_16(get_u16(2), mode8(2)) };
    // NOTEHASHEXISTS: wire [indirect, notehash, leafIndex, result] → operands [notehash, leafIndex, result]
    case WireOpCode::NOTEHASHEXISTS:
        return NOTEHASHEXISTS_Instruction{ .notehash_index = 0,
                                           .notehash_address = make_addr_ref_16(get_u16(0), mode8(0)),
                                           .leaf_index_address = make_addr_ref_16(get_u16(1), mode8(1)),
                                           .result_address = make_addr_ref_16(get_u16(2), mode8(2)) };

    // ==========================
    // Log/Message Instructions
    // ==========================
    // SENDL2TOL1MSG: wire [indirect, recipient, content] → operands [recipient, content]
    case WireOpCode::SENDL2TOL1MSG:
        return SENDL2TOL1MSG_Instruction{ .recipient = FF::zero(),
                                          .recipient_address = make_addr_ref_16(get_u16(0), mode8(0)),
                                          .content = FF::zero(),
                                          .content_address = make_addr_ref_16(get_u16(1), mode8(1)) };
    // EMITUNENCRYPTEDLOG: wire [indirect, logSize, logStart] → operands [logSize, logStart]
    case WireOpCode::EMITUNENCRYPTEDLOG:
        return EMITUNENCRYPTEDLOG_Instruction{ .log_size = 0,
                                               .log_size_address = make_addr_ref_16(get_u16(0), mode8(0)),
                                               .log_values = {},
                                               .log_values_address_start = get_u16(1) };

    // ==========================
    // Return Data Instructions
    // ==========================
    // RETURNDATASIZE: wire [indirect, dstOffset] → operands [dstOffset]
    case WireOpCode::RETURNDATASIZE:
        return RAW_RETURNDATASIZE_Instruction{ .dst_address = make_addr_ref_16(get_u16(0), mode8(0)) };
    // RETURNDATACOPY: wire [indirect, dstOffset, rdStartOffset, copySizeOffset] → operands [...]
    case WireOpCode::RETURNDATACOPY:
        return RAW_RETURNDATACOPY_Instruction{ .dst_address = make_addr_ref_16(get_u16(0), mode8(0)),
                                               .rd_start_address = make_addr_ref_16(get_u16(1), mode8(1)),
                                               .copy_size_address = make_addr_ref_16(get_u16(2), mode8(2)) };

    // ==========================
    // Contract Instance Instructions
    // ==========================
    // L1TOL2MSGEXISTS: wire [indirect, msgKeyOffset, msgLeafIndexOffset, resultOffset] → operands [...]
    case WireOpCode::L1TOL2MSGEXISTS:
        return RAW_L1TOL2MSGEXISTS_Instruction{ .msg_key_address = make_addr_ref_16(get_u16(0), mode8(0)),
                                                .msg_leaf_index_address = make_addr_ref_16(get_u16(1), mode8(1)),
                                                .result_address = make_addr_ref_16(get_u16(2), mode8(2)) };
    // GETCONTRACTINSTANCE: wire [indirect, addrOffset, resultOffset, memberIndex] → operands [...]
    case WireOpCode::GETCONTRACTINSTANCE:
        return RAW_GETCONTRACTINSTANCE_Instruction{ .addr_address = make_addr_ref_16(get_u16(0), mode8(0)),
                                                    .result_address = make_addr_ref_16(get_u16(1), mode8(1)),
                                                    .member_index = get_u8(2) };

    // ==========================
    // External Call Instructions
    // ==========================
    // CALL: wire [indirect16, l2GasOffset, daGasOffset, addrOffset, argsOffset, argsSizeOffset]
    case WireOpCode::CALL:
        return RAW_CALL_Instruction{ .l2_gas_address = make_addr_ref_16(get_u16(0), mode16(0)),
                                     .da_gas_address = make_addr_ref_16(get_u16(1), mode16(1)),
                                     .addr_address = make_addr_ref_16(get_u16(2), mode16(2)),
                                     .args_address = make_addr_ref_16(get_u16(3), mode16(3)),
                                     .args_size_address = make_addr_ref_16(get_u16(4), mode16(4)),
                                     .is_static_call = false };
    // STATICCALL: same format as CALL
    case WireOpCode::STATICCALL:
        return RAW_CALL_Instruction{ .l2_gas_address = make_addr_ref_16(get_u16(0), mode16(0)),
                                     .da_gas_address = make_addr_ref_16(get_u16(1), mode16(1)),
                                     .addr_address = make_addr_ref_16(get_u16(2), mode16(2)),
                                     .args_address = make_addr_ref_16(get_u16(3), mode16(3)),
                                     .args_size_address = make_addr_ref_16(get_u16(4), mode16(4)),
                                     .is_static_call = true };

    // ==========================
    // Unsupported opcodes
    // ==========================
    default:
        // For unsupported opcodes, create a placeholder SET_8 instruction
        // This preserves the bytecode position but loses semantic information
        return SET_8_Instruction{ .value_tag = MemoryTagWrapper(MemoryTag::U8),
                                  .result_address = make_addr_ref_8(0, AddressingMode::Direct),
                                  .value = 0 };
    }
}

} // anonymous namespace

FuzzerData decompile_bytecode(const std::vector<uint8_t>& bytecode, const std::vector<FF>& calldata)
{
    std::vector<FuzzInstruction> instructions;

    size_t pc = 0;
    while (pc < bytecode.size()) {
        try {
            // Use vm2's instruction parsing
            auto instr = simulation::deserialize_instruction(std::span<const uint8_t>(bytecode), pc);
            instructions.push_back(map_vm2_to_fuzz(instr));
            pc += instr.size_in_bytes();
        } catch (const simulation::InstrDeserializationError& e) {
            // Convert to std::exception with detailed message
            std::string msg = "Deserialization failed at pc=" + std::to_string(pc);
            if (e.message.has_value()) {
                msg += ": " + e.message.value();
            }
            switch (e.type) {
            case simulation::InstrDeserializationEventError::PC_OUT_OF_RANGE:
                msg += " (PC_OUT_OF_RANGE)";
                break;
            case simulation::InstrDeserializationEventError::OPCODE_OUT_OF_RANGE:
                msg += " (OPCODE_OUT_OF_RANGE)";
                break;
            case simulation::InstrDeserializationEventError::INSTRUCTION_OUT_OF_RANGE:
                msg += " (INSTRUCTION_OUT_OF_RANGE)";
                break;
            default:
                msg += " (UNKNOWN_ERROR)";
                break;
            }
            throw DecompilationError(msg);
        }
    }

    // Build FuzzerData with single block, minimal CFG
    // Note: NO FinalizeWithReturn - bytecode already contains RETURN
    FuzzerData result;
    result.instruction_blocks = { instructions };
    result.cfg_instructions = { InsertSimpleInstructionBlock{ .instruction_block_idx = 0 } };
    result.calldata = calldata;
    result.return_options = ReturnOptions{ .return_size = 0,
                                           .return_value_tag = MemoryTagWrapper(MemoryTag::FF),
                                           .return_value_offset_index = 0 }; // Unused - explicit RETURN in bytecode

    return result;
}

} // namespace bb::avm_fuzzer
