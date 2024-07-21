#include "barretenberg/world_state_napi/addon.hpp"
#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/messaging/header.hpp"
#include "barretenberg/world_state/types.hpp"
#include "barretenberg/world_state/world_state.hpp"
#include "barretenberg/world_state_napi/async_op.hpp"
#include "barretenberg/world_state_napi/message.hpp"
#include "msgpack/v3/pack_decl.hpp"
#include "msgpack/v3/sbuffer_decl.hpp"
#include "napi.h"
#include <algorithm>
#include <any>
#include <array>
#include <cstdint>
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>

using namespace bb::world_state;
using namespace bb::crypto::merkle_tree;
using namespace bb::messaging;

WorldStateAddon::WorldStateAddon(const Napi::CallbackInfo& info)
    : ObjectWrap(info)
{
    Napi::Env env = info.Env();

    if (info.Length() < 1) {
        throw Napi::TypeError::New(env, "Wrong number of arguments");
    }

    if (!info[0].IsString()) {
        throw Napi::TypeError::New(env, "Directory needs to be a string");
    }

    std::string data_dir = info[0].As<Napi::String>();
    _ws = std::make_unique<WorldState>(16, data_dir, 1024 * 1024); // 1 GiB

    _dispatcher.registerTarget(
        WorldStateMessageType::GET_TREE_INFO,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return get_tree_info(obj, buffer); });

    _dispatcher.registerTarget(
        WorldStateMessageType::GET_STATE_REFERENCE,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return get_state_reference(obj, buffer); });

    _dispatcher.registerTarget(
        WorldStateMessageType::GET_LEAF_VALUE,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return get_leaf_value(obj, buffer); });

    _dispatcher.registerTarget(
        WorldStateMessageType::GET_LEAF_PREIMAGE,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return get_leaf_preimage(obj, buffer); });

    _dispatcher.registerTarget(
        WorldStateMessageType::GET_SIBLING_PATH,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return get_sibling_path(obj, buffer); });

    _dispatcher.registerTarget(
        WorldStateMessageType::FIND_LEAF_INDEX,
        [this](msgpack::object& obj, msgpack::sbuffer& buffer) { return find_leaf_index(obj, buffer); });

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
}

Napi::Value WorldStateAddon::call(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();
    // keep this in a shared pointer so that AsyncOperation can resolve/reject the promise once the execution is
    // complete on an separate thread
    auto deferred = std::make_shared<Napi::Promise::Deferred>(env);

    if (info.Length() < 1) {
        deferred->Reject(Napi::TypeError::New(env, "Wrong number of arguments").Value());
    } else if (!info[0].IsBuffer()) {
        deferred->Reject(Napi::TypeError::New(env, "Argument must be a buffer").Value());
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

bool WorldStateAddon::get_tree_info(msgpack::object& obj, msgpack::sbuffer& buffer) const
{
    TypedMessage<GetTreeInfoRequest> request;
    obj.convert(request);
    auto info = _ws->get_tree_info(revision_from_input(request.value.revision), request.value.treeId);

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<GetTreeInfoResponse> resp_msg(
        WorldStateMessageType::GET_TREE_INFO, header, { request.value.treeId, info.root, info.size, info.depth });

    msgpack::pack(buffer, resp_msg);

    return true;
}

bool WorldStateAddon::get_state_reference(msgpack::object& obj, msgpack::sbuffer& buffer) const
{
    TypedMessage<GetStateReferenceRequest> request;
    obj.convert(request);
    auto state = _ws->get_state_reference(revision_from_input(request.value.revision));

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<GetStateReferenceResponse> resp_msg(
        WorldStateMessageType::GET_STATE_REFERENCE, header, { state });

    msgpack::pack(buffer, resp_msg);

    return true;
}

bool WorldStateAddon::get_leaf_value(msgpack::object& obj, msgpack::sbuffer& buffer) const
{
    TypedMessage<GetLeafValueRequest> request;
    obj.convert(request);

    switch (request.value.treeId) {
    case MerkleTreeId::NOTE_HASH_TREE:
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
    case MerkleTreeId::ARCHIVE: {
        auto leaf = _ws->get_leaf<bb::fr>(
            revision_from_input(request.value.revision), request.value.treeId, request.value.leafIndex);

        MsgHeader header(request.header.messageId);
        messaging::TypedMessage<std::optional<bb::fr>> resp_msg(WorldStateMessageType::GET_LEAF_VALUE, header, leaf);
        msgpack::pack(buffer, resp_msg);
        break;
    }

    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto leaf = _ws->get_leaf<crypto::merkle_tree::PublicDataLeafValue>(
            revision_from_input(request.value.revision), request.value.treeId, request.value.leafIndex);
        MsgHeader header(request.header.messageId);
        messaging::TypedMessage<std::optional<PublicDataLeafValue>> resp_msg(
            WorldStateMessageType::GET_LEAF_VALUE, header, leaf);
        msgpack::pack(buffer, resp_msg);
        break;
    }

    case MerkleTreeId::NULLIFIER_TREE: {
        auto leaf = _ws->get_leaf<crypto::merkle_tree::NullifierLeafValue>(
            revision_from_input(request.value.revision), request.value.treeId, request.value.leafIndex);
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

bool WorldStateAddon::get_leaf_preimage(msgpack::object& obj, msgpack::sbuffer& buffer) const
{
    TypedMessage<GetLeafPreimageRequest> request;
    obj.convert(request);

    MsgHeader header(request.header.messageId);

    switch (request.value.treeId) {
    case MerkleTreeId::NULLIFIER_TREE: {
        auto leaf = _ws->get_indexed_leaf<NullifierLeafValue>(
            revision_from_input(request.value.revision), request.value.treeId, request.value.leafIndex);
        messaging::TypedMessage<std::optional<IndexedLeaf<NullifierLeafValue>>> resp_msg(
            WorldStateMessageType::GET_LEAF_PREIMAGE, header, leaf);
        msgpack::pack(buffer, resp_msg);
        break;
    }

    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto leaf = _ws->get_indexed_leaf<PublicDataLeafValue>(
            revision_from_input(request.value.revision), request.value.treeId, request.value.leafIndex);

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

bool WorldStateAddon::get_sibling_path(msgpack::object& obj, msgpack::sbuffer& buffer) const
{
    TypedMessage<GetSiblingPathRequest> request;
    obj.convert(request);

    fr_sibling_path path = _ws->get_sibling_path(
        revision_from_input(request.value.revision), request.value.treeId, request.value.leafIndex);

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<fr_sibling_path> resp_msg(WorldStateMessageType::GET_SIBLING_PATH, header, path);

    msgpack::pack(buffer, resp_msg);

    return true;
}

bool WorldStateAddon::find_leaf_index(msgpack::object& obj, msgpack::sbuffer& buffer) const
{
    TypedMessage<TreeIdAndRevisionRequest> request;
    obj.convert(request);

    std::optional<index_t> index;
    switch (request.value.treeId) {
    case MerkleTreeId::NOTE_HASH_TREE:
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
    case MerkleTreeId::ARCHIVE: {
        TypedMessage<FindLeafIndexRequest<bb::fr>> r1;
        obj.convert(r1);
        index = _ws->find_leaf_index<bb::fr>(
            revision_from_input(request.value.revision), request.value.treeId, r1.value.leaf);
        break;
    }

    case MerkleTreeId::PUBLIC_DATA_TREE: {
        TypedMessage<FindLeafIndexRequest<crypto::merkle_tree::PublicDataLeafValue>> r2;
        obj.convert(r2);
        index = _ws->find_leaf_index<PublicDataLeafValue>(
            revision_from_input(request.value.revision), request.value.treeId, r2.value.leaf);
        break;
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        TypedMessage<FindLeafIndexRequest<crypto::merkle_tree::NullifierLeafValue>> r3;
        obj.convert(r3);
        index = _ws->find_leaf_index<NullifierLeafValue>(
            revision_from_input(request.value.revision), request.value.treeId, r3.value.leaf);
        break;
    }
    }

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<std::optional<index_t>> resp_msg(WorldStateMessageType::FIND_LEAF_INDEX, header, index);
    msgpack::pack(buffer, resp_msg);

    return true;
}

bool WorldStateAddon::find_low_leaf(msgpack::object& obj, msgpack::sbuffer& buffer) const
{
    TypedMessage<FindLowLeafRequest> request;
    obj.convert(request);

    std::pair<bool, index_t> low_leaf_info =
        _ws->find_low_leaf_index(revision_from_input(request.value.revision), request.value.treeId, request.value.key);

    MsgHeader header(request.header.messageId);
    TypedMessage<FindLowLeafResponse> response(
        WorldStateMessageType::FIND_LOW_LEAF, header, { low_leaf_info.first, low_leaf_info.second });
    msgpack::pack(buffer, response);

    return true;
}

bool WorldStateAddon::append_leaves(msgpack::object& obj, msgpack::sbuffer& buf)
{
    TypedMessage<TreeIdOnlyRequest> request;
    obj.convert(request);

    switch (request.value.treeId) {
    case MerkleTreeId::NOTE_HASH_TREE:
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
    case MerkleTreeId::ARCHIVE: {
        TypedMessage<AppendLeavesRequest<bb::fr>> r1;
        obj.convert(r1);
        _ws->append_leaves<bb::fr>(r1.value.treeId, r1.value.leaves);
        break;
    }
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        TypedMessage<AppendLeavesRequest<crypto::merkle_tree::PublicDataLeafValue>> r2;
        obj.convert(r2);
        _ws->append_leaves<crypto::merkle_tree::PublicDataLeafValue>(r2.value.treeId, r2.value.leaves);
        break;
    }
    case MerkleTreeId::NULLIFIER_TREE: {
        TypedMessage<AppendLeavesRequest<crypto::merkle_tree::NullifierLeafValue>> r3;
        obj.convert(r3);
        _ws->append_leaves<crypto::merkle_tree::NullifierLeafValue>(r3.value.treeId, r3.value.leaves);
        break;
    }
    }

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<EmptyResponse> resp_msg(WorldStateMessageType::APPEND_LEAVES, header, {});
    msgpack::pack(buf, resp_msg);

    return true;
}

bool WorldStateAddon::batch_insert(msgpack::object& obj, msgpack::sbuffer& buffer)
{
    TypedMessage<TreeIdOnlyRequest> request;
    obj.convert(request);

    switch (request.value.treeId) {
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        TypedMessage<BatchInsertRequest<PublicDataLeafValue>> r1;
        obj.convert(r1);
        auto result = _ws->batch_insert_indexed_leaves<crypto::merkle_tree::PublicDataLeafValue>(
            request.value.treeId, r1.value.leaves, r1.value.subtreeDepth);
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
            request.value.treeId, r2.value.leaves, r2.value.subtreeDepth);
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

bool WorldStateAddon::update_archive(msgpack::object& obj, msgpack::sbuffer& buf)
{
    TypedMessage<UpdateArchiveRequest> request;
    obj.convert(request);

    // TODO (alexg) move this to world state
    auto world_state_ref = _ws->get_state_reference(WorldStateRevision::uncommitted());
    auto block_state_ref = request.value.blockStateRef;

    if (block_state_ref[MerkleTreeId::NULLIFIER_TREE] == world_state_ref[MerkleTreeId::NULLIFIER_TREE] &&
        block_state_ref[MerkleTreeId::NOTE_HASH_TREE] == world_state_ref[MerkleTreeId::NOTE_HASH_TREE] &&
        block_state_ref[MerkleTreeId::PUBLIC_DATA_TREE] == world_state_ref[MerkleTreeId::PUBLIC_DATA_TREE] &&
        block_state_ref[MerkleTreeId::L1_TO_L2_MESSAGE_TREE] == world_state_ref[MerkleTreeId::L1_TO_L2_MESSAGE_TREE]) {
        _ws->append_leaves<bb::fr>(MerkleTreeId::ARCHIVE, { request.value.blockHash });
    } else {
        throw std::runtime_error("Block state reference does not match current state");
    }

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<EmptyResponse> resp_msg(WorldStateMessageType::APPEND_LEAVES, header, {});
    msgpack::pack(buf, resp_msg);

    return true;
}

bool WorldStateAddon::commit(msgpack::object& obj, msgpack::sbuffer& buf)
{
    HeaderOnlyMessage request;
    obj.convert(request);

    _ws->commit();

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<EmptyResponse> resp_msg(WorldStateMessageType::COMMIT, header, {});
    msgpack::pack(buf, resp_msg);

    return true;
}

bool WorldStateAddon::rollback(msgpack::object& obj, msgpack::sbuffer& buf)
{
    HeaderOnlyMessage request;
    obj.convert(request);

    _ws->rollback();

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<EmptyResponse> resp_msg(WorldStateMessageType::ROLLBACK, header, {});
    msgpack::pack(buf, resp_msg);

    return true;
}

bool WorldStateAddon::sync_block(msgpack::object& obj, msgpack::sbuffer& buf)
{
    TypedMessage<SyncBlockRequest> request;
    obj.convert(request);

    bool is_block_ours = _ws->sync_block(request.value.blockStateRef,
                                         request.value.blockHash,
                                         request.value.paddedNoteHashes,
                                         request.value.paddedL1ToL2Messages,
                                         request.value.paddedNullifiers,
                                         request.value.batchesOfPaddedPublicDataWrites);

    MsgHeader header(request.header.messageId);
    messaging::TypedMessage<SyncBlockResponse> resp_msg(WorldStateMessageType::SYNC_BLOCK, header, { is_block_ours });
    msgpack::pack(buf, resp_msg);

    return true;
}

WorldStateRevision WorldStateAddon::revision_from_input(int input)
{
    if (input == -1) {
        return WorldStateRevision::uncommitted();
    }

    if (input == 0) {
        return WorldStateRevision::committed();
    }

    if (input > 0) {
        return WorldStateRevision::finalised_block(static_cast<uint32_t>(input));
    }

    throw std::runtime_error("Revision must be -1, 0, or a positive integer");
}

Napi::Function WorldStateAddon::get_class(Napi::Env env)
{
    return DefineClass(env,
                       "WorldState",
                       {
                           WorldStateAddon::InstanceMethod("call", &WorldStateAddon::call),
                       });
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    Napi::String name = Napi::String::New(env, "WorldState");
    exports.Set(name, WorldStateAddon::get_class(env));
    return exports;
}

// NOLINTNEXTLINE
NODE_API_MODULE(addon, Init)
