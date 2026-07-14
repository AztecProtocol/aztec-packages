// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/eccvm/eccvm_builder_types.hpp"
#include "barretenberg/op_queue/ecc_ops_table.hpp"
#include "barretenberg/op_queue/eccvm_row_tracker.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
namespace bb {

/**
 * @brief Manages ECC operations for the Goblin proving system.
 *
 * @details This class maintains two parallel representations of ECC operations:
 *
 * 1. **ECCVM format** (eccvm_ops_table): Native operations for the ECCVM circuit.
 *    Each op is one row: {opcode, base_point, z1, z2, mul_scalar_full}
 *
 * 2. **Ultra format** (ultra_ops_table): Width-4 representation for Mega circuits and Translator.
 *    Each op spans 2 rows:
 *      Row 0: OP | X_lo | X_hi | Y_lo
 *      Row 1: 0  | Y_hi | z1   | z2
 *
 * Operations are added via add_accumulate(), mul_accumulate(), and eq_and_reset(). Each operation:
 * - Updates the native accumulator (shadow computation for verification)
 * - Appends to both ECCVM and Ultra tables
 *
 * Tables grow by appending subtables (one per circuit in an IVC). See ecc_ops_table.hpp for details.
 *
 * TODO(https://github.com/AztecProtocol/barretenberg/issues/1267): consider possible efficiency improvements
 */
class ECCOpQueue {
    using Curve = curve::BN254;
    using Point = Curve::AffineElement;
    using Fr = Curve::ScalarField;
    using Fq = Curve::BaseField; // Grumpkin's scalar field
    static constexpr size_t ULTRA_TABLE_WIDTH = UltraEccOpsTable::TABLE_WIDTH;
    Point point_at_infinity = Curve::Group::affine_point_at_infinity;

    // The operations written to the queue are also performed natively; the result is stored in accumulator
    Point accumulator = point_at_infinity;

    EccvmOpsTable eccvm_ops_table;    // table of ops in the ECCVM format
    UltraEccOpsTable ultra_ops_table; // table of ops in the Ultra-arithmetization format

    // Storage for the reconstructed eccvm ops table in contiguous memory. (Intended to be constructed once and for
    // all prior to ECCVM construction to avoid repeated traversal of the per-subtable storage.)
    std::vector<ECCVMOperation> eccvm_ops_reconstructed;

    // Storage for the reconstructed ultra ops tables in contiguous memory. (Intended to be constructed once and for
    // all prior to Translator circuit construction to avoid repeated traversal of the per-subtable storage.)
    std::vector<UltraOp> ultra_ops_zk_reconstructed;    // Chonk table
    std::vector<UltraOp> ultra_ops_no_zk_reconstructed; // AVM table

    // Tracks number of muls and size of eccvm in real time as the op queue is updated
    EccvmRowTracker eccvm_row_tracker;

  public:
    static const size_t OP_QUEUE_SIZE = 1 << CONST_OP_QUEUE_LOG_SIZE;
    /**
     * @brief Instantiate an initial ECC op subtable.
     */
    ECCOpQueue() { initialize_new_subtable(); }

    /**
     * @brief Initialize a new subtable for eccvm and ultra ops with the given merge settings.
     *
     */
    void initialize_new_subtable()
    {
        eccvm_ops_table.create_new_subtable();
        ultra_ops_table.create_new_subtable();
    }

    size_t num_subtables() const { return eccvm_ops_table.num_subtables(); }

    size_t get_current_subtable_size() const { return ultra_ops_table.get_current_subtable_size(); }

    /**
     * @brief Compute the fixed append offset for the final APPEND merge.
     */
    size_t get_append_offset_for_prover() const { return get_append_offset(get_current_subtable_size()); }
    static size_t get_append_offset_for_verifier() { return get_append_offset(bb::HIDING_KERNEL_ULTRA_OPS); }

    // Shift size of the merge / row offset at which the fixed-append subtable's polynomial begins.
    // See UltraEccOpsTable::compute_fixed_append_offset.
    static constexpr size_t compute_fixed_append_offset(size_t append_offset, bool include_zk_prefix = true)
    {
        return UltraEccOpsTable::compute_fixed_append_offset(append_offset, include_zk_prefix);
    }

    void merge()
    {
        eccvm_ops_table.merge();
        ultra_ops_table.merge();
    }

    void merge_fixed_append(size_t ultra_fixed_offset)
    {
        eccvm_ops_table.merge();
        ultra_ops_table.merge_with_fixed_append_offset(ultra_fixed_offset);
    }

    std::array<Polynomial<Fr>, ULTRA_TABLE_WIDTH> construct_zk_columns()
    {
        auto [column_polynomials, hiding_op] = ultra_ops_table.construct_zk_columns();
        this->hiding_op_for_eccvm = hiding_op;
        this->has_hiding_op = true;

        return column_polynomials;
    }

    std::vector<std::array<Polynomial<Fr>, ULTRA_TABLE_WIDTH>> construct_subtable_columns() const
    {
        return ultra_ops_table.construct_subtable_columns();
    }

    // Construct column polynomials for the full aggregate ultra ops table
    std::array<Polynomial<Fr>, ULTRA_TABLE_WIDTH> construct_ultra_ops_table_columns(
        const bool include_zk_ops = true) const
    {
        return ultra_ops_table.construct_table_columns(include_zk_ops);
    }

    // Construct column polynomials for the aggregate table up to and including the tail subtable.
    std::array<Polynomial<Fr>, ULTRA_TABLE_WIDTH> construct_table_columns_up_to_tail() const
    {
        return ultra_ops_table.construct_table_columns_up_to_tail();
    }

    // Construct column polynomials for the most recently merged subtable
    std::array<Polynomial<Fr>, ULTRA_TABLE_WIDTH> construct_current_ultra_ops_subtable_columns() const
    {
        return ultra_ops_table.construct_current_ultra_ops_subtable_columns();
    }

    // Reconstruct the full table of eccvm ops in contiguous memory from the independent subtables
    void construct_full_eccvm_ops_table() { eccvm_ops_reconstructed = eccvm_ops_table.get_reconstructed(); }

    // Reconstruct the ZK-prefixed full table of ultra ops in contiguous memory from the independent subtables.
    void construct_zk_reconstructed_ultra_ops_table()
    {
        ultra_ops_zk_reconstructed = ultra_ops_table.get_zk_reconstructed_ultra_ops();
    }

    // Reconstruct the non-ZK full table of ultra ops in contiguous memory from the independent subtables.
    void construct_no_zk_reconstructed_ultra_ops_table()
    {
        ultra_ops_no_zk_reconstructed = ultra_ops_table.get_no_zk_reconstructed_ultra_ops();
    }

    // Excludes the optional ZK prefix; see UltraEccOpsTable::num_ultra_rows
    size_t get_ultra_ops_table_num_rows() const { return ultra_ops_table.num_ultra_rows(); }
    size_t get_ultra_ops_count() const { return ultra_ops_table.num_ops(); } // actual operation count without padding
    // Excludes the optional ZK prefix, same as get_ultra_ops_table_num_rows.
    size_t get_ultra_ops_table_num_rows_up_to_tail() const { return ultra_ops_table.ultra_table_size_up_to_tail(); }

    // Get the full table of ECCVM ops in contiguous memory; construct it if it has not been constructed already.
    // The hiding op is always prepended at index 0.
    std::vector<ECCVMOperation>& get_eccvm_ops()
    {
        if (eccvm_ops_reconstructed.empty()) {
            construct_full_eccvm_ops_table();
            // Prepend the hiding op at index 0 (required for ZK)
            if (!has_hiding_op) {
                throw_or_abort("Hiding op must be set before calling get_eccvm_ops()");
            }
            eccvm_ops_reconstructed.insert(eccvm_ops_reconstructed.begin(), hiding_op_for_eccvm);
        }
        return eccvm_ops_reconstructed;
    }

    std::vector<UltraOp>& get_no_zk_reconstructed_ultra_ops()
    {
        if (ultra_ops_no_zk_reconstructed.empty()) {
            construct_no_zk_reconstructed_ultra_ops_table();
        }
        return ultra_ops_no_zk_reconstructed;
    }

    std::vector<UltraOp>& get_zk_reconstructed_ultra_ops()
    {
        if (ultra_ops_zk_reconstructed.empty()) {
            construct_zk_reconstructed_ultra_ops_table();
        }
        return ultra_ops_zk_reconstructed;
    }

    /**
     * @brief Get the number of rows in the 'msm' column section, for all msms in the circuit
     */
    size_t get_num_msm_rows() const { return eccvm_row_tracker.get_num_msm_rows(); }

    /**
     * @brief Get the number of rows for the current ECCVM circuit.
     * @note This count does not include the hiding op.
     */
    size_t get_num_rows() const { return eccvm_row_tracker.get_num_rows(); }

    /**
     * @brief Get number of muls for the current ECCVM circuit
     */
    uint32_t get_number_of_muls() const { return eccvm_row_tracker.get_number_of_muls(); }

    /**
     * @brief A fuzzing only method for setting eccvm ops directly
     *
     */
    void set_eccvm_ops_for_fuzzing(std::vector<ECCVMOperation>& eccvm_ops_in)
    {
        eccvm_ops_reconstructed = eccvm_ops_in;
    }

    /**
     * @brief A testing only method that adds an erroneous equality op to the eccvm ops
     * @brief May be used to ensure that ECCVM responds as expected when encountering a bad op
     *
     */
    void add_erroneous_equality_op_for_testing()
    {
        EccOpCode op_code{ .eq = true, .reset = true };
        append_eccvm_op(ECCVMOperation{ .op_code = op_code, .base_point = Point::random_element() });
    }

    /**
     * @brief Write empty row to queue
     * @warning This is for testing purposes only. Currently no valid use case.
     *
     */
    void empty_row_for_testing()
    {
        append_eccvm_op(ECCVMOperation{ .base_point = point_at_infinity });
        accumulator.self_set_infinity();
    }

    Point get_accumulator() { return accumulator; }

    /**
     * @brief Write point addition op to queue and natively perform addition
     *
     * @param to_add
     */
    UltraOp add_accumulate(const Point& to_add)
    {
        // Update the accumulator natively
        accumulator = accumulator + to_add;
        EccOpCode op_code{ .add = true };
        // Store the eccvm operation
        append_eccvm_op(ECCVMOperation{ .op_code = op_code, .base_point = to_add });

        // Construct and store the operation in the ultra op format
        return construct_and_populate_ultra_ops(op_code, to_add);
    }

    /**
     * @brief Write multiply and add op to queue and natively perform operation
     *
     * @param to_add
     */
    UltraOp mul_accumulate(const Point& to_mul, const Fr& scalar)
    {
        BB_BENCH_NAME("ECCOpQueue::mul_accumulate");
        // Update the accumulator natively
        accumulator = accumulator + to_mul * scalar;
        EccOpCode op_code{ .mul = true };

        // Construct and store the operation in the ultra op format
        UltraOp ultra_op = construct_and_populate_ultra_ops(op_code, to_mul, scalar);

        // Store the eccvm operation
        append_eccvm_op(ECCVMOperation{
            .op_code = op_code,
            .base_point = to_mul,
            .z1 = ultra_op.z_1,
            .z2 = ultra_op.z_2,
            .mul_scalar_full = scalar,
        });

        return ultra_op;
    }

    /**
     * @brief Writes a no-op to the ultra ops table but adds no eccvm operations.
     *
     * @details Adds two zero rows (one no-op = NUM_ROWS_PER_OP rows) to the ultra ops table. Translator needs two
     * leading zero rows for polynomial shiftability.
     */
    UltraOp no_op_ultra_only()
    {
        UltraOp no_op{};
        ultra_ops_table.push(no_op);
        return no_op;
    }

    /**
     * @brief Writes randomness to the ultra ops table but adds no eccvm operations.
     *
     * @details This method is used to add randomness to the ultra ops table with the aim of randomising the
     * commitment and evaluations of its corresponding columns
     * @return UltraOp
     */
    UltraOp random_op_ultra_only()
    {
        UltraOp random_op{ .op_code = EccOpCode{ .is_random_op = true,
                                                 .random_value_1 = Fr::random_element(),
                                                 .random_value_2 = Fr::random_element() },
                           .x_lo = Fr::random_element(),
                           .x_hi = Fr::random_element(),
                           .y_lo = Fr::random_element(),
                           .y_hi = Fr::random_element(),
                           .z_1 = Fr::random_element(),
                           .z_2 = Fr::random_element(),
                           .return_is_infinity = false };
        ultra_ops_table.push(random_op);
        return random_op;
    }

    /**
     * @brief Write equality op using internal accumulator point
     *
     * @return current internal accumulator point (prior to reset to 0)
     */
    UltraOp eq_and_reset()
    {
        auto expected = accumulator;
        accumulator.self_set_infinity();
        EccOpCode op_code{ .eq = true, .reset = true };
        // Store eccvm operation
        append_eccvm_op(ECCVMOperation{ .op_code = op_code, .base_point = expected });

        // Construct and store the operation in the ultra op format
        return construct_and_populate_ultra_ops(op_code, expected);
    }

    /**
     * @brief Add a hiding op with random Px, Py values to both ECCVM and Ultra ops tables.
     *
     * @details The hiding op contributes random Px, Py field elements to both ECCVM transcript polynomials
     * and Translator's accumulated_result, providing statistical hiding.
     *
     * In ECCVM: stored separately and prepended to eccvm_ops_reconstructed at index 0 during get_eccvm_ops().
     * This places it at row 1 in the ECCVM transcript table (row 0 is the zero row for shifts),
     * where lagrange_second = 1. The eq and on-curve constraints are gated by (1 - lagrange_second) so they
     * don't apply to this row. The transcript relation enforces q_eq = 1 and q_reset = 1 at this row, ensuring
     * the accumulator is reset so that is_accumulator_empty = 1 at row 2 (the first real op row).
     *
     * In Ultra/Translator: appended to current subtable through normal flow, landing in the accumulation range.
     *
     * The hiding op uses opcode q_eq = 1, q_reset = 1 (value = 3) to preserve the Px, Py values in the
     * transcript. The eq constraint is gated by (1 - lagrange_second) so it doesn't actually check equality. The
     * on-curve check is similarly gated. q_reset = 1 is required for Translator compatibility (only opcodes {0,3,4,8}
     * are allowed).
     *
     * This method writes the same hiding op to both the ECCVM and Ultra tables in one step, ensuring the two
     * representations agree (required for the translation check).
     *
     * @param Px Random field element (not necessarily a valid x-coordinate on BN254)
     * @param Py Random field element (not necessarily a valid y-coordinate on BN254)
     * @return The UltraOp that was pushed to the table (for use by circuit builder to add gates)
     */
    UltraOp append_hiding_op(const Fq& Px, const Fq& Py)
    {
        auto [ultra_op, eccvm_op] = UltraEccOpsTable::make_hiding_op_pair(Px, Py);

        hiding_op_for_eccvm = eccvm_op;
        has_hiding_op = true;
        ultra_ops_table.push(ultra_op);

        // Do NOT update the accumulator - the hiding op doesn't perform any actual EC computation
        return ultra_op;
    }

  private:
    /**
     * @brief Compute the fixed append offset for the final APPEND merge.
     * @details Places the appended subtable so the merged polynomial fits exactly in MINI_CIRCUIT_SIZE rows.
     * The appended subtable carries UltraEccOpsTable::APPEND_TRACE_OFFSET leading zero rows internally,
     * matching the appender flavor's ecc_op_wire layout.
     */
    static size_t get_append_offset(size_t current_subtable_size)
    {
        constexpr size_t reserved_op_slots = UltraEccOpsTable::APPEND_TRACE_OFFSET / UltraEccOpsTable::NUM_ROWS_PER_OP;
        constexpr size_t zk_op_slots = UltraEccOpsTable::ZK_ULTRA_OPS / UltraEccOpsTable::NUM_ROWS_PER_OP;
        return OP_QUEUE_SIZE - current_subtable_size - reserved_op_slots - zk_op_slots;
    }

    // === Hiding Op State ===
    // The hiding op exists in both the ECCVM and Ultra tables (same Px, Py values, opcode q_eq=q_reset=1) so the
    // translation check holds. It is set by exactly one of two entry points, depending on the proving flow:
    //   - Chonk: UltraEccOpsTable::construct_zk_columns() builds the full ZK prefix (1 no-op + 3 random + 1 hiding)
    //     at the front of the reconstructed Ultra table; the hiding op lands at index 4.
    //   - Goblin AVM: append_hiding_op() pushes the Ultra side into the current subtable directly, with no surrounding
    //     prefix.
    // In both cases the ECCVM side is stored here and prepended to the reconstructed ECCVM table at index 0 by
    // get_eccvm_ops(), placing it at row 1 (lagrange_second) where the on-curve and eq constraints are gated off
    // so that non-curve (x, y) values are accepted.
    ECCVMOperation hiding_op_for_eccvm;
    bool has_hiding_op = false;

    /**
     * @brief Append an eccvm operation to the eccvm ops table; update the eccvm row tracker
     *
     */
    void append_eccvm_op(const ECCVMOperation& op)
    {
        eccvm_row_tracker.update_cached_msms(op);
        eccvm_ops_table.push(op);
    }
    /**
     * @brief Given an ecc operation and its inputs, decompose into ultra format and populate ultra_ops
     *
     * @param op_code
     * @param point
     * @param scalar
     * @return UltraOp
     */
    UltraOp construct_and_populate_ultra_ops(EccOpCode op_code, const Point& point, const Fr& scalar = Fr::zero())
    {
        UltraOp ultra_op;
        ultra_op.op_code = op_code;

        // Decompose point coordinates (Fq) into hi-lo chunks (Fr)
        const size_t CHUNK_SIZE = 2 * stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION;
        uint256_t x_256(point.x);
        uint256_t y_256(point.y);
        ultra_op.return_is_infinity = point.is_point_at_infinity();
        // if we have a point at infinity, set x/y to zero
        // in the biggroup_goblin class we use `assert_equal` statements to validate
        // the original in-circuit coordinate values are also zero
        if (point.is_point_at_infinity()) {
            x_256 = 0;
            y_256 = 0;
        }
        ultra_op.x_lo = Fr(x_256.slice(0, CHUNK_SIZE));
        ultra_op.x_hi = Fr(x_256.slice(CHUNK_SIZE, CHUNK_SIZE * 2));
        ultra_op.y_lo = Fr(y_256.slice(0, CHUNK_SIZE));
        ultra_op.y_hi = Fr(y_256.slice(CHUNK_SIZE, CHUNK_SIZE * 2));

        // Split scalar into 128 bit endomorphism scalars
        Fr z_1 = 0;
        Fr z_2 = 0;
        auto converted = scalar.from_montgomery_form();
        uint256_t converted_u256(scalar);
        // if our scalar is small, don't split.
        if (converted_u256.get_msb() < 128) {
            ultra_op.z_1 = scalar;
            ultra_op.z_2 = 0;
        } else {
            Fr::split_into_endomorphism_scalars(converted, z_1, z_2);
            ultra_op.z_1 = z_1.to_montgomery_form();
            ultra_op.z_2 = z_2.to_montgomery_form();
        }

        ultra_ops_table.push(ultra_op);

        return ultra_op;
    }
};

} // namespace bb
