// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <vector>

namespace bb::plonk {
template <typename Field>
Field compute_public_input_delta(const std::vector<Field>& inputs,
                                 const Field& beta,
                                 const Field& gamma,
                                 const Field& subgroup_generator);
}

#include "public_inputs_impl.hpp"
