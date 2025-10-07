#pragma once
#include <array>
#include <cstddef>
#include <cstdint>
#include <type_traits>

namespace bb {

// Helper trait to extract size from RefArray<T, N>
template <typename T> struct RefArraySize;
template <template <typename, std::size_t> class RefArray, typename T, std::size_t N>
struct RefArraySize<RefArray<T, N>> {
    static constexpr std::size_t value = N;
};

/**
 * @brief Runtime indexed access to AllEntities using precomputed offsets.
 *
 * Computes member offsets from get_all() once at static initialization,
 * then uses them for O(1) indexed access. This eliminates get_all() overhead
 * in hot loops while automatically staying in sync with entity changes.
 *
 * @tparam AllEntities The entities type (e.g., UltraFlavor::AllEntities<Polynomial>)
 * @param entities The entities object to index into
 * @param idx The index of the entity to retrieve
 * @return Reference to the entity at the given index
 */
template <typename AllEntities> const auto& get_by_index(const AllEntities& entities, size_t idx)
{
    using RefArray = decltype(std::declval<AllEntities>().get_all());
    using DataType = std::remove_reference_t<decltype(std::declval<RefArray>()[0])>;
    constexpr size_t NumEntities = RefArraySize<RefArray>::value;

    static const auto offsets = []() {
        std::array<size_t, NumEntities> result{};
        AllEntities dummy;
        auto all = dummy.get_all();
        for (size_t i = 0; i < NumEntities; i++) {
            result[i] = reinterpret_cast<uintptr_t>(&all[i]) - reinterpret_cast<uintptr_t>(&dummy);
        }
        return result;
    }();

    const auto* base = reinterpret_cast<const char*>(&entities);
    return *reinterpret_cast<const DataType*>(base + offsets[idx]);
}

template <typename AllEntities> auto& get_by_index(AllEntities& entities, size_t idx)
{
    using RefArray = decltype(std::declval<AllEntities>().get_all());
    using DataType = std::remove_reference_t<decltype(std::declval<RefArray>()[0])>;
    constexpr size_t NumEntities = RefArraySize<RefArray>::value;

    static const auto offsets = []() {
        std::array<size_t, NumEntities> result{};
        AllEntities dummy;
        auto all = dummy.get_all();
        for (size_t i = 0; i < NumEntities; i++) {
            result[i] = reinterpret_cast<uintptr_t>(&all[i]) - reinterpret_cast<uintptr_t>(&dummy);
        }
        return result;
    }();

    auto* base = reinterpret_cast<char*>(&entities);
    return *reinterpret_cast<DataType*>(base + offsets[idx]);
}

} // namespace bb
