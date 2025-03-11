#include <cassert>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2.hpp"

#include "barretenberg/vm2/simulation/merkle_check.hpp"

namespace bb::avm2::simulation {

// Helpers in anonymous namespace
namespace {

using Poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;

FF root_from_path(const FF& leaf_value, const uint64_t leaf_index, const std::vector<FF>& path)
{
    FF curr_value = leaf_value;
    uint64_t curr_index = leaf_index;
    std::vector<FF> path_values;
    for (const auto& i : path) {
        // Is true if the current index is even
        bool path_parity = (curr_index % 2 == 0);

        // TODO(dbanks12): interaction with vm2 poseidon2 module
        curr_value = path_parity ? Poseidon2::hash({ curr_value, i }) : Poseidon2::hash({ i, curr_value });
        path_values.push_back(curr_value);
        // Halve the index (to get the parent index) as we move up the tree
        curr_index >>= 1;
    }
    return curr_value;
}

} // namespace

// Merkle interface

void MerkleCheck::assert_membership(const FF& leaf_value,
                                    const uint64_t leaf_index,
                                    const std::vector<FF>& sibling_path,
                                    const FF& root)
{
    FF computed_root = root_from_path(leaf_value, leaf_index, sibling_path);
    assert(computed_root == root && "Merkle membership or non-membership check failed");
    events.emit({ .leaf_value = leaf_value, .leaf_index = leaf_index, .sibling_path = sibling_path, .root = root });
}

} // namespace bb::avm2::simulation
