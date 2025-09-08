// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/eccvm/eccvm_builder_types.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include <deque>
namespace bb {

/**
 * @brief The MergeSettings define whether an current subtable will be added at the beginning (PREPEND) or at the end
 * (APPEND) of the EccOpQueue.
 */
enum MergeSettings { PREPEND, APPEND };

/**
 * @brief Defines the opcodes for ECC operations used in both the Ultra and ECCVM formats. There are three opcodes that
 * are reflected in both ultra ops and eccvm table and so, that lead to actual operations in the ECCVM :
 * - addition: add = true, value() = 8
 * - multiplication: mul = true, value() = 4
 * - equality abd reset: eq = true, reset = true,  value() = 3
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
 * @details The table is constructed via concatenation of subtables of ECC operations. The table concatentation protocol
 * (Merge protocol) requires that the concatenation be achieved via PRE-pending successive tables. To avoid the need for
 * expensive memory reallocations associated with physically prepending, the subtables are stored as a std::deque that
 * can be traversed to reconstruct the columns of the aggregate tables as needed (e.g. in corresponding polynomials).
 *
 * @tparam OpFormat Format of the ECC operations stored in the table
 */
template <typename OpFormat> class EccOpsTable {
    using Subtable = std::vector<OpFormat>;
    std::deque<Subtable> table;
    Subtable current_subtable; // used to store the current subtable before it is added to the table
  public:
    size_t size() const
    {
        ASSERT(current_subtable.empty(),
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

    void push(const OpFormat& op)
    {
        // Get the reference of the subtable to update

        current_subtable.push_back(op);
    }

    void create_new_subtable(size_t size_hint = 0)
    {
        ASSERT(current_subtable.empty(), "Cannot create a new subtable until the current subtable has been merged.");
        current_subtable.reserve(size_hint);
    }

    // const version of operator[]
    const OpFormat& operator[](size_t index) const
    {
        ASSERT(current_subtable.empty(),
               "Current subtable should be merged before attempting to index into the full table.");
        BB_ASSERT_LT(index, size());
        // simple linear search to find the correct subtable
        for (const auto& subtable : table) {
            if (index < subtable.size()) {
                return subtable[index]; // found the correct subtable
            }
            index -= subtable.size(); // move to the next subtable
        }
        return table.front().front(); // should never reach here
    }

    // highly inefficient copy-based reconstruction of the table for use in ECCVM/Translator
    std::vector<OpFormat> get_reconstructed() const
    {
        ASSERT(current_subtable.empty(),
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

    void merge(MergeSettings settings = MergeSettings::PREPEND)
    {
        if (current_subtable.empty()) {
            return; // nothing to merge
        }

        // Based on merge settings add the current subtable to either the beginning or end of the full table
        if (settings == MergeSettings::PREPEND) {
            table.push_front(std::move(current_subtable));
        } else {
            table.push_back(std::move(current_subtable));
        }

        current_subtable.clear(); // clear the current subtable after merging
        ASSERT(current_subtable.empty(), "current subtable should be empty after merging. Check the merge logic.");
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

  private:
    using Curve = curve::BN254;
    using Fr = Curve::ScalarField;
    using UltraOpsTable = EccOpsTable<UltraOp>;
    using TableView = std::array<std::span<Fr>, TABLE_WIDTH>;
    using ColumnPolynomials = std::array<Polynomial<Fr>, TABLE_WIDTH>;

    size_t current_subtable_idx = 0; // index of the current subtable being constructed
    UltraOpsTable table;

    // For fixed-location append functionality (ultra ops only)
    std::optional<size_t> fixed_append_offset;
    bool has_fixed_append = false;

  public:
    size_t size() const { return table.size(); }
    size_t ultra_table_size() const
    {
        size_t base_size = table.size() * NUM_ROWS_PER_OP;
        if (has_fixed_append && fixed_append_offset.has_value()) {
            // Include zeros gap and final subtable at fixed location
            size_t last_subtable_size = 0;
            if (!table.get().empty()) {
                // The last subtable in deque is the fixed-location one
                last_subtable_size = table.get().back().size() * NUM_ROWS_PER_OP;
            }
            return std::max(base_size, (fixed_append_offset.value() * NUM_ROWS_PER_OP) + last_subtable_size);
        }
        return base_size;
    }
    size_t current_ultra_subtable_size() const { return table.get()[current_subtable_idx].size() * NUM_ROWS_PER_OP; }
    size_t previous_ultra_table_size() const { return (ultra_table_size() - current_ultra_subtable_size()); }
    void create_new_subtable(size_t size_hint = 0) { table.create_new_subtable(size_hint); }
    void push(const UltraOp& op) { table.push(op); }
    void merge(MergeSettings settings = MergeSettings::PREPEND, std::optional<size_t> offset = std::nullopt)
    {
        if (settings == MergeSettings::APPEND) {
            // All appends are treated as fixed-location for ultra ops
            ASSERT(!has_fixed_append, "Can only perform fixed-location append once");
            // Set fixed location at which to append ultra ops. If nullopt --> append right after prepended tables
            fixed_append_offset = offset;
            has_fixed_append = true;
            table.merge(settings);
            current_subtable_idx = table.num_subtables() - 1;
        } else { // MergeSettings::PREPEND
            table.merge(settings);
            current_subtable_idx = 0;
        }
    }

    size_t get_current_subtable_size() const { return table.get_current_subtable_size(); }

    std::vector<UltraOp> get_reconstructed() const
    {
        if (has_fixed_append && fixed_append_offset.has_value()) {
            return get_reconstructed_with_fixed_append();
        }
        return table.get_reconstructed();
    }
    std::vector<UltraOp> get_reconstructed_with_fixed_append() const
    {

        ASSERT(get_current_subtable_size() == 0,
               "current subtable should be merged before reconstructing the full table of operations.");

        std::vector<UltraOp> reconstructed_table;
        reconstructed_table.reserve(1 << CONST_OP_QUEUE_LOG_SIZE);

        for (size_t subtable_idx = 0; subtable_idx < table.num_subtables() - 1; subtable_idx++) {
            const auto& subtable = table.get()[subtable_idx];
            for (const auto& op : subtable) {
                reconstructed_table.push_back(op);
            }
        }

        // Add zeros if fixed offset is larger than current size
        if (has_fixed_append && fixed_append_offset.has_value()) {
            size_t current_size = reconstructed_table.size();
            size_t target_offset = fixed_append_offset.value();
            // Fill gap with no-ops if needed
            reconstructed_table.insert(reconstructed_table.end(), target_offset - current_size, UltraOp{ /*no-op*/ });
        }

        // Add the final subtable (appended at fixed location)
        const auto& final_subtable = table.get()[table.num_subtables() - 1];
        for (const auto& op : final_subtable) {
            reconstructed_table.push_back(op);
        }
        return reconstructed_table;
    }

    // Construct the columns of the full ultra ecc ops table
    ColumnPolynomials construct_table_columns() const
    {
        const size_t poly_size = ultra_table_size();

        if (has_fixed_append) {
            // Handle fixed-location append: prepended tables first, then appended table at fixed offset
            return construct_column_polynomials_with_fixed_append(poly_size);
        }

        // Normal case: all subtables in order
        const size_t subtable_start_idx = 0; // include all subtables
        const size_t subtable_end_idx = table.num_subtables();
        return construct_column_polynomials_from_subtables(poly_size, subtable_start_idx, subtable_end_idx);
    }

    // Construct the columns of the previous full ultra ecc ops table
    ColumnPolynomials construct_previous_table_columns() const
    {
        const size_t poly_size = previous_ultra_table_size();
        const size_t subtable_start_idx = current_subtable_idx == 0 ? 1 : 0;
        const size_t subtable_end_idx = current_subtable_idx == 0 ? table.num_subtables() : table.num_subtables() - 1;

        return construct_column_polynomials_from_subtables(poly_size, subtable_start_idx, subtable_end_idx);
    }

    // Construct the columns of the current ultra ecc ops subtable which is either the first or the last one
    // depening on whether it has been prepended or appended
    ColumnPolynomials construct_current_ultra_ops_subtable_columns() const
    {
        const size_t poly_size = current_ultra_subtable_size();
        const size_t subtable_start_idx = current_subtable_idx;
        const size_t subtable_end_idx = current_subtable_idx + 1;

        return construct_column_polynomials_from_subtables(poly_size, subtable_start_idx, subtable_end_idx);
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
     * @details Process prepended subtables first, then place the appended subtable at the fixed offset
     */
    ColumnPolynomials construct_column_polynomials_with_fixed_append(const size_t poly_size) const
    {
        ColumnPolynomials column_polynomials;
        for (auto& poly : column_polynomials) {
            poly = Polynomial<Fr>(poly_size); // Initialized to zeros
        }

        // Process all prepended subtables (all except last)
        size_t i = 0;
        for (size_t subtable_idx = 0; subtable_idx < table.num_subtables() - 1; subtable_idx++) {
            const auto& subtable = table.get()[subtable_idx];
            for (const auto& op : subtable) {
                write_op_to_polynomials(column_polynomials, op, i);
                i += NUM_ROWS_PER_OP;
            }
        }

        // Place the appended subtable at the fixed offset
        size_t append_position = fixed_append_offset.has_value() ? fixed_append_offset.value() * NUM_ROWS_PER_OP : i;
        const auto& appended_subtable = table.get()[table.num_subtables() - 1];

        size_t j = append_position;
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
     * TODO(https://github.com/AztecProtocol/barretenberg/issues/1267): multithread this functionality
     * @param target_columns
     */
    ColumnPolynomials construct_column_polynomials_from_subtables(const size_t poly_size,
                                                                  const size_t subtable_start_idx,
                                                                  const size_t subtable_end_idx) const
    {
        ColumnPolynomials column_polynomials;
        for (auto& poly : column_polynomials) {
            poly = Polynomial<Fr>(poly_size);
        }

        size_t i = 0;
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
