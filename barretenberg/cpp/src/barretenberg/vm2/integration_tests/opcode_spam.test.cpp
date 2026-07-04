#include <algorithm>
#include <array>
#include <cctype>
#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include <gtest/gtest.h>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/vm2/avm_api.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/testing/bytecode_builder.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"
#include "barretenberg/vm2/testing/public_tx_simulation_tester.hpp"

namespace bb::avm2 {
namespace {

using simulation::Instruction;
using IB = testing::InstructionBuilder;
using testing::encode_to_bytecode;
using testing::PublicTxSimulationTester;
using testing::TestEnqueuedCall;

// A single opcode-spam scenario: a set of setup instructions, the target instruction(s) to spam,
// optional cleanup (revert) instructions, and an optional per-tx limit that switches the scenario
// to the two-contract (reverting nested call) pattern.
struct SpamConfig {
    std::string label;
    std::vector<Instruction> setup;
    std::vector<Instruction> target;
    std::vector<Instruction> cleanup;
    std::optional<uint32_t> limit;
    // Whether the deployed contract's address should be passed as calldata[0] (used by the
    // external-call spammer so it can call a contract whose address is only known at run time).
    bool address_as_calldata = false;
};

// ---- Constants ----

// Max bytecode size in bytes: bytecode is packed into fields (31 data bytes per field) with one
// length field, so byteLength <= (MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS - 1) * 31.
constexpr size_t BYTES_PER_FIELD = 31;
constexpr size_t MAX_BYTECODE_BYTES = (MAX_PACKED_PUBLIC_BYTECODE_SIZE_IN_FIELDS - 1) * BYTES_PER_FIELD;
constexpr uint32_t MAX_U32 = 0xffffffff;

// Warm tree entries: values inserted before running so that "warm" existence checks find them.
const FF WARM_NOTE_HASH = FF(0xdeadbeefULL);
const FF WARM_L1_TO_L2_MSG = FF(0xcafebabedeadbeefULL);
const FF WARM_SILOED_NULLIFIER = FF(0xdeadbeef0001ULL);
const FF WARM_STORAGE_SLOT = FF(0xdeadbeef0002ULL);
const FF WARM_STORAGE_VALUE = FF(0xcafebabe0003ULL);
// insert_warm_tree_entries appends to empty note-hash / l1-to-l2 trees, so the entries land at index 0.
constexpr uint64_t WARM_NOTE_HASH_LEAF_INDEX = 0;
constexpr uint64_t WARM_L1_TO_L2_MSG_LEAF_INDEX = 0;

// Ordered so that limiting #configs per opcode still tests the max size (Field) first.
const std::array<MemoryTag, 7> ALL_TAGS = {
    MemoryTag::FF, MemoryTag::U1, MemoryTag::U8, MemoryTag::U16, MemoryTag::U32, MemoryTag::U64, MemoryTag::U128,
};
const std::array<MemoryTag, 6> INT_TAGS = {
    MemoryTag::U128, MemoryTag::U1, MemoryTag::U8, MemoryTag::U16, MemoryTag::U32, MemoryTag::U64,
};

std::string tag_name(MemoryTag tag)
{
    switch (tag) {
    case MemoryTag::FF:
        return "FF";
    case MemoryTag::U1:
        return "U1";
    case MemoryTag::U8:
        return "U8";
    case MemoryTag::U16:
        return "U16";
    case MemoryTag::U32:
        return "U32";
    case MemoryTag::U64:
        return "U64";
    case MemoryTag::U128:
        return "U128";
    }
    return "?";
}

// ---- Deterministic value generation: a deterministic sequence so the scenarios are
// reproducible. Always non-zero. ----
FF next_value()
{
    static uint64_t counter = 0;
    counter += 1;
    return FF(uint256_t(0x9e3779b97f4a7c15ULL) * uint256_t(counter) + uint256_t(1));
}

FF truncate_to_tag(const FF& value, MemoryTag tag)
{
    const uint256_t v = static_cast<uint256_t>(value);
    switch (tag) {
    case MemoryTag::U1:
        return FF(v & uint256_t(1));
    case MemoryTag::U8:
        return FF(v & uint256_t(0xffULL));
    case MemoryTag::U16:
        return FF(v & uint256_t(0xffffULL));
    case MemoryTag::U32:
        return FF(v & uint256_t(0xffffffffULL));
    case MemoryTag::U64:
        return FF(v & uint256_t(0xffffffffffffffffULL));
    case MemoryTag::U128:
        return FF(v & ((uint256_t(1) << 128) - 1));
    case MemoryTag::FF:
        return value;
    }
    return value;
}

// ---- Instruction factories ----

// Smallest SET variant carrying `value` (truncated to `tag`) at `offset`, tagged with `tag`.
Instruction set_mem(uint32_t offset, MemoryTag tag, const FF& value)
{
    const FF t = truncate_to_tag(value, tag);
    const uint256_t v = static_cast<uint256_t>(t);
    switch (tag) {
    case MemoryTag::FF:
        return IB(WireOpCode::SET_FF).operand<uint16_t>(static_cast<uint16_t>(offset)).operand(tag).operand(t).build();
    case MemoryTag::U1:
    case MemoryTag::U8:
        return IB(WireOpCode::SET_8)
            .operand<uint8_t>(static_cast<uint8_t>(offset))
            .operand(tag)
            .operand<uint8_t>(static_cast<uint8_t>(static_cast<uint64_t>(v)))
            .build();
    case MemoryTag::U16:
        return IB(WireOpCode::SET_16)
            .operand<uint16_t>(static_cast<uint16_t>(offset))
            .operand(tag)
            .operand<uint16_t>(static_cast<uint16_t>(static_cast<uint64_t>(v)))
            .build();
    case MemoryTag::U32:
        return IB(WireOpCode::SET_32)
            .operand<uint16_t>(static_cast<uint16_t>(offset))
            .operand(tag)
            .operand<uint32_t>(static_cast<uint32_t>(static_cast<uint64_t>(v)))
            .build();
    case MemoryTag::U64:
        return IB(WireOpCode::SET_64)
            .operand<uint16_t>(static_cast<uint16_t>(offset))
            .operand(tag)
            .operand<uint64_t>(static_cast<uint64_t>(v))
            .build();
    case MemoryTag::U128:
        return IB(WireOpCode::SET_128)
            .operand<uint16_t>(static_cast<uint16_t>(offset))
            .operand(tag)
            .operand<uint128_t>(static_cast<uint128_t>(v))
            .build();
    }
    return IB(WireOpCode::SET_FF).operand<uint16_t>(static_cast<uint16_t>(offset)).operand(tag).operand(t).build();
}

Instruction set_u32(uint32_t offset, uint32_t value)
{
    return set_mem(offset, MemoryTag::U32, FF(value));
}

Instruction op3_8(WireOpCode op, uint8_t a, uint8_t b, uint8_t dst)
{
    return IB(op).operand(a).operand(b).operand(dst).build();
}
Instruction not8(uint8_t src, uint8_t dst)
{
    return IB(WireOpCode::NOT_8).operand(src).operand(dst).build();
}
Instruction cast8(uint8_t src, uint8_t dst, MemoryTag tag)
{
    return IB(WireOpCode::CAST_8).operand(src).operand(dst).operand(tag).build();
}
Instruction mov8(uint8_t src, uint8_t dst)
{
    return IB(WireOpCode::MOV_8).operand(src).operand(dst).build();
}
Instruction getenvvar(uint16_t dst, uint8_t var)
{
    return IB(WireOpCode::GETENVVAR_16).operand(dst).operand(var).build();
}
Instruction calldatacopy(uint16_t copy_size, uint16_t cd_start, uint16_t dst)
{
    return IB(WireOpCode::CALLDATACOPY).operand(copy_size).operand(cd_start).operand(dst).build();
}
Instruction successcopy(uint16_t dst)
{
    return IB(WireOpCode::SUCCESSCOPY).operand(dst).build();
}
Instruction returndatasize(uint16_t dst)
{
    return IB(WireOpCode::RETURNDATASIZE).operand(dst).build();
}
Instruction returndatacopy(uint16_t copy_size, uint16_t rd_start, uint16_t dst)
{
    return IB(WireOpCode::RETURNDATACOPY).operand(copy_size).operand(rd_start).operand(dst).build();
}
Instruction jump(uint32_t loc)
{
    return IB(WireOpCode::JUMP_32).operand(loc).build();
}
Instruction jumpi(uint16_t cond, uint32_t loc)
{
    return IB(WireOpCode::JUMPI_32).operand(cond).operand(loc).build();
}
Instruction internalcall(uint32_t loc)
{
    return IB(WireOpCode::INTERNALCALL).operand(loc).build();
}
Instruction internalreturn()
{
    return IB(WireOpCode::INTERNALRETURN).build();
}
Instruction sload(uint16_t slot, uint16_t addr, uint16_t dst)
{
    return IB(WireOpCode::SLOAD).operand(slot).operand(addr).operand(dst).build();
}
Instruction sstore(uint16_t src, uint16_t slot)
{
    return IB(WireOpCode::SSTORE).operand(src).operand(slot).build();
}
Instruction notehashexists(uint16_t nh, uint16_t leaf_idx, uint16_t exists)
{
    return IB(WireOpCode::NOTEHASHEXISTS).operand(nh).operand(leaf_idx).operand(exists).build();
}
Instruction nullifierexists(uint16_t siloed, uint16_t exists)
{
    return IB(WireOpCode::NULLIFIEREXISTS).operand(siloed).operand(exists).build();
}
Instruction l1tol2msgexists(uint16_t msg, uint16_t leaf_idx, uint16_t exists)
{
    return IB(WireOpCode::L1TOL2MSGEXISTS).operand(msg).operand(leaf_idx).operand(exists).build();
}
Instruction getcontractinstance(uint16_t addr, uint16_t dst, uint8_t member)
{
    return IB(WireOpCode::GETCONTRACTINSTANCE).operand(addr).operand(dst).operand(member).build();
}
Instruction emitnotehash(uint16_t nh)
{
    return IB(WireOpCode::EMITNOTEHASH).operand(nh).build();
}
Instruction emitnullifier(uint16_t n)
{
    return IB(WireOpCode::EMITNULLIFIER).operand(n).build();
}
Instruction sendl2tol1(uint16_t recipient, uint16_t content)
{
    return IB(WireOpCode::SENDL2TOL1MSG).operand(recipient).operand(content).build();
}
Instruction emitpubliclog(uint16_t log_size, uint16_t log_offset)
{
    return IB(WireOpCode::EMITPUBLICLOG).operand(log_size).operand(log_offset).build();
}
Instruction external_call(
    WireOpCode op, uint16_t l2_gas, uint16_t da_gas, uint16_t addr, uint16_t args_size, uint16_t args)
{
    return IB(op).operand(l2_gas).operand(da_gas).operand(addr).operand(args_size).operand(args).build();
}
Instruction ret(uint16_t copy_size, uint16_t return_offset)
{
    return IB(WireOpCode::RETURN).operand(copy_size).operand(return_offset).build();
}
Instruction revert8(uint8_t ret_size, uint8_t return_offset)
{
    return IB(WireOpCode::REVERT_8).operand(ret_size).operand(return_offset).build();
}
Instruction poseidon2(uint16_t input, uint16_t output)
{
    return IB(WireOpCode::POSEIDON2PERM).operand(input).operand(output).build();
}
Instruction sha256compression(uint16_t out, uint16_t state, uint16_t inputs)
{
    return IB(WireOpCode::SHA256COMPRESSION).operand(out).operand(state).operand(inputs).build();
}
Instruction keccakf1600(uint16_t dst, uint16_t input)
{
    return IB(WireOpCode::KECCAKF1600).operand(dst).operand(input).build();
}
Instruction ecadd(uint16_t p1x, uint16_t p1y, uint16_t p2x, uint16_t p2y, uint16_t dst)
{
    return IB(WireOpCode::ECADD).operand(p1x).operand(p1y).operand(p2x).operand(p2y).operand(dst).build();
}
Instruction toradixbe(uint16_t src, uint16_t radix, uint16_t num_limbs, uint16_t out_bits, uint16_t dst)
{
    return IB(WireOpCode::TORADIXBE)
        .operand(src)
        .operand(radix)
        .operand(num_limbs)
        .operand(out_bits)
        .operand(dst)
        .build();
}
Instruction debuglog(uint16_t level, uint16_t message, uint16_t fields, uint16_t fields_size, uint16_t message_size)
{
    return IB(WireOpCode::DEBUGLOG)
        .operand(level)
        .operand(message)
        .operand(fields)
        .operand(fields_size)
        .operand(message_size)
        .build();
}

size_t instruction_byte_size(const Instruction& instruction)
{
    return instruction.serialize().size();
}

// ---- The external-call spam config (used directly for CALL/STATICCALL and as the outer contract
// of the side-effect nested-call pattern). The contract address is forwarded via calldata[0]. ----
//
// Memory layout: [0]=const 0, [1]=const 1, [2]=const MAX_U32, [3]=call target address.
SpamConfig external_call_config(WireOpCode call_opcode = WireOpCode::CALL)
{
    SpamConfig config;
    config.label = "EXTERNAL_CALL";
    config.setup = {
        set_u32(0, 0),       // cdStart / const 0
        set_u32(1, 1),       // copySize / argsSize / const 1
        set_u32(2, MAX_U32), // l2Gas / daGas (capped to remaining gas by the AVM)
        calldatacopy(/*copySize=*/1, /*cdStart=*/0, /*dst=*/3),
    };
    config.target = { external_call(call_opcode,
                                    /*l2Gas=*/2,
                                    /*daGas=*/2,
                                    /*addr=*/3,
                                    /*argsSize=*/1,
                                    /*args=*/3) };
    config.address_as_calldata = true;
    return config;
}

// ---- Bytecode generators ----

std::vector<uint8_t> create_opcode_spam_bytecode(const SpamConfig& config)
{
    BB_ASSERT(!config.limit.has_value(), "Standard spam bytecode requires a config without a limit");

    std::vector<Instruction> instructions = config.setup;
    const size_t setup_size = encode_to_bytecode(instructions).size();
    const size_t target_size = encode_to_bytecode(config.target).size();
    const size_t jump_size = instruction_byte_size(jump(0));

    // Fill the remaining bytecode space with unrolled target instructions, then loop.
    const size_t available_for_loop_body = MAX_BYTECODE_BYTES - setup_size - jump_size;
    const size_t num_targets = available_for_loop_body / target_size;
    const uint32_t loop_start_pc = static_cast<uint32_t>(setup_size);

    instructions.reserve(instructions.size() + num_targets * config.target.size() + 1);
    for (size_t i = 0; i < num_targets; ++i) {
        instructions.insert(instructions.end(), config.target.begin(), config.target.end());
    }
    instructions.push_back(jump(loop_start_pc));
    return encode_to_bytecode(instructions);
}

std::vector<uint8_t> create_side_effect_spam_bytecode(const SpamConfig& config)
{
    BB_ASSERT(config.limit.has_value(), "Side-effect spam bytecode requires a config with a limit");

    std::vector<Instruction> instructions = config.setup;
    for (uint32_t i = 0; i < *config.limit; ++i) {
        instructions.insert(instructions.end(), config.target.begin(), config.target.end());
    }
    instructions.insert(instructions.end(), config.cleanup.begin(), config.cleanup.end());
    return encode_to_bytecode(instructions);
}

// ---- World-state warm entries ----

void insert_warm_tree_entries(PublicTxSimulationTester& tester, const AztecAddress& contract_address)
{
    tester.append_note_hash(WARM_NOTE_HASH);
    tester.append_l1_to_l2_message(WARM_L1_TO_L2_MSG);
    tester.insert_siloed_nullifier(WARM_SILOED_NULLIFIER);
    tester.set_public_storage(contract_address, WARM_STORAGE_SLOT, WARM_STORAGE_VALUE);
}

// ---- Configuration table ----

std::vector<SpamConfig> get_spam_configs()
{
    std::vector<SpamConfig> configs;

    auto add = [&](SpamConfig config) { configs.push_back(std::move(config)); };

    // Arithmetic / comparison / bitwise: one config per type tag.
    auto binary_op = [&](WireOpCode op, const std::string& name, const std::array<MemoryTag, 7>& tags, uint8_t dst) {
        for (auto tag : tags) {
            add(SpamConfig{ .label = name + "/" + tag_name(tag),
                            .setup = { set_mem(0, tag, next_value()), set_mem(1, tag, next_value()) },
                            .target = { op3_8(op, 0, 1, dst) } });
        }
    };
    auto binary_op_int = [&](WireOpCode op, const std::string& name, uint8_t dst, bool nonzero_b) {
        for (auto tag : INT_TAGS) {
            // For division the divisor must be non-zero after truncation; force its low bit.
            const FF b = nonzero_b ? truncate_to_tag(FF(static_cast<uint256_t>(next_value()) | uint256_t(1)), tag)
                                   : next_value();
            add(SpamConfig{ .label = name + "/" + tag_name(tag),
                            .setup = { set_mem(0, tag, next_value()), set_mem(1, tag, b) },
                            .target = { op3_8(op, 0, 1, dst) } });
        }
    };

    binary_op(WireOpCode::ADD_8, "ADD_8", ALL_TAGS, /*dst=*/0);
    binary_op(WireOpCode::SUB_8, "SUB_8", ALL_TAGS, /*dst=*/0);
    binary_op(WireOpCode::MUL_8, "MUL_8", ALL_TAGS, /*dst=*/0);
    binary_op_int(WireOpCode::DIV_8, "DIV_8", /*dst=*/0, /*nonzero_b=*/true);
    // FDIV (field only): non-zero divisor.
    add(SpamConfig{ .label = "FDIV_8",
                    .setup = { set_mem(0, MemoryTag::FF, next_value()), set_mem(1, MemoryTag::FF, next_value()) },
                    .target = { op3_8(WireOpCode::FDIV_8, 0, 1, 0) } });

    binary_op(WireOpCode::EQ_8, "EQ_8", ALL_TAGS, /*dst=*/2);
    binary_op(WireOpCode::LT_8, "LT_8", ALL_TAGS, /*dst=*/2);
    binary_op(WireOpCode::LTE_8, "LTE_8", ALL_TAGS, /*dst=*/2);

    binary_op_int(WireOpCode::AND_8, "AND_8", /*dst=*/0, /*nonzero_b=*/false);
    binary_op_int(WireOpCode::OR_8, "OR_8", /*dst=*/0, /*nonzero_b=*/false);
    binary_op_int(WireOpCode::XOR_8, "XOR_8", /*dst=*/0, /*nonzero_b=*/false);
    for (auto tag : INT_TAGS) {
        add(SpamConfig{ .label = std::string("NOT_8/") + tag_name(tag),
                        .setup = { set_mem(0, tag, next_value()) },
                        .target = { not8(0, 0) } });
    }
    // Shifts: shift amount of 1.
    for (auto tag : INT_TAGS) {
        add(SpamConfig{ .label = std::string("SHL_8/") + tag_name(tag),
                        .setup = { set_mem(0, tag, next_value()), set_mem(1, tag, FF(1)) },
                        .target = { op3_8(WireOpCode::SHL_8, 0, 1, 0) } });
    }
    for (auto tag : INT_TAGS) {
        add(SpamConfig{ .label = std::string("SHR_8/") + tag_name(tag),
                        .setup = { set_mem(0, tag, next_value()), set_mem(1, tag, FF(1)) },
                        .target = { op3_8(WireOpCode::SHR_8, 0, 1, 0) } });
    }

    // CAST / MOV: one config per type tag.
    for (auto tag : ALL_TAGS) {
        add(SpamConfig{ .label = std::string("CAST_8/") + tag_name(tag),
                        .setup = { set_mem(0, tag, next_value()) },
                        .target = { cast8(0, 1, MemoryTag::U32) } });
    }
    for (auto tag : ALL_TAGS) {
        add(SpamConfig{ .label = std::string("MOV_8/") + tag_name(tag),
                        .setup = { set_mem(0, tag, next_value()) },
                        .target = { mov8(0, 1) } });
    }

    // SET (only the 128-bit variant; others are equivalent in sim/proving cost).
    add(SpamConfig{ .label = "SET_128",
                    .setup = {},
                    .target = { set_mem(0, MemoryTag::U128, FF(uint256_t(4242424242424242ULL))) } });

    // Control flow.
    add(SpamConfig{ .label = "JUMP_32", .setup = {}, .target = { jump(0) } });
    add(SpamConfig{ .label = "JUMPI_32",
                    .setup = { set_mem(0, MemoryTag::U1, FF(0)) },
                    .target = { jumpi(/*cond=*/0, /*loc=*/0) } });
    add(SpamConfig{ .label = "INTERNALCALL", .setup = {}, .target = { internalcall(/*loc=*/0) } });
    // INTERNALCALL jumps to the INTERNALRETURN, which returns to the JUMP, which loops back to start.
    const uint32_t internalcall_size = static_cast<uint32_t>(instruction_byte_size(internalcall(0)));
    const uint32_t jump_size = static_cast<uint32_t>(instruction_byte_size(jump(0)));
    add(SpamConfig{ .label = "INTERNALRETURN",
                    .setup = {},
                    .target = { internalcall(/*loc=*/internalcall_size + jump_size), jump(0), internalreturn() } });

    // External calls (call self via calldata[0]).
    add(external_call_config(WireOpCode::CALL));
    {
        SpamConfig staticcall = external_call_config(WireOpCode::STATICCALL);
        staticcall.label = "STATICCALL";
        add(std::move(staticcall));
    }

    // RETURN / REVERT terminate execution, so they use the side-effect (nested-call) pattern.
    add(SpamConfig{ .label = "RETURN",
                    .setup = { set_u32(0, 0) },
                    .target = { ret(/*copySize=*/0, /*returnOffset=*/0) },
                    .limit = 1 });
    add(SpamConfig{ .label = "REVERT_8",
                    .setup = { set_u32(0, 0) },
                    .target = { revert8(/*retSize=*/0, /*returnOffset=*/1) },
                    .limit = 1 });

    // Environment.
    add(SpamConfig{ .label = "GETENVVAR_16", .setup = {}, .target = { getenvvar(/*dst=*/0, /*var=*/0) } });

    // CALLDATACOPY (dynamic gas with copy size).
    add(SpamConfig{ .label = "CALLDATACOPY/Min copy size",
                    .setup = { set_u32(0, 0), set_u32(1, 0) },
                    .target = { calldatacopy(/*copySize=*/0, /*cdStart=*/1, /*dst=*/2) } });
    add(SpamConfig{ .label = "CALLDATACOPY/Large copy size",
                    .setup = { set_u32(0, 1000), set_u32(1, 0) },
                    .target = { calldatacopy(/*copySize=*/0, /*cdStart=*/1, /*dst=*/2) } });
    add(SpamConfig{ .label = "CALLDATACOPY/Near min copy size of 1",
                    .setup = { set_u32(0, 1), set_u32(1, 0) },
                    .target = { calldatacopy(/*copySize=*/0, /*cdStart=*/1, /*dst=*/2) } });

    add(SpamConfig{ .label = "SUCCESSCOPY", .setup = {}, .target = { successcopy(/*dst=*/0) } });
    add(SpamConfig{ .label = "RETURNDATASIZE", .setup = {}, .target = { returndatasize(/*dst=*/0) } });
    add(SpamConfig{ .label = "RETURNDATACOPY/Min copy size",
                    .setup = { set_u32(0, 0), set_u32(1, 0) },
                    .target = { returndatacopy(/*copySize=*/0, /*rdStart=*/1, /*dst=*/2) } });
    add(SpamConfig{ .label = "RETURNDATACOPY/Large copy size",
                    .setup = { set_u32(0, 1000), set_u32(1, 0) },
                    .target = { returndatacopy(/*copySize=*/0, /*rdStart=*/1, /*dst=*/2) } });
    add(SpamConfig{ .label = "RETURNDATACOPY/Near min copy size of 1",
                    .setup = { set_u32(0, 1), set_u32(1, 0) },
                    .target = { returndatacopy(/*copySize=*/0, /*rdStart=*/1, /*dst=*/2) } });

    // World-state reads.
    add(SpamConfig{ .label = "SLOAD/Cold read (slot not written)",
                    .setup = { set_mem(0, MemoryTag::FF, next_value()), getenvvar(/*dst=*/1, /*var=*/0) },
                    .target = { sload(/*slot=*/0, /*addr=*/1, /*dst=*/2) } });
    add(SpamConfig{ .label = "SLOAD/Warm read (from tree)",
                    .setup = { set_mem(0, MemoryTag::FF, WARM_STORAGE_SLOT), getenvvar(/*dst=*/1, /*var=*/0) },
                    .target = { sload(/*slot=*/0, /*addr=*/1, /*dst=*/2) } });
    add(SpamConfig{ .label = "SLOAD/Warm read (SSTORE first, unique slot per SLOAD)",
                    .setup = { set_mem(0, MemoryTag::FF, next_value()),
                               set_mem(1, MemoryTag::FF, next_value()),
                               set_mem(2, MemoryTag::FF, FF(1)),
                               getenvvar(/*dst=*/3, /*var=*/0),
                               set_u32(4, 0) },
                    .target = { sstore(/*src=*/1, /*slot=*/0),
                                sload(/*slot=*/0, /*addr=*/3, /*dst=*/5),
                                op3_8(WireOpCode::ADD_8, 0, 2, 0) },
                    .cleanup = { revert8(/*retSize=*/4, /*returnOffset=*/0) },
                    .limit = MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX });

    add(SpamConfig{ .label = "NOTEHASHEXISTS/Cold (non-existent)",
                    .setup = { set_mem(0, MemoryTag::FF, next_value()), set_mem(1, MemoryTag::U64, next_value()) },
                    .target = { notehashexists(/*nh=*/0, /*leafIdx=*/1, /*exists=*/2) } });
    add(SpamConfig{ .label = "NOTEHASHEXISTS/Warm (exists in tree)",
                    .setup = { set_mem(0, MemoryTag::FF, WARM_NOTE_HASH),
                               set_mem(1, MemoryTag::U64, FF(WARM_NOTE_HASH_LEAF_INDEX)) },
                    .target = { notehashexists(/*nh=*/0, /*leafIdx=*/1, /*exists=*/2) } });

    add(SpamConfig{ .label = "NULLIFIEREXISTS/Non-existent nullifier",
                    .setup = { set_mem(0, MemoryTag::FF, next_value()) },
                    .target = { nullifierexists(/*siloed=*/0, /*exists=*/1) } });
    add(SpamConfig{ .label = "NULLIFIEREXISTS/Existing nullifier (warm - from tree)",
                    .setup = { set_mem(0, MemoryTag::FF, WARM_SILOED_NULLIFIER) },
                    .target = { nullifierexists(/*siloed=*/0, /*exists=*/1) } });

    add(SpamConfig{ .label = "L1TOL2MSGEXISTS/Cold (non-existent)",
                    .setup = { set_mem(0, MemoryTag::FF, next_value()), set_mem(1, MemoryTag::U64, next_value()) },
                    .target = { l1tol2msgexists(/*msg=*/0, /*leafIdx=*/1, /*exists=*/2) } });
    add(SpamConfig{ .label = "L1TOL2MSGEXISTS/Warm (exists in tree)",
                    .setup = { set_mem(0, MemoryTag::FF, WARM_L1_TO_L2_MSG),
                               set_mem(1, MemoryTag::U64, FF(WARM_L1_TO_L2_MSG_LEAF_INDEX)) },
                    .target = { l1tol2msgexists(/*msg=*/0, /*leafIdx=*/1, /*exists=*/2) } });

    add(SpamConfig{ .label = "GETCONTRACTINSTANCE",
                    .setup = { getenvvar(/*dst=*/0, /*var=*/0) },
                    .target = { getcontractinstance(/*addr=*/0, /*dst=*/1, /*member=*/0) } });

    // Side-effect limited opcodes (nested-call pattern).
    add(SpamConfig{ .label = "EMITNOTEHASH",
                    .setup = { set_mem(0, MemoryTag::FF, next_value()), set_u32(1, 0) },
                    .target = { emitnotehash(/*nh=*/0) },
                    .cleanup = { revert8(/*retSize=*/1, /*returnOffset=*/0) },
                    .limit = MAX_NOTE_HASHES_PER_TX });
    add(SpamConfig{
        .label = "EMITNULLIFIER",
        .setup = { set_mem(0, MemoryTag::FF, next_value()), set_mem(1, MemoryTag::FF, FF(1)), set_u32(2, 0) },
        .target = { emitnullifier(/*n=*/0), op3_8(WireOpCode::ADD_8, 0, 1, 0) },
        .cleanup = { revert8(/*retSize=*/2, /*returnOffset=*/0) },
        .limit = MAX_NULLIFIERS_PER_TX - 1 });
    add(SpamConfig{
        .label = "SENDL2TOL1MSG",
        .setup = { set_mem(0, MemoryTag::FF, next_value()), set_mem(1, MemoryTag::FF, next_value()), set_u32(2, 0) },
        .target = { sendl2tol1(/*recipient=*/0, /*content=*/1) },
        .cleanup = { revert8(/*retSize=*/2, /*returnOffset=*/0) },
        .limit = MAX_L2_TO_L1_MSGS_PER_TX });

    // SSTORE: same-slot (no limit) and unique-slots (side-effect limited).
    add(SpamConfig{
        .label = "SSTORE/Same slot (no limit)",
        .setup = { set_mem(0, MemoryTag::FF, next_value()), set_mem(1, MemoryTag::FF, next_value()), set_u32(2, 0) },
        .target = { sstore(/*src=*/0, /*slot=*/1) } });
    add(SpamConfig{ .label = "SSTORE/Unique slots (side-effect limited)",
                    .setup = { set_mem(0, MemoryTag::FF, next_value()),
                               set_mem(1, MemoryTag::FF, next_value()),
                               set_mem(2, MemoryTag::FF, FF(1)),
                               set_u32(3, 0) },
                    .target = { sstore(/*src=*/0, /*slot=*/1), op3_8(WireOpCode::ADD_8, 1, 2, 1) },
                    .cleanup = { revert8(/*retSize=*/3, /*returnOffset=*/0) },
                    .limit = MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX });

    // EMITPUBLICLOG: many empty logs, and one max-size log.
    add(SpamConfig{ .label = "EMITPUBLICLOG/Many empty logs, revert, repeat",
                    .setup = { set_u32(0, 0), set_u32(1, 0) },
                    .target = { emitpubliclog(/*logSize=*/0, /*logOffset=*/1) },
                    .cleanup = { revert8(/*retSize=*/1, /*returnOffset=*/0) },
                    .limit = FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH / PUBLIC_LOG_HEADER_LENGTH });
    add(SpamConfig{ .label = "EMITPUBLICLOG/One max size log, revert, repeat",
                    .setup = { set_u32(0, MAX_PUBLIC_LOG_SIZE_IN_FIELDS), set_u32(1, 0) },
                    .target = { emitpubliclog(/*logSize=*/0, /*logOffset=*/2) },
                    .cleanup = { revert8(/*retSize=*/1, /*returnOffset=*/0) },
                    .limit = 1 });

    // Gadgets.
    add(SpamConfig{ .label = "POSEIDON2PERM",
                    .setup = { set_mem(0, MemoryTag::FF, next_value()),
                               set_mem(1, MemoryTag::FF, next_value()),
                               set_mem(2, MemoryTag::FF, next_value()),
                               set_mem(3, MemoryTag::FF, next_value()) },
                    .target = { poseidon2(/*input=*/0, /*output=*/0) } });
    {
        std::vector<Instruction> setup;
        for (uint16_t i = 0; i < 8; ++i) {
            setup.push_back(set_mem(i, MemoryTag::U32, next_value()));
        }
        for (uint16_t i = 0; i < 16; ++i) {
            setup.push_back(set_mem(static_cast<uint16_t>(8 + i), MemoryTag::U32, next_value()));
        }
        add(SpamConfig{ .label = "SHA256COMPRESSION",
                        .setup = std::move(setup),
                        .target = { sha256compression(/*out=*/0, /*state=*/0, /*inputs=*/8) } });
    }
    {
        std::vector<Instruction> setup;
        for (uint16_t i = 0; i < 25; ++i) {
            setup.push_back(set_mem(i, MemoryTag::U64, next_value()));
        }
        add(SpamConfig{
            .label = "KECCAKF1600", .setup = std::move(setup), .target = { keccakf1600(/*dst=*/0, /*input=*/0) } });
    }
    {
        const FF gx = FF(grumpkin::g1::affine_one.x);
        const FF gy = FF(grumpkin::g1::affine_one.y);
        add(SpamConfig{ .label = "ECADD",
                        .setup = { set_mem(0, MemoryTag::FF, gx),
                                   set_mem(1, MemoryTag::FF, gy),
                                   set_mem(2, MemoryTag::FF, gx),
                                   set_mem(3, MemoryTag::FF, gy) },
                        .target = { ecadd(/*p1x=*/0, /*p1y=*/1, /*p2x=*/2, /*p2y=*/3, /*dst=*/0) } });
    }
    add(SpamConfig{
        .label = "TORADIXBE/Min limbs",
        .setup = { set_mem(0, MemoryTag::FF, FF(1)), set_u32(1, 2), set_u32(2, 1), set_mem(3, MemoryTag::U1, FF(0)) },
        .target = { toradixbe(/*src=*/0, /*radix=*/1, /*numLimbs=*/2, /*outBits=*/3, /*dst=*/4) } });
    add(SpamConfig{ .label = "TORADIXBE/Max limbs",
                    .setup = { set_mem(0, MemoryTag::FF, next_value()),
                               set_u32(1, 2),
                               set_u32(2, 256),
                               set_mem(3, MemoryTag::U1, FF(0)) },
                    .target = { toradixbe(/*src=*/0, /*radix=*/1, /*numLimbs=*/2, /*outBits=*/3, /*dst=*/4) } });
    add(SpamConfig{ .label = "TORADIXBE/Radix 3 (slow divmod path)",
                    .setup = { set_mem(0, MemoryTag::FF, next_value()),
                               set_u32(1, 3),
                               set_u32(2, 161),
                               set_mem(3, MemoryTag::U1, FF(0)) },
                    .target = { toradixbe(/*src=*/0, /*radix=*/1, /*numLimbs=*/2, /*outBits=*/3, /*dst=*/4) } });

    // Misc.
    add(SpamConfig{
        .label = "DEBUGLOG",
        .setup = { set_mem(0, MemoryTag::FF, FF(0)),
                   set_mem(1, MemoryTag::FF, FF(0)),
                   set_mem(2, MemoryTag::FF, FF(0)),
                   set_u32(3, 0) },
        .target = { debuglog(/*level=*/0, /*message=*/1, /*fields=*/2, /*fieldsSize=*/3, /*messageSize=*/0) } });

    return configs;
}

// ---- Runner ----

// Deploys and simulates a single spam scenario end-to-end (handling the standard vs. side-effect
// patterns). Returns the simulation result; the caller asserts the revert behavior and records metrics.
// Pass a config with hint collection enabled to obtain proving inputs.
TxSimulationResult run_opcode_spam_case(
    PublicTxSimulationTester& tester,
    const SpamConfig& config,
    const PublicSimulatorConfig& sim_config = PublicTxSimulationTester::default_config())
{
    if (config.limit.has_value()) {
        // Two-contract pattern: outer repeatedly calls inner, which spams the side effect then reverts.
        const auto inner_bytecode = create_side_effect_spam_bytecode(config);
        const auto outer_bytecode = create_opcode_spam_bytecode(external_call_config());
        const auto inner = tester.deploy_contract(inner_bytecode);
        const auto outer = tester.deploy_contract(outer_bytecode);
        return tester.simulate_tx(
            { TestEnqueuedCall{ .contract_address = outer.address, .calldata = { inner.address } } }, sim_config);
    }

    const auto bytecode = create_opcode_spam_bytecode(config);
    const auto contract = tester.deploy_contract(bytecode);
    insert_warm_tree_entries(tester, contract.address);

    std::vector<FF> calldata;
    if (config.address_as_calldata) {
        calldata = { contract.address };
    }
    return tester.simulate_tx({ TestEnqueuedCall{ .contract_address = contract.address, .calldata = calldata } },
                              sim_config);
}

// ============================================================================
// Benchmark / test
// ============================================================================

// One benchmark datapoint, matching the github-action-benchmark JSON shape consumed by the dashboard.
struct BenchEntry {
    std::string name;
    double value;
    std::string unit;
};

PublicSimulatorConfig proving_config()
{
    PublicSimulatorConfig config = PublicTxSimulationTester::default_config();
    config.collect_hints = true;
    config.collect_public_inputs = true;
    return config;
}

std::string top_level_halting_message(const TxSimulationResult& result)
{
    if (result.call_stack_metadata.empty() || !result.call_stack_metadata[0].halting_message.has_value()) {
        return "";
    }
    std::string message = *result.call_stack_metadata[0].halting_message;
    std::transform(message.begin(), message.end(), message.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return message;
}

void write_bench_output(const std::vector<BenchEntry>& entries, const std::string& path)
{
    std::ofstream out(path);
    out << "[\n";
    for (size_t i = 0; i < entries.size(); ++i) {
        out << "  {\"name\": \"" << entries[i].name << "\", \"value\": " << entries[i].value << ", \"unit\": \""
            << entries[i].unit << "\"}";
        out << (i + 1 < entries.size() ? ",\n" : "\n");
    }
    out << "]\n";
}

// Spams every opcode through the full pipeline: fast simulation (until out of gas / explicit revert),
// simulation with hint generation, and proving (check circuit). It records per-opcode gas and timing.
// This is a heavy benchmark, so it is gated behind RUN_AVM_OPCODE_SPAM. Set BENCH_OUTPUT=<path> to emit
// github-action-benchmark JSON.
TEST(OpcodeSpam, SpamAllOpcodes)
{
    if (std::getenv("RUN_AVM_OPCODE_SPAM") == nullptr) {
        GTEST_SKIP() << "Set RUN_AVM_OPCODE_SPAM=1 to run the opcode spam benchmark";
    }

    const auto configs = get_spam_configs();
    std::vector<BenchEntry> entries;
    entries.reserve(configs.size() * 3);

    for (const auto& config : configs) {
        SCOPED_TRACE(config.label);

        // 1. Fast simulation: every scenario must halt (out of gas, or out of gas / explicit revert
        // for the side-effect scenarios).
        PublicTxSimulationTester tester;
        const auto fast_sim_start = std::chrono::steady_clock::now();
        const TxSimulationResult fast_result = run_opcode_spam_case(tester, config);
        const auto fast_sim_end = std::chrono::steady_clock::now();
        const double fast_sim_ms =
            std::chrono::duration_cast<std::chrono::duration<double, std::milli>>(fast_sim_end - fast_sim_start)
                .count();

        EXPECT_NE(fast_result.revert_code, RevertCode::OK) << "Opcode spam should halt for " << config.label;
        const std::string reason = top_level_halting_message(fast_result);
        if (!reason.empty()) {
            const bool allowed =
                reason.find("out of gas") != std::string::npos || reason.find("not enough") != std::string::npos;
            EXPECT_TRUE(allowed) << "Unexpected top-level halt reason for " << config.label << ": " << reason;
        }

        // 2. Simulation for hint generation (on a fresh tester so the world state is clean).
        PublicTxSimulationTester proving_tester;
        const auto hint_sim_start = std::chrono::steady_clock::now();
        const TxSimulationResult hint_result = run_opcode_spam_case(proving_tester, config, proving_config());
        const auto hint_sim_end = std::chrono::steady_clock::now();
        const double hint_sim_ms =
            std::chrono::duration_cast<std::chrono::duration<double, std::milli>>(hint_sim_end - hint_sim_start)
                .count();
        ASSERT_TRUE(hint_result.public_inputs.has_value());
        ASSERT_TRUE(hint_result.hints.has_value());

        const AvmProvingInputs proving_inputs{ .public_inputs = *hint_result.public_inputs,
                                               .hints = *hint_result.hints };
        AvmAPI api;
        const auto prove_start = std::chrono::steady_clock::now();
        const bool check_circuit_ok = api.check_circuit(proving_inputs);
        const auto prove_end = std::chrono::steady_clock::now();
        const double prove_ms =
            std::chrono::duration_cast<std::chrono::duration<double, std::milli>>(prove_end - prove_start).count();
        EXPECT_TRUE(check_circuit_ok) << "check_circuit failed for " << config.label;

        const double mana = static_cast<double>(fast_result.gas_used.public_gas.l2_gas);
        entries.push_back({ "Opcode Spam/" + config.label + "/manaUsed", mana, "mana" });
        entries.push_back({ "Opcode Spam/" + config.label + "/fastSimMs", fast_sim_ms, "ms" });
        entries.push_back({ "Opcode Spam/" + config.label + "/hintSimMs", hint_sim_ms, "ms" });
        entries.push_back({ "Opcode Spam/" + config.label + "/checkCircuitMs", prove_ms, "ms" });

        info("Opcode Spam: ",
             config.label,
             " mana=",
             mana,
             " fastSim=",
             fast_sim_ms,
             "ms hintSim=",
             hint_sim_ms,
             "ms checkCircuit=",
             prove_ms,
             "ms");
    }

    if (const char* bench_output = std::getenv("BENCH_OUTPUT")) {
        write_bench_output(entries, bench_output);
        info("Wrote opcode spam benchmark output to ", bench_output);
    }
}

} // namespace
} // namespace bb::avm2
