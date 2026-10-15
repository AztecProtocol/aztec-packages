#pragma once
#include "barretenberg/lmdblib/types.hpp"
#include "barretenberg/messaging/header.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl/concepts.hpp"
#include "msgpack/adaptor/define_decl.hpp"
#include <algorithm>
#include <concepts>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>

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
    // When set, read through the snapshot of this open read transaction instead of a fresh one
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
    // When set, check against the snapshot of this open read transaction instead of a fresh one
    std::optional<uint64_t> txId;
    SERIALIZATION_FIELDS(entries, db, txId);
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
    // When set, iterate over the snapshot of this open read transaction instead of a fresh one
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
    uint64_t txId;
    SERIALIZATION_FIELDS(txId);
};

struct CloseReadTxRequest {
    // Optional only so that a request without it is rejected rather than read as an indeterminate id
    std::optional<uint64_t> txId;
    SERIALIZATION_FIELDS(txId);
};

} // namespace bb::nodejs::lmdb_store

MSGPACK_ADD_ENUM(bb::nodejs::lmdb_store::LMDBStoreMessageType)

namespace bb::nodejs::lmdb_store {

/**
 * @brief Requests with an optional `txId` field. Clients that do not use read transactions omit `txId` from the map
 * entirely, but barretenberg's msgpack `define_map` rejects any missing key, so these requests get the dedicated
 * adaptor below that reads a missing `txId` as nil.
 */
template <typename T>
concept OptionalTxIdRequest = msgpack_concepts::HasMsgPack<T> && requires(T t) {
    { t.txId } -> std::same_as<std::optional<uint64_t>&>;
};

} // namespace bb::nodejs::lmdb_store

namespace msgpack::adaptor {

template <bb::nodejs::lmdb_store::OptionalTxIdRequest T> struct convert<T> {
    msgpack::object const& operator()(msgpack::object const& o, T& v) const
    {
        constexpr std::string_view tx_id_key = "txId";
        msgpack::zone zone;
        msgpack::object source = o;
        if (o.type == msgpack::type::MAP) {
            const msgpack::object_map& map = o.via.map;
            bool has_tx_id = false;
            for (uint32_t i = 0; i < map.size; ++i) {
                const msgpack::object& key = map.ptr[i].key;
                if (key.type == msgpack::type::STR &&
                    std::string_view(key.via.str.ptr, key.via.str.size) == tx_id_key) {
                    has_tx_id = true;
                    break;
                }
            }
            if (!has_tx_id) {
                auto* entries = static_cast<msgpack::object_kv*>(zone.allocate_align(
                    sizeof(msgpack::object_kv) * (map.size + 1), MSGPACK_ZONE_ALIGNOF(msgpack::object_kv)));
                std::copy(map.ptr, map.ptr + map.size, entries);
                entries[map.size].key = msgpack::object(tx_id_key.data(), zone);
                entries[map.size].val = msgpack::object();
                source.via.map.ptr = entries;
                source.via.map.size = map.size + 1;
            }
        }
        v.msgpack(
            [&](auto&... args) { msgpack::type::define_map<decltype(args)...>{ args... }.msgpack_unpack(source); });
        return o;
    }
};

} // namespace msgpack::adaptor
