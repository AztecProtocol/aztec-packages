// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include <concepts>
#include <cstdint>

namespace bb {
enum class CircuitType : uint32_t { STANDARD = 0, ULTRA = 2, UNDEFINED = 3 };

template <typename T, typename... U>
concept IsAnyOf = (std::same_as<T, U> || ...);
} // namespace bb