#include "barretenberg/nodejs_module/world_state/world_state.hpp"
#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/messaging/header.hpp"
#include "barretenberg/nodejs_module/async_op.hpp"
#include "barretenberg/nodejs_module/world_state/world_state_message.hpp"
#include "barretenberg/world_state/fork.hpp"
#include "barretenberg/world_state/types.hpp"
#include "barretenberg/world_state/world_state.hpp"
#include "msgpack/v3/pack_decl.hpp"
#include "msgpack/v3/sbuffer_decl.hpp"
#include "napi.h"
#include <algorithm>
#include <any>
#include <array>
#include <cstdint>
#include <iostream>
#include <memory>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <sys/types.h>
#include <unordered_map>

using namespace bb::nodejs;
using namespace bb::world_state;
using namespace bb::crypto::merkle_tree;
using namespace bb::messaging;

const uint64_t DEFAULT_MAP_SIZE = 1024UL * 1024;

WorldStateWrapper::WorldStateWrapper(const Napi::CallbackInfo& info)
    : ObjectWrap(info)
{
    uint64_t thread_pool_size = 16;
    std::string data_dir;
    std::unordered_map<MerkleTreeId, uint64_t> map_size{
        { MerkleTreeId::ARCHIVE, DEFAULT_MAP_SIZE },
        { MerkleTreeId::NULLIFIER_TREE, DEFAULT_MAP_SIZE },
        { MerkleTreeId::NOTE_HASH_TREE, DEFAULT_MAP_SIZE },
        { MerkleTreeId::PUBLIC_DATA_TREE, DEFAULT_MAP_SIZE },
        { MerkleTreeId::L1_TO_L2_MESSAGE_TREE, DEFAULT_MAP_SIZE },
    };
    std::unordered_map<MerkleTreeId, uint32_t> tree_height;
    std::unordered_map<MerkleTreeId, index_t> tree_prefill;
    std::vector<MerkleTreeId> tree_ids{
        MerkleTreeId::NULLIFIER_TREE,        MerkleTreeId::NOTE_HASH_TREE, MerkleTreeId::PUBLIC_DATA_TREE,
        MerkleTreeId::L1_TO_L2_MESSAGE_TREE, MerkleTreeId::ARCHIVE,
    };
    uint32_t initial_header_generator_point = 0;

    Napi::Env env = info.Env();

    size_t data_dir_index = 0;
    if (info.Length() > data_dir_index && info[data_dir_index].IsString()) {
        data_dir = info[data_dir_index].As<Napi::String>();
    } else {
        throw Napi::TypeError::New(env, "Directory needs to be a string");
    }

    size_t tree_height_index = 1;
    if (info.Length() > tree_height_index && info[tree_height_index].IsObject()) {
        Napi::Object obj = info[tree_height_index].As<Napi::Object>();

        for (auto tree_id : tree_ids) {
            if (obj.Has(tree_id)) {
                tree_height[tree_id] = obj.Get(tree_id).As<Napi::Number>().Uint32Value();
            }
        }
    } else {
        throw Napi::TypeError::New(env, "Tree heights must be a map");
    }

    size_t tree_prefill_index = 2;
    if (info.Length() > tree_prefill_index && info[tree_prefill_index].IsObject()) {
        Napi::Object obj = info[tree_prefill_index].As<Napi::Object>();

        for (auto tree_id : tree_ids) {
            if (obj.Has(tree_id)) {
                tree_prefill[tree_id] = obj.Get(tree_id).As<Napi::Number>().Uint32Value();
            }
        }
    } else {
        throw Napi::TypeError::New(env, "Tree prefill must be a map");
    }

    size_t initial_header_generator_point_index = 3;
    if (info.Length() > initial_header_generator_point_index && info[initial_header_generator_point_index].IsNumber()) {
        initial_header_generator_point = info[initial_header_generator_point_index].As<Napi::Number>().Uint32Value();
    } else {
        throw Napi::TypeError::New(env, "Header generator point needs to be a number");
    }

    // optional parameters
    size_t map_size_index = 4;
    if (info.Length() > map_size_index) {
        if (info[4].IsObject()) {
            Napi::Object obj = info[map_size_index].As<Napi::Object>();

            for (auto tree_id : tree_ids) {
                if (obj.Has(tree_id)) {
                    map_size[tree_id] = obj.Get(tree_id).As<Napi::Number>().Uint32Value();
                }
            }
        } else if (info[map_size_index].IsNumber()) {
            uint64_t size = info[map_size_index].As<Napi::Number>().Uint32Value();
            for (auto tree_id : tree_ids) {
                map_size[tree_id] = size;
            }
        } else {
            throw Napi::TypeError::New(env, "Map size must be a number or an object");
        }
    }

    size_t thread_pool_size_index = 5;
    if (info.Length() > thread_pool_size_index) {
        if (!info[thread_pool_size_index].IsNumber()) {
            throw Napi::TypeError::New(env, "Thread pool size must be a number");
        }

        thread_pool_size = info[thread_pool_size_index].As<Napi::Number>().Uint32Value();
    }

    _ws = std::make_unique<WorldState>(
        thread_pool_size, data_dir, map_size, tree_height, tree_prefill, initial_header_generator_point);

    _dispatcher.registerTarget(
        WorldStateMessageType::GET_TREE_INFO,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return get_tree_info(obj, buffer); });

    _dispatcher.registerTarget(
        WorldStateMessageType::GET_STATE_REFERENCE,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return get_state_reference(obj, buffer); });

    _dispatcher.registerTarget(
        WorldStateMessageType::GET_INITIAL_STATE_REFERENCE,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return get_initial_state_reference(obj, buffer); });

    _dispatcher.registerTarget(
        WorldStateMessageType::GET_LEAF_VALUE,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return get_leaf_value(obj, buffer); });

    _dispatcher.registerTarget(
        WorldStateMessageType::GET_LEAF_PREIMAGE,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return get_leaf_preimage(obj, buffer); });

    _dispatcher.registerTarget(
        WorldStateMessageType::GET_SIBLING_PATH,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return get_sibling_path(obj, buffer); });

    _dispatcher.registerTarget(WorldStateMessageType::GET_BLOCK_NUMBERS_FOR_LEAF_INDICES,
                               [this](msgpack::object& obj, msgpack::sbuffer& buffer) {
                                   return get_block_numbers_for_leaf_indices(obj, buffer);
                               });

    _dispatcher.registerTarget(
        WorldStateMessageType::FIND_LEAF_INDICES,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return find_leaf_indices(obj, buffer); });

    _dispatcher.registerTarget(
        WorldStateMessageType::FIND_LOW_LEAF,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return find_low_leaf(obj, buffer); });

    _dispatcher.registerTarget(
        WorldStateMessageType::APPEND_LEAVES,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return append_leaves(obj, buffer); });

    _dispatcher.registerTarget(
        WorldStateMessageType::BATCH_INSERT,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return batch_insert(obj, buffer); });

    _dispatcher.registerTarget(
        WorldStateMessageType::SEQUENTIAL_INSERT,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return sequential_insert(obj, buffer); });

    _dispatcher.registerTarget(
        WorldStateMessageType::UPDATE_ARCHIVE,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return update_archive(obj, buffer); });

    _dispatcher.registerTarget(WorldStateMessageType::COMMIT,
                               [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return commit(obj, buffer); });

    _dispatcher.registerTarget(WorldStateMessageType::ROLLBACK, [this](msgpack::object& obj, msgpack::sbuffer& buffer) {
        return rollback(obj, buffer);
    });

    _dispatcher.registerTarget(
        WorldStateMessageType::SYNC_BLOCK,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return sync_block(obj, buffer); });

    _dispatcher.registerTarget(
        WorldStateMessageType::CREATE_FORK,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return create_fork(obj, buffer); });

    _dispatcher.registerTarget(
        WorldStateMessageType::DELETE_FORK,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return delete_fork(obj, buffer); });

    _dispatcher.registerTarget(
        WorldStateMessageType::FINALISE_BLOCKS,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return set_finalised(obj, buffer); });

    _dispatcher.registerTarget(WorldStateMessageType::UNWIND_BLOCKS,
                               [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return unwind(obj, buffer); });

    _dispatcher.registerTarget(
        WorldStateMessageType::REMOVE_HISTORICAL_BLOCKS,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return remove_historical(obj, buffer); });

    _dispatcher.registerTarget(
        WorldStateMessageType::GET_STATUS,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return get_status(obj, buffer); });

    _dispatcher.registerTarget(WorldStateMessageType::CLOSE,
                               [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return close(obj, buffer); });
}

Napi::Value WorldStateWrapper::call(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    // keep this in a shared pointer so that AsyncOperation can resolve/reject the promise once the execution is
    // complete on an separate thread
    auto deferred = std::make_shared<Napi::Promise::Deferred>(env);

    if (info.Length() < 1) {
        deferred->Reject(Napi::TypeError::New(env, "Wrong number of arguments").Value());
    } else if (!info[0].IsBuffer()) {
        deferred->Reject(Napi::TypeError::New(env, "Argument must be a buffer").Value());
    } else if (!_ws) {
        deferred->Reject(Napi::TypeError::New(env, "World state has been closed").Value());
    } else {
        auto buffer = info[0].As<Napi::Buffer<char>>();
        size_t length = buffer.Length();
        // we mustn't access the Napi::Env outside of this top-level function
        // so copy the data to a variable we own
        // and make it a shared pointer so that it doesn't get destroyed as soon as we exit this code block
        auto data = std::make_shared<std::vector<char>>(length);
        std::copy_n(buffer.Data(), length, data->data());

        auto* op = new AsyncOperation(env, deferred, [=, this](msgpack::sbuffer& buf) {
            msgpack::object_handle obj_handle = msgpack::unpack(data->data(), length);
            msgpack::object obj = obj_handle.get();
            _dispatcher.onNewData(obj, buf);
        });

        // Napi is now responsible for destroying this object
        op->Queue();
    }

    return deferred->Promise();
}

bool WorldStateWrapper::get_tree_info(msgpack::object& obj, msgpack::sbuffer& buffer) const
{
    TypedMessage<GetTreeInfoRequest> request;
    obj.convert(request);
    auto info = _ws->get_tree_info(request.value.revision, request.value.treeId);

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<GetTreeInfoResponse> resp_msg(
        WorldStateMessageType::GET_TREE_INFO,
        header,
        { request.value.treeId, info.meta.root, info.meta.size, info.meta.depth });

    msgpack::pack(buffer, resp_msg);

    return true;
}

bool WorldStateWrapper::get_state_reference(msgpack::object& obj, msgpack::sbuffer& buffer) const
{
    TypedMessage<GetStateReferenceRequest> request;
    obj.convert(request);
    auto state = _ws->get_state_reference(request.value.revision);

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<GetStateReferenceResponse> resp_msg(
        WorldStateMessageType::GET_STATE_REFERENCE, header, { state });

    msgpack::pack(buffer, resp_msg);

    return true;
}

bool WorldStateWrapper::get_initial_state_reference(msgpack::object& obj, msgpack::sbuffer& buffer) const
{
    HeaderOnlyMessage request;
    obj.convert(request);
    auto state = _ws->get_initial_state_reference();

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<GetInitialStateReferenceResponse> resp_msg(
        WorldStateMessageType::GET_INITIAL_STATE_REFERENCE, header, { state });

    msgpack::pack(buffer, resp_msg);

    return true;
}

bool WorldStateWrapper::get_leaf_value(msgpack::object& obj, msgpack::sbuffer& buffer) const
{
    TypedMessage<GetLeafValueRequest> request;
    obj.convert(request);

    switch (request.value.treeId) {
    case MerkleTreeId::NOTE_HASH_TREE:
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
    case MerkleTreeId::ARCHIVE: {
        auto leaf = _ws->get_leaf<bb::fr>(request.value.revision, request.value.treeId, request.value.leafIndex);

        MsgHeader header(request.header.messageId);
        messaging::TypedMessage<std::optional<bb::fr>> resp_msg(WorldStateMessageType::GET_LEAF_VALUE, header, leaf);
        msgpack::pack(buffer, resp_msg);
        break;
    }

    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto leaf = _ws->get_leaf<crypto::merkle_tree::PublicDataLeafValue>(
            request.value.revision, request.value.treeId, request.value.leafIndex);
        MsgHeader header(request.header.messageId);
        messaging::TypedMessage<std::optional<PublicDataLeafValue>> resp_msg(
            WorldStateMessageType::GET_LEAF_VALUE, header, leaf);
        msgpack::pack(buffer, resp_msg);
        break;
    }

    case MerkleTreeId::NULLIFIER_TREE: {
        auto leaf = _ws->get_leaf<crypto::merkle_tree::NullifierLeafValue>(
            request.value.revision, request.value.treeId, request.value.leafIndex);
        MsgHeader header(request.header.messageId);
        messaging::TypedMessage<std::optional<NullifierLeafValue>> resp_msg(
            WorldStateMessageType::GET_LEAF_VALUE, header, leaf);
        msgpack::pack(buffer, resp_msg);
        break;
    }

    default:
        throw std::runtime_error("Unsupported tree type");
    }

    return true;
}

bool WorldStateWrapper::get_leaf_preimage(msgpack::object& obj, msgpack::sbuffer& buffer) const
{
    TypedMessage<GetLeafPreimageRequest> request;
    obj.convert(request);

    MsgHeader header(request.header.messageId);

    switch (request.value.treeId) {
    case MerkleTreeId::NULLIFIER_TREE: {
        auto leaf = _ws->get_indexed_leaf<NullifierLeafValue>(
            request.value.revision, request.value.treeId, request.value.leafIndex);
        messaging::TypedMessage<std::optional<IndexedLeaf<NullifierLeafValue>>> resp_msg(
            WorldStateMessageType::GET_LEAF_PREIMAGE, header, leaf);
        msgpack::pack(buffer, resp_msg);
        break;
    }

    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto leaf = _ws->get_indexed_leaf<PublicDataLeafValue>(
            request.value.revision, request.value.treeId, request.value.leafIndex);

        messaging::TypedMessage<std::optional<IndexedLeaf<PublicDataLeafValue>>> resp_msg(
            WorldStateMessageType::GET_LEAF_PREIMAGE, header, leaf);
        msgpack::pack(buffer, resp_msg);
        break;
    }

    default:
        throw std::runtime_error("Unsupported tree type");
    }

    return true;
}

bool WorldStateWrapper::get_sibling_path(msgpack::object& obj, msgpack::sbuffer& buffer) const
{
    TypedMessage<GetSiblingPathRequest> request;
    obj.convert(request);

    fr_sibling_path path = _ws->get_sibling_path(request.value.revision, request.value.treeId, request.value.leafIndex);

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<fr_sibling_path> resp_msg(WorldStateMessageType::GET_SIBLING_PATH, header, path);

    msgpack::pack(buffer, resp_msg);

    return true;
}

bool WorldStateWrapper::get_block_numbers_for_leaf_indices(msgpack::object& obj, msgpack::sbuffer& buffer) const
{
    TypedMessage<GetBlockNumbersForLeafIndicesRequest> request;
    obj.convert(request);

    GetBlockNumbersForLeafIndicesResponse response;
    _ws->get_block_numbers_for_leaf_indices(
        request.value.revision, request.value.treeId, request.value.leafIndices, response.blockNumbers);

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<GetBlockNumbersForLeafIndicesResponse> resp_msg(
        WorldStateMessageType::GET_BLOCK_NUMBERS_FOR_LEAF_INDICES, header, response);

    msgpack::pack(buffer, resp_msg);

    return true;
}

bool WorldStateWrapper::find_leaf_indices(msgpack::object& obj, msgpack::sbuffer& buffer) const
{
    TypedMessage<TreeIdAndRevisionRequest> request;
    obj.convert(request);

    FindLeafIndicesResponse response;

    switch (request.value.treeId) {
    case MerkleTreeId::NOTE_HASH_TREE:
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
    case MerkleTreeId::ARCHIVE: {
        TypedMessage<FindLeafIndicesRequest<bb::fr>> r1;
        obj.convert(r1);
        _ws->find_leaf_indices<bb::fr>(
            request.value.revision, request.value.treeId, r1.value.leaves, response.indices, r1.value.startIndex);
        break;
    }

    case MerkleTreeId::PUBLIC_DATA_TREE: {
        TypedMessage<FindLeafIndicesRequest<crypto::merkle_tree::PublicDataLeafValue>> r2;
        obj.convert(r2);
        _ws->find_leaf_indices<PublicDataLeafValue>(
            request.value.revision, request.value.treeId, r2.value.leaves, response.indices, r2.value.startIndex);
        break;
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        TypedMessage<FindLeafIndicesRequest<crypto::merkle_tree::NullifierLeafValue>> r3;
        obj.convert(r3);
        _ws->find_leaf_indices<NullifierLeafValue>(
            request.value.revision, request.value.treeId, r3.value.leaves, response.indices, r3.value.startIndex);
        break;
    }
    }

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<FindLeafIndicesResponse> resp_msg(
        WorldStateMessageType::FIND_LEAF_INDICES, header, response);
    msgpack::pack(buffer, resp_msg);

    return true;
}

bool WorldStateWrapper::find_low_leaf(msgpack::object& obj, msgpack::sbuffer& buffer) const
{
    TypedMessage<FindLowLeafRequest> request;
    obj.convert(request);

    GetLowIndexedLeafResponse low_leaf_info =
        _ws->find_low_leaf_index(request.value.revision, request.value.treeId, request.value.key);

    MsgHeader header(request.header.messageId);
    TypedMessage<FindLowLeafResponse> response(
        WorldStateMessageType::FIND_LOW_LEAF, header, { low_leaf_info.is_already_present, low_leaf_info.index });
    msgpack::pack(buffer, response);

    return true;
}

bool WorldStateWrapper::append_leaves(msgpack::object& obj, msgpack::sbuffer& buf)
{
    TypedMessage<TreeIdOnlyRequest> request;
    obj.convert(request);

    switch (request.value.treeId) {
    case MerkleTreeId::NOTE_HASH_TREE:
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
    case MerkleTreeId::ARCHIVE: {
        TypedMessage<AppendLeavesRequest<bb::fr>> r1;
        obj.convert(r1);
        _ws->append_leaves<bb::fr>(r1.value.treeId, r1.value.leaves, r1.value.forkId);
        break;
    }
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        TypedMessage<AppendLeavesRequest<crypto::merkle_tree::PublicDataLeafValue>> r2;
        obj.convert(r2);
        _ws->append_leaves<crypto::merkle_tree::PublicDataLeafValue>(r2.value.treeId, r2.value.leaves, r2.value.forkId);
        break;
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        TypedMessage<AppendLeavesRequest<crypto::merkle_tree::NullifierLeafValue>> r3;
        obj.convert(r3);
        _ws->append_leaves<crypto::merkle_tree::NullifierLeafValue>(r3.value.treeId, r3.value.leaves, r3.value.forkId);
        break;
    }
    }

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<EmptyResponse> resp_msg(WorldStateMessageType::APPEND_LEAVES, header, {});
    msgpack::pack(buf, resp_msg);

    return true;
}

bool WorldStateWrapper::batch_insert(msgpack::object& obj, msgpack::sbuffer& buffer)
{
    TypedMessage<TreeIdOnlyRequest> request;
    obj.convert(request);

    switch (request.value.treeId) {
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        TypedMessage<BatchInsertRequest<PublicDataLeafValue>> r1;
        obj.convert(r1);
        auto result = _ws->batch_insert_indexed_leaves<crypto::merkle_tree::PublicDataLeafValue>(
            request.value.treeId, r1.value.leaves, r1.value.subtreeDepth, r1.value.forkId);
        MsgHeader header(request.header.messageId);
        messaging::TypedMessage<BatchInsertionResult<PublicDataLeafValue>> resp_msg(
            WorldStateMessageType::BATCH_INSERT, header, result);
        msgpack::pack(buffer, resp_msg);

        break;
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        TypedMessage<BatchInsertRequest<NullifierLeafValue>> r2;
        obj.convert(r2);
        auto result = _ws->batch_insert_indexed_leaves<crypto::merkle_tree::NullifierLeafValue>(
            request.value.treeId, r2.value.leaves, r2.value.subtreeDepth, r2.value.forkId);
        MsgHeader header(request.header.messageId);
        messaging::TypedMessage<BatchInsertionResult<NullifierLeafValue>> resp_msg(
            WorldStateMessageType::BATCH_INSERT, header, result);
        msgpack::pack(buffer, resp_msg);
        break;
    }
    default:
        throw std::runtime_error("Unsupported tree type");
    }

    return true;
}

bool WorldStateWrapper::sequential_insert(msgpack::object& obj, msgpack::sbuffer& buffer)
{
    TypedMessage<TreeIdOnlyRequest> request;
    obj.convert(request);

    switch (request.value.treeId) {
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        TypedMessage<InsertRequest<PublicDataLeafValue>> r1;
        obj.convert(r1);
        auto result = _ws->insert_indexed_leaves<crypto::merkle_tree::PublicDataLeafValue>(
            request.value.treeId, r1.value.leaves, r1.value.forkId);
        MsgHeader header(request.header.messageId);
        messaging::TypedMessage<SequentialInsertionResult<PublicDataLeafValue>> resp_msg(
            WorldStateMessageType::SEQUENTIAL_INSERT, header, result);
        msgpack::pack(buffer, resp_msg);

        break;
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        TypedMessage<InsertRequest<NullifierLeafValue>> r2;
        obj.convert(r2);
        auto result = _ws->insert_indexed_leaves<crypto::merkle_tree::NullifierLeafValue>(
            request.value.treeId, r2.value.leaves, r2.value.forkId);
        MsgHeader header(request.header.messageId);
        messaging::TypedMessage<SequentialInsertionResult<NullifierLeafValue>> resp_msg(
            WorldStateMessageType::SEQUENTIAL_INSERT, header, result);
        msgpack::pack(buffer, resp_msg);
        break;
    }
    default:
        throw std::runtime_error("Unsupported tree type");
    }

    return true;
}

bool WorldStateWrapper::update_archive(msgpack::object& obj, msgpack::sbuffer& buf)
{
    TypedMessage<UpdateArchiveRequest> request;
    obj.convert(request);

    _ws->update_archive(request.value.blockStateRef, request.value.blockHeaderHash, request.value.forkId);

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<EmptyResponse> resp_msg(WorldStateMessageType::UPDATE_ARCHIVE, header, {});
    msgpack::pack(buf, resp_msg);

    return true;
}

bool WorldStateWrapper::commit(msgpack::object& obj, msgpack::sbuffer& buf)
{
    HeaderOnlyMessage request;
    obj.convert(request);

    WorldStateStatusFull status;
    _ws->commit(status);

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<WorldStateStatusFull> resp_msg(WorldStateMessageType::COMMIT, header, { status });
    msgpack::pack(buf, resp_msg);

    return true;
}

bool WorldStateWrapper::rollback(msgpack::object& obj, msgpack::sbuffer& buf)
{
    HeaderOnlyMessage request;
    obj.convert(request);

    _ws->rollback();

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<EmptyResponse> resp_msg(WorldStateMessageType::ROLLBACK, header, {});
    msgpack::pack(buf, resp_msg);

    return true;
}

bool WorldStateWrapper::sync_block(msgpack::object& obj, msgpack::sbuffer& buf)
{
    TypedMessage<SyncBlockRequest> request;
    obj.convert(request);

    WorldStateStatusFull status = _ws->sync_block(request.value.blockStateRef,
                                                  request.value.blockHeaderHash,
                                                  request.value.paddedNoteHashes,
                                                  request.value.paddedL1ToL2Messages,
                                                  request.value.paddedNullifiers,
                                                  request.value.publicDataWrites);

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<WorldStateStatusFull> resp_msg(WorldStateMessageType::SYNC_BLOCK, header, { status });
    msgpack::pack(buf, resp_msg);

    return true;
}

bool WorldStateWrapper::create_fork(msgpack::object& obj, msgpack::sbuffer& buf)
{
    TypedMessage<CreateForkRequest> request;
    obj.convert(request);

    std::optional<index_t> blockNumber =
        request.value.latest ? std::nullopt : std::optional<index_t>(request.value.blockNumber);

    uint64_t forkId = _ws->create_fork(blockNumber);

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<CreateForkResponse> resp_msg(WorldStateMessageType::CREATE_FORK, header, { forkId });
    msgpack::pack(buf, resp_msg);

    return true;
}

bool WorldStateWrapper::delete_fork(msgpack::object& obj, msgpack::sbuffer& buf)
{
    TypedMessage<DeleteForkRequest> request;
    obj.convert(request);

    _ws->delete_fork(request.value.forkId);

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<EmptyResponse> resp_msg(WorldStateMessageType::DELETE_FORK, header, {});
    msgpack::pack(buf, resp_msg);

    return true;
}

bool WorldStateWrapper::close(msgpack::object& obj, msgpack::sbuffer& buf)
{
    HeaderOnlyMessage request;
    obj.convert(request);

    // The only reason this API exists is for testing purposes in TS (e.g. close db, open new db instance to test
    // persistence)
    _ws.reset(nullptr);

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<EmptyResponse> resp_msg(WorldStateMessageType::CLOSE, header, {});
    msgpack::pack(buf, resp_msg);

    return true;
}

bool WorldStateWrapper::set_finalised(msgpack::object& obj, msgpack::sbuffer& buf) const
{
    TypedMessage<BlockShiftRequest> request;
    obj.convert(request);
    WorldStateStatusSummary status = _ws->set_finalised_blocks(request.value.toBlockNumber);
    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<WorldStateStatusSummary> resp_msg(
        WorldStateMessageType::FINALISE_BLOCKS, header, { status });
    msgpack::pack(buf, resp_msg);

    return true;
}

bool WorldStateWrapper::unwind(msgpack::object& obj, msgpack::sbuffer& buf) const
{
    TypedMessage<BlockShiftRequest> request;
    obj.convert(request);

    WorldStateStatusFull status = _ws->unwind_blocks(request.value.toBlockNumber);

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<WorldStateStatusFull> resp_msg(WorldStateMessageType::UNWIND_BLOCKS, header, { status });
    msgpack::pack(buf, resp_msg);

    return true;
}

bool WorldStateWrapper::remove_historical(msgpack::object& obj, msgpack::sbuffer& buf) const
{
    TypedMessage<BlockShiftRequest> request;
    obj.convert(request);
    WorldStateStatusFull status = _ws->remove_historical_blocks(request.value.toBlockNumber);

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<WorldStateStatusFull> resp_msg(
        WorldStateMessageType::REMOVE_HISTORICAL_BLOCKS, header, { status });
    msgpack::pack(buf, resp_msg);

    return true;
}

bool WorldStateWrapper::get_status(msgpack::object& obj, msgpack::sbuffer& buf) const
{
    HeaderOnlyMessage request;
    obj.convert(request);

    WorldStateStatusSummary status;
    _ws->get_status_summary(status);

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<WorldStateStatusSummary> resp_msg(WorldStateMessageType::GET_STATUS, header, { status });
    msgpack::pack(buf, resp_msg);

    return true;
}

Napi::Function WorldStateWrapper::get_class(Napi::Env env)
{
    return DefineClass(env,
                       "WorldState",
                       {
                           WorldStateWrapper::InstanceMethod("call", &WorldStateWrapper::call),
                       });
}
