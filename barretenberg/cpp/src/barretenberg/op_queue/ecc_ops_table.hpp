// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/eccvm/eccvm_builder_types.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include <vector>
namespace bb {

static constexpr size_t ECC_NUM_RANDOM_OPS_START = 3;
static constexpr size_t ECC_NUM_NO_OPS_START = 1;
static constexpr size_t ECC_NUM_HIDING_OPS_START = 1;

enum class MergeMode : uint8_t { APPEND, FIXED_APPEND };

/**
 * @brief Defines the opcodes for ECC operations used in both the Ultra and ECCVM formats. There are three opcodes that
 * are reflected in both ultra ops and eccvm table and so, that lead to actual operations in the ECCVM :
 * - addition: add = true, value() = 8
 * - multiplication: mul = true, value() = 4
 * - equality and reset: eq = true, reset = true,  value() = 3
 * On top of that, we see two more opcodes reflected only in the ultra ops table
 * - no operation: all false, value() = 0 - The ultra ops table is seen as 4 column polynomials in the merge protocol
 * and translator. We need to be able to shift these polynomials in translator and so they will have to start with
 * zeroes
 * - random operation: value() should never be called on this - To randomise the commitment and evaluations of the op
 * column polynomial in merge protocol and translator we have to add sufficient randomness. We do this via a "random op"
 * in which case two indices of the op column will be populated with random scalars.
 */
struct EccOpCode {
    using Fr = curve::BN254::ScalarField;
    bool add = false;
    bool mul = false;
    bool eq = false;
    bool reset = false;
    bool operator==(const EccOpCode& other) const = default;

    bool is_random_op = false;
    Fr random_value_1 = Fr(0);
    Fr random_value_2 = Fr(0);

    // encodes add*8 + mul*4 + eq*2 + reset*1
    [[nodiscard]] uint32_t value() const
    {
        if (is_random_op) {
            throw_or_abort("EccOpCode::value() should not be called on a random op");
        }
        auto res = static_cast<uint32_t>(add);
        res += res;
        res += static_cast<uint32_t>(mul);
        res += res;
        res += static_cast<uint32_t>(eq);
        res += res;
        res += static_cast<uint32_t>(reset);
        return res;
    }
};

struct UltraOp {
    using Fr = curve::BN254::ScalarField;
    using Fq = curve::BN254::BaseField;
    EccOpCode op_code;
    Fr x_lo;
    Fr x_hi;
    Fr y_lo;
    Fr y_hi;
    Fr z_1;
    Fr z_2;
    bool return_is_infinity;

    bool operator==(const UltraOp& other) const = default;

    /**
     * @brief Get the point in standard form i.e. as two coordinates x and y in the base field or as a point at
     * infinity whose coordinates are set to (0,0).
     *
     */
    std::array<Fq, 2> get_base_point_standard_form() const
    {
        if (return_is_infinity) {
            return { Fq(0), Fq(0) };
        }
        auto x = Fq((uint256_t(x_hi) << 2 * stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION) + uint256_t(x_lo));
        auto y = Fq((uint256_t(y_hi) << 2 * stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION) + uint256_t(y_lo));

        return { x, y };
    }
};

struct ECCVMOperation {
    using Curve = curve::BN254;
    using AffineElement = Curve::Group::affine_element;
    using Fr = Curve::ScalarField;
    EccOpCode op_code = {};
    AffineElement base_point = { 0, 0 };
    uint256_t z1 = 0;
    uint256_t z2 = 0;
    Fr mul_scalar_full = 0;
    bool operator==(const ECCVMOperation& other) const = default;
};

/**
 * @brief A table of ECC operations
 * @details The table is constructed via append-only concatenation of subtables of ECC operations. Subtables are stored
 * in chronological order.
 *
 * @tparam OpFormat Format of the ECC operations stored in the table
 */
template <typename OpFormat> class EccOpsTable {
    using Subtable = std::vector<OpFormat>;
    std::vector<Subtable> table;
    Subtable current_subtable; // used to store the current subtable before it is added to the table
  public:
    size_t size() const
    {
        BB_ASSERT(current_subtable.empty(),
                  "Current subtable should be merged before computing the size of the full table of ecc ops.");
        size_t total = 0;
        for (const auto& subtable : table) {
            total += subtable.size();
        }

        return total;
    }

    size_t num_subtables() const { return table.size(); }
    size_t get_current_subtable_size() const { return current_subtable.size(); }

    auto& get() const { return table; }

    void push(const OpFormat& op) { current_subtable.push_back(op); }

    void create_new_subtable(size_t size_hint = 0)
    {
        BB_ASSERT(current_subtable.empty(), "Cannot create a new subtable until the current subtable has been merged.");
        current_subtable.reserve(size_hint);
    }

    // const operator[]. (there is no non-const version.)
    const OpFormat& operator[](size_t index) const
    {
        BB_ASSERT(current_subtable.empty(),
                  "Current subtable should be merged before attempting to index into the full table.");
        BB_ASSERT_LT(index, size());
        // simple linear search to find the correct subtable
        for (const auto& subtable : table) {
            if (index < subtable.size()) {
                return subtable[index]; // found the correct subtable
            }
            index -= subtable.size(); // move to the next subtable
        }
        BB_ASSERT(
            false,
            "Unreachable: something has gone wrong with the subtable sizes, which do not add up to the table size.");
        // Unreachable
        return table.front().front();
    }

    // highly inefficient copy-based reconstruction of the table for use in ECCVM/Translator. Used once at the end of an
    // IVC.
    std::vector<OpFormat> get_reconstructed() const
    {
        BB_ASSERT(current_subtable.empty(),
                  "current subtable should be merged before reconstructing the full table of operations.");

        std::vector<OpFormat> reconstructed_table;
        reconstructed_table.reserve(size());
        for (const auto& subtable : table) {
            for (const auto& op : subtable) {
                reconstructed_table.push_back(op);
            }
        }
        return reconstructed_table;
    }

    void merge()
    {
        table.push_back(std::move(current_subtable));
        current_subtable.clear(); // clear the current subtable after merging
        BB_ASSERT(current_subtable.empty(), "current subtable should be empty after merging. Check the merge logic.");
    }
};

/**
 * @brief A VM operation is represented as one row with 6 columns in the ECCVM version of the Op Queue.
 * | OP | X | Y | z_1 | z_2 | mul_scalar_full |
 */
using EccvmOpsTable = EccOpsTable<ECCVMOperation>;

/**
 * @brief Stores a table of elliptic curve operations represented in the Ultra format
 * @details An ECC operation OP involing point P(X,Y) and scalar z is represented in the Ultra format as a tuple of the
 * form {OP, X_lo, X_hi, Y_lo, Y_hi, z1, z2}, where the coordinates are split into hi and lo limbs and z1, z2 are the
 * endomorphism scalars associated with z. Because the Ultra/Mega arithmetization utilizes 4 wires, each op occupies two
 * rows in a width-4 execution trace, arranged as follows:
 *
 *  OP | X_lo | X_hi | Y_lo
 *  0  | Y_hi | z1   | z2
 *
 * The table data is stored in the UltraOp tuple format but is converted to four columns of Fr scalars for use in the
 * polynomials in the proving system.
 */
class UltraEccOpsTable {
  public:
    static constexpr size_t TABLE_WIDTH = 4;     // dictated by the number of wires in the Ultra arithmetization
    static constexpr size_t NUM_ROWS_PER_OP = 2; // A single ECC op is split across two width-4 rows
    static constexpr size_t ZK_ULTRA_OPS =
        (ECC_NUM_RANDOM_OPS_START + ECC_NUM_NO_OPS_START + ECC_NUM_HIDING_OPS_START) * NUM_ROWS_PER_OP;

    // Leading-zero preamble on the APPEND subtable. Matches the appender flavor's TRACE_OFFSET, i.e. the
    // number of leading zeros carried by its ecc_op_wire polynomial commitments. Sourced from
    // NUM_DISABLED_ROWS_IN_SUMCHECK, which is == MegaZKFlavor::TRACE_OFFSET.
    // Must be a multiple of NUM_ROWS_PER_OP so ops land on even row boundaries.
    static constexpr size_t APPEND_TRACE_OFFSET = NUM_DISABLED_ROWS_IN_SUMCHECK;
    static_assert(APPEND_TRACE_OFFSET % NUM_ROWS_PER_OP == 0);

  private:
    using Curve = curve::BN254;
    using Fr = Curve::ScalarField;
    using UltraOpsTable = EccOpsTable<UltraOp>;
    using ColumnPolynomials = std::array<Polynomial<Fr>, TABLE_WIDTH>;

    size_t current_subtable_idx = 0; // index of the most recently merged subtable
    UltraOpsTable table;
    std::vector<UltraOp> zk_ops; // ops used to mask real ops in Chonk

    // For fixed-location append functionality.
    // APPEND mode places the current subtable at a fixed position at the end of the table, ensuring a
    // constant total table size (used for zero-knowledge when the appending circuit is ZK). See
    // chonk/README.md "Constant Merged Table Size for ZK". (Only applicable for ultra ops.)
    std::optional<size_t> fixed_append_offset;
    bool has_fixed_append = false;

    // Size of the appended subtable (including its APPEND_TRACE_OFFSET preamble) in rows, if any.
    size_t appended_subtable_span() const
    {
        BB_ASSERT(has_fixed_append, "Appended subtable span called without fixed append");
        BB_ASSERT(!table.get().empty(), "Appended subtable span called on empty table");

        return APPEND_TRACE_OFFSET + (table.get().back().size() * NUM_ROWS_PER_OP);
    }

  public:
    // Returns the number of ECC operations in the table
    size_t num_ops() const { return table.size(); }

    // Returns the number of rows in the Ultra execution trace (each op occupies NUM_ROWS_PER_OP rows)
    size_t num_ultra_rows() const
    {
        size_t base_size = (table.size() * NUM_ROWS_PER_OP) + (has_fixed_append ? APPEND_TRACE_OFFSET : 0);
        if (has_fixed_append && fixed_append_offset.has_value()) {
            // Include zeros gap and final subtable at fixed location (subtable span includes preamble)
            return std::max(base_size, (fixed_append_offset.value() * NUM_ROWS_PER_OP) + appended_subtable_span());
        }
        return base_size;
    }
    size_t current_ultra_subtable_size() const
    {
        const size_t ops_rows = table.get()[current_subtable_idx].size() * NUM_ROWS_PER_OP;
        return has_fixed_append ? APPEND_TRACE_OFFSET + ops_rows : ops_rows;
    }
    size_t ultra_table_size_up_to_tail() const
    {
        BB_ASSERT(table.num_subtables() > 0, "Cannot compute tail table size without a current subtable");
        size_t size = 0;
        for (size_t subtable_idx = 0; subtable_idx < table.num_subtables() - 1; ++subtable_idx) {
            size += table.get()[subtable_idx].size() * NUM_ROWS_PER_OP;
        }
        return size;
    }
    void create_new_subtable(size_t size_hint = 0) { table.create_new_subtable(size_hint); }
    void push(const UltraOp& op) { table.push(op); }
    void merge(MergeMode mode = MergeMode::APPEND, std::optional<size_t> offset = std::nullopt)
    {
        if (mode == MergeMode::FIXED_APPEND) {
            BB_ASSERT(!has_fixed_append, "Can only perform fixed-location append once");
            // Set fixed location at which to append ultra ops. If nullopt, append right after previous tables.
            fixed_append_offset = offset;
            has_fixed_append = true;
            table.merge();
        } else {
            table.merge();
        }
        current_subtable_idx = table.num_subtables() - 1;
    }

    size_t get_current_subtable_size() const { return table.get_current_subtable_size(); }

    std::vector<UltraOp> get_reconstructed() const
    {
        if (has_fixed_append && fixed_append_offset.has_value()) {
            return get_reconstructed_with_fixed_append(/*is_zk*/ true);
        }
        return table.get_reconstructed();
    }
    std::vector<UltraOp> get_reconstructed_with_fixed_append(bool is_zk) const
    {

        BB_ASSERT(get_current_subtable_size() == 0,
                  "current subtable should be merged before reconstructing the full table of operations.");

        std::vector<UltraOp> reconstructed_table;
        reconstructed_table.reserve(1 << CONST_OP_QUEUE_LOG_SIZE);

        if (is_zk) {
            // Add zk ops as a preamble to the front of the table
            for (const auto& op : zk_ops) {
                reconstructed_table.push_back(op);
            }
        }

        for (size_t subtable_idx = 0; subtable_idx < table.num_subtables() - 1; subtable_idx++) {
            const auto& subtable = table.get()[subtable_idx];
            for (const auto& op : subtable) {
                reconstructed_table.push_back(op);
            }
        }

        // Fill gap with no-ops up to fixed_append_offset, then add no-ops to match the APPEND_TRACE_OFFSET preamble
        if (has_fixed_append && fixed_append_offset.has_value()) {
            size_t current_size = reconstructed_table.size();
            size_t target_offset = fixed_append_offset.value() + (is_zk ? zk_ops.size() : 0);
            BB_ASSERT_LTE(current_size, target_offset, "Current table size is larger than fixed append offset.");

            constexpr size_t preamble_op_slots = APPEND_TRACE_OFFSET / NUM_ROWS_PER_OP;
            reconstructed_table.insert(
                reconstructed_table.end(), target_offset + preamble_op_slots - current_size, UltraOp{ /*no-op*/ });
        }

        // Add the final subtable (appended at fixed location)
        const auto& final_subtable = table.get()[table.num_subtables() - 1];
        for (const auto& op : final_subtable) {
            reconstructed_table.push_back(op);
        }
        return reconstructed_table;
    }

    std::pair<ColumnPolynomials, ECCVMOperation> construct_zk_columns()
    {
        BB_ASSERT(zk_ops.empty(), "ZK ops should only be constructed once.");

        // Construct the table of ops
        for (size_t idx = 0; idx < ECC_NUM_NO_OPS_START; idx++) {
            zk_ops.push_back(UltraOp{ /* no_op */ });
        }

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
        for (size_t idx = 0; idx < ECC_NUM_RANDOM_OPS_START; idx++) {
            zk_ops.push_back(random_op);
        }

        using Fq = curve::BN254::BaseField;
        using Point = curve::BN254::AffineElement;
        Fq Px = Fq::random_element();
        Fq Py = Fq::random_element();
        // Create an ECCVM operation with q_eq = 1, q_reset = 1 (opcode = 3) and the random Px, Py values.
        // We construct the base_point directly with the raw coordinates - it may not be on the curve.
        // Note: reset = true is required for Translator compatibility (only opcodes {0,3,4,8} are allowed)
        EccOpCode op_code{ .eq = true, .reset = true }; // q_eq = 1, q_reset = 1
        Point base_point;
        base_point.x = Px;
        base_point.y = Py;
        // Note: We don't call is_point_at_infinity() or any curve operations on this point

        // Store the hiding op for ECCVM - it will be prepended to the front during reconstruction (index 0 -> row 1)
        auto hiding_op_for_eccvm = ECCVMOperation{ .op_code = op_code, .base_point = base_point };

        // Push to zk ops
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
        zk_ops.push_back(ultra_op);

        const size_t poly_size = (zk_ops.size() * NUM_ROWS_PER_OP);
        BB_ASSERT_EQ(poly_size, ZK_ULTRA_OPS);

        // Construct the column polynomials
        ColumnPolynomials column_polynomials;
        for (auto& poly : column_polynomials) {
            poly = Polynomial<Fr>(poly_size);
        }

        size_t i = 0;
        for (const auto& op : zk_ops) {
            write_op_to_polynomials(column_polynomials, op, i);
            i += NUM_ROWS_PER_OP;
        }

        return { column_polynomials, hiding_op_for_eccvm };
    }

    // Construct column polynomials for all subtables
    std::vector<ColumnPolynomials> construct_subtable_columns() const
    {
        std::vector<ColumnPolynomials> subtable_columns;

        for (size_t idx = 0; idx < table.num_subtables(); idx++) {
            const auto& subtable = table.get()[idx];
            const size_t poly_size = (subtable.size() * NUM_ROWS_PER_OP);
            ColumnPolynomials columns = construct_column_polynomials_from_subtables(poly_size, idx, idx + 1);
            subtable_columns.push_back(std::move(columns));
        }

        return subtable_columns;
    }

    // Construct column polynomials for the full ultra ecc ops table
    ColumnPolynomials construct_table_columns(bool include_zk_ops = false) const
    {
        const size_t poly_size = num_ultra_rows();

        if (has_fixed_append) {
            return construct_column_polynomials_with_fixed_append(poly_size, include_zk_ops);
        }

        return construct_column_polynomials_from_subtables(poly_size, 0, table.num_subtables(), include_zk_ops);
    }

    // Construct column polynomials for the aggregate table up to and including the tail subtable.
    ColumnPolynomials construct_table_columns_up_to_tail() const
    {
        BB_ASSERT(!zk_ops.empty(), "ZK ops should have been constructed before constructing the table up to tail");
        BB_ASSERT(table.num_subtables() > 0, "Cannot construct table up to tail without a current subtable");

        const size_t poly_size = ultra_table_size_up_to_tail();

        return construct_column_polynomials_from_subtables(
            poly_size, 0, table.num_subtables() - 1, /*include_zk_ops=*/true);
    }

    // Construct the columns of the current subtable (first or last depending on prepend/append).
    // For the APPEND path the returned polynomials carry APPEND_TRACE_OFFSET leading zero rows so their
    // commitments match the appender's ecc_op_wire commitments.
    ColumnPolynomials construct_current_ultra_ops_subtable_columns() const
    {
        const size_t leading_zeros = has_fixed_append ? APPEND_TRACE_OFFSET : 0;
        const size_t poly_size = current_ultra_subtable_size();

        ColumnPolynomials column_polynomials;
        if (poly_size == 0) {
            return column_polynomials;
        }
        for (auto& poly : column_polynomials) {
            poly = Polynomial<Fr>(poly_size);
        }

        size_t row = leading_zeros;
        const auto& subtable = table.get()[current_subtable_idx];
        for (const auto& op : subtable) {
            write_op_to_polynomials(column_polynomials, op, row);
            row += NUM_ROWS_PER_OP;
        }
        return column_polynomials;
    }

  private:
    /**
     * @brief Write a single UltraOp to the column polynomials at the given position
     * @details Each op is written across 2 rows (NUM_ROWS_PER_OP)
     * @param column_polynomials The column polynomials to write to
     * @param op The operation to write
     * @param row_idx The starting row index (will write to row_idx and row_idx+1)
     */
    static void write_op_to_polynomials(ColumnPolynomials& column_polynomials, const UltraOp& op, const size_t row_idx)
    {
        column_polynomials[0].at(row_idx) = !op.op_code.is_random_op ? op.op_code.value() : op.op_code.random_value_1;
        column_polynomials[1].at(row_idx) = op.x_lo;
        column_polynomials[2].at(row_idx) = op.x_hi;
        column_polynomials[3].at(row_idx) = op.y_lo;
        column_polynomials[0].at(row_idx + 1) = !op.op_code.is_random_op ? 0 : op.op_code.random_value_2;
        column_polynomials[1].at(row_idx + 1) = op.y_hi;
        column_polynomials[2].at(row_idx + 1) = op.z_1;
        column_polynomials[3].at(row_idx + 1) = op.z_2;
    }

    /**
     * @brief Construct polynomials with fixed-location append
     * @details Process prepended subtables first, then place the appended subtable at the fixed offset. The appended
     * subtable's ops are preceded by APPEND_TRACE_OFFSET zero rows.
     */
    ColumnPolynomials construct_column_polynomials_with_fixed_append(const size_t poly_size,
                                                                     const bool include_zk_ops = false) const
    {
        size_t final_poly_size = poly_size + (include_zk_ops ? ZK_ULTRA_OPS : 0);

        ColumnPolynomials column_polynomials;
        if (final_poly_size == 0) {
            return column_polynomials;
        }
        for (auto& poly : column_polynomials) {
            poly = Polynomial<Fr>(final_poly_size); // Initialized to zeros
        }

        // Process all prepended subtables (all except last)
        size_t i = 0;
        if (include_zk_ops) {
            BB_ASSERT(!zk_ops.empty(), "ZK ops should have been constructed before including them in the columns");
            for (const auto& op : zk_ops) {
                write_op_to_polynomials(column_polynomials, op, i);
                i += NUM_ROWS_PER_OP;
            }
        }

        for (size_t subtable_idx = 0; subtable_idx < table.num_subtables() - 1; subtable_idx++) {
            const auto& subtable = table.get()[subtable_idx];
            for (const auto& op : subtable) {
                write_op_to_polynomials(column_polynomials, op, i);
                i += NUM_ROWS_PER_OP;
            }
        }

        // Place the appended subtable at the fixed offset (skipping its leading-zero preamble).
        const size_t zk_offset = include_zk_ops ? ZK_ULTRA_OPS : 0;
        size_t append_position =
            fixed_append_offset.has_value() ? zk_offset + (fixed_append_offset.value() * NUM_ROWS_PER_OP) : i;
        const auto& appended_subtable = table.get()[table.num_subtables() - 1];

        size_t j = append_position + APPEND_TRACE_OFFSET;
        for (const auto& op : appended_subtable) {
            write_op_to_polynomials(column_polynomials, op, j);
            j += NUM_ROWS_PER_OP;
        }

        // Any gap between prepended tables and appended table remains zeros (from initialization)
        return column_polynomials;
    }

    /**
     * @brief Construct polynomials corresponding to the columns of the reconstructed ultra ops table for the given
     * range of subtables
     * @param target_columns
     */
    ColumnPolynomials construct_column_polynomials_from_subtables(const size_t poly_size,
                                                                  const size_t subtable_start_idx,
                                                                  const size_t subtable_end_idx,
                                                                  const bool include_zk_ops = false) const
    {
        size_t final_poly_size = poly_size + (include_zk_ops ? ZK_ULTRA_OPS : 0);

        ColumnPolynomials column_polynomials;
        if (final_poly_size == 0) {
            return column_polynomials;
        }
        for (auto& poly : column_polynomials) {
            poly = Polynomial<Fr>(final_poly_size);
        }

        size_t i = 0;

        if (include_zk_ops) {
            BB_ASSERT(!zk_ops.empty(), "ZK ops should have been constructed before including them in the columns");
            for (const auto& op : zk_ops) {
                write_op_to_polynomials(column_polynomials, op, i);
                i += NUM_ROWS_PER_OP;
            }
        }

        for (size_t subtable_idx = subtable_start_idx; subtable_idx < subtable_end_idx; ++subtable_idx) {
            const auto& subtable = table.get()[subtable_idx];
            for (const auto& op : subtable) {
                write_op_to_polynomials(column_polynomials, op, i);
                i += NUM_ROWS_PER_OP;
            }
        }
        return column_polynomials;
    }
};

} // namespace bb
