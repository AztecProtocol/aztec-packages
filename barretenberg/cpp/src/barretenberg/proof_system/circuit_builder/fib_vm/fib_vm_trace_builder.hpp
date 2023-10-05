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

        [[maybe_unused]] FF prev_x = 0;
        [[maybe_unused]] FF prev_y = 1;
        [[maybe_unused]] FibVMState<FF> state;

        // In this case if n is not set earlier, the nothing will happen
        for (size_t i = 0; i < n; i++) {
            // rows.push_back({

            // });
        }
    }

    // NOTE: the methods below appear to just be some boiler plate that really is not
    // too important to the execution of the trace
    [[maybe_unused]] bool check_gates()
    {
        build_execution_trace();
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