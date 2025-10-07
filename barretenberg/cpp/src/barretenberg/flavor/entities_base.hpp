#pragma once
#include <array>
#include <cstddef>
#include <cstdint>

namespace bb {

/**
 * @brief CRTP base class providing offset-based get_by_index for AllEntities.
 *
 * This eliminates code duplication across flavors by providing a single implementation
 * that automatically computes member offsets from get_all().
 *
 * @tparam Derived The derived AllEntities class
 * @tparam DataType The entity data type (e.g., Polynomial, FF)
 * @tparam NumEntities Total number of entities (NUM_ALL_ENTITIES)
 */
template <typename Derived, typename DataType, size_t NumEntities> class EntitiesBase {
  private:
    // Helper to get offsets array (computed once, shared by const and non-const versions)
    static const std::array<size_t, NumEntities>& get_offsets()
    {
        static const auto offsets = []() {
            std::array<size_t, NumEntities> result{};
            Derived dummy;
            auto all = dummy.get_all();
            for (size_t i = 0; i < NumEntities; i++) {
                result[i] = reinterpret_cast<uintptr_t>(&all[i]) - reinterpret_cast<uintptr_t>(&dummy);
            }
            return result;
        }();
        return offsets;
    }

  public:
    // Runtime indexed access using precomputed offsets
    const DataType& get_by_index(size_t idx) const
    {
        const auto& offsets = get_offsets();
        const auto* base = reinterpret_cast<const char*>(static_cast<const Derived*>(this));
        return *reinterpret_cast<const DataType*>(base + offsets[idx]);
    }

    DataType& get_by_index(size_t idx)
    {
        const auto& offsets = get_offsets();
        auto* base = reinterpret_cast<char*>(static_cast<Derived*>(this));
        return *reinterpret_cast<DataType*>(base + offsets[idx]);
    }
};

} // namespace bb
