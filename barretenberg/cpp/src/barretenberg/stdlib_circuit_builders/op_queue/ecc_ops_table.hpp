#pragma once

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/eccvm/eccvm_builder_types.hpp"
#include "barretenberg/stdlib_circuit_builders/op_queue/ecc_op_queue.hpp"
#include <deque>
namespace bb {

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

    auto& get() const { return table; }

    void push(const OpFormat& op) { table.front().push_back(op); }

    void create_new_subtable(size_t size_hint = 0)
    {
        std::vector<OpFormat> new_subtable;
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
    using Curve = curve::BN254;
    using Fr = Curve::ScalarField;
    using UltraOpsTable = EccOpsTable<UltraOp>;

    UltraOpsTable table;
    static constexpr size_t TABLE_WIDTH = 4;

  public:
    size_t size() const { return table.size(); }
    void create_new_subtable(size_t size_hint = 0) { table.create_new_subtable(size_hint); }
    void push(const UltraOp& op) { table.push(op); }

    /**
     * @brief Populate the provided array of columns with the width-4 representation of the table data
     * @todo multithreaded this functionality
     * @param target_columns
     */
    void populate_column_data(std::array<std::span<Fr>, TABLE_WIDTH>& target_columns)
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
};

} // namespace bb
