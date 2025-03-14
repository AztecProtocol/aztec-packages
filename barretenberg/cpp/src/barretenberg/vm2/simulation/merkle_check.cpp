#include <cassert>
#include <cstdint>

#include "barretenberg/vm2/simulation/merkle_check.hpp"

namespace bb::avm2::simulation {

void MerkleCheck::assert_membership(const FF& leaf_value,
                                    const uint64_t leaf_index,
                                    const std::vector<FF>& sibling_path,
                                    const FF& root)
{
    FF curr_value = leaf_value;
    uint64_t curr_index = leaf_index;
    std::vector<FF> path_values;
    for (const auto& i : sibling_path) {
        // Is true if the current index is even
        bool path_parity = (curr_index % 2 == 0);

        curr_value = path_parity ? poseidon2.hash({ curr_value, i }) : poseidon2.hash({ i, curr_value });
        path_values.push_back(curr_value);
        // Halve the index (to get the parent index) as we move up the tree
        curr_index >>= 1;
    }

    FF computed_root = curr_value;
    assert(computed_root == root && "Merkle membership or non-membership check failed");
    events.emit({ .leaf_value = leaf_value, .leaf_index = leaf_index, .sibling_path = sibling_path, .root = root });
}

} // namespace bb::avm2::simulation
