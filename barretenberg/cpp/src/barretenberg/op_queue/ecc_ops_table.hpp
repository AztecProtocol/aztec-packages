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

    /**
     * @brief Build a hiding op as paired Ultra and ECCVM operations from raw Fq coordinates.
     *
     * @details Uses opcode q_eq=q_reset=1 (value 3) for Translator compatibility. The base point is constructed
     * directly from (Px, Py); these are not required to lie on the curve since on-curve and equality constraints
     * are gated off at the row where the hiding op lands (lagrange_second in ECCVM). z_1 and z_2 are zero in the
     * Ultra representation since the hiding op performs no scalar multiplication.
     */
    static std::pair<UltraOp, ECCVMOperation> make_hiding_op_pair(const curve::BN254::BaseField& Px,
                                                                  const curve::BN254::BaseField& Py);

  private:
    using Curve = curve::BN254;
    using Fr = Curve::ScalarField;
    using UltraOpsTable = EccOpsTable<UltraOp>;
    using ColumnPolynomials = std::array<Polynomial<Fr>, TABLE_WIDTH>;

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
    size_t num_ultra_rows() const;
    size_t ultra_table_size_up_to_tail() const;
    void create_new_subtable(size_t size_hint = 0) { table.create_new_subtable(size_hint); }
    void push(const UltraOp& op) { table.push(op); }
    bool has_fixed_append_offset() const { return fixed_append_offset.has_value(); }
    bool has_zk_ops() const { return !zk_ops.empty(); }
    void merge()
    {
        BB_ASSERT(!has_fixed_append_offset(), "Cannot perform regular merge after fixed-location append");
        table.merge();
    }
    void merge_with_fixed_append_offset(size_t offset);

    size_t get_current_subtable_size() const { return table.get_current_subtable_size(); }

    std::vector<UltraOp> get_no_zk_reconstructed_ultra_ops() const;

    std::vector<UltraOp> get_zk_reconstructed_ultra_ops() const;

  private:
    // Reconstruct the full table of ultra ops in contiguous memory. When include_zk_ops is set, the result includes
    // the ZK prefix at the front. Under fixed-location append, the result then has gap no-ops up to the fixed offset,
    // the APPEND_TRACE_OFFSET zero preamble, then the most recently merged subtable.
    std::vector<UltraOp> get_reconstructed(const bool include_zk_ops) const;

  public:
    std::pair<ColumnPolynomials, ECCVMOperation> construct_zk_columns();

    // Construct column polynomials for all subtables
    std::vector<ColumnPolynomials> construct_subtable_columns() const;

    // Construct column polynomials for the full ultra ecc ops table
    ColumnPolynomials construct_table_columns(const bool include_zk_ops = true) const;

    // Construct column polynomials for the aggregate table up to and including the tail subtable.
    ColumnPolynomials construct_table_columns_up_to_tail() const;

    // Construct the columns of the most recently merged subtable.
    // Under fixed-location append, the returned polynomials carry APPEND_TRACE_OFFSET leading zero rows so their
    // commitments match the appender's ecc_op_wire commitments.
    ColumnPolynomials construct_current_ultra_ops_subtable_columns() const;

  private:
    /**
     * @brief Write a single UltraOp to the column polynomials at the given position
     * @details Each op is written across 2 rows (NUM_ROWS_PER_OP)
     * @param column_polynomials The column polynomials to write to
     * @param op The operation to write
     * @param row_idx The starting row index (will write to row_idx and row_idx+1)
     */
    static void write_op_to_polynomials(ColumnPolynomials& column_polynomials, const UltraOp& op, const size_t row_idx);

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
        const std::optional<size_t> fixed_append_offset_for_last = std::nullopt) const;
};

} // namespace bb
