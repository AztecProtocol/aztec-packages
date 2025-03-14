#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

using Poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

FF root_from_path(const FF& leaf_value, const uint64_t leaf_index, const std::vector<FF>& path)
{
    FF curr_value = leaf_value;
    uint64_t curr_index = leaf_index;
    std::vector<FF> path_values;
    for (const auto& i : path) {
        // Is true if the current index is even
        bool path_parity = (curr_index % 2 == 0);

        curr_value = path_parity ? Poseidon2::hash({ curr_value, i }) : Poseidon2::hash({ i, curr_value });
        path_values.push_back(curr_value);
        // Halve the index (to get the parent index) as we move up the tree
        curr_index >>= 1;
    }
    return curr_value;
}

} // namespace bb::avm2::simulation
