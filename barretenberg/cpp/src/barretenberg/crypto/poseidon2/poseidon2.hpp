// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "poseidon2_params.hpp"
#include "poseidon2_permutation.hpp"
#include "sponge/sponge.hpp"

namespace bb::crypto {

/**
 * @brief Native Poseidon2 hash function implementation
 * @details This implementation is differentially tested against the stdlib (circuit) implementation.
 *          The stdlib tests (stdlib/hash/poseidon2/poseidon2.test.cpp) validate both implementations
 *          against independent test vectors from https://github.com/zemse/poseidon2-evm and verify
 *          that native and circuit implementations produce identical outputs.
 */
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
