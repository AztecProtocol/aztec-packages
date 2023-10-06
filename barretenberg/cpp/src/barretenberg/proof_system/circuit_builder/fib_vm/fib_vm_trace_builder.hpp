#pragma once

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/proof_system/circuit_builder/execution_trace_builder_base.hpp"
#include "barretenberg/proof_system/relations/fib_vm/fib_relation.hpp"
#include "barretenberg/proof_system/relations/relation_parameters.hpp"

namespace proof_system {
template <typename FF> struct FibVMState {
    FF fib_number;
};

class FibVMTraceBuilder : public ExecutionTraceBuilderBase<arithmetization::FibVM> {
  public:
    using VMOperation = fib_vm::VMOperation<FF>; // high-level description of an operation
    using Row = fib_vm::FibRow<FF>;

    size_t n = 0; // The n in the fib sequence that we would like to target
    std::vector<Row> rows;

    // Set the N that the trace wishes to target
    void set_n(size_t _n) { this->n = _n; }

    // NOTE: all of this will be done and serialized by powdr, we will just need
    // to copy it over
    void build_execution_trace()
    {

        // TODO: remove, this is for reference
        // template <typename FF> struct FibRow {
        //   FF x;
        //   FF y;
        //   FF x_prev;
        //   FF y_prev;
        //   FF is_last;
        // };

        // TODO: how do i make this relation that looks at the shift be using the same column under the hood
        [[maybe_unused]] FibVMState<FF> state;
        size_t x_start = 1;
        size_t y_start = 1;
        size_t x = 1;
        size_t y = 1;
        size_t is_last = 0;

        // In this case if n is not set earlier, the nothing will happen
        for (size_t i = 0; i < n; i++) {
            // x, y, is_last
            is_last = i == n - 1 ? 1 : 0;

            // 0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144.

            // x, y, is_last , x_shift, y_shift
            // 0, 1, 0,      , 1      , 1
            // 1, 1, 0,      , 1       ,2
            // 1, 2, 0,      , 2      , 3
            // 2, 3, 0,      , 3      , 5
            // 3, 5, 1,      , 0      , 1

            // Wrap these around and use a permutation to deal with the shifts
            // This is why the relations must wrap around to get to the final result

            size_t curr_x = x;
            size_t curr_y = y;
            y = curr_x + curr_y;
            x = curr_y;

            if (is_last) {
                x = x_start;
                y = y_start;
            }

            rows.push_back({ .x = curr_x, .y = curr_y, .x_shift = x, .y_shift = y, .is_last = is_last });
        }
    }

    [[maybe_unused]] void print_rows()
    {
        size_t i = 0;
        for (auto& row : this->rows) {
            info(i++);
            info(row);
        }
    }

    // NOTE: the methods below appear to just be some boiler plate that really is not
    // too important to the execution of the trace
    [[maybe_unused]] bool check_gates()
    {
        build_execution_trace();
        print_rows();
        return evaluate_relation<fib_vm::FibRelation<FF>, Row>("FibVMRelation", rows);
    }

    [[nodiscard]] size_t get_num_gates() const { return rows.size(); }

    [[nodiscard]] size_t get_circuit_subgroup_size() const
    {
        const size_t num_rows = get_num_gates();
        const auto num_rows_log2 = static_cast<size_t>(numeric::get_msb64(num_rows));
        size_t num_rows_pow2 = 1UL << (num_rows_log2 + (1UL << num_rows_log2 == num_rows ? 0 : 1));
        return num_rows_pow2;
    }
};
} // namespace proof_system