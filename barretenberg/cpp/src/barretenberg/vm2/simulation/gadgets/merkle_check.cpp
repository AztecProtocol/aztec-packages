#include "barretenberg/vm2/simulation/gadgets/merkle_check.hpp"

#include <cassert>
#include <cstdint>

#include "barretenberg/vm2/common/constants.hpp"

namespace bb::avm2::simulation {

void MerkleCheck::assert_membership(const FF& leaf_value,
                                    const uint64_t leaf_index,
                                    std::span<const FF> sibling_path,
                                    const FF& root)
{
    // Gadget breaks if tree_height > 64
    assert(sibling_path.size() <= 64 && "Merkle path length must be less than or equal to 64");

    FF curr_value = leaf_value;
    uint64_t curr_index = leaf_index;
    for (const auto& sibling : sibling_path) {
        bool index_is_even = (curr_index % 2 == 0);

        curr_value = index_is_even ? poseidon2.hash({ curr_value, sibling }) : poseidon2.hash({ sibling, curr_value });

        // Halve the index (to get the parent index) as we move up the tree.
        curr_index >>= 1;
    }

    if (curr_index != 0) {
        throw std::runtime_error("Merkle check's final node index must be 0");
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
    // Gadget breaks if tree_height > 64
    assert(sibling_path.size() <= 64 && "Merkle path length must be less than or equal to 64");

    FF read_value = current_value;
    FF write_value = new_value;
    uint64_t curr_index = leaf_index;

    for (const auto& sibling : sibling_path) {
        bool index_is_even = (curr_index % 2 == 0);

        read_value = index_is_even ? poseidon2.hash({ read_value, sibling }) : poseidon2.hash({ sibling, read_value });
        write_value =
            index_is_even ? poseidon2.hash({ write_value, sibling }) : poseidon2.hash({ sibling, write_value });

        // Halve the index (to get the parent index) as we move up the tree.
        curr_index >>= 1;
    }

    if (curr_index != 0) {
        throw std::runtime_error("Merkle check's final node index must be 0");
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
