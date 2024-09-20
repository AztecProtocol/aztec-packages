#pragma once

#include "barretenberg/world_state/tree_with_store.hpp"
#include "barretenberg/world_state/types.hpp"
#include "barretenberg/world_state/world_state.hpp"
#include <memory>
#include <unordered_map>

namespace bb::world_state {

using HashPolicy = crypto::merkle_tree::Poseidon2HashPolicy;

using FrStore = crypto::merkle_tree::ContentAddressedCachedTreeStore<fr>;
using FrTree = crypto::merkle_tree::ContentAddressedAppendOnlyTree<FrStore, HashPolicy>;

using NullifierStore = crypto::merkle_tree::ContentAddressedCachedTreeStore<crypto::merkle_tree::NullifierLeafValue>;
using NullifierTree = crypto::merkle_tree::ContentAddressedIndexedTree<NullifierStore, HashPolicy>;

using PublicDataStore = crypto::merkle_tree::ContentAddressedCachedTreeStore<crypto::merkle_tree::PublicDataLeafValue>;
using PublicDataTree = crypto::merkle_tree::ContentAddressedIndexedTree<PublicDataStore, HashPolicy>;

using Tree = std::variant<TreeWithStore<FrTree>, TreeWithStore<NullifierTree>, TreeWithStore<PublicDataTree>>;

struct Fork {
    using SharedPtr = std::shared_ptr<Fork>;
    uint64_t _forkId;
    std::unordered_map<MerkleTreeId, Tree> _trees;
};
} // namespace bb::world_state
