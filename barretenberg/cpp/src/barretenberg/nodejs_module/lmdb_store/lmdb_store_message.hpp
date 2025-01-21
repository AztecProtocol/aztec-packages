#pragma once
#include "barretenberg/messaging/header.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "msgpack/adaptor/define_decl.hpp"
#include <cstdint>
#include <optional>
#include <string>

namespace bb::nodejs::lmdb_store {

using namespace bb::messaging;

enum LMDBStoreMessageType {
    GET = FIRST_APP_MSG_TYPE,
    HAS,

    INDEX_GET,
    INDEX_HAS,
    INDEX_HAS_KEY,

    CURSOR_START,
    CURSOR_ADVANCE,
    CURSOR_CLOSE,

    INDEX_CURSOR_ADVANCE,

    BATCH,
};

struct KeyRequest {
    std::string key;
    MSGPACK_FIELDS(key);
};

struct GetResponse {
    std::optional<std::vector<std::byte>> value;
    MSGPACK_FIELDS(value);
};

struct EntryRequest {
    std::string key;
    std::vector<std::byte> value;
    MSGPACK_FIELDS(key, value);
};

struct BatchRequest {
    std::map<std::string, std::vector<std::byte>> set;
    std::vector<std::string> remove;

    std::map<std::string, std::vector<std::vector<std::byte>>> setIndex;
    std::map<std::string, std::vector<std::vector<std::byte>>> addIndex;
    std::map<std::string, std::vector<std::vector<std::byte>>> removeIndex;
    std::vector<std::string> resetIndex;

    MSGPACK_FIELDS(set, remove, setIndex, addIndex, removeIndex, resetIndex);
};

struct CursorStartRequest {
    std::string key;
    std::optional<bool> reverse;
    MSGPACK_FIELDS(key, reverse);
};

struct CursorStartResponse {
    uint64_t cursor;
    MSGPACK_FIELDS(cursor);
};

struct CursorRequest {
    uint64_t cursor;
    MSGPACK_FIELDS(cursor);
};

struct CursorAdvanceResponse {
    std::string key;
    std::vector<std::byte> value;
    bool done;
    MSGPACK_FIELDS(key, value, done);
};

struct IndexGetResponse {
    std::vector<std::vector<std::byte>> values;
    MSGPACK_FIELDS(values);
};

struct IndexBatchRequest {
    std::map<std::string, std::vector<std::vector<std::byte>>> add;
    std::map<std::string, std::vector<std::vector<std::byte>>> remove;
    std::vector<std::string> removeKey;
    MSGPACK_FIELDS(add, remove, removeKey);
};

struct IndexCursorAdvanceResponse {
    std::string key;
    std::vector<std::vector<std::byte>> values;
    bool done;
    MSGPACK_FIELDS(key, values, done);
};

struct BoolResponse {
    bool ok;
    MSGPACK_FIELDS(ok);
};

} // namespace bb::nodejs::lmdb_store

MSGPACK_ADD_ENUM(bb::nodejs::lmdb_store::LMDBStoreMessageType)
