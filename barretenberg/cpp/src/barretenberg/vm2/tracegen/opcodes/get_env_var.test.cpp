#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using ::bb::avm2::testing::InstructionBuilder;
using enum ::bb::avm2::WireOpCode;

using ::testing::AllOf;
using ::testing::ElementsAre;

class GetEnvVarTracegenTest : public ::testing::Test {
  protected:
    void SetUp() override
    {
        trace_container = std::make_unique<TestTraceContainer>();
        builder = std::make_unique<ExecutionTraceBuilder>();
    }

    std::unique_ptr<TestTraceContainer> trace_container;
    std::unique_ptr<ExecutionTraceBuilder> builder;
};

// Helper function to create a GETENVVAR instruction
simulation::Instruction create_getenvvar_instruction(uint8_t env_var_enum)
{
    return InstructionBuilder(WireOpCode::GETENVVAR_16)
        .operand<uint8_t>(0)            // indirect
        .operand<uint16_t>(0)           // dst_offset
        .operand<uint8_t>(env_var_enum) // env var enum
        .build();
}

TEST_F(GetEnvVarTracegenTest, AddressEnvironmentVariable)
{
    // Test ADDRESS environment variable (enum value 0)
    const auto instruction = create_getenvvar_instruction(static_cast<uint8_t>(EnvironmentVariable::ADDRESS));

    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(ValueTag::U8, 0) }; // enum value

    builder->process_get_env_var_opcode(inputs, *trace_container, 1);

    const auto rows = trace_container->as_rows();
    ASSERT_GE(rows.size(), 2);

    const auto& row = rows[1];
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 0); // No PI lookup for ADDRESS
    EXPECT_EQ(row.execution_envvar_pi_row_idx, 0);    // No PI row for ADDRESS
    EXPECT_EQ(row.execution_is_address, 1);           // Should be set
    EXPECT_EQ(row.execution_is_sender, 0);
    EXPECT_EQ(row.execution_is_transactionfee, 0);
    EXPECT_EQ(row.execution_is_feeperl2gas, 0);
    EXPECT_EQ(row.execution_is_isstaticcall, 0);
    EXPECT_EQ(row.execution_is_l2gasleft, 0);
    EXPECT_EQ(row.execution_is_dagasleft, 0);
}

TEST_F(GetEnvVarTracegenTest, SenderEnvironmentVariable)
{
    // Test SENDER environment variable (enum value 1)
    const auto instruction = create_getenvvar_instruction(static_cast<uint8_t>(EnvironmentVariable::SENDER));

    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(ValueTag::U8, 1) }; // enum value

    builder->process_get_env_var_opcode(inputs, *trace_container, 1);

    const auto rows = trace_container->as_rows();
    ASSERT_GE(rows.size(), 2);

    const auto& row = rows[1];
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 0); // No PI lookup for SENDER
    EXPECT_EQ(row.execution_envvar_pi_row_idx, 0);    // No PI row for SENDER
    EXPECT_EQ(row.execution_is_address, 0);
    EXPECT_EQ(row.execution_is_sender, 1); // Should be set
    EXPECT_EQ(row.execution_is_transactionfee, 0);
    EXPECT_EQ(row.execution_is_feeperl2gas, 0);
    EXPECT_EQ(row.execution_is_isstaticcall, 0);
    EXPECT_EQ(row.execution_is_l2gasleft, 0);
    EXPECT_EQ(row.execution_is_dagasleft, 0);
}

TEST_F(GetEnvVarTracegenTest, TransactionFeeEnvironmentVariable)
{
    // Test TRANSACTIONFEE environment variable (enum value 2)
    const auto instruction = create_getenvvar_instruction(static_cast<uint8_t>(EnvironmentVariable::TRANSACTIONFEE));

    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(ValueTag::U8, 2) }; // enum value

    builder->process_get_env_var_opcode(inputs, *trace_container, 1);

    const auto rows = trace_container->as_rows();
    ASSERT_GE(rows.size(), 2);

    const auto& row = rows[1];
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 0); // No PI lookup for TRANSACTIONFEE
    EXPECT_EQ(row.execution_envvar_pi_row_idx, 0);    // No PI row for TRANSACTIONFEE
    EXPECT_EQ(row.execution_is_address, 0);
    EXPECT_EQ(row.execution_is_sender, 0);
    EXPECT_EQ(row.execution_is_transactionfee, 1); // Should be set
    EXPECT_EQ(row.execution_is_feeperl2gas, 0);
    EXPECT_EQ(row.execution_is_isstaticcall, 0);
    EXPECT_EQ(row.execution_is_l2gasleft, 0);
    EXPECT_EQ(row.execution_is_dagasleft, 0);
}

TEST_F(GetEnvVarTracegenTest, ChainIdEnvironmentVariable)
{
    // Test CHAINID environment variable (enum value 3) - requires PI lookup
    const auto instruction = create_getenvvar_instruction(static_cast<uint8_t>(EnvironmentVariable::CHAINID));

    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(ValueTag::U8, 3) }; // enum value

    builder->process_get_env_var_opcode(inputs, *trace_container, 1);

    const auto rows = trace_container->as_rows();
    ASSERT_GE(rows.size(), 2);

    const auto& row = rows[1];
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 1); // PI lookup required
    EXPECT_EQ(row.execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX);
    EXPECT_EQ(row.execution_is_address, 0);
    EXPECT_EQ(row.execution_is_sender, 0);
    EXPECT_EQ(row.execution_is_transactionfee, 0);
    EXPECT_EQ(row.execution_is_feeperl2gas, 0); // Not feePerL2Gas
    EXPECT_EQ(row.execution_is_isstaticcall, 0);
    EXPECT_EQ(row.execution_is_l2gasleft, 0);
    EXPECT_EQ(row.execution_is_dagasleft, 0);
}

TEST_F(GetEnvVarTracegenTest, VersionEnvironmentVariable)
{
    // Test VERSION environment variable (enum value 4) - requires PI lookup
    const auto instruction = create_getenvvar_instruction(static_cast<uint8_t>(EnvironmentVariable::VERSION));

    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(ValueTag::U8, 4) }; // enum value

    builder->process_get_env_var_opcode(inputs, *trace_container, 1);

    const auto rows = trace_container->as_rows();
    ASSERT_GE(rows.size(), 2);

    const auto& row = rows[1];
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 1); // PI lookup required
    EXPECT_EQ(row.execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_VERSION_ROW_IDX);
    EXPECT_EQ(row.execution_is_address, 0);
    EXPECT_EQ(row.execution_is_sender, 0);
    EXPECT_EQ(row.execution_is_transactionfee, 0);
    EXPECT_EQ(row.execution_is_feeperl2gas, 0); // Not feePerL2Gas
    EXPECT_EQ(row.execution_is_isstaticcall, 0);
    EXPECT_EQ(row.execution_is_l2gasleft, 0);
    EXPECT_EQ(row.execution_is_dagasleft, 0);
}

TEST_F(GetEnvVarTracegenTest, BlockNumberEnvironmentVariable)
{
    // Test BLOCKNUMBER environment variable (enum value 5) - requires PI lookup
    const auto instruction = create_getenvvar_instruction(static_cast<uint8_t>(EnvironmentVariable::BLOCKNUMBER));

    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(ValueTag::U8, 5) }; // enum value

    builder->process_get_env_var_opcode(inputs, *trace_container, 1);

    const auto rows = trace_container->as_rows();
    ASSERT_GE(rows.size(), 2);

    const auto& row = rows[1];
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 1); // PI lookup required
    EXPECT_EQ(row.execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX);
    EXPECT_EQ(row.execution_is_address, 0);
    EXPECT_EQ(row.execution_is_sender, 0);
    EXPECT_EQ(row.execution_is_transactionfee, 0);
    EXPECT_EQ(row.execution_is_feeperl2gas, 0); // Not feePerL2Gas
    EXPECT_EQ(row.execution_is_isstaticcall, 0);
    EXPECT_EQ(row.execution_is_l2gasleft, 0);
    EXPECT_EQ(row.execution_is_dagasleft, 0);
}

TEST_F(GetEnvVarTracegenTest, TimestampEnvironmentVariable)
{
    // Test TIMESTAMP environment variable (enum value 6) - requires PI lookup
    const auto instruction = create_getenvvar_instruction(static_cast<uint8_t>(EnvironmentVariable::TIMESTAMP));

    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(ValueTag::U8, 6) }; // enum value

    builder->process_get_env_var_opcode(inputs, *trace_container, 1);

    const auto rows = trace_container->as_rows();
    ASSERT_GE(rows.size(), 2);

    const auto& row = rows[1];
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 1); // PI lookup required
    EXPECT_EQ(row.execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX);
    EXPECT_EQ(row.execution_is_address, 0);
    EXPECT_EQ(row.execution_is_sender, 0);
    EXPECT_EQ(row.execution_is_transactionfee, 0);
    EXPECT_EQ(row.execution_is_feeperl2gas, 0); // Not feePerL2Gas
    EXPECT_EQ(row.execution_is_isstaticcall, 0);
    EXPECT_EQ(row.execution_is_l2gasleft, 0);
    EXPECT_EQ(row.execution_is_dagasleft, 0);
}

TEST_F(GetEnvVarTracegenTest, FeePerL2GasEnvironmentVariable)
{
    // Test FEEPERL2GAS environment variable (enum value 7) - requires PI lookup, special case
    const auto instruction = create_getenvvar_instruction(static_cast<uint8_t>(EnvironmentVariable::FEEPERL2GAS));

    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(ValueTag::U8, 7) }; // enum value

    builder->process_get_env_var_opcode(inputs, *trace_container, 1);

    const auto rows = trace_container->as_rows();
    ASSERT_GE(rows.size(), 2);

    const auto& row = rows[1];
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 1); // PI lookup required
    EXPECT_EQ(row.execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX);
    EXPECT_EQ(row.execution_is_address, 0);
    EXPECT_EQ(row.execution_is_sender, 0);
    EXPECT_EQ(row.execution_is_transactionfee, 0);
    EXPECT_EQ(row.execution_is_feeperl2gas, 1); // Special case: uses PI col1
    EXPECT_EQ(row.execution_is_isstaticcall, 0);
    EXPECT_EQ(row.execution_is_l2gasleft, 0);
    EXPECT_EQ(row.execution_is_dagasleft, 0);
}

TEST_F(GetEnvVarTracegenTest, FeePerDaGasEnvironmentVariable)
{
    // Test FEEPERDAGAS environment variable (enum value 8) - requires PI lookup
    const auto instruction = create_getenvvar_instruction(static_cast<uint8_t>(EnvironmentVariable::FEEPERDAGAS));

    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(ValueTag::U8, 8) }; // enum value

    builder->process_get_env_var_opcode(inputs, *trace_container, 1);

    const auto rows = trace_container->as_rows();
    ASSERT_GE(rows.size(), 2);

    const auto& row = rows[1];
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 1); // PI lookup required
    EXPECT_EQ(row.execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX);
    EXPECT_EQ(row.execution_is_address, 0);
    EXPECT_EQ(row.execution_is_sender, 0);
    EXPECT_EQ(row.execution_is_transactionfee, 0);
    EXPECT_EQ(row.execution_is_feeperl2gas, 0); // Uses PI col0, not col1
    EXPECT_EQ(row.execution_is_isstaticcall, 0);
    EXPECT_EQ(row.execution_is_l2gasleft, 0);
    EXPECT_EQ(row.execution_is_dagasleft, 0);
}

TEST_F(GetEnvVarTracegenTest, IsStaticCallEnvironmentVariable)
{
    // Test ISSTATICCALL environment variable (enum value 9)
    const auto instruction = create_getenvvar_instruction(static_cast<uint8_t>(EnvironmentVariable::ISSTATICCALL));

    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(ValueTag::U8, 9) }; // enum value

    builder->process_get_env_var_opcode(inputs, *trace_container, 1);

    const auto rows = trace_container->as_rows();
    ASSERT_GE(rows.size(), 2);

    const auto& row = rows[1];
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 0); // No PI lookup for ISSTATICCALL
    EXPECT_EQ(row.execution_envvar_pi_row_idx, 0);    // No PI row for ISSTATICCALL
    EXPECT_EQ(row.execution_is_address, 0);
    EXPECT_EQ(row.execution_is_sender, 0);
    EXPECT_EQ(row.execution_is_transactionfee, 0);
    EXPECT_EQ(row.execution_is_feeperl2gas, 0);
    EXPECT_EQ(row.execution_is_isstaticcall, 1); // Should be set
    EXPECT_EQ(row.execution_is_l2gasleft, 0);
    EXPECT_EQ(row.execution_is_dagasleft, 0);
}

TEST_F(GetEnvVarTracegenTest, L2GasLeftEnvironmentVariable)
{
    // Test L2GASLEFT environment variable (enum value 10)
    const auto instruction = create_getenvvar_instruction(static_cast<uint8_t>(EnvironmentVariable::L2GASLEFT));

    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(ValueTag::U8, 10) }; // enum value

    builder->process_get_env_var_opcode(inputs, *trace_container, 1);

    const auto rows = trace_container->as_rows();
    ASSERT_GE(rows.size(), 2);

    const auto& row = rows[1];
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 0); // No PI lookup for L2GASLEFT
    EXPECT_EQ(row.execution_envvar_pi_row_idx, 0);    // No PI row for L2GASLEFT
    EXPECT_EQ(row.execution_is_address, 0);
    EXPECT_EQ(row.execution_is_sender, 0);
    EXPECT_EQ(row.execution_is_transactionfee, 0);
    EXPECT_EQ(row.execution_is_feeperl2gas, 0);
    EXPECT_EQ(row.execution_is_isstaticcall, 0);
    EXPECT_EQ(row.execution_is_l2gasleft, 1); // Should be set
    EXPECT_EQ(row.execution_is_dagasleft, 0);
}

TEST_F(GetEnvVarTracegenTest, DaGasLeftEnvironmentVariable)
{
    // Test DAGASLEFT environment variable (enum value 11)
    const auto instruction = create_getenvvar_instruction(static_cast<uint8_t>(EnvironmentVariable::DAGASLEFT));

    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(ValueTag::U8, 11) }; // enum value

    builder->process_get_env_var_opcode(inputs, *trace_container, 1);

    const auto rows = trace_container->as_rows();
    ASSERT_GE(rows.size(), 2);

    const auto& row = rows[1];
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 0); // No PI lookup for DAGASLEFT
    EXPECT_EQ(row.execution_envvar_pi_row_idx, 0);    // No PI row for DAGASLEFT
    EXPECT_EQ(row.execution_is_address, 0);
    EXPECT_EQ(row.execution_is_sender, 0);
    EXPECT_EQ(row.execution_is_transactionfee, 0);
    EXPECT_EQ(row.execution_is_feeperl2gas, 0);
    EXPECT_EQ(row.execution_is_isstaticcall, 0);
    EXPECT_EQ(row.execution_is_l2gasleft, 0);
    EXPECT_EQ(row.execution_is_dagasleft, 1); // Should be set
}

// TEST_F(GetEnvVarTracegenTest, InvalidEnvironmentVariableEnum)
//{
//     // Test invalid environment variable enum (value > 11)
//     const uint8_t invalid_enum = 255;
//     const auto instruction = create_getenvvar_instruction(invalid_enum);
//
//     std::vector<TaggedValue> inputs = { TaggedValue::from_tag(ValueTag::U8, invalid_enum) };
//
//     builder->process_get_env_var_opcode(inputs, *trace_container, 1);
//
//     const auto rows = trace_container->as_rows();
//     ASSERT_GE(rows.size(), 2);
//
//     const auto& row = rows[1];
//     // For invalid enum, all flags should be 0
//     EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 0);
//     EXPECT_EQ(row.execution_envvar_pi_row_idx, 0);
//     EXPECT_EQ(row.execution_is_address, 0);
//     EXPECT_EQ(row.execution_is_sender, 0);
//     EXPECT_EQ(row.execution_is_transactionfee, 0);
//     EXPECT_EQ(row.execution_is_feeperl2gas, 0);
//     EXPECT_EQ(row.execution_is_isstaticcall, 0);
//     EXPECT_EQ(row.execution_is_l2gasleft, 0);
//     EXPECT_EQ(row.execution_is_dagasleft, 0);
// }
//
// TEST_F(GetEnvVarTracegenTest, BoundaryValueEnvironmentVariableEnums)
//{
//     // Test boundary values: valid max enum (11) and invalid min above max (12)
//
//     // Test valid max enum (DAGASLEFT = 11)
//     std::vector<TaggedValue> valid_inputs = { TaggedValue::from_tag(ValueTag::U8, 11) };
//     builder->process_get_env_var_opcode(valid_inputs, *trace_container, 1);
//
//     auto rows = trace_container->as_rows();
//     ASSERT_GE(rows.size(), 2);
//
//     auto& row = rows[1];
//     EXPECT_EQ(row.execution_is_dagasleft, 1); // Should be valid
//
//     // Clear trace for next test
//     trace_container = std::make_unique<TestTraceContainer>();
//
//     // Test invalid enum just above max (12)
//     std::vector<TaggedValue> invalid_inputs = { TaggedValue::from_tag(ValueTag::U8, 12) };
//     builder->process_get_env_var_opcode(invalid_inputs, *trace_container, 1);
//
//     rows = trace_container->as_rows();
//     ASSERT_GE(rows.size(), 2);
//
//     row = rows[1];
//     // All flags should be 0 for invalid enum
//     EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 0);
//     EXPECT_EQ(row.execution_is_address, 0);
//     EXPECT_EQ(row.execution_is_sender, 0);
//     EXPECT_EQ(row.execution_is_transactionfee, 0);
//     EXPECT_EQ(row.execution_is_feeperl2gas, 0);
//     EXPECT_EQ(row.execution_is_isstaticcall, 0);
//     EXPECT_EQ(row.execution_is_l2gasleft, 0);
//     EXPECT_EQ(row.execution_is_dagasleft, 0);
// }
//
// TEST_F(GetEnvVarTracegenTest, PublicInputsLookupVariables)
//{
//     // Test all variables that require public inputs lookup
//     std::vector<std::pair<EnvironmentVariable, uint32_t>> pi_lookup_vars = {
//         { EnvironmentVariable::CHAINID, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX },
//         { EnvironmentVariable::VERSION, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_VERSION_ROW_IDX },
//         { EnvironmentVariable::BLOCKNUMBER, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX },
//         { EnvironmentVariable::TIMESTAMP, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX },
//         { EnvironmentVariable::FEEPERL2GAS, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX },
//         { EnvironmentVariable::FEEPERDAGAS, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX }
//     };
//
//     for (const auto& [env_var, expected_row_idx] : pi_lookup_vars) {
//         // Clear trace for each test
//         trace_container = std::make_unique<TestTraceContainer>();
//
//         std::vector<TaggedValue> inputs = { TaggedValue::from_tag(ValueTag::U8, static_cast<uint8_t>(env_var)) };
//         builder->process_get_env_var_opcode(inputs, *trace_container, 1);
//
//         const auto rows = trace_container->as_rows();
//         ASSERT_GE(rows.size(), 2);
//
//         const auto& row = rows[1];
//         EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 1)
//             << "PI lookup should be enabled for env var " << static_cast<int>(env_var);
//         EXPECT_EQ(row.execution_envvar_pi_row_idx, expected_row_idx)
//             << "PI row index should match for env var " << static_cast<int>(env_var);
//     }
// }
//
// TEST_F(GetEnvVarTracegenTest, NonPublicInputsLookupVariables)
//{
//     // Test all variables that do NOT require public inputs lookup
//     std::vector<EnvironmentVariable> non_pi_lookup_vars = {
//         EnvironmentVariable::ADDRESS,      EnvironmentVariable::SENDER,    EnvironmentVariable::TRANSACTIONFEE,
//         EnvironmentVariable::ISSTATICCALL, EnvironmentVariable::L2GASLEFT, EnvironmentVariable::DAGASLEFT
//     };
//
//     for (const auto& env_var : non_pi_lookup_vars) {
//         // Clear trace for each test
//         trace_container = std::make_unique<TestTraceContainer>();
//
//         std::vector<TaggedValue> inputs = { TaggedValue::from_tag(ValueTag::U8, static_cast<uint8_t>(env_var)) };
//         builder->process_get_env_var_opcode(inputs, *trace_container, 1);
//
//         const auto rows = trace_container->as_rows();
//         ASSERT_GE(rows.size(), 2);
//
//         const auto& row = rows[1];
//         EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 0)
//             << "PI lookup should NOT be enabled for env var " << static_cast<int>(env_var);
//         EXPECT_EQ(row.execution_envvar_pi_row_idx, 0)
//             << "PI row index should be 0 for env var " << static_cast<int>(env_var);
//     }
// }
//
// TEST_F(GetEnvVarTracegenTest, FeePerL2GasSpecialCase)
//{
//     // Test that FEEPERL2GAS is the only variable with is_feeperl2gas flag set
//     // This is important because it determines whether to use PI col0 or col1
//
//     // Test FEEPERL2GAS - should have is_feeperl2gas = 1
//     std::vector<TaggedValue> inputs = { TaggedValue::from_tag(ValueTag::U8,
//                                                               static_cast<uint8_t>(EnvironmentVariable::FEEPERL2GAS))
//                                                               };
//     builder->process_get_env_var_opcode(inputs, *trace_container, 1);
//
//     auto rows = trace_container->as_rows();
//     ASSERT_GE(rows.size(), 2);
//
//     auto& row = rows[1];
//     EXPECT_EQ(row.execution_is_feeperl2gas, 1);
//     EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 1); // Should still have PI lookup
//
//     // Clear trace for next test
//     trace_container = std::make_unique<TestTraceContainer>();
//
//     // Test FEEPERDAGAS - should have is_feeperl2gas = 0 (uses col0, not col1)
//     inputs = { TaggedValue::from_tag(ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::FEEPERDAGAS)) };
//     builder->process_get_env_var_opcode(inputs, *trace_container, 1);
//
//     rows = trace_container->as_rows();
//     ASSERT_GE(rows.size(), 2);
//
//     row = rows[1];
//     EXPECT_EQ(row.execution_is_feeperl2gas, 0);       // Should be 0, uses col0
//     EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 1); // Should still have PI lookup
// }
//
// TEST_F(GetEnvVarTracegenTest, MutualExclusivityOfFlags)
//{
//     // Test that exactly one flag is set for each valid environment variable
//     for (uint8_t env_var = 0; env_var <= static_cast<uint8_t>(EnvironmentVariable::DAGASLEFT); env_var++) {
//         // Clear trace for each test
//         trace_container = std::make_unique<TestTraceContainer>();
//
//         std::vector<TaggedValue> inputs = { TaggedValue::from_tag(ValueTag::U8, env_var) };
//         builder->process_get_env_var_opcode(inputs, *trace_container, 1);
//
//         const auto rows = trace_container->as_rows();
//         ASSERT_GE(rows.size(), 2);
//
//         const auto& row = rows[1];
//
//         // Count how many flags are set
//         int flag_count = 0;
//         flag_count += row.execution_is_address;
//         flag_count += row.execution_is_sender;
//         flag_count += row.execution_is_transactionfee;
//         flag_count += row.execution_is_feeperl2gas;
//         flag_count += row.execution_is_isstaticcall;
//         flag_count += row.execution_is_l2gasleft;
//         flag_count += row.execution_is_dagasleft;
//
//         // For FEEPERL2GAS, is_feeperl2gas is set but it's not one of the main env var flags
//         // The main env var flags are the context/gas flags, not the PI selection flags
//         if (env_var == static_cast<uint8_t>(EnvironmentVariable::FEEPERL2GAS)) {
//             EXPECT_EQ(flag_count, 1) << "Exactly one flag should be set for FEEPERL2GAS (is_feeperl2gas)";
//         } else if (env_var >= static_cast<uint8_t>(EnvironmentVariable::CHAINID) &&
//                    env_var <= static_cast<uint8_t>(EnvironmentVariable::FEEPERDAGAS) &&
//                    env_var != static_cast<uint8_t>(EnvironmentVariable::FEEPERL2GAS)) {
//             // For other PI lookup variables (CHAINID, VERSION, BLOCKNUMBER, TIMESTAMP, FEEPERDAGAS)
//             // none of the context/gas flags should be set
//             EXPECT_EQ(flag_count, 0) << "No context/gas flags should be set for PI lookup var "
//                                      << static_cast<int>(env_var);
//         } else {
//             // For context/gas variables (ADDRESS, SENDER, TRANSACTIONFEE, ISSTATICCALL, L2GASLEFT, DAGASLEFT)
//             EXPECT_EQ(flag_count, 1) << "Exactly one context/gas flag should be set for env var "
//                                      << static_cast<int>(env_var);
//         }
//     }
// }

} // namespace
} // namespace bb::avm2::tracegen
