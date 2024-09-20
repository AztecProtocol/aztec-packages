#pragma once

#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include <memory>

using namespace bb::crypto::merkle_tree;

namespace bb::world_state {
struct WorldStateStores {
    using Ptr = std::shared_ptr<WorldStateStores>;

    LMDBTreeStore::Ptr nullifierStore;
    LMDBTreeStore::Ptr publicDataStore;
    LMDBTreeStore::Ptr archiveStore;
    LMDBTreeStore::Ptr noteHashStore;
    LMDBTreeStore::Ptr messageStore;

    WorldStateStores(
        LMDBTreeStore::Ptr n, LMDBTreeStore::Ptr p, LMDBTreeStore::Ptr a, LMDBTreeStore::Ptr no, LMDBTreeStore::Ptr m)
        : nullifierStore(std::move(n))
        , publicDataStore(std::move(p))
        , archiveStore(std::move(a))
        , noteHashStore(std::move(no))
        , messageStore(std::move(m))
    {}

    WorldStateStores(WorldStateStores&& other) noexcept
        : nullifierStore(std::move(other.nullifierStore))
        , publicDataStore(std::move(other.publicDataStore))
        , archiveStore(std::move(other.archiveStore))
        , noteHashStore(std::move(other.noteHashStore))
        , messageStore(std::move(other.messageStore))
    {}

    WorldStateStores(const WorldStateStores& other) = delete;
    ~WorldStateStores() = default;

    WorldStateStores& operator=(WorldStateStores&& other) = delete;
    WorldStateStores& operator=(WorldStateStores& other) = delete;
};
} // namespace bb::world_state