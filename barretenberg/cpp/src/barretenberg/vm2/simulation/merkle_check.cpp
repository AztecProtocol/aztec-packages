#include "barretenberg/vm2/simulation/merkle_check.hpp"

#include <cassert>
#include <cstdint>

#include "barretenberg/vm2/common/constants.hpp"

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
    // for (const auto& i : sibling_path) {
    for (size_t i = 0; i < sibling_path.size(); ++i) {
        const FF sibling = sibling_path[i];
        bool index_is_even = (curr_index % 2 == 0);

        curr_value = index_is_even ? poseidon2.hash({ curr_value, sibling }) : poseidon2.hash({ sibling, curr_value });

        // Halve the index (to get the parent index) as we move up the tree>
        // Don't halve on the last iteration because after the loop,
        // we want curr_index to be the "final" index (0 or 1).
        if (i < sibling_path.size() - 1) {
            curr_index >>= 1;
        }
    }

    if (curr_index != 0 && curr_index != 1) {
        throw std::runtime_error("Merkle check's final node index must be 0 or 1");
    }
    if (curr_value != root) {
        throw std::runtime_error("Merkle read check failed");
    }

    std::vector<FF> sibling_vec(sibling_path.begin(), sibling_path.end());
    events.emit(
        { .leaf_value = leaf_value, .leaf_index = leaf_index, .sibling_path = std::move(sibling_vec), .root = root });
}

FF MerkleCheck::write(const FF& current_value,
                      const FF& new_value,
                      const uint64_t leaf_index,
                      std::span<const FF> sibling_path,
                      const FF& current_root)
{
    // Gadget breaks if tree_height >= 254
    assert(sibling_path.size() <= 254 && "Merkle path length must be less than 254");

    FF read_value = current_value;
    FF write_value = new_value;
    uint64_t curr_index = leaf_index;

    for (size_t i = 0; i < sibling_path.size(); ++i) {
        const FF sibling = sibling_path[i];
        bool index_is_even = (curr_index % 2 == 0);

        read_value = index_is_even ? poseidon2.hash({ read_value, sibling }) : poseidon2.hash({ sibling, read_value });
        write_value =
            index_is_even ? poseidon2.hash({ write_value, sibling }) : poseidon2.hash({ sibling, write_value });

        // Halve the index (to get the parent index) as we move up the tree>
        // Don't halve on the last iteration because after the loop,
        // we want curr_index to be the "final" index (0 or 1).
        if (i < sibling_path.size() - 1) {
            curr_index >>= 1;
        }
    }

    if (curr_index != 0 && curr_index != 1) {
        throw std::runtime_error("Merkle check's final node index must be 0 or 1");
    }
    if (read_value != current_root) {
        throw std::runtime_error("Merkle read check failed");
    }

    std::vector<FF> sibling_vec(sibling_path.begin(), sibling_path.end());
    events.emit({ .leaf_value = current_value,
                  .new_leaf_value = new_value,
                  .leaf_index = leaf_index,
                  .sibling_path = std::move(sibling_vec),
                  .root = current_root,
                  .new_root = write_value });

    return write_value;
}

} // namespace bb::avm2::simulation
