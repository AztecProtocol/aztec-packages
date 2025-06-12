#include "barretenberg/vm2/simulation/gas_tracker.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/gas.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/simulation/events/gas_event.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"

namespace bb::avm2::simulation {
namespace {

class GasTrackerTest : public ::testing::Test {
  protected:
    void SetUp() override
    {
        // Default context setup
        ON_CALL(context, get_gas_used()).WillByDefault(testing::Return(Gas{ 0, 0 }));
        ON_CALL(context, get_gas_limit()).WillByDefault(testing::Return(Gas{ 1000, 500 }));
    }

    InstructionInfoDB instruction_info_db;
    testing::StrictMock<MockContext> context;
    testing::StrictMock<MockRangeCheck> range_check;
    Instruction instruction;
};

TEST_F(GasTrackerTest, BaseGasConsumption)
{
    GasTracker tracker(instruction_info_db, context, range_check);

    instruction.opcode = WireOpCode::SET_8;
    tracker.set_instruction(instruction);

    // Test base gas consumption
    EXPECT_CALL(context, get_gas_used());
    EXPECT_CALL(context, get_gas_limit());
    EXPECT_CALL(context, set_gas_used(Gas{ AVM_SET_BASE_L2_GAS + compute_addressing_gas(instruction.indirect), 0 }));

    tracker.consume_base_gas();
}

TEST_F(GasTrackerTest, AddressingGasConsumption)
{
    instruction.opcode = WireOpCode::SET_8;
    // Indirect and relative
    instruction.indirect = 0b11;
    GasTracker tracker(instruction_info_db, context, range_check);

    tracker.set_instruction(instruction);

    // Test base gas consumption
    EXPECT_CALL(context, get_gas_used());
    EXPECT_CALL(context, get_gas_limit());
    EXPECT_CALL(context, set_gas_used(Gas{ AVM_SET_BASE_L2_GAS + compute_addressing_gas(instruction.indirect), 0 }));

    tracker.consume_base_gas();
}

TEST_F(GasTrackerTest, OutOfGasBase)
{
    instruction.opcode = WireOpCode::SET_8;
    GasTracker tracker(instruction_info_db, context, range_check);

    tracker.set_instruction(instruction);

    // Set up context to be near gas limit
    EXPECT_CALL(context, get_gas_used()).WillOnce(testing::Return(Gas{ 999, 450 }));
    EXPECT_CALL(context, get_gas_limit()).WillOnce(testing::Return(Gas{ 1000, 500 }));
    EXPECT_CALL(context, set_gas_used(Gas{ 1000, 500 }));

    EXPECT_THROW(tracker.consume_base_gas(), OutOfGasException);
}

TEST_F(GasTrackerTest, DynamicGasConsumption)
{
    instruction.opcode = WireOpCode::CALLDATACOPY;
    GasTracker tracker(instruction_info_db, context, range_check);

    tracker.set_instruction(instruction);

    EXPECT_CALL(context, get_gas_limit());
    EXPECT_CALL(context, set_gas_used(Gas{ AVM_CALLDATACOPY_DYN_L2_GAS * 10, 0 }));

    tracker.consume_dynamic_gas(Gas{ 10, 0 });
}

TEST_F(GasTrackerTest, OutOfGasDynamicPhase)
{
    instruction.opcode = WireOpCode::CALLDATACOPY;
    GasTracker tracker(instruction_info_db, context, range_check);

    tracker.set_instruction(instruction);

    EXPECT_CALL(context, get_gas_used())
        .WillOnce(testing::Return(
            Gas{ 999 - AVM_CALLDATACOPY_BASE_L2_GAS - compute_addressing_gas(instruction.indirect), 450 }));
    EXPECT_CALL(context, get_gas_limit());
    EXPECT_CALL(context, set_gas_used(Gas{ 999, 450 }));
    tracker.consume_base_gas();

    EXPECT_CALL(context, get_gas_limit()).WillOnce(testing::Return(Gas{ 1000, 500 }));
    EXPECT_CALL(context, set_gas_used(Gas{ 1000, 500 }));
    EXPECT_THROW(tracker.consume_dynamic_gas(Gas{ 10, 0 }), OutOfGasException);
}

TEST_F(GasTrackerTest, OutOfGasBasePhaseWithOverflow)
{
    instruction.opcode = WireOpCode::CALLDATACOPY;
    GasTracker tracker(instruction_info_db, context, range_check);

    uint32_t uint32_max = std::numeric_limits<uint32_t>::max();
    uint32_t gas_limit = uint32_max;
    uint32_t prev_gas_used = uint32_max;

    tracker.set_instruction(instruction);

    EXPECT_CALL(context, get_gas_used()).WillOnce(testing::Return(Gas{ prev_gas_used, 0 }));
    EXPECT_CALL(context, get_gas_limit()).WillOnce(testing::Return(Gas{ gas_limit, gas_limit }));
    EXPECT_CALL(context, set_gas_used(Gas{ gas_limit, gas_limit }));
    EXPECT_THROW(tracker.consume_base_gas(), OutOfGasException);

    // We are over the limit, so we need to do gas_used - limit - 1
    uint64_t limit_used_l2_comparison_witness = (static_cast<uint64_t>(prev_gas_used) + AVM_CALLDATACOPY_BASE_L2_GAS +
                                                 compute_addressing_gas(instruction.indirect)) -
                                                gas_limit - 1;
    // No da gas was used
    uint64_t limit_used_da_comparison_witness = gas_limit - 0;

    EXPECT_CALL(context, get_gas_limit()).WillOnce(testing::Return(Gas{ gas_limit, gas_limit }));
    EXPECT_CALL(range_check, assert_range(limit_used_l2_comparison_witness, 64));
    EXPECT_CALL(range_check, assert_range(limit_used_da_comparison_witness, 64));

    GasEvent event = tracker.finish();
    EXPECT_EQ(event.limit_used_l2_comparison_witness, limit_used_l2_comparison_witness);
    EXPECT_EQ(event.limit_used_da_comparison_witness, limit_used_da_comparison_witness);
}

TEST_F(GasTrackerTest, OutOfGasDynamicPhaseWithOverflow)
{
    instruction.opcode = WireOpCode::CALLDATACOPY;
    GasTracker tracker(instruction_info_db, context, range_check);

    uint32_t uint32_max = std::numeric_limits<uint32_t>::max();
    uint32_t gas_limit = uint32_max;
    uint32_t prev_gas_used = uint32_max - AVM_CALLDATACOPY_BASE_L2_GAS - compute_addressing_gas(instruction.indirect);
    uint32_t gas_factor = uint32_max;

    tracker.set_instruction(instruction);

    EXPECT_CALL(context, get_gas_used()).WillOnce(testing::Return(Gas{ prev_gas_used, 0 }));
    EXPECT_CALL(context, get_gas_limit()).WillOnce(testing::Return(Gas{ gas_limit, gas_limit }));
    EXPECT_CALL(context, set_gas_used(Gas{ uint32_max, 0 }));
    tracker.consume_base_gas();

    EXPECT_CALL(context, get_gas_limit()).WillOnce(testing::Return(Gas{ gas_limit, gas_limit }));
    EXPECT_CALL(context, set_gas_used(Gas{ gas_limit, gas_limit }));
    EXPECT_THROW(tracker.consume_dynamic_gas(Gas{ gas_factor, 0 }), OutOfGasException);

    // We are over the limit, so we need to do gas_used - limit - 1
    uint64_t limit_used_l2_comparison_witness =
        (AVM_ADDRESSING_BASE_L2_GAS + static_cast<uint64_t>(prev_gas_used) + AVM_CALLDATACOPY_BASE_L2_GAS +
         static_cast<uint64_t>(gas_factor) * AVM_CALLDATACOPY_DYN_L2_GAS) -
        gas_limit - 1;
    // No da gas was used
    uint64_t limit_used_da_comparison_witness = gas_limit - 0;

    EXPECT_CALL(context, get_gas_limit()).WillOnce(testing::Return(Gas{ gas_limit, gas_limit }));
    EXPECT_CALL(range_check, assert_range(limit_used_l2_comparison_witness, 64));
    EXPECT_CALL(range_check, assert_range(limit_used_da_comparison_witness, 64));

    GasEvent event = tracker.finish();
    EXPECT_EQ(event.limit_used_l2_comparison_witness, limit_used_l2_comparison_witness);
    EXPECT_EQ(event.limit_used_da_comparison_witness, limit_used_da_comparison_witness);
}

TEST_F(GasTrackerTest, GasLimitForCall)
{
    GasTracker tracker(instruction_info_db, context, range_check);
    Gas gas_left = Gas{ 500, 200 };
    Gas allocated_gas = Gas{ 100, 150 };

    EXPECT_CALL(context, gas_left()).WillOnce(testing::Return(gas_left));

    EXPECT_CALL(range_check, assert_range(gas_left.l2Gas - allocated_gas.l2Gas - 1, 32));
    EXPECT_CALL(range_check, assert_range(gas_left.daGas - allocated_gas.daGas - 1, 32));
    EXPECT_EQ(tracker.compute_gas_limit_for_call(allocated_gas), allocated_gas);
}

TEST_F(GasTrackerTest, GasLimitForCallClamping)
{
    GasTracker tracker(instruction_info_db, context, range_check);
    Gas gas_left = Gas{ 500, 200 };
    Gas allocated_gas = Gas{ 1000, 100 };
    Gas clamped_gas = Gas{ 500, 100 };

    EXPECT_CALL(context, gas_left()).WillOnce(testing::Return(gas_left));

    EXPECT_CALL(range_check, assert_range(allocated_gas.l2Gas - gas_left.l2Gas, 32));
    EXPECT_CALL(range_check, assert_range(gas_left.daGas - allocated_gas.daGas - 1, 32));
    EXPECT_EQ(tracker.compute_gas_limit_for_call(allocated_gas), clamped_gas);
}

TEST_F(GasTrackerTest, GasEvent)
{
    instruction.opcode = WireOpCode::CALLDATACOPY;
    instruction.indirect = 0b111111; // All direct and relative

    EXPECT_CALL(context, get_gas_used());
    EXPECT_CALL(context, get_gas_limit());
    EXPECT_CALL(context,
                set_gas_used(Gas{ AVM_CALLDATACOPY_BASE_L2_GAS + compute_addressing_gas(instruction.indirect), 0 }));

    GasTracker tracker(instruction_info_db, context, range_check);
    tracker.set_instruction(instruction);

    tracker.consume_base_gas();

    EXPECT_CALL(context, get_gas_limit());
    EXPECT_CALL(context,
                set_gas_used(Gas{ AVM_CALLDATACOPY_BASE_L2_GAS + compute_addressing_gas(instruction.indirect) +
                                      AVM_CALLDATACOPY_DYN_L2_GAS * 10,
                                  0 }));

    tracker.consume_dynamic_gas(Gas{ 10, 0 });

    uint64_t limit_used_l2_comparison_witness =
        1000 - (AVM_CALLDATACOPY_BASE_L2_GAS + compute_addressing_gas(instruction.indirect) +
                AVM_CALLDATACOPY_DYN_L2_GAS * 10);

    uint64_t limit_used_da_comparison_witness = 500;
    EXPECT_CALL(context, get_gas_limit());
    EXPECT_CALL(range_check, assert_range(limit_used_l2_comparison_witness, 64));
    EXPECT_CALL(range_check, assert_range(limit_used_da_comparison_witness, 64));

    EXPECT_EQ(tracker.finish(),
              (GasEvent{
                  .opcode_gas = AVM_CALLDATACOPY_BASE_L2_GAS,
                  .addressing_gas = compute_addressing_gas(instruction.indirect),
                  .base_gas = (Gas{ AVM_CALLDATACOPY_BASE_L2_GAS + compute_addressing_gas(instruction.indirect), 0 }),
                  .dynamic_gas_factor = (Gas{ 10, 0 }),
                  .dynamic_gas = (Gas{ AVM_CALLDATACOPY_DYN_L2_GAS, 0 }),
                  .limit_used_l2_comparison_witness = limit_used_l2_comparison_witness,
                  .limit_used_da_comparison_witness = limit_used_da_comparison_witness,
                  .oog_base_l2 = false,
                  .oog_base_da = false,
                  .oog_dynamic_l2 = false,
                  .oog_dynamic_da = false,
              }));
}

} // namespace
} // namespace bb::avm2::simulation
