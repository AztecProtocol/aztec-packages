#pragma once

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
};

extern template class Poseidon<PoseidonStark252BaseFieldParams>;

} // namespace bb::crypto
