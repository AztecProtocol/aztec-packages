#pragma once
#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/crypto/merkle_tree//lmdb_store/lmdb_store.hpp"
#include "barretenberg/crypto/merkle_tree/append_only_tree/append_only_tree.hpp"
#include "barretenberg/crypto/merkle_tree/hash.hpp"
#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_tree.hpp"
#include "barretenberg/messaging/header.hpp"
#include "barretenberg/serialize/cbind.hpp"
#include "barretenberg/world_state/service/message.hpp"
#include "msgpack/v3/sbuffer_decl.hpp"
#include <cstdint>
#include <functional>
#include <iostream>
#include <memory>
#include <string>
#include <unordered_map>

namespace bb::world_state {
using namespace bb::messaging;
using namespace bb::crypto::merkle_tree;
using HashPolicy = PedersenHashPolicy;

struct TreeWithStore {
    typedef CachedNodeStore<LMDBStore> Store;
    std::unique_ptr<IndexedTree<Store, LeavesCache, HashPolicy>> tree;
    std::unique_ptr<Store> store;

    TreeWithStore(std::unique_ptr<IndexedTree<Store, LeavesCache, HashPolicy>> t, std::unique_ptr<Store> s)
        : tree(std::move(t))
        , store(std::move(s))
    {}

    TreeWithStore(TreeWithStore&& other) noexcept
        : tree(std::move(other.tree))
        , store(std::move(other.store))
    {}

    TreeWithStore& operator=(TreeWithStore&& other) = delete;
    ~TreeWithStore() = default;
    TreeWithStore(const TreeWithStore& other) = delete;
    TreeWithStore& operator=(const TreeWithStore& other) = delete;
};

template <typename OutputStream> class WorldStateService {
  private:
    OutputStream& outputStream;
    std::unordered_map<std::string, std::unique_ptr<TreeWithStore>> trees;
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
        auto store = std::make_unique<CachedStore>(startTreeRequest.value.depth);

        auto tree =
            std::make_unique<IndexedTree<CachedStore, LeavesCache, HashPolicy>>(*store,
                                                                                startTreeRequest.value.depth,
                                                                                workers,
                                                                                startTreeRequest.value.preFilledSize,
                                                                                startTreeRequest.value.name);

        auto treeWithStore = std::make_unique<TreeWithStore>(std::move(tree), std::move(store));
        trees[startTreeRequest.value.name] = std::move(treeWithStore);

    } else {
        actualDepth = static_cast<uint32_t>(it->second->tree->depth());
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
        treeInfoResponse.depth = static_cast<uint32_t>(it->second->tree->depth());
        treeInfoResponse.root = it->second->tree->root();
        treeInfoResponse.size = static_cast<uint64_t>(it->second->tree->size());
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
        it->second->tree->add_or_update_values(insertLeavesRequest.value.leaves, completion);
    }

    return true;
}
} // namespace bb::world_state