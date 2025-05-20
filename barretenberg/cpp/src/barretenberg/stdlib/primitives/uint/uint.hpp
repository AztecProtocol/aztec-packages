// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "../bool/bool.hpp"
#include "../byte_array/byte_array.hpp"
#include "../circuit_builders/circuit_builders_fwd.hpp"
#include "../field/field.hpp"
#include "../plookup/plookup.hpp"

#include "./plookup/uint.hpp"

namespace bb::stdlib {

template <typename Builder>
using uint8 = typename std::conditional<HasPlookup<Builder>, uint_plookup<Builder, uint8_t>, void>::type;
template <typename Builder>
using uint16 = typename std::conditional<HasPlookup<Builder>, uint_plookup<Builder, uint16_t>, void>::type;
template <typename Builder>
using uint32 = typename std::conditional<HasPlookup<Builder>, uint_plookup<Builder, uint32_t>, void>::type;
template <typename Builder>
using uint64 = typename std::conditional<HasPlookup<Builder>, uint_plookup<Builder, uint64_t>, void>::type;

} // namespace bb::stdlib
