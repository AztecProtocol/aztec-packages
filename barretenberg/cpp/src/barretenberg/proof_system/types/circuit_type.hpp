#pragma once
#include <concepts>
#include <cstdint>

namespace proof_system {
enum class CircuitType : uint32_t { STANDARD = 0, ULTRA = 2, UNDEFINED = 3 };

template <typename T, typename... U>
concept IsAnyOf = (std::same_as<T, U> || ...);
} // namespace proof_system