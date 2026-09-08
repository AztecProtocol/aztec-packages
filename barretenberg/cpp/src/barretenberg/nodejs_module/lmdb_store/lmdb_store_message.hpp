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
    SERIALIZATION_FIELDS(db, uniqueKeys);
};

struct GetRequest {
    lmdblib::KeysVector keys;
    std::string db;
    // When set, read against the snapshot of the read transaction with this id instead of opening a fresh one
    std::optional<uint64_t> txId;
    SERIALIZATION_FIELDS(keys, db, txId);
};

struct GetResponse {
    lmdblib::OptionalValuesVector values;
    SERIALIZATION_FIELDS(values);
};

struct HasRequest {
    // std::map<lmdblib::Key, std::optional<lmdblib::Value>> entries;
    lmdblib::KeyOptionalValuesVector entries;
    std::string db;
    SERIALIZATION_FIELDS(entries, db);
};

struct HasResponse {
    // std::map<lmdblib::Key, bool> exists;
    std::vector<bool> exists;
    SERIALIZATION_FIELDS(exists);
};

struct Batch {
    lmdblib::KeyDupValuesVector addEntries;
    lmdblib::KeyOptionalValuesVector removeEntries;

    SERIALIZATION_FIELDS(addEntries, removeEntries);
};

struct BatchRequest {
    std::map<std::string, Batch> batches;
    SERIALIZATION_FIELDS(batches);
};

struct StartCursorRequest {
    lmdblib::Key key;
    std::optional<bool> reverse;
    std::optional<uint32_t> count;
    std::optional<bool> onePage;
    std::string db;
    // When set, iterate against the snapshot of the read transaction with this id instead of opening a fresh one
    std::optional<uint64_t> txId;
    SERIALIZATION_FIELDS(key, reverse, count, onePage, db, txId);
};

struct StartCursorResponse {
    std::optional<uint64_t> cursor;
    lmdblib::KeyDupValuesVector entries;
    SERIALIZATION_FIELDS(cursor, entries);
};

struct AdvanceCursorRequest {
    uint64_t cursor;
    std::optional<uint32_t> count;
    SERIALIZATION_FIELDS(cursor, count);
};

struct AdvanceCursorCountRequest {
    uint64_t cursor;
    lmdblib::Key endKey;
    SERIALIZATION_FIELDS(cursor, endKey);
};

struct CloseCursorRequest {
    uint64_t cursor;
    SERIALIZATION_FIELDS(cursor);
};

struct AdvanceCursorResponse {
    lmdblib::KeyDupValuesVector entries;
    bool done;
    SERIALIZATION_FIELDS(entries, done);
};

struct AdvanceCursorCountResponse {
    uint64_t count;
    bool done;
    SERIALIZATION_FIELDS(count, done);
};

struct BoolResponse {
    bool ok;
    SERIALIZATION_FIELDS(ok);
};

struct BatchResponse {
    uint64_t durationNs;
    SERIALIZATION_FIELDS(durationNs);
};

struct StatsResponse {
    std::vector<lmdblib::DBStats> stats;
    uint64_t dbMapSizeBytes;
    uint64_t dbPhysicalFileSizeBytes;
    SERIALIZATION_FIELDS(stats, dbMapSizeBytes, dbPhysicalFileSizeBytes);
};

struct CopyStoreRequest {
    std::string dstPath;
    std::optional<bool> compact;
    SERIALIZATION_FIELDS(dstPath, compact);
};

struct StartReadTxResponse {
    uint64_t tx;
    SERIALIZATION_FIELDS(tx);
};

struct CloseReadTxRequest {
    uint64_t tx;
    SERIALIZATION_FIELDS(tx);
};

} // namespace bb::nodejs::lmdb_store

MSGPACK_ADD_ENUM(bb::nodejs::lmdb_store::LMDBStoreMessageType)
