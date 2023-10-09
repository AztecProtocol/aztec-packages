#pragma once

#include "barretenberg/ecc/curves/bn254/fr.hpp"
// #include "barretenberg/honk/flavor/fib_vm.hpp"
#include "barretenberg/proof_system/arithmetization/arithmetization.hpp"
#include "barretenberg/proof_system/circuit_builder/execution_trace_builder_base.hpp"
#include "barretenberg/proof_system/flavor/flavor.hpp"
#include "barretenberg/proof_system/relations/fib_vm/fib_relation.hpp"
#include "barretenberg/proof_system/relations/relation_parameters.hpp"

namespace proof_system {
template <typename FF> struct FibVMState {
    FF fib_number;
};

class FibVMTraceBuilder : public ExecutionTraceBuilderBase<arithmetization::FibVM> {
  public:
    using FF = arithmetization::FibVM::FF;
    using VMOperation = fib_vm::VMOperation<FF>; // high-level description of an operation
    using Row = fib_vm::FibRow<FF>;

    // NOTE: this was wrecking me with a circular dependency
    // using Flavor = honk::flavor::fib_vm::FibVM;
    // using RawPolynomials = typename Flavor::RawPolynomials;
    // using Polynomial = typename Flavor::Polynomial;

    static constexpr size_t NUM_WIRES = 5;

    size_t n = 0; // The n in the fib sequence that we would like to target
    std::vector<Row> rows;

    // This is related to permutations,
    // it maps a set of tags to another set of tags
    // The values of each tag are expected to be permutations of one another
    // ( called tau in ultra builder )
    std::map<uint32_t, uint32_t> tag_mappings;
    // The values which a tag holds
    std::map<uint32_t, std::vector<FF>> tag_values;

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

        // Crate permutation groups

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

        // Create a generalised tag mapping x to x_shift
        create_tag(0, 1);
        assign_tag_to_column(0, 0); // x
        assign_tag_to_column(1, 2); // x_shift

        // Assign y to y_shift
        create_tag(2, 3);
        assign_tag_to_column(2, 1); // y
        assign_tag_to_column(3, 3); // y_shift
    }

    // Create a permutation between two different columns, in this case we want to create a relation
    // between x and x_shift, and y and y_shift
    // Normally we would do the shifts another way ( the code is in the pcs section ) but for this excercise
    // we do so here
    [[maybe_unused]] void add_column_permutation_checks()
    {
        // Assign
    }

    [[maybe_unused]] void print_rows()
    {
        size_t i = 0;
        for (auto& row : this->rows) {
            info(i++);
            info(row);
        }
    }

    void create_tag(const uint32_t tag_index, const uint32_t tau_index)
    {
        this->tag_mappings.insert({ tag_index, tau_index });
    }

    // This takes a column and applies all of it to a specific tag
    void assign_tag_to_column(const uint32_t tag, const size_t column_index)
    {
        // Get the value of the column
        size_t size = this->rows.size();
        for (size_t i = 0; i < size; ++i) {
            const auto val = this->rows[i][column_index];
            this->tag_values[tag].push_back(val); // NOte: extremely inefficient
        }
    }

    void check_permutations()
    {
        // For each tag that exists in the tag mappings, we want to pull the set of values and check that
        // the permutation identity holds for them

        const auto challenge_gamma = FF::random_element();
        for (const auto& kv : this->tag_mappings) {
            FF left_tag_product = FF::one();
            FF right_tag_product = FF::one();

            // Get the tag
            auto tag_in = kv.first;
            auto tag_out = kv.second;

            // Get the values for tag 1
            std::vector<FF> tag_1_perm = this->tag_values[tag_in];
            std::vector<FF> tag_2_perm = this->tag_values[tag_out];

            // Assert that the perms are the same length
            assert(tag_1_perm.size() == tag_2_perm.size());

            // Check that the permutation holds
            for (size_t i = 0; i < tag_1_perm.size(); ++i) {
                // TODO(Maddiaa): is tag_in here the literal tau value that labels the group?
                left_tag_product *= tag_1_perm[i] + challenge_gamma * FF(tag_in);
                right_tag_product *= tag_2_perm[i] + challenge_gamma * FF(tag_out);
            }

            if (left_tag_product == right_tag_product) {
                info("Perm failed");
                throw std::runtime_error("Perm failed");
            }
        }
    }

    // NOTE: the methods below appear to just be some boiler plate that really is not
    // too important to the execution of the trace
    [[maybe_unused]] bool check_gates()
    {
        build_execution_trace();
        // print_rows();

        // Check column permutations
        check_permutations();

        // TODO:

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