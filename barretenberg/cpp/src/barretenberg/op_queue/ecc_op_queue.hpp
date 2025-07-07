// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/eccvm/eccvm_builder_types.hpp"
#include "barretenberg/op_queue/ecc_ops_table.hpp"
#include "barretenberg/op_queue/eccvm_row_tracker.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
namespace bb {

/**
 * @brief Used to construct execution trace representations of elliptic curve operations.
 * @details Constructs and stores tables of ECC operations in two formats: the ECCVM format and the
 * Ultra-arithmetization (width-4) format. The ECCVM format is used to construct the execution trace for the ECCVM
 * circuit, while the Ultra-arithmetization is used in the Mega circuits and the Translator VM. Both tables are
 * constructed via successive pre-pending of subtables of the same format, where each subtable represents the operations
 * of a single circuit.
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
    // Constructor that instantiates an initial ECC op subtable
    ECCOpQueue(MergeSettings settings = MergeSettings::PREPEND) { initialize_new_subtable(settings); }

    // Initialize a new subtable of ECCVM ops and Ultra ops corresponding to an individual circuit
    void initialize_new_subtable(MergeSettings settings = MergeSettings::PREPEND)
    {
        eccvm_ops_table.create_new_subtable(settings);
        ultra_ops_table.create_new_subtable(settings);
    }

    MergeSettings get_current_settings() const { return eccvm_ops_table.settings; }

    // Construct polynomials corresponding to the columns of the full aggregate ultra ecc ops table
    std::array<Polynomial<Fr>, ULTRA_TABLE_WIDTH> construct_ultra_ops_table_columns() const
    {
        return ultra_ops_table.construct_table_columns();
    }

    // Construct polys corresponding to the columns of the aggregate ultra ops table, excluding the most recent subtable
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

    size_t get_ultra_ops_table_num_rows() const { return ultra_ops_table.ultra_table_size(); }
    size_t get_current_ultra_ops_subtable_num_rows() const { return ultra_ops_table.current_ultra_subtable_size(); }
    size_t get_previous_ultra_ops_table_num_rows() const { return ultra_ops_table.previous_ultra_table_size(); }

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1339): Consider making the ultra and eccvm ops getters
    // more memory efficient

    // Get the full table of ECCVM ops in contiguous memory; construct it if it has not been constructed already
    std::vector<ECCVMOperation>& get_eccvm_ops()
    {
        if (eccvm_ops_reconstructed.empty()) {
            construct_full_eccvm_ops_table();
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
     * @brief Get the number of rows for the current ECCVM circuit
     */
    size_t get_num_rows() const { return eccvm_row_tracker.get_num_rows(); }

    /**
     * @brief get number of muls for the current ECCVM circuit
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
    void empty_row_for_testing() { append_eccvm_op(ECCVMOperation{ .base_point = point_at_infinity }); }

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
     * @details We want to be able to add zero rows (and, eventually, random rows
     * https://github.com/AztecProtocol/barretenberg/issues/1360) to the ultra ops table without affecting the
     * operations in the ECCVM.
     */
    UltraOp no_op_ultra_only()
    {
        EccOpCode op_code{};

        // Construct and store the operation in the ultra op format
        return construct_and_populate_ultra_ops(op_code, accumulator);
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

  private:
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
        if (converted_u256.get_msb() <= 128) {
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
