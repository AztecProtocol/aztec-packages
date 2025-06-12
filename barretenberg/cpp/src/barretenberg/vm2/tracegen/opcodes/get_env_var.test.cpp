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

using enum ::bb::avm2::WireOpCode;

class GetEnvVarTracegenTest : public ::testing::Test {
  protected:
    void SetUp() override
    {
        trace = std::make_unique<TestTraceContainer>();
        builder = std::make_unique<ExecutionTraceBuilder>();
        default_output = TaggedValue::from_tag(ValueTag::FF, FF(0));
    }

    std::unique_ptr<TestTraceContainer> trace;
    std::unique_ptr<ExecutionTraceBuilder> builder;
    TaggedValue default_output;
};

TEST_F(GetEnvVarTracegenTest, AddressEnvironmentVariable)
{
    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(
        ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::ADDRESS)) }; // enum value

    builder->process_get_env_var_opcode(inputs, default_output, *trace, 0);

    const auto rows = trace->as_rows();
    ASSERT_GE(rows.size(), 1);

    const auto& row = rows[0];
    EXPECT_EQ(row.execution_sel_should_get_env_var, 1); // Should be set
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 0);   // No PI lookup
    EXPECT_EQ(row.execution_envvar_pi_row_idx, 0);      // No PI lookup
    EXPECT_EQ(row.execution_is_address, 1);             // Should be set
    EXPECT_EQ(row.execution_is_sender, 0);
    EXPECT_EQ(row.execution_is_transactionfee, 0);
    EXPECT_EQ(row.execution_is_feeperl2gas, 0);
    EXPECT_EQ(row.execution_is_isstaticcall, 0);
    EXPECT_EQ(row.execution_is_l2gasleft, 0);
    EXPECT_EQ(row.execution_is_dagasleft, 0);
}

TEST_F(GetEnvVarTracegenTest, SenderEnvironmentVariable)
{
    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(
        ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::SENDER)) }; // enum value

    builder->process_get_env_var_opcode(inputs, default_output, *trace, 0);

    const auto rows = trace->as_rows();
    ASSERT_GE(rows.size(), 1);

    const auto& row = rows[0];
    EXPECT_EQ(row.execution_sel_should_get_env_var, 1); // Should be set
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 0);   // No PI lookup
    EXPECT_EQ(row.execution_envvar_pi_row_idx, 0);      // No PI lookup
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
    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(
        ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::TRANSACTIONFEE)) }; // enum value

    builder->process_get_env_var_opcode(inputs, default_output, *trace, 0);

    const auto rows = trace->as_rows();
    ASSERT_GE(rows.size(), 1);

    const auto& row = rows[0];
    EXPECT_EQ(row.execution_sel_should_get_env_var, 1); // Should be set
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 0);   // No PI lookup
    EXPECT_EQ(row.execution_envvar_pi_row_idx, 0);      // No PI lookup
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
    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(
        ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::CHAINID)) }; // enum value

    FF chain_id = FF(42);
    TaggedValue output = TaggedValue::from_tag(ValueTag::FF, chain_id);

    builder->process_get_env_var_opcode(inputs, output, *trace, 0);

    const auto rows = trace->as_rows();
    ASSERT_GE(rows.size(), 1);

    const auto& row = rows[0];
    EXPECT_EQ(row.execution_sel_should_get_env_var, 1); // Should be set
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 1);   // PI lookup required
    EXPECT_EQ(row.execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX);
    EXPECT_EQ(row.execution_is_address, 0);
    EXPECT_EQ(row.execution_is_sender, 0);
    EXPECT_EQ(row.execution_is_transactionfee, 0);
    EXPECT_EQ(row.execution_is_feeperl2gas, 0);
    EXPECT_EQ(row.execution_is_isstaticcall, 0);
    EXPECT_EQ(row.execution_is_l2gasleft, 0);
    EXPECT_EQ(row.execution_is_dagasleft, 0);
    EXPECT_EQ(row.execution_value_from_pi_col0, chain_id);
}

TEST_F(GetEnvVarTracegenTest, VersionEnvironmentVariable)
{
    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(
        ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::VERSION)) }; // enum value

    FF version = FF(42);
    TaggedValue output = TaggedValue::from_tag(ValueTag::FF, version);

    builder->process_get_env_var_opcode(inputs, output, *trace, 0);

    const auto rows = trace->as_rows();
    ASSERT_GE(rows.size(), 1);

    const auto& row = rows[0];
    EXPECT_EQ(row.execution_sel_should_get_env_var, 1); // Should be set
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 1);   // PI lookup required
    EXPECT_EQ(row.execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_VERSION_ROW_IDX);
    EXPECT_EQ(row.execution_is_address, 0);
    EXPECT_EQ(row.execution_is_sender, 0);
    EXPECT_EQ(row.execution_is_transactionfee, 0);
    EXPECT_EQ(row.execution_is_feeperl2gas, 0);
    EXPECT_EQ(row.execution_is_isstaticcall, 0);
    EXPECT_EQ(row.execution_is_l2gasleft, 0);
    EXPECT_EQ(row.execution_is_dagasleft, 0);
    EXPECT_EQ(row.execution_value_from_pi_col0, version);
}

TEST_F(GetEnvVarTracegenTest, BlockNumberEnvironmentVariable)
{
    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(
        ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::BLOCKNUMBER)) }; // enum value

    uint32_t block_number = 42;
    TaggedValue output = TaggedValue::from_tag(ValueTag::U32, block_number);
    builder->process_get_env_var_opcode(inputs, output, *trace, 0);

    const auto rows = trace->as_rows();
    ASSERT_GE(rows.size(), 1);

    const auto& row = rows[0];
    EXPECT_EQ(row.execution_sel_should_get_env_var, 1); // Should be set
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 1);   // PI lookup required
    EXPECT_EQ(row.execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX);
    EXPECT_EQ(row.execution_is_address, 0);
    EXPECT_EQ(row.execution_is_sender, 0);
    EXPECT_EQ(row.execution_is_transactionfee, 0);
    EXPECT_EQ(row.execution_is_feeperl2gas, 0);
    EXPECT_EQ(row.execution_is_isstaticcall, 0);
    EXPECT_EQ(row.execution_is_l2gasleft, 0);
    EXPECT_EQ(row.execution_is_dagasleft, 0);
    EXPECT_EQ(row.execution_value_from_pi_col0, block_number);
}

TEST_F(GetEnvVarTracegenTest, TimestampEnvironmentVariable)
{
    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(
        ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::TIMESTAMP)) }; // enum value

    uint64_t timestamp = 42;
    TaggedValue output = TaggedValue::from_tag(ValueTag::U64, timestamp);
    builder->process_get_env_var_opcode(inputs, output, *trace, 0);

    const auto rows = trace->as_rows();
    ASSERT_GE(rows.size(), 1);

    const auto& row = rows[0];
    EXPECT_EQ(row.execution_sel_should_get_env_var, 1); // Should be set
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 1);   // PI lookup required
    EXPECT_EQ(row.execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX);
    EXPECT_EQ(row.execution_is_address, 0);
    EXPECT_EQ(row.execution_is_sender, 0);
    EXPECT_EQ(row.execution_is_transactionfee, 0);
    EXPECT_EQ(row.execution_is_feeperl2gas, 0);
    EXPECT_EQ(row.execution_is_isstaticcall, 0);
    EXPECT_EQ(row.execution_is_l2gasleft, 0);
    EXPECT_EQ(row.execution_is_dagasleft, 0);
    EXPECT_EQ(row.execution_value_from_pi_col0, timestamp);
}

TEST_F(GetEnvVarTracegenTest, FeePerL2GasEnvironmentVariable)
{
    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(
        ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::FEEPERL2GAS)) }; // enum value

    uint128_t fee_per_l2_gas = 42;
    TaggedValue output = TaggedValue::from_tag(ValueTag::U128, fee_per_l2_gas);
    builder->process_get_env_var_opcode(inputs, output, *trace, 0);

    const auto rows = trace->as_rows();
    ASSERT_GE(rows.size(), 1);

    const auto& row = rows[0];
    EXPECT_EQ(row.execution_sel_should_get_env_var, 1); // Should be set
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 1);   // PI lookup required
    EXPECT_EQ(row.execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX);
    EXPECT_EQ(row.execution_is_address, 0);
    EXPECT_EQ(row.execution_is_sender, 0);
    EXPECT_EQ(row.execution_is_transactionfee, 0);
    EXPECT_EQ(row.execution_is_feeperl2gas, 1); // Special case: uses PI col1
    EXPECT_EQ(row.execution_is_isstaticcall, 0);
    EXPECT_EQ(row.execution_is_l2gasleft, 0);
    EXPECT_EQ(row.execution_is_dagasleft, 0);
    // TODO(dbanks12): tracegen this properly...
    // EXPECT_EQ(row.execution_value_from_pi_col1, fee_per_l2_gas);
}

TEST_F(GetEnvVarTracegenTest, FeePerDaGasEnvironmentVariable)
{
    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(
        ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::FEEPERDAGAS)) }; // enum value

    uint128_t fee_per_da_gas = 42;
    TaggedValue output = TaggedValue::from_tag(ValueTag::U128, fee_per_da_gas);
    builder->process_get_env_var_opcode(inputs, output, *trace, 0);

    const auto rows = trace->as_rows();
    ASSERT_GE(rows.size(), 1);

    const auto& row = rows[0];
    EXPECT_EQ(row.execution_sel_should_get_env_var, 1); // Should be set
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 1);   // PI lookup required
    EXPECT_EQ(row.execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX);
    EXPECT_EQ(row.execution_is_address, 0);
    EXPECT_EQ(row.execution_is_sender, 0);
    EXPECT_EQ(row.execution_is_transactionfee, 0);
    EXPECT_EQ(row.execution_is_feeperl2gas, 0); // Uses PI col0, not col1
    EXPECT_EQ(row.execution_is_isstaticcall, 0);
    EXPECT_EQ(row.execution_is_l2gasleft, 0);
    EXPECT_EQ(row.execution_is_dagasleft, 0);
    EXPECT_EQ(row.execution_value_from_pi_col0, fee_per_da_gas);
}

TEST_F(GetEnvVarTracegenTest, IsStaticCallEnvironmentVariable)
{
    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(
        ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::ISSTATICCALL)) }; // enum value

    builder->process_get_env_var_opcode(inputs, default_output, *trace, 0);

    const auto rows = trace->as_rows();

    const auto& row = rows[0];
    EXPECT_EQ(row.execution_sel_should_get_env_var, 1); // Should be set
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 0);   // No PI lookup
    EXPECT_EQ(row.execution_envvar_pi_row_idx, 0);      // No PI lookup
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
    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(
        ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::L2GASLEFT)) }; // enum value

    builder->process_get_env_var_opcode(inputs, default_output, *trace, 0);

    const auto rows = trace->as_rows();
    ASSERT_GE(rows.size(), 1);

    const auto& row = rows[0];
    EXPECT_EQ(row.execution_sel_should_get_env_var, 1); // Should be set
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 0);   // No PI lookup
    EXPECT_EQ(row.execution_envvar_pi_row_idx, 0);      // No PI lookup
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
    std::vector<TaggedValue> inputs = { TaggedValue::from_tag(
        ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::DAGASLEFT)) }; // enum value

    builder->process_get_env_var_opcode(inputs, default_output, *trace, 0);

    const auto rows = trace->as_rows();
    ASSERT_GE(rows.size(), 1);

    const auto& row = rows[0];
    EXPECT_EQ(row.execution_sel_should_get_env_var, 1); // Should be set
    EXPECT_EQ(row.execution_sel_envvar_pi_lookup, 0);   // No PI lookup
    EXPECT_EQ(row.execution_envvar_pi_row_idx, 0);      // No PI lookup
    EXPECT_EQ(row.execution_is_address, 0);
    EXPECT_EQ(row.execution_is_sender, 0);
    EXPECT_EQ(row.execution_is_transactionfee, 0);
    EXPECT_EQ(row.execution_is_feeperl2gas, 0);
    EXPECT_EQ(row.execution_is_isstaticcall, 0);
    EXPECT_EQ(row.execution_is_l2gasleft, 0);
    EXPECT_EQ(row.execution_is_dagasleft, 1); // Should be set
}

} // namespace
} // namespace bb::avm2::tracegen
