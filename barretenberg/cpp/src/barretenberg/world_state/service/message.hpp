#pragma once
#include "barretenberg/messaging/header.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <string>

namespace bb::world_state {

using namespace bb::messaging;
enum WorldStateMsgTypes {
    START_TREE_REQUEST = FIRST_APP_MSG_TYPE,
    START_TREE_RESPONSE,
    GET_TREE_INFO_REQUEST,
    GET_TREE_INFO_RESPONSE
};

struct StartTreeRequest {
    std::string name;
    uint32_t depth;

    MSGPACK_FIELDS(name, depth);
};

struct StartTreeResponse {
    std::string name;
    uint32_t depth;
    bool success;
    std::string reason;

    MSGPACK_FIELDS(name, depth, success, reason);
};

} // namespace bb::world_state
