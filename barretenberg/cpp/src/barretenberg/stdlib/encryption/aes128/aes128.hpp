// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include <array>
#include <vector>

#include "../../primitives/field/field.hpp"
#include "../../primitives/witness/witness.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"

namespace bb::stdlib::aes128 {

template <typename Builder>
std::vector<stdlib::field_t<Builder>> encrypt_buffer_cbc(const std::vector<stdlib::field_t<Builder>>& input,
                                                         const stdlib::field_t<Builder>& iv,
                                                         const stdlib::field_t<Builder>& key);

} // namespace bb::stdlib::aes128
