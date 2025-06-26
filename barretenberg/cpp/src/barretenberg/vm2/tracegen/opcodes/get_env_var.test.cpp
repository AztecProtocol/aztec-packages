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

TaggedValue default_output = TaggedValue::from_tag(ValueTag::FF, FF(0));

TEST(GetEnvVarTracegenTest, AddressEnvironmentVariable)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    TaggedValue envvar_enum =
        TaggedValue::from_tag(ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::ADDRESS)); // enum value

    builder.process_get_env_var_opcode(envvar_enum, default_output, trace, 0);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(execution_sel_should_get_env_var, 1),    // Should be set
                                  ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col0, 0), // No PI lookup
                                  ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col1, 0), // No PI lookup
                                  ROW_FIELD_EQ(execution_envvar_pi_row_idx, 0),         // No PI lookup
                                  ROW_FIELD_EQ(execution_is_address, 1),                // Should be set
                                  ROW_FIELD_EQ(execution_is_sender, 0),
                                  ROW_FIELD_EQ(execution_is_transactionfee, 0),
                                  ROW_FIELD_EQ(execution_is_isstaticcall, 0),
                                  ROW_FIELD_EQ(execution_is_l2gasleft, 0),
                                  ROW_FIELD_EQ(execution_is_dagasleft, 0))));
}

TEST(GetEnvVarTracegenTest, SenderEnvironmentVariable)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    TaggedValue envvar_enum =
        TaggedValue::from_tag(ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::SENDER)); // enum value

    builder.process_get_env_var_opcode(envvar_enum, default_output, trace, 0);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(execution_sel_should_get_env_var, 1),    // Should be set
                                  ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col0, 0), // No PI lookup
                                  ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col1, 0), // No PI lookup
                                  ROW_FIELD_EQ(execution_envvar_pi_row_idx, 0),         // No PI lookup
                                  ROW_FIELD_EQ(execution_is_address, 0),
                                  ROW_FIELD_EQ(execution_is_sender, 1), // Should be set
                                  ROW_FIELD_EQ(execution_is_transactionfee, 0),
                                  ROW_FIELD_EQ(execution_is_isstaticcall, 0),
                                  ROW_FIELD_EQ(execution_is_l2gasleft, 0),
                                  ROW_FIELD_EQ(execution_is_dagasleft, 0))));
}

TEST(GetEnvVarTracegenTest, TransactionFeeEnvironmentVariable)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    TaggedValue envvar_enum =
        TaggedValue::from_tag(ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::TRANSACTIONFEE)); // enum value

    builder.process_get_env_var_opcode(envvar_enum, default_output, trace, 0);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(execution_sel_should_get_env_var, 1),    // Should be set
                                  ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col0, 0), // No PI lookup
                                  ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col1, 0), // No PI lookup
                                  ROW_FIELD_EQ(execution_envvar_pi_row_idx, 0),         // No PI lookup
                                  ROW_FIELD_EQ(execution_is_address, 0),
                                  ROW_FIELD_EQ(execution_is_sender, 0),
                                  ROW_FIELD_EQ(execution_is_transactionfee, 1), // Should be set
                                  ROW_FIELD_EQ(execution_is_isstaticcall, 0),
                                  ROW_FIELD_EQ(execution_is_l2gasleft, 0),
                                  ROW_FIELD_EQ(execution_is_dagasleft, 0))));
}

TEST(GetEnvVarTracegenTest, ChainIdEnvironmentVariable)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    TaggedValue envvar_enum =
        TaggedValue::from_tag(ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::CHAINID)); // enum value

    FF chain_id = FF(42);
    TaggedValue output = TaggedValue::from_tag(ValueTag::FF, chain_id);

    builder.process_get_env_var_opcode(envvar_enum, output, trace, 0);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(
                    ROW_FIELD_EQ(execution_sel_should_get_env_var, 1),    // Should be set
                    ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col0, 1), // PI lookup required
                    ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col1, 0), // No PI lookup
                    ROW_FIELD_EQ(execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX),
                    ROW_FIELD_EQ(execution_is_address, 0),
                    ROW_FIELD_EQ(execution_is_sender, 0),
                    ROW_FIELD_EQ(execution_is_transactionfee, 0),
                    ROW_FIELD_EQ(execution_is_isstaticcall, 0),
                    ROW_FIELD_EQ(execution_is_l2gasleft, 0),
                    ROW_FIELD_EQ(execution_is_dagasleft, 0),
                    ROW_FIELD_EQ(execution_value_from_pi, chain_id))));
}

TEST(GetEnvVarTracegenTest, VersionEnvironmentVariable)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    TaggedValue envvar_enum =
        TaggedValue::from_tag(ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::VERSION)); // enum value

    FF version = FF(42);
    TaggedValue output = TaggedValue::from_tag(ValueTag::FF, version);

    builder.process_get_env_var_opcode(envvar_enum, output, trace, 0);

    EXPECT_THAT(
        trace.as_rows(),
        ElementsAre(AllOf(ROW_FIELD_EQ(execution_sel_should_get_env_var, 1),    // Should be set
                          ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col0, 1), // PI lookup required
                          ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col1, 0), // No PI lookup
                          ROW_FIELD_EQ(execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_VERSION_ROW_IDX),
                          ROW_FIELD_EQ(execution_is_address, 0),
                          ROW_FIELD_EQ(execution_is_sender, 0),
                          ROW_FIELD_EQ(execution_is_transactionfee, 0),
                          ROW_FIELD_EQ(execution_is_isstaticcall, 0),
                          ROW_FIELD_EQ(execution_is_l2gasleft, 0),
                          ROW_FIELD_EQ(execution_is_dagasleft, 0),
                          ROW_FIELD_EQ(execution_value_from_pi, version))));
}

TEST(GetEnvVarTracegenTest, BlockNumberEnvironmentVariable)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    TaggedValue envvar_enum =
        TaggedValue::from_tag(ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::BLOCKNUMBER)); // enum value

    uint32_t block_number = 42;
    TaggedValue output = TaggedValue::from_tag(ValueTag::U32, block_number);
    builder.process_get_env_var_opcode(envvar_enum, output, trace, 0);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(
                    ROW_FIELD_EQ(execution_sel_should_get_env_var, 1),    // Should be set
                    ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col0, 1), // PI lookup required
                    ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col1, 0), // No PI lookup
                    ROW_FIELD_EQ(execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX),
                    ROW_FIELD_EQ(execution_is_address, 0),
                    ROW_FIELD_EQ(execution_is_sender, 0),
                    ROW_FIELD_EQ(execution_is_transactionfee, 0),
                    ROW_FIELD_EQ(execution_is_isstaticcall, 0),
                    ROW_FIELD_EQ(execution_is_l2gasleft, 0),
                    ROW_FIELD_EQ(execution_is_dagasleft, 0),
                    ROW_FIELD_EQ(execution_value_from_pi, block_number))));
}

TEST(GetEnvVarTracegenTest, TimestampEnvironmentVariable)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    TaggedValue envvar_enum =
        TaggedValue::from_tag(ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::TIMESTAMP)); // enum value

    uint64_t timestamp = 42;
    TaggedValue output = TaggedValue::from_tag(ValueTag::U64, timestamp);
    builder.process_get_env_var_opcode(envvar_enum, output, trace, 0);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(
                    ROW_FIELD_EQ(execution_sel_should_get_env_var, 1),    // Should be set
                    ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col0, 1), // PI lookup required
                    ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col1, 0), // No PI lookup
                    ROW_FIELD_EQ(execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX),
                    ROW_FIELD_EQ(execution_is_address, 0),
                    ROW_FIELD_EQ(execution_is_sender, 0),
                    ROW_FIELD_EQ(execution_is_transactionfee, 0),
                    ROW_FIELD_EQ(execution_is_isstaticcall, 0),
                    ROW_FIELD_EQ(execution_is_l2gasleft, 0),
                    ROW_FIELD_EQ(execution_is_dagasleft, 0),
                    ROW_FIELD_EQ(execution_value_from_pi, timestamp))));
}

TEST(GetEnvVarTracegenTest, FeePerL2GasEnvironmentVariable)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    TaggedValue envvar_enum =
        TaggedValue::from_tag(ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::FEEPERL2GAS)); // enum value

    uint128_t fee_per_l2_gas = 42;
    TaggedValue output = TaggedValue::from_tag(ValueTag::U128, fee_per_l2_gas);
    builder.process_get_env_var_opcode(envvar_enum, output, trace, 0);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(
                    ROW_FIELD_EQ(execution_sel_should_get_env_var, 1),    // Should be set
                    ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col0, 0), // No PI lookup
                    ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col1, 1), // PI lookup required
                    ROW_FIELD_EQ(execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX),
                    ROW_FIELD_EQ(execution_is_address, 0),
                    ROW_FIELD_EQ(execution_is_sender, 0),
                    ROW_FIELD_EQ(execution_is_transactionfee, 0),
                    ROW_FIELD_EQ(execution_is_isstaticcall, 0),
                    ROW_FIELD_EQ(execution_is_l2gasleft, 0),
                    ROW_FIELD_EQ(execution_is_dagasleft, 0),
                    ROW_FIELD_EQ(execution_value_from_pi, fee_per_l2_gas))));
}

TEST(GetEnvVarTracegenTest, FeePerDaGasEnvironmentVariable)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    TaggedValue envvar_enum =
        TaggedValue::from_tag(ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::FEEPERDAGAS)); // enum value

    uint128_t fee_per_da_gas = 42;
    TaggedValue output = TaggedValue::from_tag(ValueTag::U128, fee_per_da_gas);
    builder.process_get_env_var_opcode(envvar_enum, output, trace, 0);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(
                    ROW_FIELD_EQ(execution_sel_should_get_env_var, 1),    // Should be set
                    ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col0, 1), // No PI lookup
                    ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col1, 0), // PI lookup required
                    ROW_FIELD_EQ(execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX),
                    ROW_FIELD_EQ(execution_is_address, 0),
                    ROW_FIELD_EQ(execution_is_sender, 0),
                    ROW_FIELD_EQ(execution_is_transactionfee, 0),
                    ROW_FIELD_EQ(execution_is_isstaticcall, 0),
                    ROW_FIELD_EQ(execution_is_l2gasleft, 0),
                    ROW_FIELD_EQ(execution_is_dagasleft, 0),
                    ROW_FIELD_EQ(execution_value_from_pi, fee_per_da_gas))));
}

TEST(GetEnvVarTracegenTest, IsStaticCallEnvironmentVariable)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    TaggedValue envvar_enum =
        TaggedValue::from_tag(ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::ISSTATICCALL)); // enum value

    builder.process_get_env_var_opcode(envvar_enum, default_output, trace, 0);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(execution_sel_should_get_env_var, 1),    // Should be set
                                  ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col0, 0), // No PI lookup
                                  ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col1, 0), // No PI lookup
                                  ROW_FIELD_EQ(execution_envvar_pi_row_idx, 0),         // No PI lookup
                                  ROW_FIELD_EQ(execution_is_address, 0),
                                  ROW_FIELD_EQ(execution_is_sender, 0),
                                  ROW_FIELD_EQ(execution_is_transactionfee, 0),
                                  ROW_FIELD_EQ(execution_is_isstaticcall, 1), // Should be set
                                  ROW_FIELD_EQ(execution_is_l2gasleft, 0),
                                  ROW_FIELD_EQ(execution_is_dagasleft, 0),
                                  ROW_FIELD_EQ(execution_value_from_pi, 0))));
}

TEST(GetEnvVarTracegenTest, L2GasLeftEnvironmentVariable)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    TaggedValue envvar_enum =
        TaggedValue::from_tag(ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::L2GASLEFT)); // enum value

    builder.process_get_env_var_opcode(envvar_enum, default_output, trace, 0);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(execution_sel_should_get_env_var, 1),    // Should be set
                                  ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col0, 0), // No PI lookup
                                  ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col1, 0), // No PI lookup
                                  ROW_FIELD_EQ(execution_envvar_pi_row_idx, 0),         // No PI lookup
                                  ROW_FIELD_EQ(execution_is_address, 0),
                                  ROW_FIELD_EQ(execution_is_sender, 0),
                                  ROW_FIELD_EQ(execution_is_transactionfee, 0),
                                  ROW_FIELD_EQ(execution_is_isstaticcall, 0),
                                  ROW_FIELD_EQ(execution_is_l2gasleft, 1), // Should be set
                                  ROW_FIELD_EQ(execution_is_dagasleft, 0),
                                  ROW_FIELD_EQ(execution_value_from_pi, 0))));
}

TEST(GetEnvVarTracegenTest, DaGasLeftEnvironmentVariable)
{
    TestTraceContainer trace;
    ExecutionTraceBuilder builder;

    TaggedValue envvar_enum =
        TaggedValue::from_tag(ValueTag::U8, static_cast<uint8_t>(EnvironmentVariable::DAGASLEFT)); // enum value

    builder.process_get_env_var_opcode(envvar_enum, default_output, trace, 0);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(AllOf(ROW_FIELD_EQ(execution_sel_should_get_env_var, 1),    // Should be set
                                  ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col0, 0), // No PI lookup
                                  ROW_FIELD_EQ(execution_sel_envvar_pi_lookup_col1, 0), // No PI lookup
                                  ROW_FIELD_EQ(execution_envvar_pi_row_idx, 0),         // No PI lookup
                                  ROW_FIELD_EQ(execution_is_address, 0),
                                  ROW_FIELD_EQ(execution_is_sender, 0),
                                  ROW_FIELD_EQ(execution_is_transactionfee, 0),
                                  ROW_FIELD_EQ(execution_is_isstaticcall, 0),
                                  ROW_FIELD_EQ(execution_is_l2gasleft, 0),
                                  ROW_FIELD_EQ(execution_is_dagasleft, 1), // Should be set
                                  ROW_FIELD_EQ(execution_value_from_pi, 0))));
}

} // namespace
} // namespace bb::avm2::tracegen
