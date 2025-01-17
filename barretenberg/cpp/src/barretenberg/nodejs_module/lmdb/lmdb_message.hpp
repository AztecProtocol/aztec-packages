#pragma once
#include "barretenberg/messaging/header.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "msgpack/adaptor/define_decl.hpp"
#include <cstdint>
#include <optional>
#include <string>

namespace bb::nodejs::lmdb {

using namespace bb::messaging;

enum LmdbMessageType {
    OPEN_DATABASE = FIRST_APP_MSG_TYPE,

    GET,
    SET,
    REMOVE,

    CLOSE_DATABASE = 999,
};

struct OpenDatabaseRequest {
    std::string db_name;
    MSGPACK_FIELDS(db_name);
};

struct CloseDatabaseRequest {
    std::string db_name;
    MSGPACK_FIELDS(db_name);
};

struct GetRequest {
    std::string db_name;
    std::string key;
    MSGPACK_FIELDS(db_name, key);
};

struct GetResponse {
    std::vector<std::byte> value;
    MSGPACK_FIELDS(value);
};

struct SetRequest {
    std::string db_name;
    std::string key;
    std::vector<std::byte> value;
    MSGPACK_FIELDS(db_name, key, value);
};

struct RemoveRequest {
    std::string db_name;
    std::string key;
    MSGPACK_FIELDS(db_name, key);
};

struct EmptyResponse {
    bool ok;
    MSGPACK_FIELDS(ok);
};

} // namespace bb::nodejs::lmdb

MSGPACK_ADD_ENUM(bb::nodejs::lmdb::LmdbMessageType)
