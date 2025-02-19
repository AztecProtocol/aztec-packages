#pragma once

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/eccvm/eccvm_builder_types.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include <deque>
namespace bb {

enum EccOpCode { NULL_OP, ADD_ACCUM, MUL_ACCUM, EQUALITY };

struct UltraOp {
    using Fr = curve::BN254::ScalarField;
    EccOpCode op_code = NULL_OP;
    Fr op;
    Fr x_lo;
    Fr x_hi;
    Fr y_lo;
    Fr y_hi;
    Fr z_1;
    Fr z_2;
    bool return_is_infinity;
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
    std::vector<Subtable> table;

  public:
    size_t size() const
    {
        size_t total = 0;
        for (const auto& subtable : table) {
            total += subtable.size();
        }
        return total;
    }

    size_t num_subtables() const { return table.size(); }

    auto& get() const { return table; }

    void push(const OpFormat& op) { table.front().push_back(op); }

    void create_new_subtable(size_t size_hint = 0)
    {
        Subtable new_subtable;
        new_subtable.reserve(size_hint);
        table.insert(table.begin(), std::move(new_subtable));
    }

    // const version of operator[]
    const OpFormat& operator[](size_t index) const
    {
        ASSERT(index < size());
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
        std::vector<OpFormat> reconstructed_table;
        reconstructed_table.reserve(size());
        for (const auto& subtable : table) {
            for (const auto& op : subtable) {
                reconstructed_table.push_back(op);
            }
        }
        return reconstructed_table;
    }
};

using RawEccOpsTable = EccOpsTable<eccvm::VMOperation<curve::BN254::Group>>;

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
    static constexpr size_t TABLE_WIDTH = 4;
    static constexpr size_t NUM_ROWS_PER_OP = 2;

    using Curve = curve::BN254;
    using Fr = Curve::ScalarField;
    using UltraOpsTable = EccOpsTable<UltraOp>;
    using TableView = std::array<std::span<Fr>, TABLE_WIDTH>;
    using ColumnPolynomials = std::array<Polynomial<Fr>, TABLE_WIDTH>;

    UltraOpsTable table;

  public:
    size_t size() const { return table.size(); }
    size_t ultra_table_size() const { return table.size() * NUM_ROWS_PER_OP; }
    size_t current_ultra_subtable_size() const { return table.get()[0].size() * NUM_ROWS_PER_OP; }
    size_t previous_ultra_table_size() const { return (ultra_table_size() - current_ultra_subtable_size()); }
    void create_new_subtable(size_t size_hint = 0) { table.create_new_subtable(size_hint); }
    void push(const UltraOp& op) { table.push(op); }

    /**
     * @brief Populate the provided array of columns with the width-4 representation of the table data
     * @todo multithreaded this functionality
     * @param target_columns
     */
    void populate_column_data(std::array<std::span<Fr>, TABLE_WIDTH>& target_columns) const
    {
        size_t i = 0;
        for (const auto& subtable : table.get()) {
            for (const auto& op : subtable) {
                target_columns[0][i] = op.op;
                target_columns[1][i] = op.x_lo;
                target_columns[2][i] = op.x_hi;
                target_columns[3][i] = op.y_lo;
                i++;
                target_columns[0][i] = 0; // only the first 'op' field is utilized
                target_columns[1][i] = op.y_hi;
                target_columns[2][i] = op.z_1;
                target_columns[3][i] = op.z_2;
                i++;
            }
        }
    }

    void populate_column_data_from_subtables(ColumnPolynomials& column_polynomials,
                                             const size_t start_idx,
                                             const size_t end_idx) const
    {
        size_t i = 0;
        for (size_t j = start_idx; j < end_idx; ++j) {
            const auto& subtable = table.get()[j];
            for (const auto& op : subtable) {
                column_polynomials[0].at(i) = op.op;
                column_polynomials[1].at(i) = op.x_lo;
                column_polynomials[2].at(i) = op.x_hi;
                column_polynomials[3].at(i) = op.y_lo;
                i++;
                column_polynomials[0].at(i) = 0; // only the first 'op' field is utilized
                column_polynomials[1].at(i) = op.y_hi;
                column_polynomials[2].at(i) = op.z_1;
                column_polynomials[3].at(i) = op.z_2;
                i++;
            }
        }
    }

    ColumnPolynomials construct_table_columns() const
    {
        ColumnPolynomials column_polynomials;
        for (auto& poly : column_polynomials) {
            poly = Polynomial<Fr>(ultra_table_size());
        }

        const size_t start_idx = 0;
        const size_t end_idx = table.num_subtables();
        populate_column_data_from_subtables(column_polynomials, start_idx, end_idx);

        return column_polynomials;
    }

    ColumnPolynomials construct_previous_table_columns() const
    {
        ColumnPolynomials column_polynomials;
        for (auto& poly : column_polynomials) {
            poly = Polynomial<Fr>(previous_ultra_table_size());
        }

        const size_t start_idx = 1;
        const size_t end_idx = table.num_subtables();
        populate_column_data_from_subtables(column_polynomials, start_idx, end_idx);

        return column_polynomials;
    }

    ColumnPolynomials construct_current_subtable_columns() const
    {
        ColumnPolynomials column_polynomials;
        for (auto& poly : column_polynomials) {
            poly = Polynomial<Fr>(current_ultra_subtable_size());
        }

        const size_t start_idx = 0;
        const size_t end_idx = 1;
        populate_column_data_from_subtables(column_polynomials, start_idx, end_idx);

        return column_polynomials;
    }
};

} // namespace bb
