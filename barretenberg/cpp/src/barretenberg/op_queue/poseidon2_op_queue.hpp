#pragma once

#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/op_queue/ecc_ops_table.hpp" // for MergeSettings enum
#include "barretenberg/polynomials/polynomial.hpp"
#include <deque>

namespace bb {

/**
 * @brief Manages deferred Poseidon2 hash operations for IVC.
 *
 * @details Analogous to ECCOpQueue but much simpler: no curve cycling, no coordinate decomposition,
 * no ECCVM format. Each hash operation records the 4-element sponge state (before permutation) and
 * the hash output (state[0] after permutation) = 5 values across 2 rows of 4 op wires.
 *
 * Data layout per operation (2 rows, 4 wires):
 *   Row 0: state[0], state[1], state[2], state[3]  (sponge state before permutation)
 *   Row 1: output,   0,        0,        0          (hash output = state[0] after permutation)
 *
 * Subtables are stored in a deque (matching ECCOpQueue pattern) for efficient merge protocol
 * accumulation across IVC iterations. The merge protocol proves correct concatenation of subtables.
 *
 * NOTE: This is a standalone implementation. In a future refactor, the merge protocol could be
 * templated to share code with the ECC merge protocol (see MergeProver/MergeVerifier).
 */
class Poseidon2OpQueue {
    using FF = fr;
    using Perm = crypto::Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams>;

  public:
    static constexpr size_t TABLE_WIDTH = 4;
    static constexpr size_t NUM_ROWS_PER_OP = 2;

    struct Poseidon2Op {
        std::array<FF, 4> input; // sponge state before permutation
        FF output;               // hash output = state[0] after permutation
    };

    using Subtable = std::vector<Poseidon2Op>;

  private:
    // Deque-based subtable storage for efficient merge protocol accumulation.
    // Each IVC iteration creates a new subtable. The deque allows efficient prepend/append
    // without reallocating the entire table (matching the ECCOpQueue pattern).
    std::deque<Subtable> merged_subtables;
    Subtable current_subtable;

  public:
    Poseidon2OpQueue() = default;

    /**
     * @brief Add a Poseidon2 hash operation to the queue.
     * @details Computes the permutation natively and records the input state and output.
     * The output can be used as a witness in the circuit; correctness is deferred to
     * the final Poseidon2SingleRowFlavor proof at the end of the IVC chain.
     *
     * @param sponge_state The 4-element sponge state before the permutation
     * @return The hash output (state[0] after permutation)
     */
    FF add_hash_op(const std::array<FF, 4>& sponge_state)
    {
        // Compute the permutation natively
        auto output_state = Perm::permutation(sponge_state);

        // Record the operation
        current_subtable.push_back(Poseidon2Op{
            .input = sponge_state,
            .output = output_state[0],
        });

        return output_state[0];
    }

    /**
     * @brief Initialize a new subtable for the current circuit in the IVC chain.
     */
    void initialize_new_subtable() { current_subtable.clear(); }

    /**
     * @brief Merge the current subtable into the accumulated table.
     * @details Moves the current subtable into the deque of merged subtables.
     * In PREPEND mode, the current subtable is added at the front (matching ECCOpQueue behavior).
     */
    void merge(MergeSettings settings = MergeSettings::PREPEND)
    {
        if (current_subtable.empty()) {
            return;
        }
        if (settings == MergeSettings::PREPEND) {
            merged_subtables.push_front(std::move(current_subtable));
        } else {
            merged_subtables.push_back(std::move(current_subtable));
        }
        current_subtable.clear();
    }

    size_t get_current_subtable_size() const { return current_subtable.size(); }
    size_t get_current_subtable_num_rows() const { return current_subtable.size() * NUM_ROWS_PER_OP; }

    /**
     * @brief Get the total number of rows across all merged subtables (excluding current).
     */
    size_t get_previous_table_num_rows() const
    {
        size_t total = 0;
        for (const auto& subtable : merged_subtables) {
            total += subtable.size();
        }
        return total * NUM_ROWS_PER_OP;
    }

    /**
     * @brief Get the total number of rows including all subtables and the current one.
     */
    size_t get_total_num_rows() const { return get_previous_table_num_rows() + get_current_subtable_num_rows(); }

    size_t get_total_num_ops() const
    {
        size_t total = current_subtable.size();
        for (const auto& subtable : merged_subtables) {
            total += subtable.size();
        }
        return total;
    }

    // ==================== Polynomial construction for merge protocol ====================

    /**
     * @brief Write one Poseidon2 op into 4 column polynomials at a given row offset.
     * @details Row 0: input[0..3], Row 1: output, 0, 0, 0
     */
    static void write_op_to_polynomials(std::array<Polynomial<FF>, TABLE_WIDTH>& polys,
                                        const Poseidon2Op& op,
                                        size_t row_idx)
    {
        polys[0].at(row_idx) = op.input[0];
        polys[1].at(row_idx) = op.input[1];
        polys[2].at(row_idx) = op.input[2];
        polys[3].at(row_idx) = op.input[3];

        polys[0].at(row_idx + 1) = op.output;
        polys[1].at(row_idx + 1) = FF(0);
        polys[2].at(row_idx + 1) = FF(0);
        polys[3].at(row_idx + 1) = FF(0);
    }

    /**
     * @brief Construct polynomials for the full aggregate table (all merged subtables + current).
     */
    std::array<Polynomial<FF>, TABLE_WIDTH> construct_table_columns() const
    {
        const size_t total_rows = get_total_num_rows();
        std::array<Polynomial<FF>, TABLE_WIDTH> columns;
        for (auto& col : columns) {
            col = Polynomial<FF>(total_rows, total_rows);
        }

        size_t row_offset = 0;
        // Merged subtables first
        for (const auto& subtable : merged_subtables) {
            for (const auto& op : subtable) {
                write_op_to_polynomials(columns, op, row_offset);
                row_offset += NUM_ROWS_PER_OP;
            }
        }
        // Then current subtable
        for (const auto& op : current_subtable) {
            write_op_to_polynomials(columns, op, row_offset);
            row_offset += NUM_ROWS_PER_OP;
        }

        return columns;
    }

    /**
     * @brief Construct polynomials for the current subtable only (left table in PREPEND merge).
     */
    std::array<Polynomial<FF>, TABLE_WIDTH> construct_current_subtable_columns() const
    {
        const size_t num_rows = get_current_subtable_num_rows();
        std::array<Polynomial<FF>, TABLE_WIDTH> columns;
        for (auto& col : columns) {
            col = Polynomial<FF>(num_rows, num_rows);
        }

        size_t row_offset = 0;
        for (const auto& op : current_subtable) {
            write_op_to_polynomials(columns, op, row_offset);
            row_offset += NUM_ROWS_PER_OP;
        }

        return columns;
    }

    /**
     * @brief Construct polynomials for previous subtables only (right table in PREPEND merge).
     */
    std::array<Polynomial<FF>, TABLE_WIDTH> construct_previous_table_columns() const
    {
        const size_t num_rows = get_previous_table_num_rows();
        std::array<Polynomial<FF>, TABLE_WIDTH> columns;
        for (auto& col : columns) {
            col = Polynomial<FF>(num_rows, num_rows);
        }

        size_t row_offset = 0;
        for (const auto& subtable : merged_subtables) {
            for (const auto& op : subtable) {
                write_op_to_polynomials(columns, op, row_offset);
                row_offset += NUM_ROWS_PER_OP;
            }
        }

        return columns;
    }

    /**
     * @brief Get all operations in order (all merged subtables + current), for building the final circuit.
     */
    std::vector<Poseidon2Op> get_all_ops() const
    {
        std::vector<Poseidon2Op> all_ops;
        all_ops.reserve(get_total_num_ops());
        for (const auto& subtable : merged_subtables) {
            all_ops.insert(all_ops.end(), subtable.begin(), subtable.end());
        }
        all_ops.insert(all_ops.end(), current_subtable.begin(), current_subtable.end());
        return all_ops;
    }
};

} // namespace bb
