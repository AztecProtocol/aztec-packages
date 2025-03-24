#pragma once

#include <array>
#include <cstdint>
#include <vector>
#include "poseidon_params.hpp"
#include "poseidon_permutation.hpp"
#include "barretenberg/crypto/poseidon2/sponge/sponge.hpp"

namespace bb::crypto {

template <typename Params> class Poseidon {
  public:
    using FF = typename Params::FF;

    using Sponge = FieldSponge<FF, Params::t - 1, 1, Params::t, PoseidonPermutation<Params>>;

    static FF hash(const std::vector<FF>& input);

    static FF hash(const std::vector<FF>& input, FF iv);

    static FF hash_buffer(const std::vector<uint8_t>& input);
};

extern template class Poseidon<PoseidonStark252BaseFieldParams>;

using PoseidonHash = std::array<uint8_t, 32>;

PoseidonHash poseidon_stark252(const std::vector<uint8_t>& input);

} // namespace bb::crypto
