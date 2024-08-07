#pragma once

#include <cstddef>
#include <vector>

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/opcode.hpp"

namespace bb::avm_trace {

class FixedGasTable {
  public:
    struct GasRow {
        FF sel_gas_cost;
        FF base_l2_gas_fixed_table;
        FF base_da_gas_fixed_table;
        FF dyn_l2_gas_fixed_table;
        FF dyn_da_gas_fixed_table;
    };

    static const FixedGasTable& get();

    size_t size() const { return table_rows.size(); }
    const GasRow& at(size_t i) const { return table_rows.at(i); }
    const GasRow& at(OpCode o) const { return at(static_cast<size_t>(o)); }

  private:
    FixedGasTable();

    std::vector<GasRow> table_rows;
};

template <typename DestRow> void merge_into(DestRow& dest, FixedGasTable::GasRow const& src)
{
    dest.gas_sel_gas_cost = src.sel_gas_cost;
    dest.gas_base_l2_gas_fixed_table = src.base_l2_gas_fixed_table;
    dest.gas_base_da_gas_fixed_table = src.base_da_gas_fixed_table;
    dest.gas_dyn_l2_gas_fixed_table = src.dyn_l2_gas_fixed_table;
    dest.gas_dyn_da_gas_fixed_table = src.dyn_da_gas_fixed_table;
}

} // namespace bb::avm_trace