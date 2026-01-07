// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

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
 * Tables grow via prepending subtables (one per circuit in an IVC). The deque-based storage avoids
 * expensive memory reallocation. See ecc_ops_table.hpp for details.
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

    // Storage for the reconstructed eccvm ops table in contiguous memory. (Intended to be constructed once and for all
    // prior to ECCVM construction to avoid repeated prepending of subtables in physical memory).
    std::vector<ECCVMOperation> eccvm_ops_reconstructed;

    // Storage for the reconstructed ultra ops table in contiguous memory. (Intended to be constructed once and for all
    // prior to Translator circuit construction to avoid repeated prepending of subtables in physical memory).
    std::vector<UltraOp> ultra_ops_reconstructed;

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

    size_t get_current_subtable_size() const { return ultra_ops_table.get_current_subtable_size(); }

    void merge(MergeSettings settings = MergeSettings::PREPEND, std::optional<size_t> ultra_fixed_offset = std::nullopt)
    {
        eccvm_ops_table.merge(settings);
        ultra_ops_table.merge(settings, ultra_fixed_offset);
    }

    // Construct polynomials corresponding to the columns of the full aggregate ultra ecc ops table
    std::array<Polynomial<Fr>, ULTRA_TABLE_WIDTH> construct_ultra_ops_table_columns() const
    {
        return ultra_ops_table.construct_table_columns();
    }

    // Construct polys corresponding to the columns of the aggregate ultra ops table, excluding the most recent
    // subtable
    std::array<Polynomial<Fr>, ULTRA_TABLE_WIDTH> construct_previous_ultra_ops_table_columns() const
    {
        return ultra_ops_table.construct_previous_table_columns();
    }

    // Construct polynomials corresponding to the columns of the current subtable of ultra ecc ops
    std::array<Polynomial<Fr>, ULTRA_TABLE_WIDTH> construct_current_ultra_ops_subtable_columns() const
    {
        return ultra_ops_table.construct_current_ultra_ops_subtable_columns();
    }

    // Reconstruct the full table of eccvm ops in contiguous memory from the independent subtables
    void construct_full_eccvm_ops_table() { eccvm_ops_reconstructed = eccvm_ops_table.get_reconstructed(); }

    // Reconstruct the full table of ultra ops in contiguous memory from the independent subtables
    void construct_full_ultra_ops_table() { ultra_ops_reconstructed = ultra_ops_table.get_reconstructed(); }

    size_t get_ultra_ops_table_num_rows() const { return ultra_ops_table.num_ultra_rows(); }
    size_t get_ultra_ops_count() const { return ultra_ops_table.num_ops(); } // actual operation count without padding
    size_t get_current_ultra_ops_subtable_num_rows() const { return ultra_ops_table.current_ultra_subtable_size(); }
    size_t get_previous_ultra_ops_table_num_rows() const { return ultra_ops_table.previous_ultra_table_size(); }

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1339): Consider making the ultra and eccvm ops
    // getters more memory efficient

    // Get the full table of ECCVM ops in contiguous memory; construct it if it has not been constructed already.
    // The hiding op (set via append_hiding_op) is always prepended at index 0.
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

    std::vector<UltraOp>& get_ultra_ops()
    {
        if (ultra_ops_reconstructed.empty()) {
            construct_full_ultra_ops_table();
        }
        return ultra_ops_reconstructed;
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
     * @brief Writes a no op (i.e. two zero rows) to the ultra ops table but adds no eccvm operations.
     *
     * @details We want to be able to add zero rows to the ultra ops table without affecting the
     * operations in the ECCVM.
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
     * This method should be called ONCE per IVC in the tail kernel, after the random non-ops.
     *
     * @param Px Random field element (not necessarily a valid x-coordinate on BN254)
     * @param Py Random field element (not necessarily a valid y-coordinate on BN254)
     * @return The UltraOp that was pushed to the table (for use by circuit builder to add gates)
     */
    UltraOp append_hiding_op(const Fq& Px, const Fq& Py)
    {
        // Create an ECCVM operation with q_eq = 1, q_reset = 1 (opcode = 3) and the random Px, Py values.
        // We construct the base_point directly with the raw coordinates - it may not be on the curve.
        // Note: reset = true is required for Translator compatibility (only opcodes {0,3,4,8} are allowed)
        EccOpCode op_code{ .eq = true, .reset = true }; // q_eq = 1, q_reset = 1
        Point base_point;
        base_point.x = Px;
        base_point.y = Py;
        // Note: We don't call is_point_at_infinity() or any curve operations on this point

        // Store the hiding op for ECCVM - it will be prepended to the front during reconstruction (index 0 -> row 1)
        hiding_op_for_eccvm = ECCVMOperation{ .op_code = op_code, .base_point = base_point };
        has_hiding_op = true;

        // Push to Ultra ops through normal flow (appends to current subtable)
        // Decompose Px, Py (Fq) into hi-lo chunks (Fr)
        const size_t CHUNK_SIZE = 2 * stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION;
        uint256_t x_256(Px);
        uint256_t y_256(Py);
        UltraOp ultra_op{
            .op_code = op_code,
            .x_lo = Fr(x_256.slice(0, CHUNK_SIZE)),
            .x_hi = Fr(x_256.slice(CHUNK_SIZE, CHUNK_SIZE * 2)),
            .y_lo = Fr(y_256.slice(0, CHUNK_SIZE)),
            .y_hi = Fr(y_256.slice(CHUNK_SIZE, CHUNK_SIZE * 2)),
            .z_1 = Fr(0),
            .z_2 = Fr(0),
            .return_is_infinity = false,
        };
        ultra_ops_table.push(ultra_op);

        // Do NOT update the accumulator - the hiding op doesn't perform any actual EC computation
        return ultra_op;
    }

  private:
    // === Hiding Op State ===
    // The hiding op is handled asymmetrically but ends up at the same functional relative position in both:
    // - ECCVM: Stored here and prepended at index 0 during get_eccvm_ops() reconstruction
    // - Ultra: Pushed to ultra_ops_table at index 4 (after 1 no-op + 3 random padding ops)
    //
    // Both end up with hiding op as the first "real" op because:
    // - ECCVM: prepending puts it at index 0; padding ops don't exist in ECCVM table
    // - Translator: skips first 4 Ultra ops (padding), so accumulation starts at the hiding op
    //
    // This alignment is required for the translation check (ECCVM and Translator must compute
    // the same accumulated_result). ECCVM places it at row 1 (lagrange_second) where on-curve
    // and eq constraints are gated off, allowing non-curve (x, y) values.
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
