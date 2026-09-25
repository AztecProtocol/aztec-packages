#pragma once

#include "field/hash_policy.hpp"
#include "merkle_tree/append_only_tree/content_addressed_append_only_tree.hpp"
#include "merkle_tree/indexed_tree/content_addressed_indexed_tree.hpp"
#include "merkle_tree/node_store/cached_content_addressed_tree_store.hpp"
#include "world_state/tree_with_store.hpp"
#include "world_state/types.hpp"
#include <memory>
#include <unordered_map>

namespace azteclabs::wsdb::world_state {

// Append-only trees (note-hash, L1->L2 message, archive) share the baseline merkle separator.
using AppendOnlyHashPolicy = aztec::AztecMerkleHashPolicy;

using FrStore = merkle_tree::ContentAddressedCachedTreeStore<fr>;
using FrTree = merkle_tree::ContentAddressedAppendOnlyTree<FrStore, AppendOnlyHashPolicy>;

using NullifierStore = merkle_tree::ContentAddressedCachedTreeStore<merkle_tree::NullifierLeafValue>;
using NullifierTree =
    merkle_tree::ContentAddressedIndexedTree<NullifierStore, aztec::NullifierMerkleHashPolicy>;

using PublicDataStore = merkle_tree::ContentAddressedCachedTreeStore<merkle_tree::PublicDataLeafValue>;
using PublicDataTree =
    merkle_tree::ContentAddressedIndexedTree<PublicDataStore, aztec::PublicDataMerkleHashPolicy>;

using Tree = std::variant<TreeWithStore<FrTree>, TreeWithStore<NullifierTree>, TreeWithStore<PublicDataTree>>;

struct Fork {
    using Id = uint64_t;
    using SharedPtr = std::shared_ptr<Fork>;
    Id _forkId;
    std::unordered_map<MerkleTreeId, Tree> _trees;
    index_t _blockNumber;
};
} // namespace azteclabs::wsdb::world_state
