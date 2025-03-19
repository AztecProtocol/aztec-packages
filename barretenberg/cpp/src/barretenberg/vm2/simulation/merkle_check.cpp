#include <cassert>
#include <cstdint>

#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/simulation/merkle_check.hpp"

namespace bb::avm2::simulation {

void MerkleCheck::assert_membership(const FF& leaf_value,
                                    const uint64_t leaf_index,
                                    std::span<const FF> sibling_path,
                                    const FF& root)
{
    // Gadget breaks if tree_height >= 254
    assert(sibling_path.size() <= 254 && "Merkle path length must be less than 254");

    FF curr_value = leaf_value;
    uint64_t curr_index = leaf_index;
    for (const auto& i : sibling_path) {
        bool index_is_even = (curr_index % 2 == 0);
        // Assert that the current index fits in 64 bits so that
        // it can't overflow when multiplied by 2 in the halving constraint
        range_check.assert_range(curr_index, MAX_LEAF_INDEX_BITS);

        curr_value = index_is_even ? poseidon2.hash({ curr_value, i }) : poseidon2.hash({ i, curr_value });
        // Halve the index (to get the parent index) as we move up the tree
        curr_index >>= 1;
    }

    FF computed_root = curr_value;
    assert(computed_root == root && "Merkle membership or non-membership check failed");
    std::vector<FF> sibling_vec(sibling_path.begin(), sibling_path.end());
    events.emit(
        { .leaf_value = leaf_value, .leaf_index = leaf_index, .sibling_path = std::move(sibling_vec), .root = root });
}

} // namespace bb::avm2::simulation
