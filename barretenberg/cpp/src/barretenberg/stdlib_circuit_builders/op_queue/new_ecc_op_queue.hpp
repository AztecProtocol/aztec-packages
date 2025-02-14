#pragma once

#include "barretenberg/common/ref_array.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/eccvm/eccvm_builder_types.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include "barretenberg/stdlib_circuit_builders/op_queue/ecc_op_queue.hpp"
#include "barretenberg/stdlib_circuit_builders/op_queue/eccvm_row_tracker.hpp"
namespace bb {

/**
 * @brief
 *
 * @tparam Derived CRTP (curiously recurring template pattern) implementation class
 * @tparam TABLE_WIDTH
 * @tparam OpFormat
 */
template <typename Derived, size_t TABLE_WIDTH, typename OpFormat> class OpsTable {
    using Curve = curve::BN254;
    using Fr = Curve::ScalarField;

  protected:
    struct Subtable {
        std::array<std::vector<Fr>, TABLE_WIDTH> columns;
        std::unique_ptr<Subtable> prev;

        Subtable(size_t size_hint = 0)
        {
            for (auto& column : columns) {
                column.reserve(size_hint);
            }
        }

        size_t size() const { return columns[0].size(); }
    };

    std::unique_ptr<Subtable> current_subtable = std::make_unique<Subtable>();

  public:
    using Row = RefArray<Fr, TABLE_WIDTH>;

    size_t size() const
    {
        size_t total_size = 0;
        for (auto* subtable = current_subtable.get(); subtable != nullptr; subtable = subtable->prev.get()) {
            total_size += subtable->size();
        }
        return total_size;
    }

    class Iterator {
        Subtable* subtable = nullptr;
        size_t index = 0;
        size_t subtable_size = 0;

      public:
        Iterator() = default;
        Iterator(Subtable* sub, size_t idx)
            : subtable(sub)
            , index(idx)
            , subtable_size(sub ? sub->size() : 0)
        {}

        Row operator*()
        {
            std::array<Fr*, TABLE_WIDTH> row;
            for (size_t i = 0; i < TABLE_WIDTH; ++i) {
                row[i] = &subtable->columns[i][index];
            }
            return row;
        }

        Iterator& operator++()
        {
            if (++index < subtable_size) { // return row within the current subtable
                return *this;
            }
            if (subtable->prev) { // update to next subtable
                subtable = subtable->prev.get();
                subtable_size = subtable->size();
                index = 0;
            } else {
                *this = Iterator(); // end of iteration
            }
            return *this;
        }

        bool operator!=(const Iterator& other) const { return subtable != other.subtable || index != other.index; }
    };

    // begin() and end() to enable range based iteration over the full table
    // WORKTODO: need to skip over the first empty subtable created from the last call to concatenate_subtable(). Might
    // be nicer to have the user instead call create_subtable() prior to construction rather than at the end to mark
    // completion.
    Iterator begin() { return Iterator(current_subtable->prev.get(), 0); }
    Iterator end() { return {}; }

    void create_new_subtable(size_t size_hint = 0)
    {
        auto new_subtable = std::make_unique<Subtable>(size_hint);
        new_subtable->prev = std::move(current_subtable);
        current_subtable = std::move(new_subtable);
    }

    void append_operation(const OpFormat& op) { static_cast<Derived*>(this)->append_operation_impl(op); }
};

/**
 * @brief Stores a width-4 aggregate table of elliptic curve operations represented in the Ultra format
 * @details The aggregate Ultra ops table is constructed by succesively PREpending subtables of ultra ops, where each
 * subtable represents the operations performed in a single circuit. To avoid expensive memory reallocations associated
 * with physically prepending, the subtables are stored in a linked list that can be traversed to reconstruct the
 * columns of the aggregate tables as needed (e.g. in corresponding polynomials). An EC operation OP involving point
 * P(X, Y) and scalar z is encoded in the Ultra format as two rows in a width-4 table as follows:
 *
 *  OP | X_lo | X_hi | Y_lo
 *  0  | Y_hi | z1   | z2
 */
class UltraOpsTable : public OpsTable<UltraOpsTable, 4, UltraOp> {
    using Curve = curve::BN254;
    using Fr = Curve::ScalarField;

    static constexpr size_t TABLE_WIDTH = 4;

  public:
    void append_operation_impl(const UltraOp& op)
    {
        current_subtable->columns[0].emplace_back(op.op);
        current_subtable->columns[1].emplace_back(op.x_lo);
        current_subtable->columns[2].emplace_back(op.x_hi);
        current_subtable->columns[3].emplace_back(op.y_lo);

        current_subtable->columns[0].emplace_back(0); // only the first 'op' field is utilized
        current_subtable->columns[1].emplace_back(op.y_hi);
        current_subtable->columns[2].emplace_back(op.z_1);
        current_subtable->columns[3].emplace_back(op.z_2);
    }

    void populate_columns(std::array<std::span<Fr>, TABLE_WIDTH>& target_columns)
    {
        size_t i = 0;
        for (auto* subtable = current_subtable.get(); subtable != nullptr; subtable = subtable->prev.get()) {
            for (size_t j = 0; j < subtable->size(); ++j) {
                target_columns[0][i] = subtable->columns[0][j];
                target_columns[1][i] = subtable->columns[1][j];
                target_columns[2][i] = subtable->columns[2][j];
                target_columns[3][i] = subtable->columns[3][j];
                ++i;
            }
        }
    }
};

} // namespace bb
