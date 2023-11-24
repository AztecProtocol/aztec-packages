#pragma once

#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/common/std_array.hpp"
#include <array>

template <typename... Refs> auto _refs_to_pointer_array(Refs&... refs)
{
    return std::array{ &refs... };
}

// @deprecated this was less natural than the ref view
#define DEFINE_POINTER_VIEW(...)                                                                                       \
    [[nodiscard]] auto pointer_view()                                                                                  \
    {                                                                                                                  \
        return _refs_to_pointer_array(__VA_ARGS__);                                                                    \
    }                                                                                                                  \
    [[nodiscard]] auto pointer_view() const                                                                            \
    {                                                                                                                  \
        return _refs_to_pointer_array(__VA_ARGS__);                                                                    \
    }

// Slow debug tool for getting the name of an entity
// TODO(AD): Only enable
#define DEFINE_GET_ENTITY_NAME(DataType, ...)                                                                          \
    const char* get_entity_name(const DataType& ptr) const                                                             \
    {                                                                                                                  \
        const char* entity_names[] = { #__VA_ARGS__ };                                                                 \
        size_t i = 0;                                                                                                  \
        for (const DataType& elem : get_all()) {                                                                       \
            if (&elem == &ptr) {                                                                                       \
                return entity_names[i];                                                                                \
            }                                                                                                          \
            i++;                                                                                                       \
        }                                                                                                              \
        return nullptr; /*Not actually in struct*/                                                                     \
    }

#define DEFINE_REF_VIEW(...)                                                                                           \
    [[nodiscard]] auto get_all()                                                                                       \
    {                                                                                                                  \
        return RefVector{ __VA_ARGS__ };                                                                               \
    }                                                                                                                  \
    [[nodiscard]] auto get_all() const                                                                                 \
    {                                                                                                                  \
        return RefVector{ __VA_ARGS__ };                                                                               \
    }

/**
 * @brief Define the body of a flavor class, included each member and a pointer view with which to iterate the struct.
 *
 * @tparam T The underlying data type stored in the array
 * @tparam HandleType The type that will be used to
 * @tparam NUM_ENTITIES The size of the underlying array.
 */
#define FLAVOR_MEMBERS(DataType, ...)                                                                                  \
    DataType __VA_ARGS__;                                                                                              \
    DEFINE_POINTER_VIEW(__VA_ARGS__)                                                                                   \
    DEFINE_REF_VIEW(__VA_ARGS__)                                                                                       \
    DEFINE_GET_ENTITY_NAME(DataType, ...)

#define DEFINE_COMPOUND_POINTER_VIEW(...)                                                                              \
    [[nodiscard]] auto pointer_view()                                                                                  \
    {                                                                                                                  \
        return concatenate(__VA_ARGS__);                                                                               \
    }                                                                                                                  \
    [[nodiscard]] auto pointer_view() const                                                                            \
    {                                                                                                                  \
        return concatenate(__VA_ARGS__);                                                                               \
    }

#define DEFINE_COMPOUND_GET_ALL(...)                                                                                   \
    [[nodiscard]] auto get_all()                                                                                       \
    {                                                                                                                  \
        return concatenate(__VA_ARGS__);                                                                               \
    }                                                                                                                  \
    [[nodiscard]] auto get_all() const                                                                                 \
    {                                                                                                                  \
        return concatenate(__VA_ARGS__);                                                                               \
    }
