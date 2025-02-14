#pragma once

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/eccvm/eccvm_builder_types.hpp"
#include "barretenberg/stdlib_circuit_builders/op_queue/ecc_op_queue.hpp"
namespace bb {

template <typename OpFormat> class EccOpsTable {
    using Curve = curve::BN254;
    using Fr = Curve::ScalarField;

  protected:
    struct Subtable {
        std::vector<OpFormat> data;
        std::unique_ptr<Subtable> prev;

        Subtable(size_t size_hint = 0) { data.reserve(size_hint); }

        size_t size() const { return data.size(); }
    };

    std::unique_ptr<Subtable> current_subtable = nullptr;

  public:
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

        OpFormat operator*() { return subtable->data[index]; }

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
    Iterator begin() { return Iterator(current_subtable.get(), 0); }
    Iterator end() { return {}; }

    void create_new_subtable(size_t size_hint = 0)
    {
        auto new_subtable = std::make_unique<Subtable>(size_hint);
        new_subtable->prev = std::move(current_subtable);
        current_subtable = std::move(new_subtable);
    }

    void push(const OpFormat& op) { current_subtable->data.push_back(op); }
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
class UltraEccOpsTable : public EccOpsTable<UltraOp> {
    static constexpr size_t TABLE_WIDTH = 4;
    using Curve = curve::BN254;
    using Fr = Curve::ScalarField;

  public:
    // WORKTODO: multithreaded version of this function
    void populate_column_data(std::array<std::span<Fr>, TABLE_WIDTH>& target_columns)
    {
        size_t i = 0;
        for (auto* subtable = current_subtable.get(); subtable != nullptr; subtable = subtable->prev.get()) {
            for (const auto& op : subtable->data) {
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

/**
 * @brief The table of ECC ops used by the ECCVM circuit builder
 * @note just an alias for a specialized EccOpsTable
 */
using RawEccOpsTable = EccOpsTable<eccvm::VMOperation<curve::BN254::Group>>;

} // namespace bb
