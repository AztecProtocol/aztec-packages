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
#include "barretenberg/vm2/testing/macros.hpp"

using ::testing::Return;

namespace bb::avm2::simulation {
namespace {

class GasTrackerTest : public ::testing::Test {
  protected:
    void SetUp() override
    {
        // Default context setup
        ON_CALL(context, get_gas_used()).WillByDefault(Return(Gas{ 0, 0 }));
        ON_CALL(context, get_gas_limit()).WillByDefault(Return(Gas{ 1000, 500 }));
    }

    InstructionInfoDB instruction_info_db;
    testing::StrictMock<MockContext> context;
    testing::StrictMock<MockRangeCheck> range_check;
    Instruction instruction;
    GasEvent gas_event;
};

TEST_F(GasTrackerTest, BaseGasConsumption)
{
    instruction.opcode = WireOpCode::SET_8;
    GasTracker tracker(gas_event, instruction, instruction_info_db, context, range_check);

    // Test base gas consumption (no dynamic gas factor).
    uint32_t l2_gas_used = AVM_SET_BASE_L2_GAS + compute_addressing_gas(instruction.indirect);
    EXPECT_CALL(context, get_gas_used);
    EXPECT_CALL(context, get_gas_limit);
    EXPECT_CALL(context, set_gas_used(Gas{ l2_gas_used, 0 }));

    EXPECT_CALL(range_check, assert_range(1000 - l2_gas_used, 64));
    EXPECT_CALL(range_check, assert_range(500, 64));

    tracker.consume_gas();

    EXPECT_EQ(gas_event,
              (GasEvent{
                  .addressing_gas = 0,
                  .dynamic_gas_factor = Gas{ 0, 0 },
                  .limit_used_l2_comparison_witness = 1000 - l2_gas_used,
                  .limit_used_da_comparison_witness = 500,
                  .oog_l2 = false,
                  .oog_da = false,
              }));
}

TEST_F(GasTrackerTest, AddressingGasConsumption)
{
    instruction.opcode = WireOpCode::SET_8;
    // Indirect and relative
    instruction.indirect = 0b11;
    GasTracker tracker(gas_event, instruction, instruction_info_db, context, range_check);

    // Test base gas consumption
    uint32_t l2_gas_used = AVM_SET_BASE_L2_GAS + compute_addressing_gas(instruction.indirect);
    EXPECT_CALL(context, get_gas_used);
    EXPECT_CALL(context, get_gas_limit);
    EXPECT_CALL(context, set_gas_used(Gas{ l2_gas_used, 0 }));

    EXPECT_CALL(range_check, assert_range(1000 - l2_gas_used, 64));
    EXPECT_CALL(range_check, assert_range(500, 64));

    tracker.consume_gas();

    EXPECT_EQ(gas_event,
              (GasEvent{
                  .addressing_gas = compute_addressing_gas(instruction.indirect),
                  .dynamic_gas_factor = Gas{ 0, 0 },
                  .limit_used_l2_comparison_witness = 1000 - l2_gas_used,
                  .limit_used_da_comparison_witness = 500,
                  .oog_l2 = false,
                  .oog_da = false,
              }));
}

TEST_F(GasTrackerTest, OutOfGasBase)
{
    instruction.opcode = WireOpCode::SET_8;
    GasTracker tracker(gas_event, instruction, instruction_info_db, context, range_check);

    // Set up context to be near gas limit
    EXPECT_CALL(context, get_gas_used).WillOnce(Return(Gas{ 999, 450 }));
    EXPECT_CALL(context, get_gas_limit).WillOnce(Return(Gas{ 1000, 500 }));
    uint32_t opcode_l2_gas = AVM_SET_BASE_L2_GAS + compute_addressing_gas(instruction.indirect);
    // No call to set_gas_used in the tracker.

    EXPECT_CALL(range_check, assert_range((999 + opcode_l2_gas) - 1000 - 1, 64));
    EXPECT_CALL(range_check, assert_range(500 - 450, 64));

    EXPECT_THROW_WITH_MESSAGE(tracker.consume_gas(), "(base)");

    EXPECT_EQ(gas_event,
              (GasEvent{
                  .addressing_gas = 0,
                  .dynamic_gas_factor = Gas{ 0, 0 },
                  .limit_used_l2_comparison_witness = (999 + opcode_l2_gas) - 1000 - 1,
                  .limit_used_da_comparison_witness = 500 - 450,
                  .oog_l2 = true,
                  .oog_da = false,
              }));
}

TEST_F(GasTrackerTest, DynamicGasConsumption)
{
    instruction.opcode = WireOpCode::CALLDATACOPY;
    GasTracker tracker(gas_event, instruction, instruction_info_db, context, range_check);

    EXPECT_CALL(context, get_gas_used);
    EXPECT_CALL(context, get_gas_limit);
    uint32_t l2_base_gas = AVM_SET_BASE_L2_GAS + compute_addressing_gas(instruction.indirect);
    uint32_t l2_dyn_computation = AVM_CALLDATACOPY_DYN_L2_GAS * 10;
    EXPECT_CALL(context, set_gas_used(Gas{ l2_base_gas + l2_dyn_computation, 0 }));

    EXPECT_CALL(range_check, assert_range(1000 - (l2_base_gas + l2_dyn_computation), 64));
    EXPECT_CALL(range_check, assert_range(500, 64));

    tracker.consume_gas(Gas{ 10, 0 });

    EXPECT_EQ(gas_event,
              (GasEvent{
                  .addressing_gas = compute_addressing_gas(instruction.indirect),
                  .dynamic_gas_factor = Gas{ 10, 0 },
                  .limit_used_l2_comparison_witness = 1000 - (l2_base_gas + l2_dyn_computation),
                  .limit_used_da_comparison_witness = 500,
                  .oog_l2 = false,
                  .oog_da = false,
              }));
}

TEST_F(GasTrackerTest, OutOfGasDynamicPhase)
{
    instruction.opcode = WireOpCode::CALLDATACOPY;
    GasTracker tracker(gas_event, instruction, instruction_info_db, context, range_check);

    uint32_t l2_gas_limit = 1000;
    uint32_t l2_gas_used_start = l2_gas_limit - AVM_CALLDATACOPY_BASE_L2_GAS - 50;
    EXPECT_CALL(context, get_gas_used).WillOnce(Return(Gas{ l2_gas_used_start, 0 }));
    EXPECT_CALL(context, get_gas_limit).WillOnce(Return(Gas{ l2_gas_limit, 500 }));

    uint32_t l2_base_gas = AVM_CALLDATACOPY_BASE_L2_GAS + compute_addressing_gas(instruction.indirect);
    uint32_t l2_dyn_computation = AVM_CALLDATACOPY_DYN_L2_GAS * 100;
    EXPECT_CALL(range_check,
                assert_range((l2_base_gas + l2_dyn_computation + l2_gas_used_start) - l2_gas_limit - 1, 64));
    EXPECT_CALL(range_check, assert_range(500, 64));

    // This should throw because total gas exceeds limit.
    EXPECT_THROW_WITH_MESSAGE(tracker.consume_gas(Gas{ 100, 0 }), "(dynamic)");

    EXPECT_EQ(gas_event,
              (GasEvent{
                  .addressing_gas = 0,
                  .dynamic_gas_factor = Gas{ 100, 0 },
                  .limit_used_l2_comparison_witness =
                      (l2_base_gas + l2_dyn_computation + l2_gas_used_start) - l2_gas_limit - 1,
                  .limit_used_da_comparison_witness = 500,
                  .oog_l2 = true,
                  .oog_da = false,
              }));
}

TEST_F(GasTrackerTest, OutOfGasBothPhases)
{
    // The objective of this test is to check that the event is properly formed for the case
    // where we would run out of gas due to base gas, but we would also run out of gas due to
    // dynamic gas, independently, if we carried on.
    instruction.opcode = WireOpCode::CALLDATACOPY;
    GasTracker tracker(gas_event, instruction, instruction_info_db, context, range_check);

    uint32_t l2_gas_limit = 1000;
    uint32_t l2_gas_used_start = l2_gas_limit - 1; // will be surpased by base gas.
    EXPECT_CALL(context, get_gas_used).WillOnce(Return(Gas{ l2_gas_used_start, 0 }));
    EXPECT_CALL(context, get_gas_limit).WillOnce(Return(Gas{ l2_gas_limit, 500 }));

    uint32_t l2_base_gas = AVM_CALLDATACOPY_BASE_L2_GAS + compute_addressing_gas(instruction.indirect);
    uint32_t l2_dyn_computation = AVM_CALLDATACOPY_DYN_L2_GAS * 100;
    EXPECT_CALL(range_check,
                assert_range((l2_base_gas + l2_dyn_computation + l2_gas_used_start) - l2_gas_limit - 1, 64));
    EXPECT_CALL(range_check, assert_range(500, 64));

    // This should throw because total gas exceeds limit.
    EXPECT_THROW_WITH_MESSAGE(tracker.consume_gas(Gas{ 100, 0 }), "(base)");

    EXPECT_EQ(gas_event,
              (GasEvent{
                  .addressing_gas = 0,
                  .dynamic_gas_factor = Gas{ 100, 0 },
                  .limit_used_l2_comparison_witness =
                      (l2_base_gas + l2_dyn_computation + l2_gas_used_start) - l2_gas_limit - 1,
                  .limit_used_da_comparison_witness = 500,
                  .oog_l2 = true,
                  .oog_da = false,
              }));
}

TEST_F(GasTrackerTest, OutOfGasBasePhaseWithOverflow)
{
    instruction.opcode = WireOpCode::SET_8;

    constexpr uint32_t uint32_max = std::numeric_limits<uint32_t>::max();
    constexpr uint32_t gas_limit = uint32_max;
    constexpr uint32_t prev_gas_used = uint32_max;

    GasTracker tracker(gas_event, instruction, instruction_info_db, context, range_check);

    EXPECT_CALL(context, get_gas_used).WillOnce(Return(Gas{ prev_gas_used, 0 }));
    EXPECT_CALL(context, get_gas_limit).WillOnce(Return(Gas{ gas_limit, gas_limit }));

    uint32_t l2_opcode_gas = AVM_SET_BASE_L2_GAS + compute_addressing_gas(instruction.indirect);
    EXPECT_CALL(range_check, assert_range(prev_gas_used + l2_opcode_gas - gas_limit - 1, 64)); // L2 OOG.
    EXPECT_CALL(range_check, assert_range(gas_limit, 64));                                     // DA not OOG.

    EXPECT_THROW_WITH_MESSAGE(tracker.consume_gas(), "(base)");

    EXPECT_EQ(gas_event,
              (GasEvent{
                  .addressing_gas = 0,
                  .dynamic_gas_factor = Gas{ 0, 0 },
                  .limit_used_l2_comparison_witness = prev_gas_used + l2_opcode_gas - gas_limit - 1,
                  .limit_used_da_comparison_witness = gas_limit,
                  .oog_l2 = true,
                  .oog_da = false,
              }));
}

TEST_F(GasTrackerTest, OutOfGasDynamicPhaseWithOverflow)
{
    instruction.opcode = WireOpCode::CALLDATACOPY;

    constexpr uint32_t uint32_max = std::numeric_limits<uint32_t>::max();
    uint32_t gas_limit = uint32_max;
    uint32_t prev_gas_used = uint32_max - AVM_CALLDATACOPY_BASE_L2_GAS - /*some buffer*/ 50;
    uint32_t gas_factor = uint32_max;

    GasTracker tracker(gas_event, instruction, instruction_info_db, context, range_check);

    EXPECT_CALL(context, get_gas_used).WillOnce(Return(Gas{ prev_gas_used, 0 }));
    EXPECT_CALL(context, get_gas_limit).WillOnce(Return(Gas{ gas_limit, gas_limit }));

    uint32_t l2_base_opcode_gas = AVM_CALLDATACOPY_BASE_L2_GAS + compute_addressing_gas(instruction.indirect);
    uint64_t l2_dyn_computation = static_cast<uint64_t>(AVM_CALLDATACOPY_DYN_L2_GAS) * gas_factor;
    EXPECT_CALL(range_check,
                assert_range(prev_gas_used + l2_base_opcode_gas + l2_dyn_computation - gas_limit - 1, 64)); // L2 OOG.
    EXPECT_CALL(range_check, assert_range(gas_limit, 64)); // DA not OOG.

    EXPECT_THROW_WITH_MESSAGE(tracker.consume_gas(Gas{ gas_factor, 0 }), "(dynamic)");

    EXPECT_EQ(
        gas_event,
        (GasEvent{
            .addressing_gas = 0,
            .dynamic_gas_factor = Gas{ gas_factor, 0 },
            .limit_used_l2_comparison_witness = prev_gas_used + l2_base_opcode_gas + l2_dyn_computation - gas_limit - 1,
            .limit_used_da_comparison_witness = gas_limit,
            .oog_l2 = true,
            .oog_da = false,
        }));
}

TEST_F(GasTrackerTest, GasLimitForCall)
{
    instruction.opcode = WireOpCode::CALL;
    GasTracker tracker(gas_event, instruction, instruction_info_db, context, range_check);
    Gas gas_left = Gas{ 500, 200 };
    Gas allocated_gas = Gas{ 100, 150 };

    EXPECT_CALL(context, gas_left()).WillOnce(Return(gas_left));

    EXPECT_CALL(range_check, assert_range(gas_left.l2Gas - allocated_gas.l2Gas - 1, 32));
    EXPECT_CALL(range_check, assert_range(gas_left.daGas - allocated_gas.daGas - 1, 32));
    EXPECT_EQ(tracker.compute_gas_limit_for_call(allocated_gas), allocated_gas);
}

TEST_F(GasTrackerTest, GasLimitForCallClamping)
{
    instruction.opcode = WireOpCode::CALL;
    GasTracker tracker(gas_event, instruction, instruction_info_db, context, range_check);
    Gas gas_left = Gas{ 500, 200 };
    Gas allocated_gas = Gas{ 1000, 100 };
    Gas clamped_gas = Gas{ 500, 100 };

    EXPECT_CALL(context, gas_left()).WillOnce(Return(gas_left));

    EXPECT_CALL(range_check, assert_range(allocated_gas.l2Gas - gas_left.l2Gas, 32));
    EXPECT_CALL(range_check, assert_range(gas_left.daGas - allocated_gas.daGas - 1, 32));
    EXPECT_EQ(tracker.compute_gas_limit_for_call(allocated_gas), clamped_gas);
}

} // namespace
} // namespace bb::avm2::simulation
