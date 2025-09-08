#pragma once

#include <type_traits>
#include <utility>

// This function/macros is used to possibly cast pol aliases in a relation's accumulate.
template <typename View, typename FF_> constexpr auto avm_relations_maybe_cast_(auto&& v)
{
    if constexpr (std::is_same_v<std::decay_t<decltype(v)>, FF_>) {
        return std::forward<decltype(v)>(v);
    } else {
        return static_cast<View>(std::forward<decltype(v)>(v));
    }
};

#define CView(v) avm_relations_maybe_cast_<View, FF_>(v)
