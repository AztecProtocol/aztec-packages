#pragma once
#include "barretenberg/lmdblib/types.hpp"
#include "barretenberg/messaging/header.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "msgpack/adaptor/define_decl.hpp"
#include <cstdint>
#include <optional>
#include <string>

namespace bb::nodejs::lmdb_store {

using namespace bb::messaging;

enum LMDBStoreMessageType {
    OPEN_DATABASE = FIRST_APP_MSG_TYPE,

    GET,
    HAS,

    START_CURSOR,
    ADVANCE_CURSOR,
    CLOSE_CURSOR,

    BATCH,

    CLOSE,
};

struct OpenDatabaseRequest {
    std::string db;
    std::optional<bool> uniqueKeys;
    MSGPACK_FIELDS(db, uniqueKeys);
};

struct GetRequest {
    lmdblib::KeysVector keys;
    std::string db;
    MSGPACK_FIELDS(keys, db);
};

struct GetResponse {
    lmdblib::OptionalValuesVector values;
    MSGPACK_FIELDS(values);
};

struct HasRequest {
    // std::map<lmdblib::Key, std::optional<lmdblib::Value>> entries;
    lmdblib::KeyOptionalValuesVector entries;
    std::string db;
    MSGPACK_FIELDS(entries, db);
};

struct HasResponse {
    // std::map<lmdblib::Key, bool> exists;
    std::vector<bool> exists;
    MSGPACK_FIELDS(exists);
};

struct Batch {
    lmdblib::KeyDupValuesVector addEntries;
    lmdblib::KeyOptionalValuesVector removeEntries;

    MSGPACK_FIELDS(addEntries, removeEntries);
};

struct BatchRequest {
    std::map<std::string, Batch> batches;
    MSGPACK_FIELDS(batches);
};

struct StartCursorRequest {
    lmdblib::Key key;
    std::optional<bool> reverse;
    std::optional<uint32_t> count;
    std::string db;
    MSGPACK_FIELDS(key, reverse, count, db);
};

struct StartCursorResponse {
    std::optional<uint64_t> cursor;
    lmdblib::KeyDupValuesVector entries;
    MSGPACK_FIELDS(cursor, entries);
};

struct AdvanceCursorRequest {
    uint64_t cursor;
    std::optional<uint32_t> count;
    MSGPACK_FIELDS(cursor, count);
};

struct CloseCursorRequest {
    uint64_t cursor;
    MSGPACK_FIELDS(cursor);
};

struct AdvanceCursorResponse {
    lmdblib::KeyDupValuesVector entries;
    bool done;
    MSGPACK_FIELDS(entries, done);
};

struct BoolResponse {
    bool ok;
    MSGPACK_FIELDS(ok);
};

struct BatchResponse {
    uint64_t durationNs;
    MSGPACK_FIELDS(durationNs);
};

} // namespace bb::nodejs::lmdb_store

MSGPACK_ADD_ENUM(bb::nodejs::lmdb_store::LMDBStoreMessageType)
