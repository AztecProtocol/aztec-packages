#pragma once
#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/crypto/merkle_tree/append_only_tree/append_only_tree.hpp"
#include "barretenberg/crypto/merkle_tree/array_store.hpp"
#include "barretenberg/crypto/merkle_tree/hash.hpp"
#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_tree.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/leaves_cache.hpp"
#include "barretenberg/messaging/header.hpp"
#include "barretenberg/serialize/cbind.hpp"
#include "barretenberg/world_state/service/message.hpp"
#include "msgpack/v3/sbuffer_decl.hpp"
#include <cstdint>
#include <functional>
#include <iostream>
#include <string>
#include <unordered_map>

namespace bb::world_state {
using namespace bb::messaging;
using namespace bb::crypto::merkle_tree;
using HashPolicy = PedersenHashPolicy;

template <typename OutputStream> class WorldStateService {
  private:
    OutputStream& outputStream;
    std::unordered_map<std::string, std::shared_ptr<IndexedTree<ArrayStore, LeavesCache, HashPolicy>>> trees;
    std::vector<std::shared_ptr<ArrayStore>> stores;
    ThreadPool workers;

  public:
    WorldStateService(OutputStream& out, size_t numThreads)
        : outputStream(out)
        , workers(numThreads)
    {}
    bool startTree(msgpack::object& obj);
    bool getTreeInfo(msgpack::object& obj);
    bool insertLeaves(msgpack::object& obj);
};

template <typename OutputStream> bool WorldStateService<OutputStream>::startTree(msgpack::object& obj)
{
    TypedMessage<StartTreeRequest> startTreeRequest;
    obj.convert(startTreeRequest);

    uint32_t actualDepth = startTreeRequest.value.depth;

    auto it = trees.find(startTreeRequest.value.name);
    if (it == trees.end()) {
        auto store = std::make_shared<ArrayStore>(startTreeRequest.value.depth, 1024 * 16);
        stores.push_back(store);
        auto tree =
            std::make_shared<IndexedTree<ArrayStore, LeavesCache, HashPolicy>>(*store,
                                                                               startTreeRequest.value.depth,
                                                                               workers,
                                                                               startTreeRequest.value.preFilledSize,
                                                                               startTreeRequest.value.name);
        std::unordered_map<std::string, std::shared_ptr<IndexedTree<ArrayStore, LeavesCache, HashPolicy>>>::value_type
            v = { startTreeRequest.value.name, tree };
        trees.insert(v);
    } else {
        actualDepth = static_cast<uint32_t>(it->second->depth());
    }

    StartTreeResponse response;
    response.depth = actualDepth;
    response.name = startTreeRequest.value.name;
    response.success = it == trees.end();
    response.message = response.success ? "" : "Tree already exists";

    MsgHeader header(startTreeRequest.header.messageId);
    TypedMessage<StartTreeResponse> startTreeResponse(WorldStateMsgTypes::START_TREE_RESPONSE, header, response);
    outputStream.sendPackedObject(startTreeResponse);
    return true;
}

template <typename OutputStream> bool WorldStateService<OutputStream>::getTreeInfo(msgpack::object& obj)
{
    TypedMessage<GetTreeInfoRequest> treeInfoRequest;
    obj.convert(treeInfoRequest);

    GetTreeInfoResponse treeInfoResponse;
    treeInfoResponse.name = treeInfoRequest.value.name;

    auto it = trees.find(treeInfoRequest.value.name);
    if (it == trees.end()) {
        treeInfoResponse.success = false;
        treeInfoResponse.message = "Tree not found";
    } else {
        treeInfoResponse.message = "";
        treeInfoResponse.success = true;
        treeInfoResponse.depth = static_cast<uint32_t>(it->second->depth());
        treeInfoResponse.root = it->second->root();
        treeInfoResponse.size = static_cast<uint64_t>(it->second->size());
    }

    MsgHeader header(treeInfoRequest.header.messageId);
    TypedMessage<GetTreeInfoResponse> getTreeInfoResponse(
        WorldStateMsgTypes::GET_TREE_INFO_RESPONSE, header, treeInfoResponse);
    outputStream.sendPackedObject(getTreeInfoResponse);
    return true;
}

template <typename OutputStream> bool WorldStateService<OutputStream>::insertLeaves(msgpack::object& obj)
{
    TypedMessage<InsertLeavesRequest> insertLeavesRequest;
    obj.convert(insertLeavesRequest);

    uint32_t requestId = insertLeavesRequest.header.messageId;

    auto it = trees.find(insertLeavesRequest.value.name);
    if (it == trees.end()) {
        InsertLeavesResponse response;
        response.success = false;
        response.message = "Tree not found";

        // Send the response immediately
        MsgHeader header(requestId);
        TypedMessage<InsertLeavesResponse> insertLeavesResponse(
            WorldStateMsgTypes::INSERT_LEAVES_RESPONSE, header, response);
        outputStream.sendPackedObject(insertLeavesResponse);

    } else {

        // Send the response async
        auto completion = [=](std::vector<fr_hash_path>&, fr& root, index_t size) -> void {
            MsgHeader header(requestId);
            InsertLeavesResponse response;
            response.message = "";
            response.success = true;
            response.root = root;
            response.size = size;
            TypedMessage<InsertLeavesResponse> insertLeavesResponse(
                WorldStateMsgTypes::INSERT_LEAVES_RESPONSE, header, response);
            outputStream.sendPackedObject(insertLeavesResponse);
        };
        it->second->add_or_update_values(insertLeavesRequest.value.leaves, completion);
    }

    return true;
}
} // namespace bb::world_state