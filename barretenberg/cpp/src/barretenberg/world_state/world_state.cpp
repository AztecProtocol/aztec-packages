#include "barretenberg/world_state/world_state.hpp"
#include "barretenberg/crypto/merkle_tree/append_only_tree/content_addressed_append_only_tree.hpp"
#include "barretenberg/crypto/merkle_tree/fixtures.hpp"
#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/callbacks.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/merkle_tree/signal.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/vm/aztec_constants.hpp"
#include "barretenberg/world_state/tree_with_store.hpp"
#include "barretenberg/world_state/types.hpp"
#include "barretenberg/world_state/world_state_stores.hpp"
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <memory>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <tuple>
#include <unordered_map>
#include <utility>
#include <variant>

namespace bb::world_state {

using namespace bb::crypto::merkle_tree;

const uint64_t INITIAL_NULLIFIER_TREE_SIZE = 2UL * MAX_NULLIFIERS_PER_TX;
const uint64_t INITIAL_PUBLIC_DATA_TREE_SIZE = 2UL * MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX;

WorldState::WorldState(const std::string& data_dir,
                       const std::unordered_map<MerkleTreeId, uint64_t>& map_size,
                       uint64_t thread_pool_size)
    : _workers(std::make_shared<ThreadPool>(thread_pool_size))
    , _forkId(CANONICAL_FORK_ID)
{
    create_canonical_fork(data_dir, map_size, thread_pool_size);
}

WorldState::WorldState(const std::string& data_dir, uint64_t map_size, uint64_t thread_pool_size)
    : WorldState(data_dir,
                 {
                     { MerkleTreeId::NULLIFIER_TREE, map_size },
                     { MerkleTreeId::PUBLIC_DATA_TREE, map_size },
                     { MerkleTreeId::ARCHIVE, map_size },
                     { MerkleTreeId::NOTE_HASH_TREE, map_size },
                     { MerkleTreeId::L1_TO_L2_MESSAGE_TREE, map_size },
                 },
                 thread_pool_size)
{}

void WorldState::create_canonical_fork(const std::string& dataDir,
                                       const std::unordered_map<MerkleTreeId, uint64_t>& dbSize,
                                       uint64_t maxReaders)
{
    // create the underlying stores
    auto createStore = [&](MerkleTreeId id) {
        auto name = getMerkleTreeName(id);
        std::filesystem::path directory = dataDir;
        directory /= name;
        std::filesystem::create_directories(directory);
        return std::make_unique<LMDBTreeStore>(directory, name, dbSize.at(id), maxReaders);
    };
    _persistentStores = std::make_unique<WorldStateStores>(createStore(MerkleTreeId::NULLIFIER_TREE),
                                                           createStore(MerkleTreeId::PUBLIC_DATA_TREE),
                                                           createStore(MerkleTreeId::ARCHIVE),
                                                           createStore(MerkleTreeId::NOTE_HASH_TREE),
                                                           createStore(MerkleTreeId::L1_TO_L2_MESSAGE_TREE));

    Fork::SharedPtr fork = std::make_shared<Fork>();
    fork->_forkId = _forkId++;
    {
        auto store = std::make_unique<NullifierStore>(
            getMerkleTreeName(MerkleTreeId::NULLIFIER_TREE), NULLIFIER_TREE_HEIGHT, *_persistentStores->nullifierStore);
        auto tree = std::make_unique<NullifierTree>(*store, _workers, INITIAL_NULLIFIER_TREE_SIZE);
        fork->_trees.insert({ MerkleTreeId::NULLIFIER_TREE, TreeWithStore(std::move(tree), std::move(store)) });
    }
    {
        auto store = std::make_unique<FrStore>(
            getMerkleTreeName(MerkleTreeId::NOTE_HASH_TREE), NOTE_HASH_TREE_HEIGHT, *_persistentStores->noteHashStore);
        auto tree = std::make_unique<FrTree>(*store, _workers);
        fork->_trees.insert({ MerkleTreeId::NOTE_HASH_TREE, TreeWithStore(std::move(tree), std::move(store)) });
    }
    {
        auto store = std::make_unique<PublicDataStore>(getMerkleTreeName(MerkleTreeId::PUBLIC_DATA_TREE),
                                                       PUBLIC_DATA_TREE_HEIGHT,
                                                       *_persistentStores->publicDataStore);
        auto tree = std::make_unique<PublicDataTree>(*store, this->_workers, INITIAL_PUBLIC_DATA_TREE_SIZE);
        fork->_trees.insert({ MerkleTreeId::PUBLIC_DATA_TREE, TreeWithStore(std::move(tree), std::move(store)) });
    }
    {
        auto store = std::make_unique<FrStore>(getMerkleTreeName(MerkleTreeId::L1_TO_L2_MESSAGE_TREE),
                                               L1_TO_L2_MSG_TREE_HEIGHT,
                                               *_persistentStores->messageStore);
        auto tree = std::make_unique<FrTree>(*store, this->_workers);
        fork->_trees.insert({ MerkleTreeId::L1_TO_L2_MESSAGE_TREE, TreeWithStore(std::move(tree), std::move(store)) });
    }
    {
        auto store = std::make_unique<FrStore>(
            getMerkleTreeName(MerkleTreeId::ARCHIVE), ARCHIVE_HEIGHT, *_persistentStores->archiveStore);
        auto tree = std::make_unique<FrTree>(*store, this->_workers);
        fork->_trees.insert({ MerkleTreeId::ARCHIVE, TreeWithStore(std::move(tree), std::move(store)) });
    }
    _forks[fork->_forkId] = fork;
}

Fork::SharedPtr WorldState::retrieve_fork(uint64_t forkId) const
{
    std::unique_lock lock(mtx);
    auto it = _forks.find(forkId);
    if (it == _forks.end()) {
        throw std::runtime_error("Fork not found");
    }
    return it->second;
}
uint64_t WorldState::create_fork(index_t blockNumber)
{
    std::unique_lock lock(mtx);
    Fork::SharedPtr fork = create_new_fork(blockNumber);
    fork->_forkId = _forkId++;
    _forks[fork->_forkId] = fork;
    return fork->_forkId;
}

Fork::SharedPtr WorldState::create_new_fork(index_t blockNumber)
{
    Fork::SharedPtr fork = std::make_shared<Fork>();
    {
        auto store = std::make_unique<NullifierStore>(getMerkleTreeName(MerkleTreeId::NULLIFIER_TREE),
                                                      NULLIFIER_TREE_HEIGHT,
                                                      blockNumber,
                                                      *_persistentStores->nullifierStore);
        auto tree = std::make_unique<NullifierTree>(*store, _workers, INITIAL_NULLIFIER_TREE_SIZE);
        fork->_trees.insert({ MerkleTreeId::NULLIFIER_TREE, TreeWithStore(std::move(tree), std::move(store)) });
    }
    {
        auto store = std::make_unique<FrStore>(getMerkleTreeName(MerkleTreeId::NOTE_HASH_TREE),
                                               NOTE_HASH_TREE_HEIGHT,
                                               blockNumber,
                                               *_persistentStores->noteHashStore);
        auto tree = std::make_unique<FrTree>(*store, _workers);
        fork->_trees.insert({ MerkleTreeId::NOTE_HASH_TREE, TreeWithStore(std::move(tree), std::move(store)) });
    }
    {
        auto store = std::make_unique<PublicDataStore>(getMerkleTreeName(MerkleTreeId::PUBLIC_DATA_TREE),
                                                       PUBLIC_DATA_TREE_HEIGHT,
                                                       blockNumber,
                                                       *_persistentStores->publicDataStore);
        auto tree = std::make_unique<PublicDataTree>(*store, this->_workers, INITIAL_PUBLIC_DATA_TREE_SIZE);
        fork->_trees.insert({ MerkleTreeId::PUBLIC_DATA_TREE, TreeWithStore(std::move(tree), std::move(store)) });
    }
    {
        auto store = std::make_unique<FrStore>(getMerkleTreeName(L1_TO_L2_MESSAGE_TREE),
                                               L1_TO_L2_MSG_TREE_HEIGHT,
                                               blockNumber,
                                               *_persistentStores->messageStore);
        auto tree = std::make_unique<FrTree>(*store, this->_workers);
        fork->_trees.insert({ MerkleTreeId::L1_TO_L2_MESSAGE_TREE, TreeWithStore(std::move(tree), std::move(store)) });
    }
    {
        auto store = std::make_unique<FrStore>(
            getMerkleTreeName(MerkleTreeId::ARCHIVE), ARCHIVE_HEIGHT, blockNumber, *_persistentStores->archiveStore);
        auto tree = std::make_unique<FrTree>(*store, this->_workers);
        fork->_trees.insert({ MerkleTreeId::ARCHIVE, TreeWithStore(std::move(tree), std::move(store)) });
    }
    return fork;
}

void WorldState::delete_fork(uint64_t forkId)
{
    if (forkId == 0) {
        throw std::runtime_error("Unable to delete canonical fork");
    }
    std::unique_lock lock(mtx);
    _forks.erase(forkId);
}

TreeMetaResponse WorldState::get_tree_info(WorldStateRevision revision, MerkleTreeId tree_id) const
{
    Fork::SharedPtr fork = retrieve_fork(revision.forkId);
    return std::visit(
        [=](auto&& wrapper) {
            Signal signal(1);
            TreeMetaResponse response;

            auto callback = [&](const TypedResponse<TreeMetaResponse>& meta) {
                response = meta.inner;
                signal.signal_level(0);
            };

            wrapper.tree->get_meta_data(include_uncommitted(revision), callback);
            signal.wait_for_level(0);

            return response;
        },
        fork->_trees.at(tree_id));
}

StateReference WorldState::get_state_reference(WorldStateRevision revision) const
{
    Fork::SharedPtr fork = retrieve_fork(revision.forkId);
    Signal signal(static_cast<uint32_t>(fork->_trees.size()));
    StateReference state_reference;
    std::mutex state_ref_mutex;
    bool uncommitted = include_uncommitted(revision);

    for (const auto& [id, tree] : fork->_trees) {
        auto callback = [&signal, &state_reference, &state_ref_mutex, id](const TypedResponse<TreeMetaResponse>& meta) {
            {
                std::lock_guard<std::mutex> lock(state_ref_mutex);
                state_reference.insert({ id, { meta.inner.meta.root, meta.inner.meta.size } });
            }
            signal.signal_decrement();
        };
        std::visit([&callback, uncommitted](auto&& wrapper) { wrapper.tree->get_meta_data(uncommitted, callback); },
                   tree);
    }

    signal.wait_for_level(0);
    return state_reference;
}

StateReference WorldState::get_initial_state_reference() const
{
    Fork::SharedPtr fork = retrieve_fork(CANONICAL_FORK_ID);
    Signal signal(static_cast<uint32_t>(fork->_trees.size()));
    StateReference state_reference;
    std::mutex state_ref_mutex;

    for (const auto& [id, tree] : fork->_trees) {
        auto callback = [&signal, &state_reference, &state_ref_mutex, id](const TypedResponse<TreeMetaResponse>& meta) {
            {
                std::lock_guard<std::mutex> lock(state_ref_mutex);
                state_reference.insert({ id, { meta.inner.meta.initialRoot, meta.inner.meta.initialSize } });
            }
            signal.signal_decrement();
        };
        std::visit([&callback](auto&& wrapper) { wrapper.tree->get_meta_data(false, callback); }, tree);
    }

    signal.wait_for_level(0);
    return state_reference;
}

fr_sibling_path WorldState::get_sibling_path(WorldStateRevision revision,
                                             MerkleTreeId tree_id,
                                             index_t leaf_index) const
{
    Fork::SharedPtr fork = retrieve_fork(revision.forkId);

    return std::visit(
        [leaf_index, revision](auto&& wrapper) {
            Signal signal(1);
            fr_sibling_path path;

            auto callback = [&signal, &path](const TypedResponse<GetSiblingPathResponse>& response) {
                path = response.inner.path;
                signal.signal_level(0);
            };

            if (revision.blockNumber) {
                wrapper.tree->get_sibling_path(leaf_index, revision.blockNumber, callback, revision.includeUncommitted);
            } else {
                wrapper.tree->get_sibling_path(leaf_index, callback, revision.includeUncommitted);
            }
            signal.wait_for_level(0);

            return path;
        },
        fork->_trees.at(tree_id));
}

void WorldState::update_public_data(const PublicDataLeafValue& new_value, Fork::Id fork_id)
{
    Fork::SharedPtr fork = retrieve_fork(fork_id);
    if (const auto* wrapper =
            std::get_if<TreeWithStore<PublicDataTree>>(&fork->_trees.at(MerkleTreeId::PUBLIC_DATA_TREE))) {
        Signal signal;
        wrapper->tree->add_or_update_value(new_value, [&signal](const auto&) { signal.signal_level(0); });
        signal.wait_for_level();
    } else {
        throw std::runtime_error("Invalid tree type for PublicDataTree");
    }
}

void WorldState::update_archive(const StateReference& block_state_ref, fr block_header_hash, Fork::Id fork_id)
{
    auto world_state_ref = get_state_reference(WorldStateRevision{ .forkId = fork_id, .includeUncommitted = true });
    if (block_state_matches_world_state(block_state_ref, world_state_ref)) {
        append_leaves<fr>(MerkleTreeId::ARCHIVE, { block_header_hash }, fork_id);
    } else {
        throw std::runtime_error("Block state does not match world state");
    }
}

void WorldState::commit()
{
    // NOTE: the calling code is expected to ensure no other reads or writes happen during commit
    Fork::SharedPtr fork = retrieve_fork(CANONICAL_FORK_ID);
    Signal signal(static_cast<uint32_t>(fork->_trees.size()));
    for (auto& [id, tree] : fork->_trees) {
        std::visit(
            [&signal](auto&& wrapper) { wrapper.tree->commit([&](const Response&) { signal.signal_decrement(); }); },
            tree);
    }

    signal.wait_for_level(0);
}

void WorldState::rollback()
{
    // NOTE: the calling code is expected to ensure no other reads or writes happen during rollback
    Fork::SharedPtr fork = retrieve_fork(CANONICAL_FORK_ID);
    Signal signal(static_cast<uint32_t>(fork->_trees.size()));
    for (auto& [id, tree] : fork->_trees) {
        std::visit(
            [&signal](auto&& wrapper) {
                wrapper.tree->rollback([&signal](const Response&) { signal.signal_decrement(); });
            },
            tree);
    }
    signal.wait_for_level();
}

bool WorldState::sync_block(StateReference& block_state_ref,
                            fr block_header_hash,
                            const std::vector<bb::fr>& notes,
                            const std::vector<bb::fr>& l1_to_l2_messages,
                            const std::vector<crypto::merkle_tree::NullifierLeafValue>& nullifiers,
                            const std::vector<std::vector<crypto::merkle_tree::PublicDataLeafValue>>& public_writes)
{
    Fork::SharedPtr fork = retrieve_fork(CANONICAL_FORK_ID);
    auto current_state = get_state_reference(WorldStateRevision::uncommitted());
    if (block_state_matches_world_state(block_state_ref, current_state)) {
        // TODO (alexg) remove commit & rollback. All modifications should happen on forks
        // Synching a block should always be done on top of a clean state
        // so committing partial writes like we're doing here shouldn't be possible
        //
        // Disable updating the archive tree. Why? The only way to commit dirty state when synching a block is if the
        // current node _built_ the block. If that's the case then the archive tree has already been updated by the
        // node's orchestrator.
        // append_leaves<fr>(MerkleTreeId::ARCHIVE, { block_hash });
        // just commit the dirty state
        commit();
        return true;
    }

    rollback();

    Signal signal(static_cast<uint32_t>(fork->_trees.size()));
    auto decr = [&signal](const auto&) { signal.signal_decrement(); };

    {
        auto& wrapper = std::get<TreeWithStore<NullifierTree>>(fork->_trees.at(MerkleTreeId::NULLIFIER_TREE));
        wrapper.tree->add_or_update_values(nullifiers, 0, decr);
    }

    {
        auto& wrapper = std::get<TreeWithStore<FrTree>>(fork->_trees.at(MerkleTreeId::NOTE_HASH_TREE));
        wrapper.tree->add_values(notes, decr);
    }

    {
        auto& wrapper = std::get<TreeWithStore<PublicDataTree>>(fork->_trees.at(MerkleTreeId::PUBLIC_DATA_TREE));
        std::vector<PublicDataLeafValue> leaves;
        size_t total_leaves = 0;
        for (const auto& batch : public_writes) {
            total_leaves += batch.size();
        }

        leaves.reserve(total_leaves);
        for (const auto& batch : public_writes) {
            leaves.insert(leaves.end(), batch.begin(), batch.end());
        }

        wrapper.tree->add_or_update_values(leaves, 0, decr);
    }

    {
        auto& wrapper = std::get<TreeWithStore<FrTree>>(fork->_trees.at(MerkleTreeId::L1_TO_L2_MESSAGE_TREE));
        wrapper.tree->add_values(l1_to_l2_messages, decr);
    }

    {
        auto& wrapper = std::get<TreeWithStore<FrTree>>(fork->_trees.at(MerkleTreeId::ARCHIVE));
        wrapper.tree->add_value(block_header_hash, decr);
    }

    signal.wait_for_level();

    auto state_after_inserts = get_state_reference(WorldStateRevision::uncommitted());
    if (block_state_matches_world_state(block_state_ref, state_after_inserts)) {
        commit();
        return false;
    }

    // TODO (alexg) should we rollback here?
    // Potentiall not since all the changes exist only in-memory and this error will cause the process to die
    throw std::runtime_error("Block state does not match world state");
}

GetLowIndexedLeafResponse WorldState::find_low_leaf_index(const WorldStateRevision revision,
                                                          MerkleTreeId tree_id,
                                                          fr leaf_key) const
{
    Fork::SharedPtr fork = retrieve_fork(revision.forkId);
    Signal signal;
    GetLowIndexedLeafResponse low_leaf_info;
    auto callback = [&signal, &low_leaf_info](const TypedResponse<GetLowIndexedLeafResponse>& response) {
        low_leaf_info = response.inner;
        signal.signal_level();
    };

    if (const auto* wrapper = std::get_if<TreeWithStore<NullifierTree>>(&fork->_trees.at(tree_id))) {
        if (revision.blockNumber != 0U) {
            wrapper->tree->find_low_leaf(leaf_key, revision.blockNumber, include_uncommitted(revision), callback);
        } else {
            wrapper->tree->find_low_leaf(leaf_key, include_uncommitted(revision), callback);
        }

    } else if (const auto* wrapper = std::get_if<TreeWithStore<PublicDataTree>>(&fork->_trees.at(tree_id))) {
        if (revision.blockNumber != 0U) {
            wrapper->tree->find_low_leaf(leaf_key, revision.blockNumber, include_uncommitted(revision), callback);
        } else {
            wrapper->tree->find_low_leaf(leaf_key, include_uncommitted(revision), callback);
        }

    } else {
        throw std::runtime_error("Invalid tree type for find_low_leaf");
    }

    signal.wait_for_level();
    return low_leaf_info;
}

bool WorldState::include_uncommitted(WorldStateRevision rev)
{
    return rev.includeUncommitted;
}

bool WorldState::block_state_matches_world_state(const StateReference& block_state_ref,
                                                 const StateReference& tree_state_ref)
{
    std::vector tree_ids{
        MerkleTreeId::NULLIFIER_TREE,
        MerkleTreeId::NOTE_HASH_TREE,
        MerkleTreeId::PUBLIC_DATA_TREE,
        MerkleTreeId::L1_TO_L2_MESSAGE_TREE,
    };

    return std::all_of(
        tree_ids.begin(), tree_ids.end(), [=](auto id) { return block_state_ref.at(id) == tree_state_ref.at(id); });
}

} // namespace bb::world_state
