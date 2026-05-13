#pragma once
/**
 * @file kvdb_commands.hpp
 * @brief NamedUnion command structs for the aztec-kvdb key-value store API.
 *
 * Same shape as wsdb_commands.hpp / cdb_commands.hpp. Mirrors the message types
 * that used to live in nodejs_module/lmdb_store/lmdb_store_message.hpp, but
 * recast as commands with an execute(KvdbRequest&) method instead of NAPI
 * handler methods.
 */

#include "barretenberg/common/try_catch_shim.hpp" // defines THROW before msgpack-c zone headers
#include "barretenberg/lmdblib/types.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>
#include <map>
#include <optional>
#include <string>
#include <vector>

namespace bb::kvdb {

using namespace bb::lmdblib;

// Forward declaration
struct KvdbRequest;

// ---------------------------------------------------------------------------
// Lifecycle / database management
// ---------------------------------------------------------------------------

struct KvdbOpenDatabase {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbOpenDatabase";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbOpenDatabaseResponse";
        bool ok;
        SERIALIZATION_FIELDS(ok);
        bool operator==(const Response&) const = default;
    };
    std::string db;
    std::optional<bool> uniqueKeys;
    Response execute(KvdbRequest& request) &&;
    SERIALIZATION_FIELDS(db, uniqueKeys);
    bool operator==(const KvdbOpenDatabase&) const = default;
};

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

struct KvdbGet {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbGet";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbGetResponse";
        OptionalValuesVector values;
        SERIALIZATION_FIELDS(values);
        bool operator==(const Response&) const = default;
    };
    KeysVector keys;
    std::string db;
    Response execute(KvdbRequest& request) &&;
    SERIALIZATION_FIELDS(keys, db);
    bool operator==(const KvdbGet&) const = default;
};

struct KvdbHas {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbHas";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbHasResponse";
        std::vector<bool> exists;
        SERIALIZATION_FIELDS(exists);
        bool operator==(const Response&) const = default;
    };
    KeyOptionalValuesVector entries;
    std::string db;
    Response execute(KvdbRequest& request) &&;
    SERIALIZATION_FIELDS(entries, db);
    bool operator==(const KvdbHas&) const = default;
};

// ---------------------------------------------------------------------------
// Cursors
// ---------------------------------------------------------------------------

struct KvdbStartCursor {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbStartCursor";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbStartCursorResponse";
        std::optional<uint64_t> cursor;
        KeyDupValuesVector entries;
        SERIALIZATION_FIELDS(cursor, entries);
        bool operator==(const Response&) const = default;
    };
    Key key;
    std::optional<bool> reverse;
    std::optional<uint32_t> count;
    std::optional<bool> onePage;
    std::string db;
    Response execute(KvdbRequest& request) &&;
    SERIALIZATION_FIELDS(key, reverse, count, onePage, db);
    bool operator==(const KvdbStartCursor&) const = default;
};

struct KvdbAdvanceCursor {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbAdvanceCursor";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbAdvanceCursorResponse";
        KeyDupValuesVector entries;
        bool done;
        SERIALIZATION_FIELDS(entries, done);
        bool operator==(const Response&) const = default;
    };
    uint64_t cursor;
    std::optional<uint32_t> count;
    Response execute(KvdbRequest& request) &&;
    SERIALIZATION_FIELDS(cursor, count);
    bool operator==(const KvdbAdvanceCursor&) const = default;
};

struct KvdbAdvanceCursorCount {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbAdvanceCursorCount";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbAdvanceCursorCountResponse";
        uint64_t count;
        bool done;
        SERIALIZATION_FIELDS(count, done);
        bool operator==(const Response&) const = default;
    };
    uint64_t cursor;
    Key endKey;
    Response execute(KvdbRequest& request) &&;
    SERIALIZATION_FIELDS(cursor, endKey);
    bool operator==(const KvdbAdvanceCursorCount&) const = default;
};

struct KvdbCloseCursor {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbCloseCursor";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbCloseCursorResponse";
        bool ok;
        SERIALIZATION_FIELDS(ok);
        bool operator==(const Response&) const = default;
    };
    uint64_t cursor;
    Response execute(KvdbRequest& request) &&;
    SERIALIZATION_FIELDS(cursor);
    bool operator==(const KvdbCloseCursor&) const = default;
};

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

struct KvdbBatchEntry {
    KeyDupValuesVector addEntries;
    KeyOptionalValuesVector removeEntries;
    SERIALIZATION_FIELDS(addEntries, removeEntries);
    bool operator==(const KvdbBatchEntry&) const = default;
};

struct KvdbBatch {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbBatch";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbBatchResponse";
        uint64_t durationNs;
        SERIALIZATION_FIELDS(durationNs);
        bool operator==(const Response&) const = default;
    };
    std::map<std::string, KvdbBatchEntry> batches;
    Response execute(KvdbRequest& request) &&;
    SERIALIZATION_FIELDS(batches);
    bool operator==(const KvdbBatch&) const = default;
};

// ---------------------------------------------------------------------------
// Stats / maintenance / lifecycle
// ---------------------------------------------------------------------------

struct KvdbStats {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbStats";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbStatsResponse";
        std::vector<DBStats> stats;
        uint64_t dbMapSizeBytes;
        uint64_t dbPhysicalFileSizeBytes;
        SERIALIZATION_FIELDS(stats, dbMapSizeBytes, dbPhysicalFileSizeBytes);
        bool operator==(const Response&) const = default;
    };
    void msgpack(auto&& pack_fn) { pack_fn(); }
    Response execute(KvdbRequest& request) &&;
    bool operator==(const KvdbStats&) const = default;
};

struct KvdbCopyStore {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbCopyStore";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbCopyStoreResponse";
        bool ok;
        SERIALIZATION_FIELDS(ok);
        bool operator==(const Response&) const = default;
    };
    std::string dstPath;
    std::optional<bool> compact;
    Response execute(KvdbRequest& request) &&;
    SERIALIZATION_FIELDS(dstPath, compact);
    bool operator==(const KvdbCopyStore&) const = default;
};

struct KvdbShutdown {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbShutdown";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbShutdownResponse";
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    void msgpack(auto&& pack_fn) { pack_fn(); }
    Response execute(KvdbRequest& request) &&;
    bool operator==(const KvdbShutdown&) const = default;
};

} // namespace bb::kvdb
