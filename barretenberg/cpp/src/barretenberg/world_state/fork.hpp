#pragma once

#include "barretenberg/crypto/merkle_tree/append_only_tree/content_addressed_append_only_tree.hpp"
#include "barretenberg/crypto/merkle_tree/hash.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/content_addressed_indexed_tree.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/cached_content_addressed_tree_store.hpp"
#include "barretenberg/world_state/tree_with_store.hpp"
#include "barretenberg/world_state/types.hpp"
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
    using Id = uint64_t;
    using SharedPtr = std::shared_ptr<Fork>;
    Id _forkId;
    std::unordered_map<MerkleTreeId, Tree> _trees;
    index_t _blockNumber;
};
} // namespace bb::world_state
