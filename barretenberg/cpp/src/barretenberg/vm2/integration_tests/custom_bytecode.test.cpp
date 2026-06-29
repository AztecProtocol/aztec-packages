#include <cstdint>
#include <string>
#include <utility>
#include <vector>

#include <gtest/gtest.h>

#include "barretenberg/vm2/avm_api.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/testing/bytecode_builder.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"
#include "barretenberg/vm2/testing/public_tx_simulation_tester.hpp"

namespace bb::avm2 {
namespace {

using simulation::Instruction;
using testing::BytecodeBuilder;
using testing::InstructionBuilder;
using testing::PublicTxSimulationTester;
using testing::tag_byte_offset;
using testing::TestEnqueuedCall;

// A hand-built bytecode program together with its expected simulation outcome. Shared by the
// simulation and proving phases below.
struct CustomBytecodeCase {
    std::string label;
    std::vector<uint8_t> bytecode;
    bool expect_revert;
};

// The opcode byte value of the last valid wire opcode.
constexpr uint8_t MAX_OPCODE_VALUE = static_cast<uint8_t>(WireOpCode::LAST_OPCODE_SENTINEL) - 1;
// A tag byte value outside the valid range (valid tags are 0..MAX = U128 = 6).
constexpr uint8_t INVALID_TAG = static_cast<uint8_t>(MemoryTag::MAX) + 1;

Instruction set8(uint8_t dst, MemoryTag tag, uint8_t value)
{
    return InstructionBuilder(WireOpCode::SET_8).operand(dst).operand(tag).operand(value).build();
}
Instruction set32(uint16_t dst, MemoryTag tag, uint32_t value)
{
    return InstructionBuilder(WireOpCode::SET_32).operand(dst).operand(tag).operand(value).build();
}
Instruction set64(uint16_t dst, MemoryTag tag, uint64_t value)
{
    return InstructionBuilder(WireOpCode::SET_64).operand(dst).operand(tag).operand(value).build();
}
Instruction set128(uint16_t dst, MemoryTag tag, uint128_t value)
{
    return InstructionBuilder(WireOpCode::SET_128).operand(dst).operand(tag).operand(value).build();
}
Instruction setff(uint16_t dst, MemoryTag tag, const FF& value)
{
    return InstructionBuilder(WireOpCode::SET_FF).operand(dst).operand(tag).operand(value).build();
}
Instruction cast8(uint8_t src, uint8_t dst, MemoryTag tag)
{
    return InstructionBuilder(WireOpCode::CAST_8).operand(src).operand(dst).operand(tag).build();
}
Instruction ret(uint16_t copy_size_offset, uint16_t return_offset)
{
    return InstructionBuilder(WireOpCode::RETURN).operand(copy_size_offset).operand(return_offset).build();
}
Instruction jump(uint32_t loc)
{
    return InstructionBuilder(WireOpCode::JUMP_32).operand(loc).build();
}

CustomBytecodeCase avm_minimal()
{
    auto bytecode = BytecodeBuilder()
                        .add(set8(/*dst=*/0, MemoryTag::U32, /*value=*/1))
                        .add(set8(/*dst=*/1, MemoryTag::U32, /*value=*/2))
                        .add(InstructionBuilder(WireOpCode::ADD_8)
                                 .operand<uint8_t>(0)
                                 .operand<uint8_t>(1)
                                 .operand<uint8_t>(2)
                                 .build())
                        .add(ret(/*copySizeOffset=*/0, /*returnOffset=*/2))
                        .build();
    return { "AvmMinimal", std::move(bytecode), /*expect_revert=*/false };
}

// First instruction resolves a base address (offset 0) which is uninitialized (invalid tag).
CustomBytecodeCase addressing_with_base_tag_issue(bool is_indirect)
{
    InstructionBuilder cdc(WireOpCode::CALLDATACOPY);
    cdc.operand<uint16_t>(1).relative(); // copySize
    if (is_indirect) {
        cdc.indirect();
    }
    cdc.operand<uint16_t>(0); // cdOffset
    cdc.operand<uint16_t>(0); // dstOffset
    auto bytecode = BytecodeBuilder().add(cdc).add(ret(0, 0)).build();
    return { is_indirect ? "AddressingWithBaseTagIssueIndirect" : "AddressingWithBaseTagIssueDirect",
             std::move(bytecode),
             /*expect_revert=*/true };
}

// A U64 value at offset 0 is used as an indirect address (invalid: must be U32).
CustomBytecodeCase addressing_with_indirect_tag_issue()
{
    InstructionBuilder cdc(WireOpCode::CALLDATACOPY);
    cdc.operand<uint16_t>(1).indirect(); // copySize: indirect
    cdc.operand<uint16_t>(0);            // cdOffset
    cdc.operand<uint16_t>(1);            // dstOffset
    auto bytecode =
        BytecodeBuilder().add(set64(/*dst=*/0, MemoryTag::U64, /*value=*/100)).add(cdc).add(ret(0, 0)).build();
    return { "AddressingWithIndirectTagIssue", std::move(bytecode), /*expect_revert=*/true };
}

// Indirect addressing succeeds, then relative addressing fails due to a wrong base tag.
CustomBytecodeCase addressing_with_indirect_then_relative_tag_issue()
{
    InstructionBuilder add(WireOpCode::ADD_16);
    add.operand<uint16_t>(1).indirect(); // aOffset: indirect
    add.operand<uint16_t>(2).relative(); // bOffset: relative
    add.operand<uint16_t>(3);            // dstOffset
    auto bytecode =
        BytecodeBuilder().add(set32(/*dst=*/1, MemoryTag::U32, /*value=*/10)).add(add).add(ret(0, 0)).build();
    return { "AddressingWithIndirectThenRelativeTagIssue", std::move(bytecode), /*expect_revert=*/true };
}

// Relative addressing overflows (UINT32_MAX base) and indirect addressing also fails.
CustomBytecodeCase addressing_with_relative_overflow_and_indirect_tag_issue()
{
    InstructionBuilder add(WireOpCode::ADD_8);
    add.operand<uint8_t>(1).indirect().relative(); // aOffset: indirect-relative
    add.operand<uint8_t>(2).indirect();            // bOffset: indirect
    add.operand<uint8_t>(3);                       // dstOffset
    auto bytecode =
        BytecodeBuilder().add(set32(/*dst=*/0, MemoryTag::U32, /*value=*/0xffffffff)).add(add).add(ret(0, 0)).build();
    return { "AddressingWithRelativeOverflowAndIndirectTagIssue", std::move(bytecode), /*expect_revert=*/true };
}

CustomBytecodeCase pc_out_of_range()
{
    auto bytecode = BytecodeBuilder().add(jump(/*loc=*/123)).add(ret(0, 0)).build();
    return { "PcOutOfRange", std::move(bytecode), /*expect_revert=*/true };
}

CustomBytecodeCase invalid_opcode()
{
    const auto set_bytes = BytecodeBuilder().add(set8(/*dst=*/0, MemoryTag::U32, /*value=*/0)).build();
    const size_t return_opcode_offset = set_bytes.size();

    auto bytecode = BytecodeBuilder().add(set8(/*dst=*/0, MemoryTag::U32, /*value=*/0)).add(ret(0, 0)).build();
    bytecode[return_opcode_offset] = MAX_OPCODE_VALUE + 1; // opcode out of range
    return { "InvalidOpcode", std::move(bytecode), /*expect_revert=*/true };
}

CustomBytecodeCase invalid_byte()
{
    const uint8_t invalid_opcode = MAX_OPCODE_VALUE + 7;
    return { "InvalidByte", { invalid_opcode }, /*expect_revert=*/true };
}

CustomBytecodeCase instruction_truncated()
{
    auto bytecode = BytecodeBuilder().add(set8(/*dst=*/0, MemoryTag::U32, /*value=*/0)).build();
    bytecode.pop_back(); // truncate last byte
    return { "InstructionTruncated", std::move(bytecode), /*expect_revert=*/true };
}

CustomBytecodeCase invalid_tag_value()
{
    auto bytecode = BytecodeBuilder().add(set8(/*dst=*/0, MemoryTag::U32, /*value=*/0)).add(ret(0, 0)).build();
    const size_t tag_offset = tag_byte_offset(WireOpCode::SET_8);
    bytecode[tag_offset] = INVALID_TAG;
    return { "InvalidTagValue", std::move(bytecode), /*expect_revert=*/true };
}

CustomBytecodeCase invalid_tag_value_and_instruction_truncated()
{
    auto bytecode = BytecodeBuilder().add(set128(/*dst=*/0, MemoryTag::U128, /*value=*/0)).build();
    bytecode.resize(bytecode.size() - 5); // truncate
    const size_t tag_offset = tag_byte_offset(WireOpCode::SET_128);
    bytecode[tag_offset] = 0x6f; // invalid tag value
    return { "InvalidTagValueAndInstructionTruncated", std::move(bytecode), /*expect_revert=*/true };
}

CustomBytecodeCase set_truncation()
{
    // 200-bit value: forces truncation for every target tag up to U128.
    const uint256_t low128 = (uint256_t(0x1234567890abcdefULL) << 64) | uint256_t(0x1234567890abcdefULL);
    const FF large_field = FF((uint256_t(1) << 200) + low128);
    // 40-bit value: forces truncation for target tags up to U32.
    const uint64_t large_u64 = (uint64_t(1) << 40) + 0xdeadbeef;

    auto bytecode = BytecodeBuilder()
                        .add(set8(/*dst=*/0, MemoryTag::U32, /*value=*/0)) // Return copy-size slot.
                        .add(setff(/*dst=*/1, MemoryTag::U128, large_field))
                        .add(setff(/*dst=*/2, MemoryTag::U64, large_field))
                        .add(setff(/*dst=*/3, MemoryTag::U32, large_field))
                        .add(setff(/*dst=*/4, MemoryTag::U16, large_field))
                        .add(setff(/*dst=*/5, MemoryTag::U8, large_field))
                        .add(setff(/*dst=*/6, MemoryTag::U1, large_field))
                        .add(set64(/*dst=*/7, MemoryTag::U32, large_u64))
                        .add(set64(/*dst=*/8, MemoryTag::U16, large_u64))
                        .add(set64(/*dst=*/9, MemoryTag::U8, large_u64))
                        .add(set64(/*dst=*/10, MemoryTag::U1, large_u64))
                        .add(ret(/*copySizeOffset=*/0, /*returnOffset=*/0))
                        .build();
    return { "SetTruncation", std::move(bytecode), /*expect_revert=*/false };
}

CustomBytecodeCase cast_truncation()
{
    const uint256_t low128 = (uint256_t(0x1234567890abcdefULL) << 64) | uint256_t(0x1234567890abcdefULL);
    const FF large_field = FF((uint256_t(1) << 200) + low128);
    const uint64_t large_u64 = (uint64_t(1) << 40) + 0xdeadbeef;

    auto bytecode = BytecodeBuilder()
                        .add(set8(/*dst=*/0, MemoryTag::U32, /*value=*/0)) // Return copy-size slot.
                        .add(setff(/*dst=*/10, MemoryTag::FF, large_field))
                        .add(cast8(/*src=*/10, /*dst=*/11, MemoryTag::U128))
                        .add(cast8(/*src=*/10, /*dst=*/12, MemoryTag::U64))
                        .add(cast8(/*src=*/10, /*dst=*/13, MemoryTag::U32))
                        .add(cast8(/*src=*/10, /*dst=*/14, MemoryTag::U16))
                        .add(cast8(/*src=*/10, /*dst=*/15, MemoryTag::U8))
                        .add(cast8(/*src=*/10, /*dst=*/16, MemoryTag::U1))
                        .add(set64(/*dst=*/20, MemoryTag::U64, large_u64))
                        .add(cast8(/*src=*/20, /*dst=*/21, MemoryTag::U32))
                        .add(cast8(/*src=*/20, /*dst=*/22, MemoryTag::U16))
                        .add(cast8(/*src=*/20, /*dst=*/23, MemoryTag::U8))
                        .add(cast8(/*src=*/20, /*dst=*/24, MemoryTag::U1))
                        .add(ret(/*copySizeOffset=*/0, /*returnOffset=*/0))
                        .build();
    return { "CastTruncation", std::move(bytecode), /*expect_revert=*/false };
}

// All custom-bytecode cases: a minimal happy path, the addressing/bytecode-flow unhappy paths
// (which must exceptionally halt), and the SET/CAST truncation happy paths.
std::vector<CustomBytecodeCase> get_custom_bytecode_cases()
{
    std::vector<CustomBytecodeCase> cases;
    cases.push_back(avm_minimal());
    cases.push_back(addressing_with_base_tag_issue(/*is_indirect=*/true));
    cases.push_back(addressing_with_base_tag_issue(/*is_indirect=*/false));
    cases.push_back(addressing_with_indirect_tag_issue());
    cases.push_back(addressing_with_indirect_then_relative_tag_issue());
    cases.push_back(addressing_with_relative_overflow_and_indirect_tag_issue());
    cases.push_back(pc_out_of_range());
    cases.push_back(invalid_opcode());
    cases.push_back(invalid_byte());
    cases.push_back(instruction_truncated());
    cases.push_back(invalid_tag_value());
    cases.push_back(invalid_tag_value_and_instruction_truncated());
    cases.push_back(set_truncation());
    cases.push_back(cast_truncation());
    return cases;
}

PublicSimulatorConfig proving_config()
{
    PublicSimulatorConfig config = PublicTxSimulationTester::default_config();
    config.collect_hints = true;
    config.collect_public_inputs = true;
    return config;
}

class CustomBytecodeSimulation : public ::testing::TestWithParam<CustomBytecodeCase> {};

// Each custom-bytecode program is run through the full pipeline: fast simulation (checking the
// expected revert behavior), simulation with hint generation, and proving (check circuit).
TEST_P(CustomBytecodeSimulation, SimulateAndProve)
{
    const CustomBytecodeCase& test_case = GetParam();
    PublicTxSimulationTester tester;
    const auto deployed = tester.deploy_contract(test_case.bytecode);

    // 1. Fast simulation.
    const TxSimulationResult fast_result =
        tester.simulate_tx({ TestEnqueuedCall{ .contract_address = deployed.address } });
    EXPECT_EQ(fast_result.revert_code != RevertCode::OK, test_case.expect_revert);

    // 2. Simulation for hint generation.
    const TxSimulationResult hint_result =
        tester.simulate_tx({ TestEnqueuedCall{ .contract_address = deployed.address } }, proving_config());
    ASSERT_TRUE(hint_result.public_inputs.has_value());
    ASSERT_TRUE(hint_result.hints.has_value());

    // 3. Proving (check circuit).
    const AvmProvingInputs proving_inputs{ .public_inputs = *hint_result.public_inputs, .hints = *hint_result.hints };
    AvmAPI api;
    EXPECT_TRUE(api.check_circuit(proving_inputs));
}

INSTANTIATE_TEST_SUITE_P(CustomBytecode,
                         CustomBytecodeSimulation,
                         ::testing::ValuesIn(get_custom_bytecode_cases()),
                         [](const ::testing::TestParamInfo<CustomBytecodeCase>& info) { return info.param.label; });

} // namespace
} // namespace bb::avm2
