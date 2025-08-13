// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "poseidon2_params.hpp"
#include "poseidon2_permutation.hpp"
#include "sponge/sponge.hpp"

namespace bb::crypto {

template <typename Params> class Poseidon2 {
  public:
    using FF = typename Params::FF;

    // We choose our rate to be t-1 and capacity to be 1.
    using Sponge = FieldSponge<FF, Params::t - 1, 1, Params::t, Poseidon2Permutation<Params>>;

    /**
     * @brief Hashes a vector of field elements
     */
    static FF hash(const std::vector<FF>& input);
};

extern template class Poseidon2<Poseidon2Bn254ScalarFieldParams>;
} // namespace bb::crypto