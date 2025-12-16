// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include <vector>

namespace bb {

using PublicInputsVector = std::vector<fr>;
using HonkProof = std::vector<fr>;

template <typename Builder> using StdlibPublicInputsVector = std::vector<bb::stdlib::field_t<Builder>>;

} // namespace bb
