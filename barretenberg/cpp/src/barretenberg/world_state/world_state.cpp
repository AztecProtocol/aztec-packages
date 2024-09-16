#include "barretenberg/world_state/world_state.hpp"
#include "barretenberg/crypto/merkle_tree/append_only_tree/append_only_tree.hpp"
#include "barretenberg/crypto/merkle_tree/fixtures.hpp"
#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/callbacks.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/merkle_tree/signal.hpp"
#include "barretenberg/world_state/tree_with_store.hpp"
#include "barretenberg/world_state/types.hpp"
#include <memory>
#include <mutex>
#include <stdexcept>
#include <tuple>
#include <unordered_map>
#include <utility>
#include <variant>

namespace bb::world_state {

const uint WORLD_STATE_MAX_DB_COUNT = 16;

using namespace bb::crypto::merkle_tree;

WorldState::WorldState(uint threads, const std::string& data_dir, uint map_size_kb)
    : _workers(threads)
{
    _lmdb_env = std::make_unique<LMDBEnvironment>(data_dir, map_size_kb, WORLD_STATE_MAX_DB_COUNT, threads);

    {
        const auto* name = "nullifier_tree";
        auto lmdb_store = std::make_unique<LMDBStore>(*_lmdb_env, name, false, false, integer_key_cmp);
        auto store = std::make_unique<NullifierStore>(name, NULLIFIER_TREE_HEIGHT, *lmdb_store);
        auto tree = std::make_unique<NullifierTree>(*store, _workers, 128);
        _trees.insert(
            { MerkleTreeId::NULLIFIER_TREE, TreeWithStore(std::move(tree), std::move(store), std::move(lmdb_store)) });
    }

    {
        const auto* name = "note_hash_tree";
        auto lmdb_store = std::make_unique<LMDBStore>(*_lmdb_env, name, false, false, integer_key_cmp);
        auto store = std::make_unique<FrStore>(name, NOTE_HASH_TREE_HEIGHT, *lmdb_store);
        auto tree = std::make_unique<FrTree>(*store, this->_workers);
        _trees.insert(
            { MerkleTreeId::NOTE_HASH_TREE, TreeWithStore(std::move(tree), std::move(store), std::move(lmdb_store)) });
    }

    {
        const auto* name = "public_data_tree";
        auto lmdb_store = std::make_unique<LMDBStore>(*_lmdb_env, name, false, false, integer_key_cmp);
        auto store = std::make_unique<PublicDataStore>(name, PUBLIC_DATA_TREE_HEIGHT, *lmdb_store);
        auto tree = std::make_unique<PublicDataTree>(*store, this->_workers, 128);
        _trees.insert({ MerkleTreeId::PUBLIC_DATA_TREE,
                        TreeWithStore(std::move(tree), std::move(store), std::move(lmdb_store)) });
    }

    {
        const auto* name = "message_tree";
        auto lmdb_store = std::make_unique<LMDBStore>(*_lmdb_env, name, false, false, integer_key_cmp);
        auto store = std::make_unique<FrStore>(name, L1_TO_L2_MSG_TREE_HEIGHT, *lmdb_store);
        auto tree = std::make_unique<FrTree>(*store, this->_workers);
        _trees.insert({ MerkleTreeId::L1_TO_L2_MESSAGE_TREE,
                        TreeWithStore(std::move(tree), std::move(store), std::move(lmdb_store)) });
    }

    {
        const auto* name = "archive_tree";
        auto lmdb_store = std::make_unique<LMDBStore>(*_lmdb_env, name, false, false, integer_key_cmp);
        auto store = std::make_unique<FrStore>(name, ARCHIVE_TREE_HEIGHT, *lmdb_store);
        auto tree = std::make_unique<FrTree>(*store, this->_workers);
        _trees.insert(
            { MerkleTreeId::ARCHIVE, TreeWithStore(std::move(tree), std::move(store), std::move(lmdb_store)) });
    }
}

TreeMetaResponse WorldState::get_tree_info(WorldStateRevision revision, MerkleTreeId tree_id) const
{
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
        _trees.at(tree_id));
}

StateReference WorldState::get_state_reference(WorldStateRevision revision) const
{
    Signal signal(static_cast<uint32_t>(_trees.size()));
    StateReference state_reference;
    // multiple threads want to write to state_reference
    std::mutex state_ref_mutex;

    bool uncommitted = include_uncommitted(revision);

    for (const auto& [id, tree] : _trees) {
        auto callback = [&signal, &state_reference, &state_ref_mutex, id](const TypedResponse<TreeMetaResponse>& meta) {
            std::lock_guard<std::mutex> lock(state_ref_mutex);
            state_reference.insert({ id, { meta.inner.root, meta.inner.size } });
            signal.signal_decrement();
        };
        std::visit([&callback, uncommitted](auto&& wrapper) { wrapper.tree->get_meta_data(uncommitted, callback); },
                   tree);
    }

    signal.wait_for_level(0);
    return state_reference;
}

fr_sibling_path WorldState::get_sibling_path(WorldStateRevision revision,
                                             MerkleTreeId tree_id,
                                             index_t leaf_index) const
{
    bool uncommited = include_uncommitted(revision);
    return std::visit(
        [leaf_index, uncommited](auto&& wrapper) {
            Signal signal(1);
            fr_sibling_path path;

            auto callback = [&signal, &path](const TypedResponse<GetSiblingPathResponse>& response) {
                path = response.inner.path;
                signal.signal_level(0);
            };

            wrapper.tree->get_sibling_path(leaf_index, callback, uncommited);
            signal.wait_for_level(0);

            return path;
        },
        _trees.at(tree_id));
}

void WorldState::update_public_data(const PublicDataLeafValue& new_value)
{
    if (const auto* wrapper = std::get_if<TreeWithStore<PublicDataTree>>(&_trees.at(MerkleTreeId::PUBLIC_DATA_TREE))) {
        Signal signal;
        wrapper->tree->add_or_update_value(new_value, [&signal](const auto&) { signal.signal_level(0); });
        signal.wait_for_level();
    } else {
        throw std::runtime_error("Invalid tree type for PublicDataTree");
    }
}

void WorldState::commit()
{
    // TODO (alexg) should this lock _all_ the trees until they are all committed?
    // otherwise another request could come in to modify one of the trees
    // or reads would give inconsistent results
    Signal signal(static_cast<uint32_t>(_trees.size()));
    for (auto& [id, tree] : _trees) {
        std::visit(
            [&signal](auto&& wrapper) { wrapper.tree->commit([&](const Response&) { signal.signal_decrement(); }); },
            tree);
    }

    signal.wait_for_level(0);
}

void WorldState::rollback()
{
    // TODO (alexg) should this lock _all_ the trees until they are all committed?
    // otherwise another request could come in to modify one of the trees
    // or reads would give inconsistent results
    Signal signal(static_cast<uint32_t>(_trees.size()));
    for (auto& [id, tree] : _trees) {
        std::visit(
            [&signal](auto&& wrapper) {
                wrapper.tree->rollback([&signal](const Response&) { signal.signal_decrement(); });
            },
            tree);
    }
    signal.wait_for_level();
}

bool WorldState::sync_block(StateReference& block_state_ref,
                            fr block_hash,
                            const std::vector<bb::fr>& notes,
                            const std::vector<bb::fr>& l1_to_l2_messages,
                            const std::vector<crypto::merkle_tree::NullifierLeafValue>& nullifiers,
                            const std::vector<std::vector<crypto::merkle_tree::PublicDataLeafValue>>& public_writes)
{
    auto current_state = get_state_reference(WorldStateRevision::uncommitted());
    if (block_state_matches_world_state(block_state_ref, current_state)) {
        append_leaves<fr>(MerkleTreeId::ARCHIVE, { block_hash });
        commit();
        return true;
    }

    rollback();

    // the public data tree gets updated once per batch and every other gets one update
    Signal signal(static_cast<uint32_t>(_trees.size()));
    auto decr = [&signal](const auto&) { signal.signal_decrement(); };

    {
        auto& wrapper = std::get<TreeWithStore<NullifierTree>>(_trees.at(MerkleTreeId::NULLIFIER_TREE));
        wrapper.tree->add_or_update_values(nullifiers, 0, decr);
    }

    {
        auto& wrapper = std::get<TreeWithStore<FrTree>>(_trees.at(MerkleTreeId::NOTE_HASH_TREE));
        wrapper.tree->add_values(notes, decr);
    }

    {
        auto& wrapper = std::get<TreeWithStore<FrTree>>(_trees.at(MerkleTreeId::L1_TO_L2_MESSAGE_TREE));
        wrapper.tree->add_values(l1_to_l2_messages, decr);
    }

    {
        auto& wrapper = std::get<TreeWithStore<FrTree>>(_trees.at(MerkleTreeId::ARCHIVE));
        wrapper.tree->add_value(block_hash, decr);
    }

    {
        auto& wrapper = std::get<TreeWithStore<PublicDataTree>>(_trees.at(MerkleTreeId::PUBLIC_DATA_TREE));
        for (const auto& batch : public_writes) {
            Signal batch_signal(1);
            // TODO (alexg) should trees serialize writes internally or should we do it here?
            wrapper.tree->add_or_update_values(
                batch, 0, [&batch_signal](const auto&) { batch_signal.signal_level(0); });
            batch_signal.wait_for_level(0);
        }

        signal.signal_decrement();
    }

    signal.wait_for_level();

    current_state = get_state_reference(WorldStateRevision::uncommitted());
    if (block_state_matches_world_state(block_state_ref, current_state)) {
        commit();
        return false;
    }

    // TODO (alexg) should we rollback here?
    // Potentiall not since all the changes exist only in-memory and this error will cause the process to die
    throw std::runtime_error("Block state does not match world state");
}

std::pair<bool, index_t> WorldState::find_low_leaf_index(const WorldStateRevision revision,
                                                         MerkleTreeId tree_id,
                                                         fr leaf_key) const
{
    Signal signal;
    std::pair<bool, index_t> low_leaf_info;
    auto callback = [&signal, &low_leaf_info](const TypedResponse<std::pair<bool, index_t>>& response) {
        low_leaf_info = response.inner;
        signal.signal_level();
    };

    if (const auto* wrapper = std::get_if<TreeWithStore<NullifierTree>>(&_trees.at(tree_id))) {
        wrapper->tree->find_low_leaf(leaf_key, include_uncommitted(revision), callback);
    } else if (const auto* wrapper = std::get_if<TreeWithStore<PublicDataTree>>(&_trees.at(tree_id))) {
        wrapper->tree->find_low_leaf(leaf_key, include_uncommitted(revision), callback);
    } else {
        throw std::runtime_error("Invalid tree type for find_low_leaf");
    }

    signal.wait_for_level();
    return low_leaf_info;
}

bool WorldState::include_uncommitted(WorldStateRevision rev)
{
    return std::get<WorldStateRevision::CurrentState>(rev.inner).uncommitted;
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
        tree_ids.begin(), tree_ids.end(), [&](auto id) { return block_state_ref.at(id) == tree_state_ref.at(id); });
}

} // namespace bb::world_state
