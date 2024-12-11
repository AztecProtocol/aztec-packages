#pragma once

#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include <memory>
#include <utility>

using namespace bb::crypto::merkle_tree;

namespace bb::world_state {
struct WorldStateStores {
    using Ptr = std::shared_ptr<WorldStateStores>;

    LMDBTreeStore::SharedPtr nullifierStore;
    LMDBTreeStore::SharedPtr publicDataStore;
    LMDBTreeStore::SharedPtr archiveStore;
    LMDBTreeStore::SharedPtr noteHashStore;
    LMDBTreeStore::SharedPtr messageStore;

    WorldStateStores(LMDBTreeStore::SharedPtr n,
                     LMDBTreeStore::SharedPtr p,
                     LMDBTreeStore::SharedPtr a,
                     LMDBTreeStore::SharedPtr no,
                     LMDBTreeStore::SharedPtr m)
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