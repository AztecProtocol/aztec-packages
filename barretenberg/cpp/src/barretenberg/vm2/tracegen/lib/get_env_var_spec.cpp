#include "barretenberg/vm2/tracegen/lib/get_env_var_spec.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"

namespace bb::avm2::tracegen {

// See PIL table in `get_env_var.pil` for reference.
GetEnvVarSpec::Table GetEnvVarSpec::get_table(uint8_t envvar)
{
    // default
    Table table = {
        .invalid_enum = false,
        .envvar_pi_lookup_col0 = false,
        .envvar_pi_lookup_col1 = false,
        .envvar_pi_row_idx = 0,
        .is_address = false,
        .is_sender = false,
        .is_transactionfee = false,
        .is_isstaticcall = false,
        .is_l2gasleft = false,
        .is_dagasleft = false,
        .out_tag = static_cast<uint8_t>(ValueTag::FF),
    };

    switch (static_cast<EnvironmentVariable>(envvar)) {
    case EnvironmentVariable::ADDRESS:
        table.is_address = true;
        table.out_tag = static_cast<uint8_t>(ValueTag::FF);
        return table;
    case EnvironmentVariable::SENDER:
        table.is_sender = true;
        table.out_tag = static_cast<uint8_t>(ValueTag::FF);
        return table;
    case EnvironmentVariable::TRANSACTIONFEE:
        table.is_transactionfee = true;
        table.out_tag = static_cast<uint8_t>(ValueTag::FF);
        return table;
    case EnvironmentVariable::CHAINID:
        table.envvar_pi_lookup_col0 = true;
        table.envvar_pi_row_idx = AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX;
        table.out_tag = static_cast<uint8_t>(ValueTag::FF);
        return table;
    case EnvironmentVariable::VERSION:
        table.envvar_pi_lookup_col0 = true;
        table.envvar_pi_row_idx = AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_VERSION_ROW_IDX;
        table.out_tag = static_cast<uint8_t>(ValueTag::FF);
        return table;
    case EnvironmentVariable::BLOCKNUMBER:
        table.envvar_pi_lookup_col0 = true;
        table.envvar_pi_row_idx = AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX;
        table.out_tag = static_cast<uint8_t>(ValueTag::U32);
        return table;
    case EnvironmentVariable::TIMESTAMP:
        table.envvar_pi_lookup_col0 = true;
        table.envvar_pi_row_idx = AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX;
        table.out_tag = static_cast<uint8_t>(ValueTag::U64);
        return table;
    case EnvironmentVariable::BASEFEEPERL2GAS:
        table.envvar_pi_lookup_col1 = true; // Only case where we lookup from col1
        table.envvar_pi_row_idx = AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX;
        table.out_tag = static_cast<uint8_t>(ValueTag::U128);
        return table;
    case EnvironmentVariable::BASEFEEPERDAGAS:
        table.envvar_pi_lookup_col0 = true;
        table.envvar_pi_row_idx = AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX;
        table.out_tag = static_cast<uint8_t>(ValueTag::U128);
        return table;
    case EnvironmentVariable::ISSTATICCALL:
        table.is_isstaticcall = true;
        table.out_tag = static_cast<uint8_t>(ValueTag::U1);
        return table;
    case EnvironmentVariable::L2GASLEFT:
        table.is_l2gasleft = true;
        table.out_tag = static_cast<uint8_t>(ValueTag::U32);
        return table;
    case EnvironmentVariable::DAGASLEFT:
        table.is_dagasleft = true;
        table.out_tag = static_cast<uint8_t>(ValueTag::U32);
        return table;
    default:
        table.invalid_enum = true;
        return table;
    }
}

} // namespace bb::avm2::tracegen
