#pragma once

#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/tree_meta.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <exception>
#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <utility>

namespace bb::crypto::merkle_tree {
struct TreeMetaResponse {
    TreeMeta meta;

    TreeMetaResponse() = default;
    ~TreeMetaResponse() = default;
    TreeMetaResponse(const TreeMetaResponse& other) = default;
    TreeMetaResponse(TreeMetaResponse&& other) noexcept = default;
    TreeMetaResponse& operator=(const TreeMetaResponse& other) = default;
    TreeMetaResponse& operator=(TreeMetaResponse&& other) noexcept = default;
};

struct AddDataResponse {
    index_t size;
    fr root;

    AddDataResponse() = default;
    ~AddDataResponse() = default;
    AddDataResponse(const AddDataResponse& other) = default;
    AddDataResponse(AddDataResponse&& other) noexcept = default;
    AddDataResponse& operator=(const AddDataResponse& other) = default;
    AddDataResponse& operator=(AddDataResponse&& other) noexcept = default;
};

struct GetSiblingPathResponse {
    fr_sibling_path path;

    GetSiblingPathResponse() = default;
    ~GetSiblingPathResponse() = default;
    GetSiblingPathResponse(const GetSiblingPathResponse& other) = default;
    GetSiblingPathResponse(GetSiblingPathResponse&& other) noexcept = default;
    GetSiblingPathResponse& operator=(const GetSiblingPathResponse& other) = default;
    GetSiblingPathResponse& operator=(GetSiblingPathResponse&& other) noexcept = default;
};

template <typename LeafType> struct LeafUpdateWitnessData {
    IndexedLeaf<LeafType> leaf;
    index_t index;
    fr_sibling_path path;

    LeafUpdateWitnessData(const IndexedLeaf<LeafType>& l, const index_t& i, fr_sibling_path p)
        : leaf(l)
        , index(i)
        , path(std::move(p))
    {}
    LeafUpdateWitnessData() = default;
    ~LeafUpdateWitnessData() = default;
    LeafUpdateWitnessData(const LeafUpdateWitnessData& other) = default;
    LeafUpdateWitnessData(LeafUpdateWitnessData&& other) noexcept = default;
    LeafUpdateWitnessData& operator=(const LeafUpdateWitnessData& other) = default;
    LeafUpdateWitnessData& operator=(LeafUpdateWitnessData&& other) noexcept = default;

    MSGPACK_FIELDS(leaf, index, path);
};

template <typename LeafValueType> struct AddIndexedDataResponse {
    AddDataResponse add_data_result;
    fr_sibling_path subtree_path;
    std::shared_ptr<std::vector<std::pair<LeafValueType, size_t>>> sorted_leaves;
    std::shared_ptr<std::vector<LeafUpdateWitnessData<LeafValueType>>> low_leaf_witness_data;

    AddIndexedDataResponse() = default;
    ~AddIndexedDataResponse() = default;
    AddIndexedDataResponse(const AddIndexedDataResponse& other) = default;
    AddIndexedDataResponse(AddIndexedDataResponse&& other) noexcept = default;
    AddIndexedDataResponse& operator=(const AddIndexedDataResponse& other) = default;
    AddIndexedDataResponse& operator=(AddIndexedDataResponse&& other) noexcept = default;
};

template <typename LeafValueType> struct AddIndexedDataSequentiallyResponse {
    AddDataResponse add_data_result;
    std::shared_ptr<std::vector<LeafUpdateWitnessData<LeafValueType>>> low_leaf_witness_data;
    std::shared_ptr<std::vector<LeafUpdateWitnessData<LeafValueType>>> insertion_witness_data;

    AddIndexedDataSequentiallyResponse() = default;
    ~AddIndexedDataSequentiallyResponse() = default;
    AddIndexedDataSequentiallyResponse(const AddIndexedDataSequentiallyResponse& other) = default;
    AddIndexedDataSequentiallyResponse(AddIndexedDataSequentiallyResponse&& other) noexcept = default;
    AddIndexedDataSequentiallyResponse& operator=(const AddIndexedDataSequentiallyResponse& other) = default;
    AddIndexedDataSequentiallyResponse& operator=(AddIndexedDataSequentiallyResponse&& other) noexcept = default;
};

struct BlockForIndexResponse {
    std::vector<std::optional<block_number_t>> blockNumbers;

    BlockForIndexResponse() = default;
    ~BlockForIndexResponse() = default;
    BlockForIndexResponse(const BlockForIndexResponse& other) = default;
    BlockForIndexResponse(BlockForIndexResponse&& other) noexcept = default;
    BlockForIndexResponse& operator=(const BlockForIndexResponse& other) = default;
    BlockForIndexResponse& operator=(BlockForIndexResponse&& other) noexcept = default;
};

struct FindLeafIndexResponse {
    index_t leaf_index;

    FindLeafIndexResponse() = default;
    ~FindLeafIndexResponse() = default;
    FindLeafIndexResponse(const FindLeafIndexResponse& other) = default;
    FindLeafIndexResponse(FindLeafIndexResponse&& other) noexcept = default;
    FindLeafIndexResponse& operator=(const FindLeafIndexResponse& other) = default;
    FindLeafIndexResponse& operator=(FindLeafIndexResponse&& other) noexcept = default;
};

struct GetLeafResponse {
    std::optional<bb::fr> leaf;

    GetLeafResponse() = default;
    ~GetLeafResponse() = default;
    GetLeafResponse(const GetLeafResponse& other) = default;
    GetLeafResponse(GetLeafResponse&& other) noexcept = default;
    GetLeafResponse& operator=(const GetLeafResponse& other) = default;
    GetLeafResponse& operator=(GetLeafResponse&& other) noexcept = default;
};

template <typename LeafValueType> struct GetIndexedLeafResponse {
    std::optional<IndexedLeaf<LeafValueType>> indexed_leaf;
};

struct GetLowIndexedLeafResponse {
    bool is_already_present;
    index_t index;

    MSGPACK_FIELDS(is_already_present, index);

    GetLowIndexedLeafResponse(bool p, const index_t& i)
        : is_already_present(p)
        , index(i)
    {}
    GetLowIndexedLeafResponse() = default;
    ~GetLowIndexedLeafResponse() = default;
    GetLowIndexedLeafResponse(const GetLowIndexedLeafResponse& other) = default;
    GetLowIndexedLeafResponse(GetLowIndexedLeafResponse&& other) noexcept = default;
    GetLowIndexedLeafResponse& operator=(const GetLowIndexedLeafResponse& other) = default;
    GetLowIndexedLeafResponse& operator=(GetLowIndexedLeafResponse&& other) noexcept = default;

    bool operator==(const GetLowIndexedLeafResponse& other) const
    {
        return is_already_present == other.is_already_present && index == other.index;
    }
};

struct CommitResponse {
    TreeMeta meta;
    TreeDBStats stats;

    CommitResponse() = default;
    ~CommitResponse() = default;
    CommitResponse(const CommitResponse& other) = default;
    CommitResponse(CommitResponse&& other) noexcept = default;
    CommitResponse& operator=(const CommitResponse& other) = default;
    CommitResponse& operator=(CommitResponse&& other) noexcept = default;
};

struct UnwindResponse {
    TreeMeta meta;
    TreeDBStats stats;

    UnwindResponse() = default;
    ~UnwindResponse() = default;
    UnwindResponse(const UnwindResponse& other) = default;
    UnwindResponse(UnwindResponse&& other) noexcept = default;
    UnwindResponse& operator=(const UnwindResponse& other) = default;
    UnwindResponse& operator=(UnwindResponse&& other) noexcept = default;
};

struct RemoveHistoricResponse {
    TreeMeta meta;
    TreeDBStats stats;

    RemoveHistoricResponse() = default;
    ~RemoveHistoricResponse() = default;
    RemoveHistoricResponse(const RemoveHistoricResponse& other) = default;
    RemoveHistoricResponse(RemoveHistoricResponse&& other) noexcept = default;
    RemoveHistoricResponse& operator=(const RemoveHistoricResponse& other) = default;
    RemoveHistoricResponse& operator=(RemoveHistoricResponse&& other) noexcept = default;
};

template <typename ResponseType> struct TypedResponse {
    ResponseType inner;
    bool success{ true };
    std::string message;

    TypedResponse() = default;
    ~TypedResponse() = default;
    TypedResponse(const TypedResponse& other) = default;
    TypedResponse(TypedResponse&& other) noexcept = default;
    TypedResponse& operator=(const TypedResponse& other) = default;
    TypedResponse& operator=(TypedResponse&& other) noexcept = default;
};

struct Response {
    bool success;
    std::string message;

    Response(bool s, std::string m)
        : success(s)
        , message(std::move(m))
    {}
    Response() = default;
    ~Response() = default;
    Response(const Response& other) = default;
    Response(Response&& other) noexcept = default;
    Response& operator=(const Response& other) = default;
    Response& operator=(Response&& other) noexcept = default;
};

template <typename ResponseType>
void execute_and_report(const std::function<void(TypedResponse<ResponseType>&)>& f,
                        const std::function<void(TypedResponse<ResponseType>&)>& on_completion)
{
    TypedResponse<ResponseType> response;
    try {
        f(response);
    } catch (std::exception& e) {
        response.success = false;
        response.message = e.what();
        // std::cout << "Response " << e.what() << std::endl;
    }
    try {
        on_completion(response);
    } catch (std::exception&) {
    }
}

inline void execute_and_report(const std::function<void()>& f, const std::function<void(Response&)>& on_completion)
{
    Response response{ true, "" };
    try {
        f();
    } catch (std::exception& e) {
        response.success = false;
        response.message = e.what();
        // std::cout << "Response " << e.what() << std::endl;
    }
    try {
        on_completion(response);
    } catch (std::exception&) {
    }
}
} // namespace bb::crypto::merkle_tree
