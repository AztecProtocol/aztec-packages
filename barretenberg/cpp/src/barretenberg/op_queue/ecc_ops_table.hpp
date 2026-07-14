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

// Constants determining the structure of the zk columns. These must match the structure expected by Translator.
static constexpr size_t ECC_NUM_RANDOM_OPS_START = 3;
static constexpr size_t ECC_NUM_NO_OPS_START = 1;
static constexpr size_t ECC_NUM_HIDING_OPS_START = 1;

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
    static constexpr size_t TABLE_WIDTH = NUM_WIRES; // dictated by the number of wires in the Ultra arithmetization
    static constexpr size_t NUM_ROWS_PER_OP = 2;     // A single ECC op is split across two width-4 rows
    static constexpr size_t ZK_ULTRA_OPS =
        (ECC_NUM_RANDOM_OPS_START + ECC_NUM_NO_OPS_START + ECC_NUM_HIDING_OPS_START) * NUM_ROWS_PER_OP;

    // Leading-zero preamble on the APPEND subtable. Matches the appender flavor's TRACE_OFFSET, i.e. the
    // number of leading zeros carried by its ecc_op_wire polynomial commitments. Sourced from
    // NUM_DISABLED_ROWS_IN_SUMCHECK, which is == MegaZKFlavor::TRACE_OFFSET.
    // Must be a multiple of NUM_ROWS_PER_OP so ops land on even row boundaries.
    static constexpr size_t APPEND_TRACE_OFFSET = NUM_DISABLED_ROWS_IN_SUMCHECK;
    static_assert(APPEND_TRACE_OFFSET % NUM_ROWS_PER_OP == 0);

    /**
     * @brief Shift size of the APPEND merge: the start row of the appended subtable's polynomial in the merged table.
     * @details The shift `k` of the identity M = L + X^k · R: the optional ZK prefix (ZK_ULTRA_OPS rows, present only
     * for the Chonk table) followed by `append_offset` ops (NUM_ROWS_PER_OP rows each) for the tables up to the tail.
     * The appended subtable's polynomial carries the APPEND_TRACE_OFFSET leading zeros itself, so `k` excludes them.
     * For the row at which the appended operations actually begin, see compute_fixed_append_ops_row.
     */
    static constexpr size_t compute_fixed_append_offset(size_t append_offset, bool include_zk_prefix = true)
    {
        return (include_zk_prefix ? ZK_ULTRA_OPS : 0) + (append_offset * NUM_ROWS_PER_OP);
    }

    /**
     * @brief Build a hiding op as paired Ultra and ECCVM operations from raw Fq coordinates.
     *
     * @details Uses opcode q_eq=q_reset=1 (value 3) for Translator compatibility. The base point is constructed
     * directly from (Px, Py); these are not required to lie on the curve since on-curve and equality constraints
     * are gated off at the row where the hiding op lands (lagrange_second in ECCVM). z_1 and z_2 are zero in the
     * Ultra representation since the hiding op performs no scalar multiplication.
     */
    static std::pair<UltraOp, ECCVMOperation> make_hiding_op_pair(const curve::BN254::BaseField& Px,
                                                                  const curve::BN254::BaseField& Py)
    {
        using Fr = curve::BN254::ScalarField;
        using Point = curve::BN254::AffineElement;

        EccOpCode op_code{ .eq = true, .reset = true };
        Point base_point;
        base_point.x = Px;
        base_point.y = Py;

        constexpr size_t CHUNK_SIZE = 2 * stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION;
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
        ECCVMOperation eccvm_op{ .op_code = op_code, .base_point = base_point };
        return { ultra_op, eccvm_op };
    }

  private:
    using Curve = curve::BN254;
    using Fr = Curve::ScalarField;
    using UltraOpsTable = EccOpsTable<UltraOp>;
    using ColumnPolynomials = std::array<Polynomial<Fr>, TABLE_WIDTH>;

    // Row at which the appended subtable's operations begin: the polynomial start (compute_fixed_append_offset) plus
    // the APPEND_TRACE_OFFSET leading-zero preamble that the subtable polynomial carries.
    static constexpr size_t compute_fixed_append_ops_row(size_t append_offset, bool include_zk_prefix)
    {
        return compute_fixed_append_offset(append_offset, include_zk_prefix) + APPEND_TRACE_OFFSET;
    }

    UltraOpsTable table;
    std::vector<UltraOp> zk_ops; // ops used to mask real ops in Chonk

    // Set by merge_with_fixed_append_offset to record the row offset (in NUM_ROWS_PER_OP units) at which the
    // most recent subtable should be placed when constructing the full table polynomials. Setting this value
    // also ensures that subsequent reconstructions/polynomial constructions include the APPEND_TRACE_OFFSET
    // leading-zero preamble for the appended subtable, so the resulting commitments line up with the
    // appender flavor's ecc_op_wire commitments. See chonk/README.md "Constant Merged Table Size for ZK".
    std::optional<size_t> fixed_append_offset;

  public:
    // Returns the number of ECC operations in the table
    size_t num_ops() const { return table.size(); }

    // Returns the number of rows in the Ultra execution trace (each op occupies NUM_ROWS_PER_OP rows).
    // NOTE: this count covers the merged subtables only and EXCLUDES the ZK prefix (zk_ops, size ZK_ULTRA_OPS).
    // Callers that need the full polynomial size (e.g. for sizing a commitment key) must add ZK_ULTRA_OPS.
    size_t num_ultra_rows() const
    {
        if (!has_fixed_append_offset()) {
            return table.size() * NUM_ROWS_PER_OP;
        }
        BB_ASSERT(!table.get().empty(), "Fixed-append set but no subtables present");
        // Last subtable starts at fixed_append_offset (in op units), preceded by APPEND_TRACE_OFFSET zero rows.
        // This count excludes the ZK prefix, hence include_zk_prefix=false.
        const size_t last_subtable_rows = table.get().back().size() * NUM_ROWS_PER_OP;
        return compute_fixed_append_ops_row(fixed_append_offset.value(), /*include_zk_prefix=*/false) +
               last_subtable_rows;
    }
    size_t ultra_table_size_up_to_tail() const
    {
        BB_ASSERT_EQ(
            table.get_current_subtable_size(),
            0UL,
            "Current subtable should be merged before computing the size of table of operations up to the tail.");
        BB_ASSERT_GT(table.num_subtables(), 1UL, "Cannot compute tail table size without at least two tables.");
        size_t size = 0;
        for (size_t subtable_idx = 0; subtable_idx < table.num_subtables() - 1; ++subtable_idx) {
            size += table.get()[subtable_idx].size() * NUM_ROWS_PER_OP;
        }
        return size;
    }
    void create_new_subtable(size_t size_hint = 0) { table.create_new_subtable(size_hint); }
    void push(const UltraOp& op) { table.push(op); }
    bool has_fixed_append_offset() const { return fixed_append_offset.has_value(); }
    bool has_zk_ops() const { return !zk_ops.empty(); }
    void merge()
    {
        BB_ASSERT(!has_fixed_append_offset(), "Cannot perform regular merge after fixed-location append");
        table.merge();
    }
    void merge_with_fixed_append_offset(size_t offset)
    {
        BB_ASSERT(!has_fixed_append_offset(), "Can only perform fixed-location append once");

        size_t prior_subtables_size = 0;
        for (const auto& subtable : table.get()) {
            prior_subtables_size += subtable.size();
        }
        BB_ASSERT_LTE(prior_subtables_size,
                      offset,
                      "Merged table size exceeds fixed append offset. This means that there are too many ops before "
                      "the last subtable. The last subtable doesn't fit at the end of the op queue.");

        fixed_append_offset = offset;
        table.merge();
    }

    size_t get_current_subtable_size() const { return table.get_current_subtable_size(); }

    std::vector<UltraOp> get_no_zk_reconstructed_ultra_ops() const
    {
        return get_reconstructed(/*include_zk_ops=*/false);
    }

    std::vector<UltraOp> get_zk_reconstructed_ultra_ops() const { return get_reconstructed(/*include_zk_ops=*/true); }

  private:
    // Reconstruct the full table of ultra ops in contiguous memory. When include_zk_ops is set, the result includes
    // the ZK prefix at the front. Under fixed-location append, the result then has gap no-ops up to the fixed offset,
    // the APPEND_TRACE_OFFSET zero preamble, then the most recently merged subtable.
    std::vector<UltraOp> get_reconstructed(const bool include_zk_ops) const
    {
        BB_ASSERT_EQ(get_current_subtable_size(),
                     0UL,
                     "current subtable should be merged before reconstructing the full table of operations.");
        BB_ASSERT(!include_zk_ops || has_zk_ops(), "ZK ops must be constructed before reconstructing the Ultra table.");

        std::vector<UltraOp> reconstructed_table;
        reconstructed_table.reserve(1 << CONST_OP_QUEUE_LOG_SIZE);

        if (include_zk_ops) {
            reconstructed_table.insert(reconstructed_table.end(), zk_ops.begin(), zk_ops.end());
        }

        if (!has_fixed_append_offset()) {
            for (const auto& subtable : table.get()) {
                reconstructed_table.insert(reconstructed_table.end(), subtable.begin(), subtable.end());
            }
            return reconstructed_table;
        }

        // Previously-merged subtables (everything except the most recent)
        for (size_t idx = 0; idx + 1 < table.num_subtables(); ++idx) {
            const auto& subtable = table.get()[idx];
            reconstructed_table.insert(reconstructed_table.end(), subtable.begin(), subtable.end());
        }

        // Pad with no-ops up to fixed offset + APPEND_TRACE_OFFSET preamble
        constexpr size_t preamble_op_slots = APPEND_TRACE_OFFSET / NUM_ROWS_PER_OP;
        const size_t zk_offset_ops = include_zk_ops ? zk_ops.size() : 0;
        const size_t target_op_count = fixed_append_offset.value() + zk_offset_ops + preamble_op_slots;
        BB_ASSERT_LTE(
            reconstructed_table.size(), target_op_count, "Current table size is larger than fixed append offset.");
        reconstructed_table.insert(
            reconstructed_table.end(), target_op_count - reconstructed_table.size(), UltraOp{ /* no-op */ });

        // Final subtable
        const auto& final_subtable = table.get().back();
        reconstructed_table.insert(reconstructed_table.end(), final_subtable.begin(), final_subtable.end());
        return reconstructed_table;
    }

  public:
    std::pair<ColumnPolynomials, ECCVMOperation> construct_zk_columns()
    {
        BB_ASSERT(!has_zk_ops(), "ZK ops should only be constructed once.");

        // Construct the table of ops
        for (size_t idx = 0; idx < ECC_NUM_NO_OPS_START; idx++) {
            zk_ops.push_back(UltraOp{ /* no_op */ });
        }

        // Each random op contributes 8 fresh Fr values to the column polynomials, masking commitments and
        // evaluations of the columns in the merge protocol and Translator.
        for (size_t idx = 0; idx < ECC_NUM_RANDOM_OPS_START; idx++) {
            zk_ops.push_back(UltraOp{ .op_code = EccOpCode{ .is_random_op = true,
                                                            .random_value_1 = Fr::random_element(),
                                                            .random_value_2 = Fr::random_element() },
                                      .x_lo = Fr::random_element(),
                                      .x_hi = Fr::random_element(),
                                      .y_lo = Fr::random_element(),
                                      .y_hi = Fr::random_element(),
                                      .z_1 = Fr::random_element(),
                                      .z_2 = Fr::random_element(),
                                      .return_is_infinity = false });
        }

        using Fq = curve::BN254::BaseField;
        auto [hiding_ultra_op, hiding_eccvm_op] = make_hiding_op_pair(Fq::random_element(), Fq::random_element());
        zk_ops.push_back(hiding_ultra_op);

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

        return { column_polynomials, hiding_eccvm_op };
    }

    // Construct column polynomials for all subtables
    std::vector<ColumnPolynomials> construct_subtable_columns() const
    {
        std::vector<ColumnPolynomials> subtable_columns;

        for (size_t idx = 0; idx < table.num_subtables(); idx++) {
            const auto& subtable = table.get()[idx];
            const size_t poly_size = (subtable.size() * NUM_ROWS_PER_OP);
            ColumnPolynomials columns = construct_columns_in_range(poly_size, idx, idx + 1);
            subtable_columns.push_back(std::move(columns));
        }

        return subtable_columns;
    }

    // Construct column polynomials for the full ultra ecc ops table
    ColumnPolynomials construct_table_columns(const bool include_zk_ops = true) const
    {
        BB_ASSERT(!include_zk_ops || has_zk_ops(),
                  "ZK ops must be constructed before constructing the full Ultra table with ZK ops.");
        return construct_columns_in_range(
            num_ultra_rows(), 0, table.num_subtables(), include_zk_ops, fixed_append_offset);
    }

    // Construct column polynomials for the aggregate table up to and including the tail subtable.
    ColumnPolynomials construct_table_columns_up_to_tail() const
    {
        BB_ASSERT(has_zk_ops(), "ZK ops should have been constructed before constructing the table up to tail");
        BB_ASSERT_GT(table.num_subtables(),
                     1UL,
                     "There should be at least two subtables (including the tail) to construct the table up to tail");
        BB_ASSERT_GT(table.num_subtables(), 0UL, "Cannot construct table up to tail without a current subtable");

        return construct_columns_in_range(
            ultra_table_size_up_to_tail(), 0, table.num_subtables() - 1, /*include_zk_ops=*/true);
    }

    // Construct the columns of the most recently merged subtable.
    // Under fixed-location append, the returned polynomials carry APPEND_TRACE_OFFSET leading zero rows so their
    // commitments match the appender's ecc_op_wire commitments.
    ColumnPolynomials construct_current_ultra_ops_subtable_columns() const
    {
        BB_ASSERT(table.num_subtables() > 0, "Cannot construct current subtable columns with no merged subtables");
        const size_t leading_zeros = has_fixed_append_offset() ? APPEND_TRACE_OFFSET : 0;
        const auto& subtable = table.get().back();
        const size_t poly_size = leading_zeros + (subtable.size() * NUM_ROWS_PER_OP);

        ColumnPolynomials column_polynomials;
        if (poly_size == 0) {
            return column_polynomials;
        }
        for (auto& poly : column_polynomials) {
            poly = Polynomial<Fr>(poly_size);
        }

        size_t row = leading_zeros;
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
     * @brief Construct column polynomials covering subtables [start, end), optionally with a ZK prefix and an
     * optional fixed-location placement of the last-in-range subtable.
     *
     * @details Layout (rows in NUM_ROWS_PER_OP units, advancing left to right):
     *   [optional ZK prefix] [subtables [start, sequential_end)] [optional gap] [optional last-in-range subtable
     *                                                                            preceded by APPEND_TRACE_OFFSET]
     *
     * If `fixed_append_offset_for_last` is set, sequential_end = end - 1 and the last-in-range subtable is placed
     * at row `(zk_size + offset * NUM_ROWS_PER_OP + APPEND_TRACE_OFFSET)`. Any intervening rows are left at the
     * zero-initialized default. Otherwise sequential_end = end and there is no gap.
     */
    ColumnPolynomials construct_columns_in_range(
        const size_t poly_size,
        const size_t subtable_start_idx,
        const size_t subtable_end_idx,
        const bool include_zk_ops = false,
        const std::optional<size_t> fixed_append_offset_for_last = std::nullopt) const
    {
        const size_t final_poly_size = poly_size + (include_zk_ops ? ZK_ULTRA_OPS : 0);

        ColumnPolynomials column_polynomials;
        if (final_poly_size == 0) {
            return column_polynomials;
        }
        for (auto& poly : column_polynomials) {
            poly = Polynomial<Fr>(final_poly_size);
        }

        size_t row = 0;

        if (include_zk_ops) {
            BB_ASSERT(has_zk_ops(), "ZK ops should have been constructed before including them in the columns");
            for (const auto& op : zk_ops) {
                write_op_to_polynomials(column_polynomials, op, row);
                row += NUM_ROWS_PER_OP;
            }
        }

        // Lay out subtables sequentially. If a fixed-append target is set, exclude the last-in-range subtable
        // from the sequential pass; it is placed at the fixed offset below.
        const size_t sequential_end =
            fixed_append_offset_for_last.has_value() ? subtable_end_idx - 1 : subtable_end_idx;
        for (size_t idx = subtable_start_idx; idx < sequential_end; ++idx) {
            for (const auto& op : table.get()[idx]) {
                write_op_to_polynomials(column_polynomials, op, row);
                row += NUM_ROWS_PER_OP;
            }
        }

        if (fixed_append_offset_for_last.has_value()) {
            // The appended subtable's operations begin after the optional ZK prefix and the APPEND_TRACE_OFFSET
            // leading-zero preamble.
            size_t append_row = compute_fixed_append_ops_row(fixed_append_offset_for_last.value(), include_zk_ops);
            for (const auto& op : table.get()[subtable_end_idx - 1]) {
                write_op_to_polynomials(column_polynomials, op, append_row);
                append_row += NUM_ROWS_PER_OP;
            }
        }

        return column_polynomials;
    }
};

} // namespace bb
