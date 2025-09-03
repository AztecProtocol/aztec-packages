#include "barretenberg/vm2/simulation/testing/fakes/fake_poseidon2.hpp"

#include "barretenberg//crypto/poseidon2/poseidon2.hpp"

namespace bb::avm2::simulation {

using Poseidon2Hash = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
using Poseidon2Perm = crypto::Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams>;

std::array<FF, 4> FakePoseidon2::permutation(const std::array<FF, 4>& input)
{
    return Poseidon2Perm::permutation(input);
}

FF FakePoseidon2::hash(const std::vector<FF>& input)
{
    return Poseidon2Hash::hash(input);
}

} // namespace bb::avm2::simulation
