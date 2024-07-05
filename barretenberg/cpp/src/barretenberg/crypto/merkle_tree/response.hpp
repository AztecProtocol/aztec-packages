#pragma once

#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <exception>
#include <functional>
#include <string>

namespace bb::crypto::merkle_tree {
struct TreeMetaResponse {
    std::string name;
    uint32_t depth;
    index_t size;
    fr root;
};

struct AddDataResponse {
    index_t size;
    fr root;
};

struct GetSiblingPathResponse {
    fr_sibling_path path;
};

struct AddIndexedDataResponse {
    AddDataResponse add_data_result;
    std::shared_ptr<std::vector<fr_sibling_path>> paths;
};

struct FindLeafIndexResponse {
    index_t leaf_index;
};

template <typename LeafValueType> struct GetIndexedLeafResponse {
    IndexedLeaf<LeafValueType> indexed_leaf;
};

template <typename ResponseType> struct TypedResponse {
    ResponseType inner;
    bool success{ true };
    std::string message;
};

struct Response {
    bool success;
    std::string message;
};

template <typename ResponseType>
void ExecuteAndReport(const std::function<void(TypedResponse<ResponseType>&)>& f,
                      const std::function<void(const TypedResponse<ResponseType>&)>& on_completion)
{
    TypedResponse<ResponseType> response;
    try {
        f(response);
    } catch (std::exception& e) {
        response.success = false;
        response.message = e.what();
    }
    try {
        on_completion(response);
    } catch (std::exception&) {
    }
}

inline void ExecuteAndReport(const std::function<void()>& f, const std::function<void(const Response&)>& on_completion)
{
    Response response{ true, "" };
    try {
        f();
    } catch (std::exception& e) {
        response.success = false;
        response.message = e.what();
    }
    try {
        on_completion(response);
    } catch (std::exception&) {
    }
}
} // namespace bb::crypto::merkle_tree
