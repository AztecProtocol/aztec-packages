#pragma once

#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/common/std_array.hpp"
#include <array>
#include <iostream>
#include <sstream>

inline std::vector<std::string> _string_split_by_comma(const std::string& s)
{
    std::vector<std::string> tokens;
    std::string token;
    std::istringstream tokens_stream(s);

    while (std::getline(tokens_stream, token, ',')) {
        tokens.push_back(token);
    }

    return tokens;
}
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

// Debug tool for printing
#define DEFINE_PRINT(DataType, ...)                                                                                    \
    void print() const                                                                                                 \
    {                                                                                                                  \
        auto entity_names = _string_split_by_comma(#__VA_ARGS__);                                                      \
        size_t i = 0;                                                                                                  \
        for (const DataType& elem : get_all()) {                                                                       \
            std::cout << entity_names[i] << ": " << elem << std::endl;                                                 \
            i++;                                                                                                       \
        }                                                                                                              \
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
#define DEFINE_FLAVOR_MEMBERS(DataType, ...)                                                                           \
    DataType __VA_ARGS__;                                                                                              \
    DEFINE_POINTER_VIEW(__VA_ARGS__)                                                                                   \
    DEFINE_REF_VIEW(__VA_ARGS__)                                                                                       \
    DEFINE_PRINT(DataType, __VA_ARGS__)

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
