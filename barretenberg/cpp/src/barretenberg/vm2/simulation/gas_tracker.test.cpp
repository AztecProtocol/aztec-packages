#include "barretenberg/vm2/simulation/gas_tracker.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/gas.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/simulation/events/gas_event.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"

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
    Instruction instruction;
};

TEST_F(GasTrackerTest, BaseGasConsumption)
{
    instruction.opcode = WireOpCode::SET_8;
    GasTracker tracker(instruction_info_db, context, instruction);

    // Test base gas consumption
    EXPECT_CALL(context, get_gas_used());
    EXPECT_CALL(context, get_gas_limit());
    EXPECT_CALL(context, set_gas_used(Gas{ AVM_SET_BASE_L2_GAS, 0 }));

    tracker.consume_base_gas();
}

TEST_F(GasTrackerTest, AddressingGasConsumption)
{
    instruction.opcode = WireOpCode::SET_8;
    // Indirect and relative
    instruction.indirect = 0b11;
    GasTracker tracker(instruction_info_db, context, instruction);

    // Test base gas consumption
    EXPECT_CALL(context, get_gas_used());
    EXPECT_CALL(context, get_gas_limit());
    EXPECT_CALL(context, set_gas_used(Gas{ AVM_SET_BASE_L2_GAS + compute_addressing_gas(instruction.indirect), 0 }));

    tracker.consume_base_gas();
}

TEST_F(GasTrackerTest, OutOfGasBase)
{
    instruction.opcode = WireOpCode::SET_8;
    GasTracker tracker(instruction_info_db, context, instruction);

    // Set up context to be near gas limit
    EXPECT_CALL(context, get_gas_used()).WillOnce(testing::Return(Gas{ 999, 450 }));
    EXPECT_CALL(context, get_gas_limit()).WillOnce(testing::Return(Gas{ 1000, 500 }));
    EXPECT_CALL(context, set_gas_used(Gas{ 1000, 500 }));

    EXPECT_THROW(tracker.consume_base_gas(), OutOfGasException);
}

TEST_F(GasTrackerTest, DynamicGasConsumption)
{
    instruction.opcode = WireOpCode::CALLDATACOPY;
    GasTracker tracker(instruction_info_db, context, instruction);

    EXPECT_CALL(context, get_gas_used());
    EXPECT_CALL(context, get_gas_limit());
    EXPECT_CALL(context, set_gas_used(Gas{ AVM_CALLDATACOPY_DYN_L2_GAS * 10, 0 }));

    tracker.consume_dynamic_gas(Gas{ 10, 0 });
}

TEST_F(GasTrackerTest, OutOfGasDynamicPhase)
{
    instruction.opcode = WireOpCode::CALLDATACOPY;
    GasTracker tracker(instruction_info_db, context, instruction);

    EXPECT_CALL(context, get_gas_used()).WillOnce(testing::Return(Gas{ 999, 450 }));
    EXPECT_CALL(context, get_gas_limit()).WillOnce(testing::Return(Gas{ 1000, 500 }));
    EXPECT_CALL(context, set_gas_used(Gas{ 1000, 500 }));

    EXPECT_THROW(tracker.consume_dynamic_gas(Gas{ 10, 0 }), OutOfGasException);
}

TEST_F(GasTrackerTest, GasEvent)
{
    instruction.opcode = WireOpCode::CALLDATACOPY;
    instruction.indirect = 0b111111; // All direct and relative

    EXPECT_CALL(context, get_gas_used());
    EXPECT_CALL(context, get_gas_limit());
    EXPECT_CALL(context,
                set_gas_used(Gas{ AVM_CALLDATACOPY_BASE_L2_GAS + compute_addressing_gas(instruction.indirect), 0 }));

    GasTracker tracker(instruction_info_db, context, instruction);
    tracker.consume_base_gas();

    EXPECT_CALL(context, get_gas_used())
        .WillOnce(
            testing::Return(Gas{ AVM_CALLDATACOPY_BASE_L2_GAS + compute_addressing_gas(instruction.indirect), 0 }));
    EXPECT_CALL(context, get_gas_limit());
    EXPECT_CALL(context,
                set_gas_used(Gas{ AVM_CALLDATACOPY_BASE_L2_GAS + compute_addressing_gas(instruction.indirect) +
                                      AVM_CALLDATACOPY_DYN_L2_GAS * 10,
                                  0 }));

    tracker.consume_dynamic_gas(Gas{ 10, 0 });

    EXPECT_EQ(tracker.finish(),
              (GasEvent{
                  .prev_gas_used = (Gas{ 0, 0 }),
                  .opcode_gas = AVM_CALLDATACOPY_BASE_L2_GAS,
                  .addressing_gas = compute_addressing_gas(instruction.indirect),
                  .base_gas = (Gas{ AVM_CALLDATACOPY_BASE_L2_GAS + compute_addressing_gas(instruction.indirect), 0 }),
                  .dynamic_gas_factor = (Gas{ 10, 0 }),
                  .dynamic_gas = (Gas{ AVM_CALLDATACOPY_DYN_L2_GAS * 10, 0 }),
                  .oog_l2_base = false,
                  .oog_da_base = false,
                  .oog_l2_dynamic = false,
                  .oog_da_dynamic = false,
              }));
}

} // namespace
} // namespace bb::avm2::simulation
