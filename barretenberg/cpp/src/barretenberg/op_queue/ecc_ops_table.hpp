// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/eccvm/eccvm_builder_types.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include <deque>
namespace bb {

enum MergeSettings { PREPEND, APPEND };

/**
 * @brief Defines the opcodes for ECC operations used in both the Ultra and ECCVM formats. There are four opcodes:
 * - addition: add = true, value() = 8
 * - multiplication: mul = true, value() = 4
 * - equality abd reset: eq = true, reset = true,  value() = 3
 * - no operation: all false, value() = 0
 */
struct EccOpCode {
    bool add = false;
    bool mul = false;
    bool eq = false;
    bool reset = false;
    bool operator==(const EccOpCode& other) const = default;

    [[nodiscard]] uint32_t value() const
    {
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
    std::vector<Subtable> table;

  public:
    MergeSettings settings;
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

    void push(const OpFormat& op)
    {
        // Get the reference of the subtable to update
        auto& subtable_to_update = settings == MergeSettings::PREPEND ? table.front() : table.back();
        subtable_to_update.push_back(op);
    }

    void create_new_subtable(MergeSettings settings = MergeSettings::PREPEND, size_t size_hint = 0)
    {
        this->settings = settings;
        // If there is a single subtable and it is empty, dont create a new one
        if (table.size() == 1 && table.front().empty()) {
            return;
        }
        // Get an iterator at which location we should insert a new subtable
        auto it = settings == MergeSettings::PREPEND ? table.begin() : table.end();
        Subtable new_subtable;
        new_subtable.reserve(size_hint);
        table.insert(it, std::move(new_subtable));
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

    UltraOpsTable table;

  public:
    size_t size() const { return table.size(); }
    size_t ultra_table_size() const { return table.size() * NUM_ROWS_PER_OP; }
    size_t current_ultra_subtable_size() const { return table.get()[0].size() * NUM_ROWS_PER_OP; }
    size_t previous_ultra_table_size() const { return (ultra_table_size() - current_ultra_subtable_size()); }
    void create_new_subtable(MergeSettings settings = MergeSettings::PREPEND, size_t size_hint = 0)
    {
        table.create_new_subtable(settings, size_hint);
    }
    void push(const UltraOp& op) { table.push(op); }
    std::vector<UltraOp> get_reconstructed() const { return table.get_reconstructed(); }

    // Construct the columns of the full ultra ecc ops table
    ColumnPolynomials construct_table_columns() const
    {
        const size_t poly_size = ultra_table_size();
        const size_t subtable_start_idx = 0; // include all subtables
        const size_t subtable_end_idx = table.num_subtables();

        return construct_column_polynomials_from_subtables(poly_size, subtable_start_idx, subtable_end_idx);
    }

    // Construct the columns of the previous full ultra ecc ops table
    ColumnPolynomials construct_previous_table_columns() const
    {

        const size_t poly_size = previous_ultra_table_size();
        const size_t subtable_start_idx = table.settings == MergeSettings::PREPEND ? 1 : 0; // exclude the 0th subtable
        const size_t subtable_end_idx =
            table.settings == MergeSettings::PREPEND ? table.num_subtables() : table.num_subtables() - 1;

        return construct_column_polynomials_from_subtables(poly_size, subtable_start_idx, subtable_end_idx);
    }

    // Construct the columns of the current ultra ecc ops subtable
    ColumnPolynomials construct_current_ultra_ops_subtable_columns() const
    {
        const size_t poly_size = current_ultra_subtable_size();
        const size_t subtable_start_idx = table.settings == MergeSettings::PREPEND ? 0 : table.num_subtables() - 1;
        const size_t subtable_end_idx =
            table.settings == MergeSettings::PREPEND ? 1 : table.num_subtables(); // include only the 0th subtable

        return construct_column_polynomials_from_subtables(poly_size, subtable_start_idx, subtable_end_idx);
    }

  private:
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
                column_polynomials[0].at(i) = op.op_code.value();
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
        return column_polynomials;
    }
};

} // namespace bb
