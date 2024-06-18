#pragma once
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/messaging/header.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl/struct_map_impl.hpp"
#include <cstdint>
#include <string>

namespace bb::world_state {

using namespace bb::messaging;

enum WorldStateMsgTypes {
    START_TREE_REQUEST = FIRST_APP_MSG_TYPE,
    START_TREE_RESPONSE,
    GET_TREE_INFO_REQUEST,
    GET_TREE_INFO_RESPONSE,
    INSERT_LEAVES_REQUEST,
    INSERT_LEAVES_RESPONSE,
};

struct StartTreeRequest {
    std::string name;
    uint32_t depth;
    uint32_t preFilledSize;

    MSGPACK_FIELDS(name, depth, preFilledSize);
};

struct StartTreeResponse {
    std::string name;
    uint32_t depth;
    bool success;
    std::string message;

    MSGPACK_FIELDS(name, depth, success, message);
};

struct GetTreeInfoRequest {
    std::string name;

    MSGPACK_FIELDS(name);
};

struct GetTreeInfoResponse {
    std::string name;
    uint32_t depth;
    bb::fr root;
    uint64_t size;
    bool success;
    std::string message;

    MSGPACK_FIELDS(name, depth, root, size, success, message);
};

struct InsertLeavesRequest {
    std::string name;
    std::vector<bb::fr> leaves;

    MSGPACK_FIELDS(name, leaves);
};

struct InsertLeavesResponse {
    bb::fr root;
    uint64_t size;
    bool success;
    std::string message;

    MSGPACK_FIELDS(root, size, success, message);
};

} // namespace bb::world_state

MSGPACK_ADD_ENUM(bb::world_state::WorldStateMsgTypes)
