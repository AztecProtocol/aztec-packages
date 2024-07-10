#pragma once
#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/crypto/merkle_tree//lmdb_store/lmdb_store.hpp"
#include "barretenberg/crypto/merkle_tree/append_only_tree/append_only_tree.hpp"
#include "barretenberg/crypto/merkle_tree/fixtures.hpp"
#include "barretenberg/crypto/merkle_tree/hash.hpp"
#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_tree.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/cached_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
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
#include <vector>

namespace bb::world_state {
using namespace bb::messaging;
using namespace bb::crypto::merkle_tree;
using HashPolicy = PedersenHashPolicy;

struct TreeWithStore {
    typedef CachedTreeStore<LMDBStore, NullifierLeafValue> Store;
    std::unique_ptr<LMDBStore> lmdbStore;
    std::unique_ptr<IndexedTree<Store, HashPolicy>> tree;
    std::unique_ptr<Store> store;

    TreeWithStore(std::unique_ptr<LMDBStore> l,
                  std::unique_ptr<IndexedTree<Store, HashPolicy>> t,
                  std::unique_ptr<Store> s)
        : lmdbStore(std::move(l))
        , tree(std::move(t))
        , store(std::move(s))
    {}

    TreeWithStore(TreeWithStore&& other) noexcept
        : lmdbStore(std::move(other.lmdbStore))
        , tree(std::move(other.tree))
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
    LMDBEnvironment lmdbEnvironment;

  public:
    WorldStateService(OutputStream& out, uint32_t numThreads)
        : outputStream(out)
        , workers(numThreads)
        , lmdbEnvironment(randomTempDirectory(), 1024, 50, numThreads)
    {}
    bool startTree(msgpack::object& obj);
    bool getTreeInfo(msgpack::object& obj);
    bool insertLeaves(msgpack::object& obj);

  private:
};

template <typename OutputStream> bool WorldStateService<OutputStream>::startTree(msgpack::object& obj)
{
    TypedMessage<StartTreeRequest> startTreeRequest;
    obj.convert(startTreeRequest);

    uint32_t actualDepth = startTreeRequest.value.depth;

    auto it = trees.find(startTreeRequest.value.name);
    if (it == trees.end()) {
        auto lmdbStore =
            std::make_unique<LMDBStore>(lmdbEnvironment, startTreeRequest.value.name, false, false, IntegerKeyCmp);
        auto store = std::make_unique<TreeWithStore::Store>(
            startTreeRequest.value.name, startTreeRequest.value.depth, *lmdbStore);

        auto tree = std::make_unique<IndexedTree<TreeWithStore::Store, HashPolicy>>(
            *store, workers, startTreeRequest.value.preFilledSize);

        auto treeWithStore = std::make_unique<TreeWithStore>(std::move(lmdbStore), std::move(tree), std::move(store));
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
        // treeInfoResponse.root = it->second->tree->root();
        // treeInfoResponse.size = static_cast<uint64_t>(it->second->tree->size());
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
        auto completion = [=, this](const TypedResponse<AddIndexedDataResponse<NullifierLeafValue>>& resp) -> void {
            MsgHeader header(requestId);
            InsertLeavesResponse response;
            response.message = "";
            response.success = true;
            response.root = resp.inner.add_data_result.root;
            response.size = resp.inner.add_data_result.size;
            TypedMessage<InsertLeavesResponse> insertLeavesResponse(
                WorldStateMsgTypes::INSERT_LEAVES_RESPONSE, header, response);
            outputStream.sendPackedObject(insertLeavesResponse);
        };
        std::vector<NullifierLeafValue> leaves(insertLeavesRequest.value.leaves.size());
        for (auto& v : insertLeavesRequest.value.leaves) {
            leaves.emplace_back(v);
        }
        it->second->tree->add_or_update_values(leaves, completion);
    }

    return true;
}
} // namespace bb::world_state
