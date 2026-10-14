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
<<<<<<< HEAD:barretenberg/cpp/src/barretenberg/nodejs_module/lmdb_store/lmdb_store_message.hpp
    SERIALIZATION_FIELDS(keys, db);
=======
    // When set, read through the snapshot of this open read transaction instead of a fresh one
    std::optional<uint64_t> txId;
    MSGPACK_DEFINE_MAP(keys, db, txId);
>>>>>>> aca4d3e946c (feat(kvdb): expose read-only lmdb transactions (#25631)):native-packages/kvdb/cpp/src/lmdb_store/lmdb_store_message.hpp
};

struct GetResponse {
    lmdblib::OptionalValuesVector values;
    SERIALIZATION_FIELDS(values);
};

struct HasRequest {
    // std::map<lmdblib::Key, std::optional<lmdblib::Value>> entries;
    lmdblib::KeyOptionalValuesVector entries;
    std::string db;
<<<<<<< HEAD:barretenberg/cpp/src/barretenberg/nodejs_module/lmdb_store/lmdb_store_message.hpp
    SERIALIZATION_FIELDS(entries, db);
=======
    // When set, check against the snapshot of this open read transaction instead of a fresh one
    std::optional<uint64_t> txId;
    MSGPACK_DEFINE_MAP(entries, db, txId);
>>>>>>> aca4d3e946c (feat(kvdb): expose read-only lmdb transactions (#25631)):native-packages/kvdb/cpp/src/lmdb_store/lmdb_store_message.hpp
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
<<<<<<< HEAD:barretenberg/cpp/src/barretenberg/nodejs_module/lmdb_store/lmdb_store_message.hpp
    SERIALIZATION_FIELDS(key, reverse, count, onePage, db);
=======
    // When set, iterate over the snapshot of this open read transaction instead of a fresh one
    std::optional<uint64_t> txId;
    MSGPACK_DEFINE_MAP(key, reverse, count, onePage, db, txId);
>>>>>>> aca4d3e946c (feat(kvdb): expose read-only lmdb transactions (#25631)):native-packages/kvdb/cpp/src/lmdb_store/lmdb_store_message.hpp
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

<<<<<<< HEAD:barretenberg/cpp/src/barretenberg/nodejs_module/lmdb_store/lmdb_store_message.hpp
} // namespace bb::nodejs::lmdb_store
=======
struct StartReadTxResponse {
    uint64_t txId;
    MSGPACK_DEFINE_MAP(txId);
};

struct CloseReadTxRequest {
    // Optional only so that a request without it is rejected rather than read as an indeterminate id
    std::optional<uint64_t> txId;
    MSGPACK_DEFINE_MAP(txId);
};

} // namespace azteclabs::kvdb::lmdb_store
>>>>>>> aca4d3e946c (feat(kvdb): expose read-only lmdb transactions (#25631)):native-packages/kvdb/cpp/src/lmdb_store/lmdb_store_message.hpp

MSGPACK_ADD_ENUM(bb::nodejs::lmdb_store::LMDBStoreMessageType)
