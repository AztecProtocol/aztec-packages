#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/get_env_var.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/testing/public_inputs_builder.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/public_inputs_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::ExecutionTraceBuilder;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using get_env_var = bb::avm2::get_env_var<FF>;

TEST(GetEnvVarConstrainingTest, EmptyRow)
{
    check_relation<get_env_var>(testing::empty_trace());
}

TEST(GetEnvVarConstrainingTest, DoNotGetEnvVarOnError)
{
    // Test the TRY_GET_ENV_VAR gating logic
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // TRY_GET_ENV_VAR = 1 (no addressing error), no opcode error, should get env var
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_sel_should_resolve_address, 1 },
          { C::execution_sel_addressing_error, 0 },
          { C::execution_opcode_error, 0 },
          { C::execution_sel_should_get_env_var, 1 },
          { C::execution_rop_1_, 0 } }, // ADDRESS enum
        // TRY_GET_ENV_VAR = 0 (addressing error), should not get env var
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_sel_should_resolve_address, 1 },
          { C::execution_sel_addressing_error, 1 },
          { C::execution_opcode_error, 0 },
          { C::execution_sel_should_get_env_var, 0 },
          { C::execution_rop_1_, 1 } }, // SENDER enum
        // TRY_GET_ENV_VAR = 1, but opcode error, should not get env var
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_sel_should_resolve_address, 1 },
          { C::execution_sel_addressing_error, 0 },
          { C::execution_opcode_error, 1 },
          { C::execution_sel_should_get_env_var, 0 },
          { C::execution_rop_1_, 15 } }, // Invalid enum
        { { C::execution_sel, 1 }, { C::execution_last, 1 } },
        { { C::execution_sel, 0 } },
    });

    check_relation<get_env_var>(
        trace, get_env_var::SR_SHOULD_TRY_TO_GET_ENV_IF_NO_ERRORS, get_env_var::SR_SHOULD_NOT_TRY_TO_GET_ENV_ON_ERROR);

    // Negative test: TRY_GET_ENV_VAR = 1, no opcode error, but sel_should_get_env_var = 0
    trace.set(C::execution_sel_should_get_env_var, 1, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<get_env_var>(trace, get_env_var::SR_SHOULD_TRY_TO_GET_ENV_IF_NO_ERRORS),
                              "SHOULD_TRY_TO_GET_ENV_IF_NO_ERRORS");

    // Reset and test opposite case
    trace.set(C::execution_sel_should_get_env_var, 1, 1);
    // TRY_GET_ENV_VAR = 0, but sel_should_get_env_var = 1
    trace.set(C::execution_sel_should_get_env_var, 2, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<get_env_var>(trace, get_env_var::SR_SHOULD_NOT_TRY_TO_GET_ENV_ON_ERROR),
                              "SHOULD_NOT_TRY_TO_GET_ENV_ON_ERROR");
}

TEST(GetEnvVarConstrainingTest, OutputRegisterIsZeroOnError)
{
    // Test that register[0] is set to 0 when not getting env var
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Not getting env var (error), register[0] should be 0
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_sel_should_get_env_var, 0 },
          { C::execution_register_0_, 0 },
          { C::execution_rop_1_, 0 } }, // ADDRESS enum
        // Getting env var (no error), register[0] can be non-zero
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_sel_should_get_env_var, 1 },
          { C::execution_register_0_, 42 },
          { C::execution_rop_1_, 1 } }, // SENDER enum
    });

    check_relation<get_env_var>(trace, get_env_var::SR_SET_OUTPUT_REGISTER_TO_0_ON_ERROR);

    // Negative test: not getting env var but register[0] != 0
    trace.set(C::execution_register_0_, 1, 42);
    EXPECT_THROW_WITH_MESSAGE(check_relation<get_env_var>(trace, get_env_var::SR_SET_OUTPUT_REGISTER_TO_0_ON_ERROR),
                              "SET_OUTPUT_REGISTER_TO_0_ON_ERROR");
}

TEST(GetEnvVarConstrainingTest, AddressContextVariable)
{
    // Test reading ADDRESS from context
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Getting ADDRESS env var
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_sel_should_get_env_var, 1 },
          { C::execution_is_address, 1 },
          { C::execution_register_0_, FF(1234567890) },
          { C::execution_contract_address, FF(1234567890) },
          { C::execution_rop_1_, 0 } }, // ADDRESS enum = 0
        // Not getting ADDRESS
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_sel_should_get_env_var, 1 },
          { C::execution_is_address, 0 },
          { C::execution_register_0_, 999 },
          { C::execution_contract_address, FF(1234567890) },
          { C::execution_rop_1_, 1 } }, // SENDER enum = 1
    });

    check_relation<get_env_var>(trace, get_env_var::SR_ADDRESS_FROM_CONTEXT);

    // Negative test: getting ADDRESS but register != contract_address
    trace.set(C::execution_register_0_, 1, FF(0xDEADBEEF));
    EXPECT_THROW_WITH_MESSAGE(check_relation<get_env_var>(trace, get_env_var::SR_ADDRESS_FROM_CONTEXT),
                              "ADDRESS_FROM_CONTEXT");
}

TEST(GetEnvVarConstrainingTest, SenderContextVariable)
{
    // Test reading SENDER from context
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Getting SENDER env var
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_sel_should_get_env_var, 1 },
          { C::execution_is_sender, 1 },
          { C::execution_register_0_, FF(1234567890) },
          { C::execution_msg_sender, FF(1234567890) },
          { C::execution_rop_1_, 1 } }, // SENDER enum = 1
        // Not getting SENDER
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_sel_should_get_env_var, 1 },
          { C::execution_is_sender, 0 },
          { C::execution_register_0_, 999 },
          { C::execution_msg_sender, FF(1234567890) },
          { C::execution_rop_1_, 0 } }, // ADDRESS enum = 0
    });

    check_relation<get_env_var>(trace, get_env_var::SR_SENDER_FROM_CONTEXT);

    // Negative test: getting SENDER but register != msg_sender
    trace.set(C::execution_register_0_, 1, FF(0xDEADBEEF));
    EXPECT_THROW_WITH_MESSAGE(check_relation<get_env_var>(trace, get_env_var::SR_SENDER_FROM_CONTEXT),
                              "SENDER_FROM_CONTEXT");
}

TEST(GetEnvVarConstrainingTest, TransactionFeeContextVariable)
{
    // Test reading TRANSACTIONFEE from context
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Getting TRANSACTIONFEE env var
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_sel_should_get_env_var, 1 },
          { C::execution_is_transactionfee, 1 },
          { C::execution_register_0_, 1000 },
          { C::execution_transaction_fee, 1000 },
          { C::execution_rop_1_, 2 } }, // TRANSACTIONFEE enum = 2
        // Not getting TRANSACTIONFEE
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_sel_should_get_env_var, 1 },
          { C::execution_is_transactionfee, 0 },
          { C::execution_register_0_, 999 },
          { C::execution_transaction_fee, 1000 },
          { C::execution_rop_1_, 0 } }, // ADDRESS enum = 0
    });

    check_relation<get_env_var>(trace, get_env_var::SR_TRANSACTION_FEE_FROM_CONTEXT);

    // Negative test: getting TRANSACTIONFEE but register != transaction_fee
    trace.set(C::execution_register_0_, 1, 2000);
    EXPECT_THROW_WITH_MESSAGE(check_relation<get_env_var>(trace, get_env_var::SR_TRANSACTION_FEE_FROM_CONTEXT),
                              "TRANSACTION_FEE_FROM_CONTEXT");
}

TEST(GetEnvVarConstrainingTest, IsStaticCallContextVariable)
{
    // Test reading ISSTATICCALL from context
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Getting ISSTATICCALL env var (true)
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_sel_should_get_env_var, 1 },
          { C::execution_is_isstaticcall, 1 },
          { C::execution_register_0_, 1 },
          { C::execution_is_static, 1 },
          { C::execution_rop_1_, 9 } }, // ISSTATICCALL enum = 9
        // Getting ISSTATICCALL env var (false)
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_sel_should_get_env_var, 1 },
          { C::execution_is_isstaticcall, 1 },
          { C::execution_register_0_, 0 },
          { C::execution_is_static, 0 },
          { C::execution_rop_1_, 9 } }, // ISSTATICCALL enum = 9
        // Not getting ISSTATICCALL
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_sel_should_get_env_var, 1 },
          { C::execution_is_isstaticcall, 0 },
          { C::execution_register_0_, 999 },
          { C::execution_is_static, 1 },
          { C::execution_rop_1_, 0 } }, // ADDRESS enum = 0
    });

    check_relation<get_env_var>(trace, get_env_var::SR_ISSTATICCALL_FROM_CONTEXT);

    // Negative test: getting ISSTATICCALL but register != is_static
    trace.set(C::execution_register_0_, 1, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<get_env_var>(trace, get_env_var::SR_ISSTATICCALL_FROM_CONTEXT),
                              "ISSTATICCALL_FROM_CONTEXT");
}

TEST(GetEnvVarConstrainingTest, L2GasLeftGasVariable)
{
    // Test reading L2GASLEFT from gas columns
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Getting L2GASLEFT env var
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_sel_should_get_env_var, 1 },
          { C::execution_is_l2gasleft, 1 },
          { C::execution_register_0_, 7500 }, // limit - used = 10000 - 2500
          { C::execution_l2_gas_limit, 10000 },
          { C::execution_l2_gas_used, 2500 },
          { C::execution_rop_1_, 10 } }, // L2GASLEFT enum = 10
        // Not getting L2GASLEFT
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_sel_should_get_env_var, 1 },
          { C::execution_is_l2gasleft, 0 },
          { C::execution_register_0_, 999 },
          { C::execution_l2_gas_limit, 10000 },
          { C::execution_l2_gas_used, 2500 },
          { C::execution_rop_1_, 0 } }, // ADDRESS enum = 0
    });

    check_relation<get_env_var>(trace, get_env_var::SR_L2GASLEFT_FROM_GAS);

    // Negative test: getting L2GASLEFT but register != (limit - used)
    trace.set(C::execution_register_0_, 1, 5000);
    EXPECT_THROW_WITH_MESSAGE(check_relation<get_env_var>(trace, get_env_var::SR_L2GASLEFT_FROM_GAS),
                              "L2GASLEFT_FROM_GAS");
}

TEST(GetEnvVarConstrainingTest, DaGasLeftGasVariable)
{
    // Test reading DAGASLEFT from gas columns
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Getting DAGASLEFT env var
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_sel_should_get_env_var, 1 },
          { C::execution_is_dagasleft, 1 },
          { C::execution_register_0_, 3000 }, // limit - used = 5000 - 2000
          { C::execution_da_gas_limit, 5000 },
          { C::execution_da_gas_used, 2000 },
          { C::execution_rop_1_, 11 } }, // DAGASLEFT enum = 11
        // Not getting DAGASLEFT
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_sel_should_get_env_var, 1 },
          { C::execution_is_dagasleft, 0 },
          { C::execution_register_0_, 999 },
          { C::execution_da_gas_limit, 5000 },
          { C::execution_da_gas_used, 2000 },
          { C::execution_rop_1_, 0 } }, // ADDRESS enum = 0
    });

    check_relation<get_env_var>(trace, get_env_var::SR_DAGASLEFT_FROM_GAS);

    // Negative test: getting DAGASLEFT but register != (limit - used)
    trace.set(C::execution_register_0_, 1, 1000);
    EXPECT_THROW_WITH_MESSAGE(check_relation<get_env_var>(trace, get_env_var::SR_DAGASLEFT_FROM_GAS),
                              "DAGASLEFT_FROM_GAS");
}

TEST(GetEnvVarConstrainingTest, NoSideEffectsWhenNotGettingEnvVar)
{
    // Test that when sel_should_get_env_var = 0, the constraints don't interfere
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Not getting env var - all context/gas values can be arbitrary
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_sel_should_get_env_var, 0 },
          { C::execution_is_address, 1 },                    // This is set but shouldn't matter
          { C::execution_register_0_, 0 },                   // Must be 0 when not getting env var
          { C::execution_contract_address, FF(1234567890) }, // Arbitrary
          { C::execution_msg_sender, FF(1234567890) },       // Arbitrary
          { C::execution_l2_gas_limit, 10000 },              // Arbitrary
          { C::execution_l2_gas_used, 5000 },                // Arbitrary
          { C::execution_rop_1_, 0 } },                      // ADDRESS enum = 0
    });

    // Should pass because sel_should_get_env_var = 0 disables the context/gas constraints
    check_relation<get_env_var>(trace);
}

TEST(GetEnvVarConstrainingTest, ComplexTraceWithAllEnumsAndInteractions)
{
    auto test_public_inputs = testing::PublicInputsBuilder().rand_global_variables().build();

    AztecAddress sender = 0x424242;
    AztecAddress contract_address = 0x123456;
    uint256_t transaction_fee = 66666;
    bool is_static_call = true;
    uint256_t l2_gas_limit = 10000;
    uint256_t l2_gas_used = 2500;
    uint256_t da_gas_limit = 5000;
    uint256_t da_gas_used = 2000;

    // Test that an invalid enum value results in an error
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // address
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_contract_address, contract_address },
          { C::execution_rop_1_, static_cast<uint8_t>(EnvironmentVariable::ADDRESS) },
          { C::execution_sel_should_resolve_address, 1 },
          { C::execution_sel_addressing_error, 0 },
          // from precomputed table
          { C::execution_opcode_error, 0 }, // valid enum
          { C::execution_sel_envvar_pi_lookup, 0 },
          { C::execution_envvar_pi_row_idx, 0 }, // none
          { C::execution_is_address, 1 },
          { C::execution_is_sender, 0 },
          { C::execution_is_transactionfee, 0 },
          { C::execution_is_feeperl2gas, 0 },
          { C::execution_is_isstaticcall, 0 },
          { C::execution_is_l2gasleft, 0 },
          { C::execution_is_dagasleft, 0 },
          // Do it! No prior error, and enum is valid
          { C::execution_sel_should_get_env_var, 1 },
          // output
          { C::execution_register_0_, contract_address },
          // nothing from pis
          { C::execution_value_from_pi_col0, 0 },
          { C::execution_value_from_pi_col1, 0 } },
        // sender
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_msg_sender, sender },
          { C::execution_rop_1_, static_cast<uint8_t>(EnvironmentVariable::SENDER) },
          { C::execution_sel_should_resolve_address, 1 },
          { C::execution_sel_addressing_error, 0 },
          // from precomputed table
          { C::execution_opcode_error, 0 }, // valid enum
          { C::execution_sel_envvar_pi_lookup, 0 },
          { C::execution_envvar_pi_row_idx, 0 }, // none
          { C::execution_is_address, 0 },
          { C::execution_is_sender, 1 },
          { C::execution_is_transactionfee, 0 },
          { C::execution_is_feeperl2gas, 0 },
          { C::execution_is_isstaticcall, 0 },
          { C::execution_is_l2gasleft, 0 },
          { C::execution_is_dagasleft, 0 },
          // Do it! No prior error, and enum is valid
          { C::execution_sel_should_get_env_var, 1 },
          // output
          { C::execution_register_0_, sender },
          // nothing from pis
          { C::execution_value_from_pi_col0, 0 },
          { C::execution_value_from_pi_col1, 0 } },
        // transaction fee
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_transaction_fee, transaction_fee },
          { C::execution_rop_1_, static_cast<uint8_t>(EnvironmentVariable::TRANSACTIONFEE) },
          { C::execution_sel_should_resolve_address, 1 },
          { C::execution_sel_addressing_error, 0 },
          // from precomputed table
          { C::execution_opcode_error, 0 }, // valid enum
          { C::execution_sel_envvar_pi_lookup, 0 },
          { C::execution_envvar_pi_row_idx, 0 }, // none
          { C::execution_is_address, 0 },
          { C::execution_is_sender, 0 },
          { C::execution_is_transactionfee, 1 },
          { C::execution_is_feeperl2gas, 0 },
          { C::execution_is_isstaticcall, 0 },
          { C::execution_is_l2gasleft, 0 },
          { C::execution_is_dagasleft, 0 },
          // Do it! No prior error, and enum is valid
          { C::execution_sel_should_get_env_var, 1 },
          // output
          { C::execution_register_0_, transaction_fee },
          // nothing from pis
          { C::execution_value_from_pi_col0, 0 },
          { C::execution_value_from_pi_col1, 0 } },
        // chain id
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_rop_1_, static_cast<uint8_t>(EnvironmentVariable::CHAINID) },
          { C::execution_sel_should_resolve_address, 1 },
          { C::execution_sel_addressing_error, 0 },
          // from precomputed table
          { C::execution_opcode_error, 0 }, // valid enum
          { C::execution_sel_envvar_pi_lookup, 1 },
          { C::execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX },
          { C::execution_is_address, 0 },
          { C::execution_is_sender, 0 },
          { C::execution_is_transactionfee, 0 },
          { C::execution_is_feeperl2gas, 0 },
          { C::execution_is_isstaticcall, 0 },
          { C::execution_is_l2gasleft, 0 },
          { C::execution_is_dagasleft, 0 },
          // Do it! No prior error, and enum is valid
          { C::execution_sel_should_get_env_var, 1 },
          // output, looked up from PIs
          { C::execution_register_0_, test_public_inputs.globalVariables.chainId },
          // value from pi col0 should match
          { C::execution_value_from_pi_col0, test_public_inputs.globalVariables.chainId },
          { C::execution_value_from_pi_col1, 0 } },
        // version
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_rop_1_, static_cast<uint8_t>(EnvironmentVariable::VERSION) },
          { C::execution_sel_should_resolve_address, 1 },
          { C::execution_sel_addressing_error, 0 },
          // from precomputed table
          { C::execution_opcode_error, 0 }, // valid enum
          { C::execution_sel_envvar_pi_lookup, 1 },
          { C::execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_VERSION_ROW_IDX },
          { C::execution_is_address, 0 },
          { C::execution_is_sender, 0 },
          { C::execution_is_transactionfee, 0 },
          { C::execution_is_feeperl2gas, 0 },
          { C::execution_is_isstaticcall, 0 },
          { C::execution_is_l2gasleft, 0 },
          { C::execution_is_dagasleft, 0 },
          // Do it! No prior error, and enum is valid
          { C::execution_sel_should_get_env_var, 1 },
          // output, looked up from PIs
          { C::execution_register_0_, test_public_inputs.globalVariables.version },
          // value from pi col0 should match
          { C::execution_value_from_pi_col0, test_public_inputs.globalVariables.version },
          { C::execution_value_from_pi_col1, 0 } },
        // block number
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_rop_1_, static_cast<uint8_t>(EnvironmentVariable::BLOCKNUMBER) },
          { C::execution_sel_should_resolve_address, 1 },
          { C::execution_sel_addressing_error, 0 },
          // from precomputed table
          { C::execution_opcode_error, 0 }, // valid enum
          { C::execution_sel_envvar_pi_lookup, 1 },
          { C::execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX },
          { C::execution_is_address, 0 },
          { C::execution_is_sender, 0 },
          { C::execution_is_transactionfee, 0 },
          { C::execution_is_feeperl2gas, 0 },
          { C::execution_is_isstaticcall, 0 },
          { C::execution_is_l2gasleft, 0 },
          { C::execution_is_dagasleft, 0 },
          // Do it! No prior error, and enum is valid
          { C::execution_sel_should_get_env_var, 1 },
          // output, looked up from PIs
          { C::execution_register_0_, test_public_inputs.globalVariables.blockNumber },
          // value from pi col0 should match
          { C::execution_value_from_pi_col0, test_public_inputs.globalVariables.blockNumber },
          { C::execution_value_from_pi_col1, 0 } },
        // timestamp
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_rop_1_, static_cast<uint8_t>(EnvironmentVariable::TIMESTAMP) },
          { C::execution_sel_should_resolve_address, 1 },
          { C::execution_sel_addressing_error, 0 },
          // from precomputed table
          { C::execution_opcode_error, 0 }, // valid enum
          { C::execution_sel_envvar_pi_lookup, 1 },
          { C::execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX },
          { C::execution_is_address, 0 },
          { C::execution_is_sender, 0 },
          { C::execution_is_transactionfee, 0 },
          { C::execution_is_feeperl2gas, 0 },
          { C::execution_is_isstaticcall, 0 },
          { C::execution_is_l2gasleft, 0 },
          { C::execution_is_dagasleft, 0 },
          // Do it! No prior error, and enum is valid
          { C::execution_sel_should_get_env_var, 1 },
          // output, looked up from PIs
          { C::execution_register_0_, test_public_inputs.globalVariables.timestamp },
          // value from pi col0 should match
          { C::execution_value_from_pi_col0, test_public_inputs.globalVariables.timestamp },
          { C::execution_value_from_pi_col1, 0 } },
        // feePerL2Gas
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_rop_1_, static_cast<uint8_t>(EnvironmentVariable::FEEPERL2GAS) },
          { C::execution_sel_should_resolve_address, 1 },
          { C::execution_sel_addressing_error, 0 },
          // from precomputed table
          { C::execution_opcode_error, 0 }, // valid enum
          { C::execution_sel_envvar_pi_lookup, 1 },
          { C::execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX },
          { C::execution_is_address, 0 },
          { C::execution_is_sender, 0 },
          { C::execution_is_transactionfee, 0 },
          { C::execution_is_feeperl2gas, 1 },
          { C::execution_is_isstaticcall, 0 },
          { C::execution_is_l2gasleft, 0 },
          { C::execution_is_dagasleft, 0 },
          // Do it! No prior error, and enum is valid
          { C::execution_sel_should_get_env_var, 1 },
          // output, looked up from PIs
          { C::execution_register_0_, test_public_inputs.globalVariables.gasFees.feePerL2Gas },
          // value from pi col1 should match. pi col0 too, but we don't use it
          { C::execution_value_from_pi_col0, test_public_inputs.globalVariables.gasFees.feePerDaGas },
          { C::execution_value_from_pi_col1, test_public_inputs.globalVariables.gasFees.feePerL2Gas } },
        // feePerDaGas
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_rop_1_, static_cast<uint8_t>(EnvironmentVariable::FEEPERDAGAS) },
          { C::execution_sel_should_resolve_address, 1 },
          { C::execution_sel_addressing_error, 0 },
          // from precomputed table
          { C::execution_opcode_error, 0 }, // valid enum
          { C::execution_sel_envvar_pi_lookup, 1 },
          { C::execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX },
          { C::execution_is_address, 0 },
          { C::execution_is_sender, 0 },
          { C::execution_is_transactionfee, 0 },
          { C::execution_is_feeperl2gas, 0 },
          { C::execution_is_isstaticcall, 0 },
          { C::execution_is_l2gasleft, 0 },
          { C::execution_is_dagasleft, 0 },
          // Do it! No prior error, and enum is valid
          { C::execution_sel_should_get_env_var, 1 },
          // output, looked up from PIs
          { C::execution_register_0_, test_public_inputs.globalVariables.gasFees.feePerDaGas },
          // value from pi col0 should match. pi col1 too, but we don't use it
          { C::execution_value_from_pi_col0, test_public_inputs.globalVariables.gasFees.feePerDaGas },
          { C::execution_value_from_pi_col1, test_public_inputs.globalVariables.gasFees.feePerL2Gas } },
        // isStaticCall
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_is_static, is_static_call },
          { C::execution_rop_1_, static_cast<uint8_t>(EnvironmentVariable::ISSTATICCALL) },
          { C::execution_sel_should_resolve_address, 1 },
          { C::execution_sel_addressing_error, 0 },
          // from precomputed table
          { C::execution_opcode_error, 0 }, // valid enum
          { C::execution_sel_envvar_pi_lookup, 0 },
          { C::execution_envvar_pi_row_idx, 0 }, // none
          { C::execution_is_address, 0 },
          { C::execution_is_sender, 0 },
          { C::execution_is_transactionfee, 0 },
          { C::execution_is_feeperl2gas, 0 },
          { C::execution_is_isstaticcall, 1 },
          { C::execution_is_l2gasleft, 0 },
          { C::execution_is_dagasleft, 0 },
          // Do it! No prior error, and enum is valid
          { C::execution_sel_should_get_env_var, 1 },
          // output
          { C::execution_register_0_, is_static_call },
          // nothing from pis
          { C::execution_value_from_pi_col0, 0 },
          { C::execution_value_from_pi_col1, 0 } },
        // l2GasLeft
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_l2_gas_limit, l2_gas_limit },
          { C::execution_l2_gas_used, l2_gas_used },
          { C::execution_rop_1_, static_cast<uint8_t>(EnvironmentVariable::L2GASLEFT) },
          { C::execution_sel_should_resolve_address, 1 },
          { C::execution_sel_addressing_error, 0 },
          // from precomputed table
          { C::execution_opcode_error, 0 }, // valid enum
          { C::execution_sel_envvar_pi_lookup, 0 },
          { C::execution_envvar_pi_row_idx, 0 }, // none
          { C::execution_is_address, 0 },
          { C::execution_is_sender, 0 },
          { C::execution_is_transactionfee, 0 },
          { C::execution_is_feeperl2gas, 0 },
          { C::execution_is_isstaticcall, 0 },
          { C::execution_is_l2gasleft, 1 },
          { C::execution_is_dagasleft, 0 },
          // Do it! No prior error, and enum is valid
          { C::execution_sel_should_get_env_var, 1 },
          // output
          { C::execution_register_0_, l2_gas_limit - l2_gas_used },
          // nothing from pis
          { C::execution_value_from_pi_col0, 0 },
          { C::execution_value_from_pi_col1, 0 } },
        // daGasLeft
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_da_gas_limit, da_gas_limit },
          { C::execution_da_gas_used, da_gas_used },
          { C::execution_rop_1_, static_cast<uint8_t>(EnvironmentVariable::DAGASLEFT) },
          { C::execution_sel_should_resolve_address, 1 },
          { C::execution_sel_addressing_error, 0 },
          // from precomputed table
          { C::execution_opcode_error, 0 }, // valid enum
          { C::execution_sel_envvar_pi_lookup, 0 },
          { C::execution_envvar_pi_row_idx, 0 }, // none
          { C::execution_is_address, 0 },
          { C::execution_is_sender, 0 },
          { C::execution_is_transactionfee, 0 },
          { C::execution_is_feeperl2gas, 0 },
          { C::execution_is_isstaticcall, 0 },
          { C::execution_is_l2gasleft, 0 },
          { C::execution_is_dagasleft, 1 },
          // Do it! No prior error, and enum is valid
          { C::execution_sel_should_get_env_var, 1 },
          // output
          { C::execution_register_0_, da_gas_limit - da_gas_used },
          // nothing from pis
          { C::execution_value_from_pi_col0, 0 },
          { C::execution_value_from_pi_col1, 0 } },
        // invalid enum
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_rop_1_, 42 },
          { C::execution_sel_should_resolve_address, 1 },
          { C::execution_sel_addressing_error, 0 },
          // from precomputed table
          { C::execution_opcode_error, 1 }, // invalid enum!
          { C::execution_sel_envvar_pi_lookup, 0 },
          { C::execution_envvar_pi_row_idx, 0 }, // none
          { C::execution_is_address, 0 },
          { C::execution_is_sender, 0 },
          { C::execution_is_transactionfee, 0 },
          { C::execution_is_feeperl2gas, 0 },
          { C::execution_is_isstaticcall, 0 },
          { C::execution_is_l2gasleft, 0 },
          { C::execution_is_dagasleft, 0 },
          // ERROR! Invalid enum
          { C::execution_sel_should_get_env_var, 0 },
          // output
          { C::execution_register_0_, 0 }, // no output on error
          // nothing from pis
          { C::execution_value_from_pi_col0, 0 },
          { C::execution_value_from_pi_col1, 0 } },
    });

    tracegen::PublicInputsTraceBuilder public_inputs_builder;
    public_inputs_builder.process_public_inputs(trace, test_public_inputs);
    public_inputs_builder.process_public_inputs_aux_precomputed(trace);

    tracegen::PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_misc(trace, trace.get_num_rows());
    precomputed_builder.process_get_env_var_table(trace);
    precomputed_builder.process_sel_range_8(trace);

    check_relation<get_env_var>(trace);
    check_interaction<ExecutionTraceBuilder,
                      lookup_get_env_var_precomputed_info_settings,
                      lookup_get_env_var_read_from_public_inputs_settings>(trace);

    // corrupt and perform negative tests
    trace.set(C::execution_rop_1_, 1, 42);
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<ExecutionTraceBuilder, lookup_get_env_var_precomputed_info_settings>(trace)),
        "Failed.*GET_ENV_VAR_PRECOMPUTED_INFO. Could not find tuple in destination.");
    // reset/uncorrupt
    trace.set(C::execution_rop_1_, 1, static_cast<uint8_t>(EnvironmentVariable::CHAINID));
}

TEST(GetEnvVarConstrainingTest, NegativeInteractionTests)
{
    auto test_public_inputs = testing::PublicInputsBuilder().rand_global_variables().build();
    TestTraceContainer trace({
        { { C::execution_sel, 1 },
          { C::execution_sel_get_env_var, 1 },
          { C::execution_rop_1_, static_cast<uint8_t>(EnvironmentVariable::CHAINID) },
          { C::execution_sel_should_resolve_address, 1 },
          { C::execution_sel_addressing_error, 0 },
          // from precomputed table
          { C::execution_opcode_error, 0 }, // valid enum
          { C::execution_sel_envvar_pi_lookup, 1 },
          { C::execution_envvar_pi_row_idx, AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX },
          { C::execution_is_address, 0 },
          { C::execution_is_sender, 0 },
          { C::execution_is_transactionfee, 0 },
          { C::execution_is_feeperl2gas, 0 },
          { C::execution_is_isstaticcall, 0 },
          { C::execution_is_l2gasleft, 0 },
          { C::execution_is_dagasleft, 0 },
          // Do it! No prior error, and enum is valid
          { C::execution_sel_should_get_env_var, 1 },
          // output, looked up from PIs
          { C::execution_register_0_, test_public_inputs.globalVariables.chainId },
          // value from pi col0 should match
          { C::execution_value_from_pi_col0, test_public_inputs.globalVariables.chainId },
          { C::execution_value_from_pi_col1, 0 } },
    });

    tracegen::PublicInputsTraceBuilder public_inputs_builder;
    public_inputs_builder.process_public_inputs(trace, test_public_inputs);
    public_inputs_builder.process_public_inputs_aux_precomputed(trace);

    tracegen::PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_misc(trace, trace.get_num_rows());
    precomputed_builder.process_get_env_var_table(trace);
    precomputed_builder.process_sel_range_8(trace);

    check_relation<get_env_var>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_get_env_var_precomputed_info_settings>(trace);
    check_interaction<ExecutionTraceBuilder, lookup_get_env_var_read_from_public_inputs_settings>(trace);

    // corrupt and perform negative tests
    trace.set(C::execution_rop_1_, 0, 42);
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<ExecutionTraceBuilder, lookup_get_env_var_precomputed_info_settings>(trace)),
        "Failed.*GET_ENV_VAR_PRECOMPUTED_INFO. Could not find tuple in destination.");
    // reset/uncorrupt
    trace.set(C::execution_rop_1_, 0, static_cast<uint8_t>(EnvironmentVariable::CHAINID));

    // corrupt the value so it doesn't match the public input
    trace.set(C::execution_value_from_pi_col0, 0, test_public_inputs.globalVariables.chainId + 1);
    EXPECT_THROW_WITH_MESSAGE(
        (check_interaction<ExecutionTraceBuilder, lookup_get_env_var_read_from_public_inputs_settings>(trace)),
        "Failed.*GET_ENV_VAR_READ_FROM_PUBLIC_INPUTS. Could not find tuple in destination.");
    // reset/uncorrupt
    trace.set(C::execution_value_from_pi_col0, 0, test_public_inputs.globalVariables.chainId);
}

} // namespace
} // namespace bb::avm2::constraining
