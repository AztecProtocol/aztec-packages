#pragma once
#include <concepts>

namespace bb {

template <typename T, typename... U>
concept IsAnyOf = (std::same_as<T, U> || ...);

} // namespace bb
