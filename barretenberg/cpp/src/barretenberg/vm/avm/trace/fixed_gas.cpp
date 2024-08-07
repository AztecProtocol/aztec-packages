#include "barretenberg/vm/avm/trace/fixed_gas.hpp"

namespace bb::avm_trace {

FixedGasTable::FixedGasTable()
{
    for (int i = 0; i < static_cast<int>(OpCode::LAST_OPCODE_SENTINEL); i++) {
        table_rows.push_back(GasRow{
            .sel_gas_cost = FF(1),
            .base_l2_gas_fixed_table = FF(10),
            .base_da_gas_fixed_table = FF(2),
            .dyn_l2_gas_fixed_table = FF(10),
            .dyn_da_gas_fixed_table = FF(2),
        });
    }
}

// Singleton.
const FixedGasTable& FixedGasTable::get()
{
    static FixedGasTable table;
    return table;
}

} // namespace bb::avm_trace