#pragma once

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/eccvm/eccvm_builder_types.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include "barretenberg/stdlib_circuit_builders/op_queue/ecc_op_queue.hpp"
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
class NewECCOpQueue {
    using Curve = curve::BN254;
    using Point = Curve::AffineElement;
    using Fr = Curve::ScalarField;
    Point point_at_infinity = Curve::Group::affine_point_at_infinity;

    static constexpr size_t ULTRA_OPS_TABLE_WIDTH = 4;

    // The operations written to the queue are also performed natively; the result is stored in accumulator
    Point accumulator = point_at_infinity;

    static constexpr size_t DEFAULT_NON_NATIVE_FIELD_LIMB_BITS = stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION;

    std::vector<bb::eccvm::VMOperation<Curve::Group>> raw_ops;
    std::array<std::vector<Fr>, 4> ultra_ops; // ops encoded in the width-4 Ultra format

    // Tracks numer of muls and size of eccvm in real time as the op queue is updated
    EccvmRowTracker eccvm_row_tracker;

    struct UltraSubtable {
        std::array<std::vector<fr>, 4> columns;
        std::unique_ptr<UltraSubtable> prev;

        UltraSubtable(const size_t size_hint = 0)
        {
            // reserve space for the columns
            for (auto& column : columns) {
                column.reserve(size_hint);
            }
        }

        size_t size() const { return columns[0].size(); }

        /**
         * @brief Populate two rows of the table, representing a complete ECC operation
         * @note Only the first 'op' field is utilized so the second is explicitly set to 0
         *
         */
        void append_operation(const UltraOp& tuple)
        {
            columns[0].emplace_back(tuple.op);
            columns[1].emplace_back(tuple.x_lo);
            columns[2].emplace_back(tuple.x_hi);
            columns[3].emplace_back(tuple.y_lo);

            columns[0].emplace_back(0);
            columns[1].emplace_back(tuple.y_hi);
            columns[2].emplace_back(tuple.z_1);
            columns[3].emplace_back(tuple.z_2);
        }
    };

    std::unique_ptr<UltraSubtable> current_ultra_subtable = std::make_unique<UltraSubtable>();

  public:
    using ECCVMOperation = bb::eccvm::VMOperation<Curve::Group>;

    void append_ultra_op(const UltraOp& op) { current_ultra_subtable->append_operation(op); }

    size_t ultra_ops_table_size() const
    {
        size_t total_size = 0;
        for (auto* subtable = current_ultra_subtable.get(); subtable != nullptr; subtable = subtable->prev.get()) {
            total_size += subtable->size();
        }
        return total_size;
    }

    void concatenate_ultra_subtable(const size_t size_hint = 0)
    {
        auto new_ultra_subtable = std::make_unique<UltraSubtable>(size_hint); // new empty subtable
        new_ultra_subtable->prev = std::move(current_ultra_subtable);         // link new subtable to current subtable
        current_ultra_subtable = std::move(new_ultra_subtable);               // update current subtable
    }

    void populate_ultra_ops_table(std::array<std::span<Fr>, ULTRA_OPS_TABLE_WIDTH>& ultra_ops_table)
    {
        size_t i = 0;
        for (auto* subtable = current_ultra_subtable.get(); subtable != nullptr; subtable = subtable->prev.get()) {
            for (size_t j = 0; j < subtable->size(); ++j) {
                ultra_ops_table[0][i] = subtable->columns[0][j];
                ultra_ops_table[1][i] = subtable->columns[1][j];
                ultra_ops_table[2][i] = subtable->columns[2][j];
                ultra_ops_table[3][i] = subtable->columns[3][j];
                ++i;
            }
        }
    }

    const std::vector<ECCVMOperation>& get_raw_ops() { return raw_ops; }

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
    void set_raw_ops_for_fuzzing(std::vector<ECCVMOperation>& raw_ops_in) { raw_ops = raw_ops_in; }

    /**
     * @brief A testing only method that adds an erroneous equality op to the raw ops
     * @brief May be used to ensure that ECCVM responds as expected when encountering a bad op
     *
     */
    void add_erroneous_equality_op_for_testing()
    {
        raw_ops.emplace_back(ECCVMOperation{ .eq = true, .reset = true, .base_point = Point::random_element() });
    }

    /**
     * @brief Write empty row to queue
     * @warning This is for testing purposes only. Currently no valid use case.
     *
     */
    void empty_row_for_testing()
    {
        raw_ops.emplace_back(ECCVMOperation{ .base_point = point_at_infinity });

        eccvm_row_tracker.update_cached_msms(raw_ops.back());
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

        // Store the raw operation
        raw_ops.emplace_back(ECCVMOperation{ .add = true, .base_point = to_add });
        eccvm_row_tracker.update_cached_msms(raw_ops.back());

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
        raw_ops.emplace_back(ECCVMOperation{
            .mul = true,
            .base_point = to_mul,
            .z1 = ultra_op.z_1,
            .z2 = ultra_op.z_2,
            .mul_scalar_full = scalar,
        });
        eccvm_row_tracker.update_cached_msms(raw_ops.back());

        return ultra_op;
    }

    /**
     * @brief Write no op (i.e. empty row)
     *
     */
    UltraOp no_op()
    {
        // Store raw operation
        raw_ops.emplace_back(ECCVMOperation{});
        eccvm_row_tracker.update_cached_msms(raw_ops.back());

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
        raw_ops.emplace_back(ECCVMOperation{ .eq = true, .reset = true, .base_point = expected });
        eccvm_row_tracker.update_cached_msms(raw_ops.back());

        // Construct and store the operation in the ultra op format
        return construct_and_populate_ultra_ops(EQUALITY, expected);
    }

  private:
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

        append_to_ultra_ops(ultra_op);
        current_ultra_subtable->append_operation(ultra_op);

        return ultra_op;
    }

    /**
     * @brief Populate two rows of the ultra ops,representing a complete ECC operation
     * @note Only the first 'op' field is utilized so the second is explicitly set to 0
     *
     * @param tuple
     */
    void append_to_ultra_ops(UltraOp tuple)
    {
        ultra_ops[0].emplace_back(tuple.op);
        ultra_ops[1].emplace_back(tuple.x_lo);
        ultra_ops[2].emplace_back(tuple.x_hi);
        ultra_ops[3].emplace_back(tuple.y_lo);

        ultra_ops[0].emplace_back(0);
        ultra_ops[1].emplace_back(tuple.y_hi);
        ultra_ops[2].emplace_back(tuple.z_1);
        ultra_ops[3].emplace_back(tuple.z_2);
    }
};

} // namespace bb
