#pragma once

#include "./baby_vm_types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/proof_system/circuit_builder/baby_vm/baby_vm_state.hpp"
#include "barretenberg/proof_system/circuit_builder/execution_trace_builder_base.hpp"
#include "barretenberg/proof_system/relations/baby_vm/baby_vm_relation.hpp"
#include "barretenberg/proof_system/relations/baby_vm/baby_vm_row.hpp"
#include "barretenberg/proof_system/relations/relation_parameters.hpp"

namespace proof_system {

class BabyVMTraceBuilder : public ExecutionTraceBuilderBase<arithmetization::BabyVM> {
  public:
    using VMOperation = baby_vm::VMOperation<FF>; // high-level description of an operation
    using Row = BabyVMRow<FF>;                    // the type of a row in the execution trace

    // WORKNOTE: We should have constructors that allow us to reserve space for these vectors.
    std::vector<VMOperation> vm_operations;
    std::vector<Row> rows;
    // WORKTODO: instead store columns as vectors? This is what we do with circuit builders.


    // EXERCISE NOTE: In practice, some operations will span multiple execution trace rows.
    void add_accumulate(const FF& to_add)
    {
        vm_operations.emplace_back(VMOperation{
            .add = true,
            .mul = false,
            .eq = false,
            .scalar = to_add,
        });
    }

    void mul_accumulate(const FF& to_mul)
    {
        vm_operations.emplace_back(VMOperation{
            .add = false,
            .mul = true,
            .eq = false,
            .reset = false,
            .scalar = to_mul,
        });
    }

    void eq_and_reset(const FF& expected)
    {
        vm_operations.emplace_back(VMOperation{
            .add = false,
            .mul = false,
            .eq = true,
            .reset = true, // WORKTODO
            .scalar = expected,
        });
    }

    // EXERCISE NOTE: add error case and error handling?
    void build_execution_trace()
    {
        FF previous_accumulator = 0;
        BabyVMState<FF> state;
        for (auto& op : vm_operations) {
            if (op.eq && op.reset) {
                state.accumulator = previous_accumulator;
                rows.push_back({ .scalar = op.scalar,
                                 .q_mul = 0,
                                 .q_add = 0,
                                 .accumulator = state.accumulator,
                                 .previous_accumulator = previous_accumulator });
                state.accumulator = 0;
                previous_accumulator = 0;
            } else if (op.add) {
                state.accumulator = previous_accumulator + op.scalar;
                rows.push_back({ .scalar = op.scalar,
                                 .q_mul = 0,
                                 .q_add = 1,
                                 .accumulator = state.accumulator,
                                 .previous_accumulator = previous_accumulator });
            } else if (op.mul) {
                state.accumulator = previous_accumulator * op.scalar;
                rows.push_back({ .scalar = op.scalar,
                                 .q_mul = 1,
                                 .q_add = 0,
                                 .accumulator = state.accumulator,
                                 .previous_accumulator = previous_accumulator });
            } else {
                ASSERT(false);
            }
            previous_accumulator = state.accumulator;
        }
    }

    [[maybe_unused]] bool check_gates()
    {
        // WORKTODO Reuse the nice pausing structure created by Keha in Ultra and Standard circuit builders.
        build_execution_trace();
        return evaluate_relation<BabyVMRelation<FF>, Row>("BabyVMRelation", rows);
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
