#pragma once
/**
 * @file kvdb_execute.hpp
 * @brief KvdbCommand NamedUnion, KvdbRequest context, and dispatch function.
 */

// THROW macro must be visible before msgpack-c's zone headers are pulled in via named_union.hpp.
#include "barretenberg/common/try_catch_shim.hpp"

#include "barretenberg/common/named_union.hpp"
#include "barretenberg/kvdb/kvdb_commands.hpp"
#include "barretenberg/lmdblib/lmdb_cursor.hpp"
#include "barretenberg/lmdblib/lmdb_store.hpp"

#include <cstdint>
#include <memory>
#include <mutex>
#include <unordered_map>

namespace bb::kvdb {

/**
 * @brief Tracks an open cursor and its direction so subsequent advance() calls
 *        page through the entries in the right order. Same shape as the
 *        NAPI LMDBStoreWrapper's internal CursorData.
 */
struct CursorData {
    lmdblib::LMDBCursor::SharedPtr cursor;
    bool reverse;
};

/**
 * @brief Context passed to each command's execute() method. Owns the LMDB store
 *        and the open-cursor table; the IPC server passes a single instance to
 *        every dispatched command.
 */
struct KvdbRequest {
    lmdblib::LMDBStore& store;
    std::mutex& cursor_mutex;
    std::unordered_map<uint64_t, CursorData>& cursors;
};

/**
 * @brief Error response returned when a command throws.
 */
struct KvdbErrorResponse {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "KvdbErrorResponse";
    std::string message;
    SERIALIZATION_FIELDS(message);
    bool operator==(const KvdbErrorResponse&) const = default;
};

/** Union of all kvdb commands (request types). */
using KvdbCommand = NamedUnion<KvdbOpenDatabase,
                               KvdbGet,
                               KvdbHas,
                               KvdbStartCursor,
                               KvdbAdvanceCursor,
                               KvdbAdvanceCursorCount,
                               KvdbCloseCursor,
                               KvdbBatch,
                               KvdbStats,
                               KvdbCopyStore,
                               KvdbShutdown>;

/** Union of all kvdb response types. */
using KvdbCommandResponse = NamedUnion<KvdbErrorResponse,
                                       KvdbOpenDatabase::Response,
                                       KvdbGet::Response,
                                       KvdbHas::Response,
                                       KvdbStartCursor::Response,
                                       KvdbAdvanceCursor::Response,
                                       KvdbAdvanceCursorCount::Response,
                                       KvdbCloseCursor::Response,
                                       KvdbBatch::Response,
                                       KvdbStats::Response,
                                       KvdbCopyStore::Response,
                                       KvdbShutdown::Response>;

/** Execute a kvdb command using the visitor pattern. */
inline KvdbCommandResponse execute(KvdbRequest& request, KvdbCommand&& command)
{
    return std::move(command).visit([&request](auto&& cmd) -> KvdbCommandResponse {
        using CmdType = std::decay_t<decltype(cmd)>;
        return std::forward<CmdType>(cmd).execute(request);
    });
}

/** Top-level kvdb API entry point. */
KvdbCommandResponse kvdb(KvdbRequest& request, KvdbCommand&& command);

} // namespace bb::kvdb
