#include "barretenberg/vm/avm/trace/helper.hpp"
#include "barretenberg/vm/avm/trace/mem_trace.hpp"
#include <algorithm>
#include <cassert>

namespace bb::avm_trace {

template <typename FF> std::string field_to_string(const FF& ff)
{
    std::ostringstream os;
    os << ff;
    std::string raw = os.str();
    auto first_not_zero = raw.find_first_not_of('0', 2);
    std::string result = "0x" + (first_not_zero != std::string::npos ? raw.substr(first_not_zero) : "0");
    return result;
}

void dump_trace_as_csv(std::vector<Row> const& trace, std::filesystem::path const& filename)
{
    std::ofstream file;
    file.open(filename);

    // Filter zero columns indices (ugly and slow).
    std::set<size_t> non_zero_columns;
    const size_t num_columns = Row::names().size();
    for (const Row& row : trace) {
        const auto row_vec = row.as_vector();
        for (size_t i = 0; i < num_columns; ++i) {
            if (row_vec[i] != 0) {
                non_zero_columns.insert(i);
            }
        }
    }
    std::vector<size_t> sorted_non_zero_columns(non_zero_columns.begin(), non_zero_columns.end());
    std::sort(sorted_non_zero_columns.begin(), sorted_non_zero_columns.end());

    const auto& names = Row::names();
    file << "ROW_NUMBER,";
    for (const auto& column_idx : sorted_non_zero_columns) {
        file << names[column_idx] << ",";
    }
    file << std::endl;

    for (size_t r = 0; r < trace.size(); ++r) {
        // Filter zero rows.
        const auto& row_vec = trace[r].as_vector();
        bool all_zero = true;
        for (const auto& column_idx : sorted_non_zero_columns) {
            if (row_vec[column_idx] != 0) {
                all_zero = false;
                break;
            }
        }
        if (!all_zero) {
            file << r << ",";
            for (const auto& column_idx : sorted_non_zero_columns) {
                file << field_to_string(row_vec[column_idx]) << ",";
            }
            file << std::endl;
        }
    }
}

bool is_operand_indirect(uint8_t ind_value, uint8_t operand_idx)
{
    if (operand_idx > 7) {
        return false;
    }

    return (ind_value & (1 << operand_idx)) != 0;
}

std::string to_hex(bb::avm_trace::AvmMemoryTag tag)
{
    return to_hex(static_cast<uint8_t>(tag));
}

/**
 *
 *  ONLY FOR TESTS - Required by dsl module and therefore cannot be moved to test/helpers.test.cpp
 *
 * @brief Helper routine which injects the end gas values in public inputs and in the public column
 *        of kernel inputs in the trace.
 *
 * @param public_inputs Public inputs structure
 * @param trace The execution trace
 */
void inject_end_gas_values(VmPublicInputs<FF>& public_inputs, std::vector<Row>& trace)
{
    auto execution_end_row =
        std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_execution_end == FF(1); });
    trace.at(L2_END_GAS_KERNEL_INPUTS_COL_OFFSET).main_kernel_inputs = execution_end_row->main_l2_gas_remaining;
    trace.at(DA_END_GAS_KERNEL_INPUTS_COL_OFFSET).main_kernel_inputs = execution_end_row->main_da_gas_remaining;

    std::get<avm_trace::KERNEL_INPUTS>(public_inputs).at(L2_END_GAS_KERNEL_INPUTS_COL_OFFSET) =
        execution_end_row->main_l2_gas_remaining;
    std::get<avm_trace::KERNEL_INPUTS>(public_inputs).at(DA_END_GAS_KERNEL_INPUTS_COL_OFFSET) =
        execution_end_row->main_da_gas_remaining;
}

} // namespace bb::avm_trace
