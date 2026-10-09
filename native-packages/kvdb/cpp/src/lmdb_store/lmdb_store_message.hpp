#pragma once
#include "lmdblib/types.hpp"
#include "messaging/header.hpp"
#include <msgpack.hpp>
#include "msgpack/adaptor/define_decl.hpp"
#include <cstdint>
#include <optional>
#include <string>

namespace azteclabs::kvdb::lmdb_store {

using namespace azteclabs::kvdb::messaging;

enum LMDBStoreMessageType {
    OPEN_DATABASE = FIRST_APP_MSG_TYPE,

    GET,
    HAS,

    START_CURSOR,
    ADVANCE_CURSOR,
    ADVANCE_CURSOR_COUNT,
    CLOSE_CURSOR,

    BATCH,

    STATS,

    CLOSE,
    COPY_STORE,

    START_READ_TX,
    CLOSE_READ_TX,
};

struct OpenDatabaseRequest {
    std::string db;
    std::optional<bool> uniqueKeys;
    MSGPACK_DEFINE_MAP(db, uniqueKeys);
};

struct GetRequest {
    lmdblib::KeysVector keys;
    std::string db;
    // When set, read through the snapshot of this open read transaction instead of a fresh one
    std::optional<uint64_t> txId;
    MSGPACK_DEFINE_MAP(keys, db, txId);
};

struct GetResponse {
    lmdblib::OptionalValuesVector values;
    MSGPACK_DEFINE_MAP(values);
};

struct HasRequest {
    // std::map<lmdblib::Key, std::optional<lmdblib::Value>> entries;
    lmdblib::KeyOptionalValuesVector entries;
    std::string db;
    MSGPACK_DEFINE_MAP(entries, db);
};

struct HasResponse {
    // std::map<lmdblib::Key, bool> exists;
    std::vector<bool> exists;
    MSGPACK_DEFINE_MAP(exists);
};

struct Batch {
    lmdblib::KeyDupValuesVector addEntries;
    lmdblib::KeyOptionalValuesVector removeEntries;

    MSGPACK_DEFINE_MAP(addEntries, removeEntries);
};

struct BatchRequest {
    std::map<std::string, Batch> batches;
    MSGPACK_DEFINE_MAP(batches);
};

struct StartCursorRequest {
    lmdblib::Key key;
    std::optional<bool> reverse;
    std::optional<uint32_t> count;
    std::optional<bool> onePage;
    std::string db;
    // When set, iterate over the snapshot of this open read transaction instead of a fresh one
    std::optional<uint64_t> txId;
    MSGPACK_DEFINE_MAP(key, reverse, count, onePage, db, txId);
};

struct StartCursorResponse {
    std::optional<uint64_t> cursor;
    lmdblib::KeyDupValuesVector entries;
    MSGPACK_DEFINE_MAP(cursor, entries);
};

struct AdvanceCursorRequest {
    uint64_t cursor;
    std::optional<uint32_t> count;
    MSGPACK_DEFINE_MAP(cursor, count);
};

struct AdvanceCursorCountRequest {
    uint64_t cursor;
    lmdblib::Key endKey;
    MSGPACK_DEFINE_MAP(cursor, endKey);
};

struct CloseCursorRequest {
    uint64_t cursor;
    MSGPACK_DEFINE_MAP(cursor);
};

struct AdvanceCursorResponse {
    lmdblib::KeyDupValuesVector entries;
    bool done;
    MSGPACK_DEFINE_MAP(entries, done);
};

struct AdvanceCursorCountResponse {
    uint64_t count;
    bool done;
    MSGPACK_DEFINE_MAP(count, done);
};

struct BoolResponse {
    bool ok;
    MSGPACK_DEFINE_MAP(ok);
};

struct BatchResponse {
    uint64_t durationNs;
    MSGPACK_DEFINE_MAP(durationNs);
};

struct StatsResponse {
    std::vector<lmdblib::DBStats> stats;
    uint64_t dbMapSizeBytes;
    uint64_t dbPhysicalFileSizeBytes;
    MSGPACK_DEFINE_MAP(stats, dbMapSizeBytes, dbPhysicalFileSizeBytes);
};

struct CopyStoreRequest {
    std::string dstPath;
    std::optional<bool> compact;
    MSGPACK_DEFINE_MAP(dstPath, compact);
};

struct StartReadTxResponse {
    uint64_t tx;
    MSGPACK_DEFINE_MAP(tx);
};

struct CloseReadTxRequest {
    // Optional only so that a request without it is rejected rather than read as an indeterminate id
    std::optional<uint64_t> tx;
    MSGPACK_DEFINE_MAP(tx);
};

} // namespace azteclabs::kvdb::lmdb_store

MSGPACK_ADD_ENUM(azteclabs::kvdb::lmdb_store::LMDBStoreMessageType)
