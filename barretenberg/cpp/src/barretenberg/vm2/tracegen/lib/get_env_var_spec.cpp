#include "barretenberg/vm2/tracegen/lib/get_env_var_spec.hpp"

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
    };

    switch (static_cast<EnvironmentVariable>(envvar)) {
    case EnvironmentVariable::ADDRESS:
        table.is_address = true;
        return table;
    case EnvironmentVariable::SENDER:
        table.is_sender = true;
        return table;
    case EnvironmentVariable::TRANSACTIONFEE:
        table.is_transactionfee = true;
        return table;
    case EnvironmentVariable::CHAINID:
        table.envvar_pi_lookup_col0 = true;
        table.envvar_pi_row_idx = AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_CHAIN_ID_ROW_IDX;
        return table;
    case EnvironmentVariable::VERSION:
        table.envvar_pi_lookup_col0 = true;
        table.envvar_pi_row_idx = AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_VERSION_ROW_IDX;
        return table;
    case EnvironmentVariable::BLOCKNUMBER:
        table.envvar_pi_lookup_col0 = true;
        table.envvar_pi_row_idx = AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_BLOCK_NUMBER_ROW_IDX;
        return table;
    case EnvironmentVariable::TIMESTAMP:
        table.envvar_pi_lookup_col0 = true;
        table.envvar_pi_row_idx = AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_TIMESTAMP_ROW_IDX;
        return table;
    case EnvironmentVariable::FEEPERL2GAS:
        table.envvar_pi_lookup_col1 = true; // Only case where we lookup from col1
        table.envvar_pi_row_idx = AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX;
        return table;
    case EnvironmentVariable::FEEPERDAGAS:
        table.envvar_pi_lookup_col0 = true;
        table.envvar_pi_row_idx = AVM_PUBLIC_INPUTS_GLOBAL_VARIABLES_GAS_FEES_ROW_IDX;
        return table;
    case EnvironmentVariable::ISSTATICCALL:
        table.is_isstaticcall = true;
        return table;
    case EnvironmentVariable::L2GASLEFT:
        table.is_l2gasleft = true;
        return table;
    case EnvironmentVariable::DAGASLEFT:
        table.is_dagasleft = true;
        return table;
    default:
        table.invalid_enum = true;
        return table;
    }
}

} // namespace bb::avm2::tracegen
