#pragma once

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/eccvm/eccvm_builder_types.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include "barretenberg/stdlib_circuit_builders/op_queue/ecc_ops_table.hpp"
#include "barretenberg/stdlib_circuit_builders/op_queue/eccvm_row_tracker.hpp"
namespace bb {

/**
 * @brief Used to construct execution trace representations of elliptic curve operations.
 *
 * @details Currently the targets in execution traces are: four advice wires in UltraCircuitBuilder and 5 wires in the
 * ECCVM. In each case, the variable values are stored in this class, since the same values will need to be used later
 * by the TranslationVMCircuitBuilder. The circuit builders will store witness indices which are indices in the
 * ultra (resp. eccvm) ops members of this class (rather than in the builder's variables array).
 */
class ECCOpQueue {
    using Curve = curve::BN254;
    using Point = Curve::AffineElement;
    using Fr = Curve::ScalarField;
    using Fq = Curve::BaseField; // Grumpkin's scalar field
    Point point_at_infinity = Curve::Group::affine_point_at_infinity;

    // The operations written to the queue are also performed natively; the result is stored in accumulator
    Point accumulator = point_at_infinity;

    static constexpr size_t DEFAULT_NON_NATIVE_FIELD_LIMB_BITS = stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION;

    RawEccOpsTable raw_ops_table;
    UltraEccOpsTable ultra_ops_table;

    // Storage for the reconstructed raw ops table in contiguous memory
    std::vector<bb::eccvm::VMOperation<Curve::Group>> raw_ops_reconstructed;

    // Tracks numer of muls and size of eccvm in real time as the op queue is updated
    EccvmRowTracker eccvm_row_tracker;

  public:
    using ECCVMOperation = bb::eccvm::VMOperation<Curve::Group>;

    void initialize_new_subtable()
    {
        raw_ops_table.create_new_subtable();
        ultra_ops_table.create_new_subtable();
    }

    std::array<Polynomial<Fr>, 4> get_ultra_ops_table_columns() const
    {
        return ultra_ops_table.construct_table_columns();
    }

    std::array<Polynomial<Fr>, 4> get_previous_ultra_ops_table_columns() const
    {
        return ultra_ops_table.construct_previous_table_columns();
    }

    std::array<Polynomial<Fr>, 4> get_current_subtable_columns() const
    {
        return ultra_ops_table.construct_current_subtable_columns();
    }

    // Reconstruct the full table of raw ops in contiguous memory from the independent subtables
    void construct_full_raw_ops_table() { raw_ops_reconstructed = raw_ops_table.get_reconstructed(); }

    size_t get_ultra_ops_table_size() const { return ultra_ops_table.ultra_table_size(); }
    size_t get_current_ultra_ops_subtable_size() const { return ultra_ops_table.current_ultra_subtable_size(); }

    std::vector<ECCVMOperation>& get_raw_ops()
    {
        if (raw_ops_reconstructed.empty()) {
            construct_full_raw_ops_table();
        }
        return raw_ops_reconstructed;
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

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/905): Can remove this with better handling of scalar
    // mul against 0
    void append_nonzero_ops()
    {
        // Add an element and scalar the accumulation of which leaves no Point-at-Infinity commitments
        const auto x = uint256_t(0xd3c208c16d87cfd3, 0xd97816a916871ca8, 0x9b85045b68181585, 0x30644e72e131a02);
        const auto y = uint256_t(0x3ce1cc9c7e645a83, 0x2edac647851e3ac5, 0xd0cbe61fced2bc53, 0x1a76dae6d3272396);
        auto padding_element = Point(x, y);
        auto padding_scalar = -Fr::one();
        mul_accumulate(padding_element, padding_scalar);
        eq_and_reset();
    }

    /**
     * @brief A fuzzing only method for setting raw ops directly
     *
     */
    void set_raw_ops_for_fuzzing(std::vector<ECCVMOperation>& raw_ops_in) { raw_ops_reconstructed = raw_ops_in; }

    /**
     * @brief A testing only method that adds an erroneous equality op to the raw ops
     * @brief May be used to ensure that ECCVM responds as expected when encountering a bad op
     *
     */
    void add_erroneous_equality_op_for_testing()
    {
        append_raw_op(ECCVMOperation{ .eq = true, .reset = true, .base_point = Point::random_element() });
    }

    /**
     * @brief Write empty row to queue
     * @warning This is for testing purposes only. Currently no valid use case.
     *
     */
    void empty_row_for_testing() { append_raw_op(ECCVMOperation{ .base_point = point_at_infinity }); }

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

        // Store the raw operation
        append_raw_op(ECCVMOperation{ .add = true, .base_point = to_add });

        // Construct and store the operation in the ultra op format
        return construct_and_populate_ultra_ops(ADD_ACCUM, to_add);
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

        // Construct and store the operation in the ultra op format
        UltraOp ultra_op = construct_and_populate_ultra_ops(MUL_ACCUM, to_mul, scalar);

        // Store the raw operation
        append_raw_op(ECCVMOperation{
            .mul = true,
            .base_point = to_mul,
            .z1 = ultra_op.z_1,
            .z2 = ultra_op.z_2,
            .mul_scalar_full = scalar,
        });

        return ultra_op;
    }

    /**
     * @brief Write no op (i.e. empty row)
     *
     */
    UltraOp no_op()
    {
        // Store raw operation
        append_raw_op(ECCVMOperation{});

        // Construct and store the operation in the ultra op format
        return construct_and_populate_ultra_ops(NULL_OP, accumulator);
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

        // Store raw operation
        append_raw_op(ECCVMOperation{ .eq = true, .reset = true, .base_point = expected });

        // Construct and store the operation in the ultra op format
        return construct_and_populate_ultra_ops(EQUALITY, expected);
    }

  private:
    void append_raw_op(const ECCVMOperation& op)
    {
        eccvm_row_tracker.update_cached_msms(op);
        raw_ops_table.push(op);
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
        ultra_op.op = Fr(static_cast<uint256_t>(op_code));

        // Decompose point coordinates (Fq) into hi-lo chunks (Fr)
        const size_t CHUNK_SIZE = 2 * DEFAULT_NON_NATIVE_FIELD_LIMB_BITS;
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
