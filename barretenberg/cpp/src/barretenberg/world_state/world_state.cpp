#include "barretenberg/world_state/world_state.hpp"
#include "barretenberg/crypto/merkle_tree/append_only_tree/content_addressed_append_only_tree.hpp"
#include "barretenberg/crypto/merkle_tree/hash.hpp"
#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/callbacks.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/tree_meta.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/merkle_tree/signal.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/vm/aztec_constants.hpp"
#include "barretenberg/world_state/fork.hpp"
#include "barretenberg/world_state/tree_with_store.hpp"
#include "barretenberg/world_state/types.hpp"
#include "barretenberg/world_state/world_state_stores.hpp"
#include "barretenberg/world_state_napi/message.hpp"
#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <memory>
#include <mutex>
#include <optional>
#include <ostream>
#include <stdexcept>
#include <tuple>
#include <unordered_map>
#include <utility>
#include <variant>

namespace bb::world_state {

using namespace bb::crypto::merkle_tree;

WorldState::WorldState(uint64_t thread_pool_size,
                       const std::string& data_dir,
                       const std::unordered_map<MerkleTreeId, uint64_t>& map_size,
                       const std::unordered_map<MerkleTreeId, uint32_t>& tree_heights,
                       const std::unordered_map<MerkleTreeId, index_t>& tree_prefill,
                       uint32_t initial_header_generator_point)
    : _workers(std::make_shared<ThreadPool>(thread_pool_size))
    , _tree_heights(tree_heights)
    , _initial_tree_size(tree_prefill)
    , _forkId(CANONICAL_FORK_ID)
    , _initial_header_generator_point(initial_header_generator_point)
{
    create_canonical_fork(data_dir, map_size, thread_pool_size);
}

WorldState::WorldState(uint64_t thread_pool_size,
                       const std::string& data_dir,
                       uint64_t map_size,
                       const std::unordered_map<MerkleTreeId, uint32_t>& tree_heights,
                       const std::unordered_map<MerkleTreeId, index_t>& tree_prefill,
                       uint32_t initial_header_generator_point)
    : WorldState(thread_pool_size,
                 data_dir,
                 {
                     { MerkleTreeId::NULLIFIER_TREE, map_size },
                     { MerkleTreeId::PUBLIC_DATA_TREE, map_size },
                     { MerkleTreeId::ARCHIVE, map_size },
                     { MerkleTreeId::NOTE_HASH_TREE, map_size },
                     { MerkleTreeId::L1_TO_L2_MESSAGE_TREE, map_size },
                 },
                 tree_heights,
                 tree_prefill,
                 initial_header_generator_point)
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
        return std::make_shared<LMDBTreeStore>(directory, name, dbSize.at(id), maxReaders);
    };
    _persistentStores = std::make_unique<WorldStateStores>(createStore(MerkleTreeId::NULLIFIER_TREE),
                                                           createStore(MerkleTreeId::PUBLIC_DATA_TREE),
                                                           createStore(MerkleTreeId::ARCHIVE),
                                                           createStore(MerkleTreeId::NOTE_HASH_TREE),
                                                           createStore(MerkleTreeId::L1_TO_L2_MESSAGE_TREE));

    Fork::SharedPtr fork = std::make_shared<Fork>();
    fork->_forkId = _forkId++;
    {
        uint32_t levels = _tree_heights.at(MerkleTreeId::NULLIFIER_TREE);
        index_t initial_size = _initial_tree_size.at(MerkleTreeId::NULLIFIER_TREE);
        auto store = std::make_unique<NullifierStore>(
            getMerkleTreeName(MerkleTreeId::NULLIFIER_TREE), levels, _persistentStores->nullifierStore);
        auto tree = std::make_unique<NullifierTree>(std::move(store), _workers, initial_size);
        fork->_trees.insert({ MerkleTreeId::NULLIFIER_TREE, TreeWithStore(std::move(tree)) });
    }
    {
        uint32_t levels = _tree_heights.at(MerkleTreeId::NOTE_HASH_TREE);
        auto store = std::make_unique<FrStore>(
            getMerkleTreeName(MerkleTreeId::NOTE_HASH_TREE), levels, _persistentStores->noteHashStore);
        auto tree = std::make_unique<FrTree>(std::move(store), _workers);
        fork->_trees.insert({ MerkleTreeId::NOTE_HASH_TREE, TreeWithStore(std::move(tree)) });
    }
    {
        uint32_t levels = _tree_heights.at(MerkleTreeId::PUBLIC_DATA_TREE);
        index_t initial_size = _initial_tree_size.at(MerkleTreeId::PUBLIC_DATA_TREE);
        auto store = std::make_unique<PublicDataStore>(
            getMerkleTreeName(MerkleTreeId::PUBLIC_DATA_TREE), levels, _persistentStores->publicDataStore);
        auto tree = std::make_unique<PublicDataTree>(std::move(store), _workers, initial_size);
        fork->_trees.insert({ MerkleTreeId::PUBLIC_DATA_TREE, TreeWithStore(std::move(tree)) });
    }
    {
        uint32_t levels = _tree_heights.at(MerkleTreeId::L1_TO_L2_MESSAGE_TREE);
        auto store = std::make_unique<FrStore>(
            getMerkleTreeName(MerkleTreeId::L1_TO_L2_MESSAGE_TREE), levels, _persistentStores->messageStore);
        auto tree = std::make_unique<FrTree>(std::move(store), _workers);
        fork->_trees.insert({ MerkleTreeId::L1_TO_L2_MESSAGE_TREE, TreeWithStore(std::move(tree)) });
    }
    {
        uint32_t levels = _tree_heights.at(MerkleTreeId::ARCHIVE);
        std::vector<bb::fr> initial_values{ compute_initial_archive(
            get_state_reference(WorldStateRevision::committed(), fork, true), _initial_header_generator_point) };
        auto store = std::make_unique<FrStore>(
            getMerkleTreeName(MerkleTreeId::ARCHIVE), levels, _persistentStores->archiveStore);
        auto tree = std::make_unique<FrTree>(std::move(store), _workers, initial_values);
        fork->_trees.insert({ MerkleTreeId::ARCHIVE, TreeWithStore(std::move(tree)) });
    }
    _forks[fork->_forkId] = fork;
}

Fork::SharedPtr WorldState::retrieve_fork(const uint64_t& forkId) const
{
    std::unique_lock lock(mtx);
    auto it = _forks.find(forkId);
    if (it == _forks.end()) {
        throw std::runtime_error("Fork not found");
    }
    return it->second;
}
uint64_t WorldState::create_fork(const std::optional<index_t>& blockNumber)
{
    index_t blockNumberForFork = 0;
    if (!blockNumber.has_value()) {
        // we are forking at latest
        WorldStateRevision revision{ .forkId = CANONICAL_FORK_ID, .blockNumber = 0, .includeUncommitted = false };
        TreeMetaResponse archiveMeta = get_tree_info(revision, MerkleTreeId::ARCHIVE);
        blockNumberForFork = archiveMeta.meta.unfinalisedBlockHeight;
    } else {
        blockNumberForFork = blockNumber.value();
    }
    Fork::SharedPtr fork = create_new_fork(blockNumberForFork);
    std::unique_lock lock(mtx);
    uint64_t forkId = _forkId++;
    fork->_forkId = forkId;
    _forks[forkId] = fork;
    return forkId;
}

void WorldState::remove_forks_for_block(const index_t& blockNumber)
{
    // capture the shared pointers outside of the lock scope so we are not under the lock when the objects are destroyed
    std::vector<Fork::SharedPtr> forks;
    {
        std::unique_lock lock(mtx);
        for (auto it = _forks.begin(); it != _forks.end();) {
            if (it->second->_blockNumber == blockNumber) {
                forks.push_back(it->second);
                it = _forks.erase(it);

            } else {
                it++;
            }
        }
    }
}

void WorldState::delete_fork(const uint64_t& forkId)
{
    if (forkId == 0) {
        throw std::runtime_error("Unable to delete canonical fork");
    }
    // Retrieving the shared pointer here means we throw if the fork is not available, it also means we are not under a
    // lock when we destroy the object
    Fork::SharedPtr fork = retrieve_fork(forkId);
    {
        std::unique_lock lock(mtx);
        _forks.erase(forkId);
    }
}

Fork::SharedPtr WorldState::create_new_fork(const index_t& blockNumber)
{
    Fork::SharedPtr fork = std::make_shared<Fork>();
    fork->_blockNumber = blockNumber;
    {
        uint32_t levels = _tree_heights.at(MerkleTreeId::NULLIFIER_TREE);
        index_t initial_size = _initial_tree_size.at(MerkleTreeId::NULLIFIER_TREE);
        auto store = std::make_unique<NullifierStore>(
            getMerkleTreeName(MerkleTreeId::NULLIFIER_TREE), levels, blockNumber, _persistentStores->nullifierStore);
        auto tree = std::make_unique<NullifierTree>(std::move(store), _workers, initial_size);
        fork->_trees.insert({ MerkleTreeId::NULLIFIER_TREE, TreeWithStore(std::move(tree)) });
    }
    {
        uint32_t levels = _tree_heights.at(MerkleTreeId::NOTE_HASH_TREE);
        auto store = std::make_unique<FrStore>(
            getMerkleTreeName(MerkleTreeId::NOTE_HASH_TREE), levels, blockNumber, _persistentStores->noteHashStore);
        auto tree = std::make_unique<FrTree>(std::move(store), _workers);
        fork->_trees.insert({ MerkleTreeId::NOTE_HASH_TREE, TreeWithStore(std::move(tree)) });
    }
    {
        uint32_t levels = _tree_heights.at(MerkleTreeId::PUBLIC_DATA_TREE);
        index_t initial_size = _initial_tree_size.at(MerkleTreeId::PUBLIC_DATA_TREE);
        auto store = std::make_unique<PublicDataStore>(
            getMerkleTreeName(MerkleTreeId::PUBLIC_DATA_TREE), levels, blockNumber, _persistentStores->publicDataStore);
        auto tree = std::make_unique<PublicDataTree>(std::move(store), _workers, initial_size);
        fork->_trees.insert({ MerkleTreeId::PUBLIC_DATA_TREE, TreeWithStore(std::move(tree)) });
    }
    {
        uint32_t levels = _tree_heights.at(MerkleTreeId::L1_TO_L2_MESSAGE_TREE);
        auto store = std::make_unique<FrStore>(
            getMerkleTreeName(L1_TO_L2_MESSAGE_TREE), levels, blockNumber, _persistentStores->messageStore);
        auto tree = std::make_unique<FrTree>(std::move(store), _workers);
        fork->_trees.insert({ MerkleTreeId::L1_TO_L2_MESSAGE_TREE, TreeWithStore(std::move(tree)) });
    }
    {
        uint32_t levels = _tree_heights.at(MerkleTreeId::ARCHIVE);
        auto store = std::make_unique<FrStore>(
            getMerkleTreeName(MerkleTreeId::ARCHIVE), levels, blockNumber, _persistentStores->archiveStore);
        auto tree = std::make_unique<FrTree>(std::move(store), _workers);
        fork->_trees.insert({ MerkleTreeId::ARCHIVE, TreeWithStore(std::move(tree)) });
    }
    return fork;
}

TreeMetaResponse WorldState::get_tree_info(const WorldStateRevision& revision, MerkleTreeId tree_id) const
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

            if (revision.blockNumber) {
                wrapper.tree->get_meta_data(revision.blockNumber, revision.includeUncommitted, callback);
            } else {
                wrapper.tree->get_meta_data(revision.includeUncommitted, callback);
            }
            signal.wait_for_level(0);

            return response;
        },
        fork->_trees.at(tree_id));
}

void WorldState::get_all_tree_info(const WorldStateRevision& revision, std::array<TreeMeta, 5>& responses) const
{
    Fork::SharedPtr fork = retrieve_fork(revision.forkId);

    std::vector<MerkleTreeId> tree_ids{
        MerkleTreeId::NULLIFIER_TREE,        MerkleTreeId::NOTE_HASH_TREE, MerkleTreeId::PUBLIC_DATA_TREE,
        MerkleTreeId::L1_TO_L2_MESSAGE_TREE, MerkleTreeId::ARCHIVE,
    };

    Signal signal(static_cast<uint32_t>(tree_ids.size()));
    std::mutex mutex;

    for (auto id : tree_ids) {
        const auto& tree = fork->_trees.at(id);
        auto callback = [&signal, &responses, &mutex, id](const TypedResponse<TreeMetaResponse>& meta) {
            {
                std::lock_guard<std::mutex> lock(mutex);
                responses[id] = meta.inner.meta;
            }
            signal.signal_decrement();
        };
        std::visit(
            [&callback, &revision](auto&& wrapper) {
                if (revision.blockNumber) {
                    wrapper.tree->get_meta_data(revision.blockNumber, revision.includeUncommitted, callback);
                } else {
                    wrapper.tree->get_meta_data(revision.includeUncommitted, callback);
                }
            },
            tree);
    }

    signal.wait_for_level(0);
}

StateReference WorldState::get_state_reference(const WorldStateRevision& revision) const
{
    return get_state_reference(revision, retrieve_fork(revision.forkId));
}

StateReference WorldState::get_initial_state_reference() const
{
    return get_state_reference(WorldStateRevision{ .forkId = CANONICAL_FORK_ID, .includeUncommitted = false },
                               retrieve_fork(CANONICAL_FORK_ID),
                               true);
}

StateReference WorldState::get_state_reference(const WorldStateRevision& revision,
                                               Fork::SharedPtr fork,
                                               bool initial_state)
{
    if (fork->_forkId != revision.forkId) {
        throw std::runtime_error("Fork does not match revision");
    }

    std::vector<MerkleTreeId> tree_ids{
        MerkleTreeId::NULLIFIER_TREE,
        MerkleTreeId::NOTE_HASH_TREE,
        MerkleTreeId::PUBLIC_DATA_TREE,
        MerkleTreeId::L1_TO_L2_MESSAGE_TREE,
    };

    Signal signal(static_cast<uint32_t>(tree_ids.size()));
    StateReference state_reference;
    std::mutex state_ref_mutex;

    for (auto id : tree_ids) {
        const auto& tree = fork->_trees.at(id);
        auto callback = [&signal, &state_reference, &state_ref_mutex, initial_state, id](
                            const TypedResponse<TreeMetaResponse>& meta) {
            {
                std::lock_guard<std::mutex> lock(state_ref_mutex);
                if (initial_state) {
                    state_reference.insert({ id, { meta.inner.meta.initialRoot, meta.inner.meta.initialSize } });
                } else {
                    state_reference.insert({ id, { meta.inner.meta.root, meta.inner.meta.size } });
                }
            }
            signal.signal_decrement();
        };
        std::visit(
            [&callback, &revision](auto&& wrapper) {
                if (revision.blockNumber) {
                    wrapper.tree->get_meta_data(revision.blockNumber, revision.includeUncommitted, callback);
                } else {
                    wrapper.tree->get_meta_data(revision.includeUncommitted, callback);
                }
            },
            tree);
    }

    signal.wait_for_level(0);
    return state_reference;
}

fr_sibling_path WorldState::get_sibling_path(const WorldStateRevision& revision,
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
        wrapper->tree->add_or_update_value(
            new_value,
            [&signal](const TypedResponse<AddIndexedDataResponse<PublicDataLeafValue>>&) { signal.signal_level(0); });
        signal.wait_for_level();
    } else {
        throw std::runtime_error("Invalid tree type for PublicDataTree");
    }
}

void WorldState::update_archive(const StateReference& block_state_ref,
                                const bb::fr& block_header_hash,
                                Fork::Id fork_id)
{
    if (is_same_state_reference(WorldStateRevision{ .forkId = fork_id, .includeUncommitted = true }, block_state_ref)) {
        append_leaves<fr>(MerkleTreeId::ARCHIVE, { block_header_hash }, fork_id);
    } else {
        throw std::runtime_error("Can't update archive tree: Block state does not match world state");
    }
}

std::pair<bool, std::string> WorldState::commit(WorldStateStatusFull& status)
{
    // NOTE: the calling code is expected to ensure no other reads or writes happen during commit
    Fork::SharedPtr fork = retrieve_fork(CANONICAL_FORK_ID);
    std::atomic_bool success = true;
    std::string message;
    Signal signal(static_cast<uint32_t>(fork->_trees.size()));

    {
        auto& wrapper = std::get<TreeWithStore<NullifierTree>>(fork->_trees.at(MerkleTreeId::NULLIFIER_TREE));
        commit_tree(
            status.dbStats.nullifierTreeStats, signal, *wrapper.tree, success, message, status.meta.nullifierTreeMeta);
    }
    {
        auto& wrapper = std::get<TreeWithStore<PublicDataTree>>(fork->_trees.at(MerkleTreeId::PUBLIC_DATA_TREE));
        commit_tree(status.dbStats.publicDataTreeStats,
                    signal,
                    *wrapper.tree,
                    success,
                    message,
                    status.meta.publicDataTreeMeta);
    }

    {
        auto& wrapper = std::get<TreeWithStore<FrTree>>(fork->_trees.at(MerkleTreeId::NOTE_HASH_TREE));
        commit_tree(
            status.dbStats.noteHashTreeStats, signal, *wrapper.tree, success, message, status.meta.noteHashTreeMeta);
    }

    {
        auto& wrapper = std::get<TreeWithStore<FrTree>>(fork->_trees.at(MerkleTreeId::L1_TO_L2_MESSAGE_TREE));
        commit_tree(
            status.dbStats.messageTreeStats, signal, *wrapper.tree, success, message, status.meta.messageTreeMeta);
    }

    {
        auto& wrapper = std::get<TreeWithStore<FrTree>>(fork->_trees.at(MerkleTreeId::ARCHIVE));
        commit_tree(
            status.dbStats.archiveTreeStats, signal, *wrapper.tree, success, message, status.meta.archiveTreeMeta);
    }

    signal.wait_for_level(0);
    return std::make_pair(success.load(), message);
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

WorldStateStatusFull WorldState::sync_block(const StateReference& block_state_ref,
                                            const bb::fr& block_header_hash,
                                            const std::vector<bb::fr>& notes,
                                            const std::vector<bb::fr>& l1_to_l2_messages,
                                            const std::vector<crypto::merkle_tree::NullifierLeafValue>& nullifiers,
                                            const std::vector<crypto::merkle_tree::PublicDataLeafValue>& public_writes)
{
    validate_trees_are_equally_synched();
    WorldStateStatusFull status;
    if (is_same_state_reference(WorldStateRevision::uncommitted(), block_state_ref) &&
        is_archive_tip(WorldStateRevision::uncommitted(), block_header_hash)) {
        std::pair<bool, std::string> result = commit(status);
        if (!result.first) {
            throw std::runtime_error(result.second);
        }
        populate_status_summary(status);
        return status;
    }
    rollback();

    Fork::SharedPtr fork = retrieve_fork(CANONICAL_FORK_ID);
    Signal signal(static_cast<uint32_t>(fork->_trees.size()));
    std::atomic_bool success = true;
    std::string err_message;
    auto decr = [&signal, &success, &err_message](const auto& resp) {
        // take the first error
        bool expected = true;
        if (!resp.success && success.compare_exchange_strong(expected, false)) {
            err_message = resp.message;
        }

        signal.signal_decrement();
    };

    {
        auto& wrapper = std::get<TreeWithStore<NullifierTree>>(fork->_trees.at(MerkleTreeId::NULLIFIER_TREE));
        NullifierTree::AddCompletionCallback completion = [&](const auto& resp) -> void {
            // take the first error
            bool expected = true;
            if (!resp.success && success.compare_exchange_strong(expected, false)) {
                err_message = resp.message;
            }

            signal.signal_decrement();
        };
        wrapper.tree->add_or_update_values(nullifiers, 0, completion);
    }

    {
        auto& wrapper = std::get<TreeWithStore<FrTree>>(fork->_trees.at(MerkleTreeId::NOTE_HASH_TREE));
        wrapper.tree->add_values(notes, decr);
    }

    {
        auto& wrapper = std::get<TreeWithStore<FrTree>>(fork->_trees.at(MerkleTreeId::L1_TO_L2_MESSAGE_TREE));
        wrapper.tree->add_values(l1_to_l2_messages, decr);
    }

    {
        auto& wrapper = std::get<TreeWithStore<FrTree>>(fork->_trees.at(MerkleTreeId::ARCHIVE));
        wrapper.tree->add_value(block_header_hash, decr);
    }

    {
        auto& wrapper = std::get<TreeWithStore<PublicDataTree>>(fork->_trees.at(MerkleTreeId::PUBLIC_DATA_TREE));
        PublicDataTree::AddCompletionCallback completion = [&](const auto&) -> void { signal.signal_decrement(); };
        wrapper.tree->add_or_update_values_sequentially(public_writes, completion);
    }

    signal.wait_for_level();

    if (!success) {
        throw std::runtime_error("Failed to sync block: " + err_message);
    }

    if (!is_archive_tip(WorldStateRevision::uncommitted(), block_header_hash)) {
        throw std::runtime_error("Can't synch block: block header hash is not the tip of the archive tree");
    }

    if (!is_same_state_reference(WorldStateRevision::uncommitted(), block_state_ref)) {
        throw std::runtime_error("Can't synch block: block state does not match world state");
    }

    std::pair<bool, std::string> result = commit(status);
    if (!result.first) {
        throw std::runtime_error(result.second);
    }
    populate_status_summary(status);
    return status;
}

GetLowIndexedLeafResponse WorldState::find_low_leaf_index(const WorldStateRevision& revision,
                                                          MerkleTreeId tree_id,
                                                          const bb::fr& leaf_key) const
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
            wrapper->tree->find_low_leaf(leaf_key, revision.blockNumber, revision.includeUncommitted, callback);
        } else {
            wrapper->tree->find_low_leaf(leaf_key, revision.includeUncommitted, callback);
        }

    } else if (const auto* wrapper = std::get_if<TreeWithStore<PublicDataTree>>(&fork->_trees.at(tree_id))) {
        if (revision.blockNumber != 0U) {
            wrapper->tree->find_low_leaf(leaf_key, revision.blockNumber, revision.includeUncommitted, callback);
        } else {
            wrapper->tree->find_low_leaf(leaf_key, revision.includeUncommitted, callback);
        }

    } else {
        throw std::runtime_error("Invalid tree type for find_low_leaf");
    }

    signal.wait_for_level();
    return low_leaf_info;
}

WorldStateStatusSummary WorldState::set_finalised_blocks(const index_t& toBlockNumber)
{
    WorldStateRevision revision{ .forkId = CANONICAL_FORK_ID, .blockNumber = 0, .includeUncommitted = false };
    TreeMetaResponse archive_state = get_tree_info(revision, MerkleTreeId::ARCHIVE);
    if (toBlockNumber <= archive_state.meta.finalisedBlockHeight) {
        throw std::runtime_error("Unable to finalise block, already finalised");
    }
    if (!set_finalised_block(toBlockNumber)) {
        throw std::runtime_error("Failed to set finalised block");
    }
    WorldStateStatusSummary status;
    get_status_summary(status);
    return status;
}
WorldStateStatusFull WorldState::unwind_blocks(const index_t& toBlockNumber)
{
    WorldStateRevision revision{ .forkId = CANONICAL_FORK_ID, .blockNumber = 0, .includeUncommitted = false };
    TreeMetaResponse archive_state = get_tree_info(revision, MerkleTreeId::ARCHIVE);
    if (toBlockNumber >= archive_state.meta.unfinalisedBlockHeight) {
        throw std::runtime_error("Unable to unwind block, block not found");
    }
    WorldStateStatusFull status;
    for (index_t blockNumber = archive_state.meta.unfinalisedBlockHeight; blockNumber > toBlockNumber; blockNumber--) {
        if (!unwind_block(blockNumber, status)) {
            throw std::runtime_error("Failed to unwind block");
        }
    }
    populate_status_summary(status);
    return status;
}
WorldStateStatusFull WorldState::remove_historical_blocks(const index_t& toBlockNumber)
{
    WorldStateRevision revision{ .forkId = CANONICAL_FORK_ID, .blockNumber = 0, .includeUncommitted = false };
    TreeMetaResponse archive_state = get_tree_info(revision, MerkleTreeId::ARCHIVE);
    if (toBlockNumber <= archive_state.meta.oldestHistoricBlock) {
        throw std::runtime_error(format("Unable to remove historical blocks to block number ",
                                        toBlockNumber,
                                        ", blocks not found. Current oldest block: ",
                                        archive_state.meta.oldestHistoricBlock));
    }
    WorldStateStatusFull status;
    for (index_t blockNumber = archive_state.meta.oldestHistoricBlock; blockNumber < toBlockNumber; blockNumber++) {
        if (!remove_historical_block(blockNumber, status)) {
            throw std::runtime_error(format(
                "Failed to remove historical block ", blockNumber, " when removing blocks up to ", toBlockNumber));
        }
    }
    populate_status_summary(status);
    return status;
}

bool WorldState::set_finalised_block(const index_t& blockNumber)
{
    std::atomic_bool success = true;
    Fork::SharedPtr fork = retrieve_fork(CANONICAL_FORK_ID);
    Signal signal(static_cast<uint32_t>(fork->_trees.size()));
    for (auto& [id, tree] : fork->_trees) {
        std::visit(
            [&signal, &success, blockNumber](auto&& wrapper) {
                wrapper.tree->finalise_block(blockNumber, [&signal, &success](const Response& resp) {
                    success = success && resp.success;
                    signal.signal_decrement();
                });
            },
            tree);
    }
    signal.wait_for_level();
    return success;
}
bool WorldState::unwind_block(const index_t& blockNumber, WorldStateStatusFull& status)
{
    std::atomic_bool success = true;
    std::string message;
    Fork::SharedPtr fork = retrieve_fork(CANONICAL_FORK_ID);
    Signal signal(static_cast<uint32_t>(fork->_trees.size()));
    {
        auto& wrapper = std::get<TreeWithStore<NullifierTree>>(fork->_trees.at(MerkleTreeId::NULLIFIER_TREE));
        unwind_tree(status.dbStats.nullifierTreeStats,
                    signal,
                    *wrapper.tree,
                    success,
                    message,
                    status.meta.nullifierTreeMeta,
                    blockNumber);
    }
    {
        auto& wrapper = std::get<TreeWithStore<PublicDataTree>>(fork->_trees.at(MerkleTreeId::PUBLIC_DATA_TREE));
        unwind_tree(status.dbStats.publicDataTreeStats,
                    signal,
                    *wrapper.tree,
                    success,
                    message,
                    status.meta.publicDataTreeMeta,
                    blockNumber);
    }

    {
        auto& wrapper = std::get<TreeWithStore<FrTree>>(fork->_trees.at(MerkleTreeId::NOTE_HASH_TREE));
        unwind_tree(status.dbStats.noteHashTreeStats,
                    signal,
                    *wrapper.tree,
                    success,
                    message,
                    status.meta.noteHashTreeMeta,
                    blockNumber);
    }

    {
        auto& wrapper = std::get<TreeWithStore<FrTree>>(fork->_trees.at(MerkleTreeId::L1_TO_L2_MESSAGE_TREE));
        unwind_tree(status.dbStats.messageTreeStats,
                    signal,
                    *wrapper.tree,
                    success,
                    message,
                    status.meta.messageTreeMeta,
                    blockNumber);
    }

    {
        auto& wrapper = std::get<TreeWithStore<FrTree>>(fork->_trees.at(MerkleTreeId::ARCHIVE));
        unwind_tree(status.dbStats.archiveTreeStats,
                    signal,
                    *wrapper.tree,
                    success,
                    message,
                    status.meta.archiveTreeMeta,
                    blockNumber);
    }
    signal.wait_for_level();
    remove_forks_for_block(blockNumber);
    return success;
}
bool WorldState::remove_historical_block(const index_t& blockNumber, WorldStateStatusFull& status)
{
    std::atomic_bool success = true;
    std::string message;
    Fork::SharedPtr fork = retrieve_fork(CANONICAL_FORK_ID);
    Signal signal(static_cast<uint32_t>(fork->_trees.size()));
    {
        auto& wrapper = std::get<TreeWithStore<NullifierTree>>(fork->_trees.at(MerkleTreeId::NULLIFIER_TREE));
        remove_historic_block_for_tree(status.dbStats.nullifierTreeStats,
                                       signal,
                                       *wrapper.tree,
                                       success,
                                       message,
                                       status.meta.nullifierTreeMeta,
                                       blockNumber);
    }
    {
        auto& wrapper = std::get<TreeWithStore<PublicDataTree>>(fork->_trees.at(MerkleTreeId::PUBLIC_DATA_TREE));
        remove_historic_block_for_tree(status.dbStats.publicDataTreeStats,
                                       signal,
                                       *wrapper.tree,
                                       success,
                                       message,
                                       status.meta.publicDataTreeMeta,
                                       blockNumber);
    }

    {
        auto& wrapper = std::get<TreeWithStore<FrTree>>(fork->_trees.at(MerkleTreeId::NOTE_HASH_TREE));
        remove_historic_block_for_tree(status.dbStats.noteHashTreeStats,
                                       signal,
                                       *wrapper.tree,
                                       success,
                                       message,
                                       status.meta.noteHashTreeMeta,
                                       blockNumber);
    }

    {
        auto& wrapper = std::get<TreeWithStore<FrTree>>(fork->_trees.at(MerkleTreeId::L1_TO_L2_MESSAGE_TREE));
        remove_historic_block_for_tree(status.dbStats.messageTreeStats,
                                       signal,
                                       *wrapper.tree,
                                       success,
                                       message,
                                       status.meta.messageTreeMeta,
                                       blockNumber);
    }

    {
        auto& wrapper = std::get<TreeWithStore<FrTree>>(fork->_trees.at(MerkleTreeId::ARCHIVE));
        remove_historic_block_for_tree(status.dbStats.archiveTreeStats,
                                       signal,
                                       *wrapper.tree,
                                       success,
                                       message,
                                       status.meta.archiveTreeMeta,
                                       blockNumber);
    }
    signal.wait_for_level();
    remove_forks_for_block(blockNumber);
    return success;
}

bb::fr WorldState::compute_initial_archive(const StateReference& initial_state_ref, uint32_t generator_point)
{
    // NOTE: this hash operations needs to match the one in yarn-project/circuits.js/src/structs/header.ts
    return HashPolicy::hash({ generator_point,
                              // last archive - which, at genesis, is all 0s
                              0,
                              0,
                              // content commitment - all 0s
                              0,
                              0,
                              0,
                              0,
                              // state reference - the initial state for all the trees (accept the archive tree)
                              initial_state_ref.at(MerkleTreeId::L1_TO_L2_MESSAGE_TREE).first,
                              initial_state_ref.at(MerkleTreeId::L1_TO_L2_MESSAGE_TREE).second,
                              initial_state_ref.at(MerkleTreeId::NOTE_HASH_TREE).first,
                              initial_state_ref.at(MerkleTreeId::NOTE_HASH_TREE).second,
                              initial_state_ref.at(MerkleTreeId::NULLIFIER_TREE).first,
                              initial_state_ref.at(MerkleTreeId::NULLIFIER_TREE).second,
                              initial_state_ref.at(MerkleTreeId::PUBLIC_DATA_TREE).first,
                              initial_state_ref.at(MerkleTreeId::PUBLIC_DATA_TREE).second,
                              // global variables
                              0,
                              0,
                              0,
                              0,
                              0,
                              0,
                              0,
                              0,
                              0,
                              // total fees
                              0,
                              // total mana used
                              0 });
}

bool WorldState::is_archive_tip(const WorldStateRevision& revision, const bb::fr& block_header_hash) const
{
    std::optional<index_t> leaf_index = find_leaf_index(revision, MerkleTreeId::ARCHIVE, block_header_hash);

    if (!leaf_index.has_value()) {
        return false;
    }

    TreeMetaResponse archive_state = get_tree_info(revision, MerkleTreeId::ARCHIVE);
    return archive_state.meta.size == leaf_index.value() + 1;
}

void WorldState::get_status_summary(WorldStateStatusSummary& status) const
{
    WorldStateRevision revision{ .forkId = CANONICAL_FORK_ID, .blockNumber = 0, .includeUncommitted = false };
    std::array<TreeMeta, NUM_TREES> responses;
    get_all_tree_info(revision, responses);
    get_status_summary_from_meta_responses(status, responses);
}

void WorldState::get_status_summary_from_meta_responses(WorldStateStatusSummary& status,
                                                        std::array<TreeMeta, NUM_TREES>& metaResponses)
{
    TreeMeta& archive_state = metaResponses[MerkleTreeId::ARCHIVE];
    status.unfinalisedBlockNumber = archive_state.unfinalisedBlockHeight;
    status.finalisedBlockNumber = archive_state.finalisedBlockHeight;
    status.oldestHistoricalBlock = archive_state.oldestHistoricBlock;
    status.treesAreSynched = determine_if_synched(metaResponses);
}

void WorldState::populate_status_summary(WorldStateStatusFull& status)
{
    status.summary.finalisedBlockNumber = status.meta.archiveTreeMeta.finalisedBlockHeight;
    status.summary.unfinalisedBlockNumber = status.meta.archiveTreeMeta.unfinalisedBlockHeight;
    status.summary.oldestHistoricalBlock = status.meta.archiveTreeMeta.oldestHistoricBlock;
    status.summary.treesAreSynched =
        status.meta.messageTreeMeta.unfinalisedBlockHeight == status.summary.unfinalisedBlockNumber &&
        status.meta.noteHashTreeMeta.unfinalisedBlockHeight == status.summary.unfinalisedBlockNumber &&
        status.meta.nullifierTreeMeta.unfinalisedBlockHeight == status.summary.unfinalisedBlockNumber &&
        status.meta.publicDataTreeMeta.unfinalisedBlockHeight == status.summary.unfinalisedBlockNumber;
}

bool WorldState::is_same_state_reference(const WorldStateRevision& revision, const StateReference& state_ref) const
{
    return state_ref == get_state_reference(revision);
}

void WorldState::validate_trees_are_equally_synched()
{
    WorldStateRevision revision{ .forkId = CANONICAL_FORK_ID, .blockNumber = 0, .includeUncommitted = false };
    std::array<TreeMeta, NUM_TREES> responses;
    get_all_tree_info(revision, responses);

    if (!determine_if_synched(responses)) {
        throw std::runtime_error("World state trees are out of sync");
    }
}

bool WorldState::determine_if_synched(std::array<TreeMeta, NUM_TREES>& metaResponses)
{
    index_t blockNumber = metaResponses[0].unfinalisedBlockHeight;
    for (size_t i = 1; i < metaResponses.size(); i++) {
        if (blockNumber != metaResponses[i].unfinalisedBlockHeight) {
            return false;
        }
    }
    return true;
}

} // namespace bb::world_state
