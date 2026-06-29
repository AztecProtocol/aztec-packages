#include <cstdint>
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
using IB = testing::InstructionBuilder;
using testing::encode_to_bytecode;
using testing::PublicTxSimulationTester;
using testing::TestEnqueuedCall;

Instruction set8(uint8_t dst, MemoryTag tag, uint8_t value)
{
    return IB(WireOpCode::SET_8).operand(dst).operand(tag).operand(value).build();
}
Instruction set32(uint16_t dst, MemoryTag tag, uint32_t value)
{
    return IB(WireOpCode::SET_32).operand(dst).operand(tag).operand(value).build();
}
Instruction xor8(uint8_t a, uint8_t b, uint8_t dst)
{
    return IB(WireOpCode::XOR_8).operand(a).operand(b).operand(dst).build();
}
Instruction calldatacopy(uint16_t copy_size, uint16_t cd_start, uint16_t dst)
{
    return IB(WireOpCode::CALLDATACOPY).operand(copy_size).operand(cd_start).operand(dst).build();
}
Instruction call(uint16_t l2_gas, uint16_t da_gas, uint16_t addr, uint16_t args_size, uint16_t args)
{
    return IB(WireOpCode::CALL).operand(l2_gas).operand(da_gas).operand(addr).operand(args_size).operand(args).build();
}
Instruction sha256compression(uint16_t out, uint16_t state, uint16_t inputs)
{
    return IB(WireOpCode::SHA256COMPRESSION).operand(out).operand(state).operand(inputs).build();
}
Instruction ret(uint16_t copy_size, uint16_t return_offset)
{
    return IB(WireOpCode::RETURN).operand(copy_size).operand(return_offset).build();
}

// Inner contract: XOR of a U32 cell with a U16 cell (tag mismatch). The mismatch makes the
// instruction halt exceptionally and emits a bitwise "error row".
std::vector<uint8_t> make_inner_bytecode()
{
    return encode_to_bytecode({
        set8(/*dst=*/0, MemoryTag::U32, /*value=*/0),
        set8(/*dst=*/1, MemoryTag::U16, /*value=*/0),
        xor8(/*a=*/0, /*b=*/1, /*dst=*/2),
        ret(/*copySizeOffset=*/0, /*returnOffset=*/0),
    });
}

// Outer contract: calls the inner contract (whose address arrives as calldata[0]), then runs a
// SHA256COMPRESSION whose message schedule computes sigma0(w[1]=0) = XOR(U32(0), U32(0)). The
// caller-side bitwise lookup tuple (0, 0, 0, XOR, U32) used to collide with the inner call's error
// row, violating BITW_NO_EXTERNAL_START_ON_ERROR and making the honest tx unprovable.
std::vector<uint8_t> make_outer_bytecode()
{
    std::vector<Instruction> instructions = {
        set8(/*dst=*/0, MemoryTag::U32, /*value=*/0),
        set8(/*dst=*/1, MemoryTag::U32, /*value=*/1),
        set32(/*dst=*/2, MemoryTag::U32, /*value=*/100'000),
        calldatacopy(/*copySizeOffset=*/1, /*cdStartOffset=*/0, /*dstOffset=*/3),
        call(/*l2GasOffset=*/2, /*daGasOffset=*/2, /*addrOffset=*/3, /*argsSizeOffset=*/0, /*argsOffset=*/0),
    };

    // SHA256 state words [10..17] = 0.
    for (uint16_t i = 0; i < 8; ++i) {
        instructions.push_back(set8(/*dst=*/static_cast<uint8_t>(10 + i), MemoryTag::U32, /*value=*/0));
    }
    // First input word [18], then input words [19..33] = 0. w[1] (cell [19]) is 0, which drives the
    // sigma0(0) = XOR(U32(0), U32(0)) lookup that triggered the regression.
    instructions.push_back(set32(/*dst=*/18, MemoryTag::U32, /*value=*/0x61626364));
    for (uint16_t i = 0; i < 15; ++i) {
        instructions.push_back(set8(/*dst=*/static_cast<uint8_t>(19 + i), MemoryTag::U32, /*value=*/0));
    }

    instructions.push_back(sha256compression(/*outputOffset=*/34, /*stateOffset=*/10, /*inputsOffset=*/18));
    instructions.push_back(ret(/*copySizeOffset=*/0, /*returnOffset=*/0));
    return encode_to_bytecode(instructions);
}

PublicSimulatorConfig proving_config()
{
    PublicSimulatorConfig config = PublicTxSimulationTester::default_config();
    config.collect_hints = true;
    config.collect_public_inputs = true;
    return config;
}

// Regression guard for a completeness bug: an honest tx whose inner call emits a bitwise error row
// (XOR with tag mismatch) and whose outer call runs SHA256COMPRESSION could not be proven, because
// the sha256 bitwise lookup collided with the inner's error row on the 5-tuple (0, 0, 0, XOR, U32).
// The fix adds a second input tag to the bitwise lookup so error rows (tag_a != tag_b) can never
// collide with the caller's (u32, u32) lookup. This test proves the tx still goes through.
TEST(AvmCompleteness, BitwiseSha256ErrorRowCollision)
{
    PublicTxSimulationTester tester;
    const auto inner = tester.deploy_contract(make_inner_bytecode());
    const auto outer = tester.deploy_contract(make_outer_bytecode());

    // Inner call reverts (tag mismatch), outer runs SHA256 and RETURNs OK → top-level OK.
    const TxSimulationResult fast_result =
        tester.simulate_tx({ TestEnqueuedCall{ .contract_address = outer.address, .calldata = { inner.address } } });
    EXPECT_EQ(fast_result.revert_code, RevertCode::OK);

    // Simulation for hint generation, then proving (check circuit).
    const TxSimulationResult hint_result = tester.simulate_tx(
        { TestEnqueuedCall{ .contract_address = outer.address, .calldata = { inner.address } } }, proving_config());
    ASSERT_TRUE(hint_result.public_inputs.has_value());
    ASSERT_TRUE(hint_result.hints.has_value());

    const AvmProvingInputs proving_inputs{ .public_inputs = *hint_result.public_inputs, .hints = *hint_result.hints };
    AvmAPI api;
    EXPECT_TRUE(api.check_circuit(proving_inputs));
}

} // namespace
} // namespace bb::avm2
