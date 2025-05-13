#ifdef STARKNET_GARAGA_FLAVORS
#pragma once

#include "barretenberg/crypto/poseidon2/sponge/sponge.hpp"
#include "poseidon_params.hpp"
#include "poseidon_permutation.hpp"

namespace bb::starknet::crypto {

template <typename Params> class Poseidon {
  public:
    using FF = typename Params::FF;

    using Sponge = bb::crypto::FieldSponge<FF, Params::t - 1, 1, Params::t, PoseidonPermutation<Params>>;

    static FF hash(const std::vector<FF>& input);

    static FF hash(const std::vector<FF>& input, FF iv);
};

extern template class Poseidon<PoseidonStark252BaseFieldParams>;

} // namespace bb::starknet::crypto
#endif
