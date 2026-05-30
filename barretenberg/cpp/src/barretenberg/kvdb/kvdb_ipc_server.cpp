#include "barretenberg/kvdb/kvdb_ipc_server.hpp"

#include "barretenberg/common/try_catch_shim.hpp"
// clang-format off
#include "barretenberg/lmdblib/lmdb_store.hpp"
#include "barretenberg/kvdb/generated/kvdb_types.hpp"
// clang-format on
#include "ipc_runtime/ipc_server.hpp"
#include "ipc_runtime/serve_helper.hpp"
#include "ipc_runtime/signal_handlers.hpp"

#include <chrono>
#include <cstdint>
#include <iostream>
#include <memory>
#include <mutex>
#include <span>
#include <unordered_map>
#include <utility>
#include <vector>

namespace bb::kvdb {

namespace {

constexpr uint32_t DEFAULT_CURSOR_PAGE_SIZE = 10;

struct CursorState {
    lmdblib::LMDBCursor::SharedPtr cursor;
    bool reverse;
};

class KvdbServer {
  public:
    explicit KvdbServer(lmdblib::LMDBStore& store)
        : store_(store)
    {}

    wire::KvdbOpenDatabaseResponse open_database(const wire::KvdbOpenDatabase& req)
    {
        store_.open_database(req.db, !req.uniqueKeys.value_or(true));
        return { true };
    }

    wire::KvdbGetResponse get(const wire::KvdbGet& req)
    {
        lmdblib::OptionalValuesVector vals;
        lmdblib::KeysVector keys = req.keys;
        store_.get(keys, vals, req.db);
        return { std::move(vals) };
    }

    wire::KvdbHasResponse has(const wire::KvdbHas& req)
    {
        std::vector<bool> exists;
        store_.has(key_optional_values_from_wire(req.entries), exists, req.db);
        return { std::move(exists) };
    }

    wire::KvdbStartCursorResponse start_cursor(const wire::KvdbStartCursor& req)
    {
        bool reverse = req.reverse.value_or(false);
        uint32_t page_size = req.count.value_or(DEFAULT_CURSOR_PAGE_SIZE);
        bool one_page = req.onePage.value_or(false);
        lmdblib::Key key = req.key;

        auto tx = store_.create_shared_read_transaction();
        lmdblib::LMDBCursor::SharedPtr cursor = store_.create_cursor(tx, req.db);
        bool start_ok = cursor->set_at_key(key);
        if (!start_ok) {
            start_ok = cursor->set_at_key_gte(key);
            if (start_ok && reverse) {
                lmdblib::KeyDupValuesVector throwaway;
                start_ok = !cursor->read_prev(1, throwaway);
            } else if (!start_ok && reverse) {
                start_ok = cursor->set_at_end();
            }
        }
        if (!start_ok) {
            return { std::nullopt, {} };
        }

        auto [done, first_page] = advance_page(*cursor, reverse, page_size);
        if (done || one_page) {
            return { std::nullopt, key_values_to_wire(first_page) };
        }

        auto cursor_id = cursor->id();
        {
            std::lock_guard<std::mutex> lock(cursor_mutex_);
            cursors_[cursor_id] = { cursor, reverse };
        }
        return { cursor_id, key_values_to_wire(first_page) };
    }

    wire::KvdbAdvanceCursorResponse advance_cursor(const wire::KvdbAdvanceCursor& req)
    {
        CursorState state;
        {
            std::lock_guard<std::mutex> lock(cursor_mutex_);
            state = cursors_.at(req.cursor);
        }
        uint32_t page_size = req.count.value_or(DEFAULT_CURSOR_PAGE_SIZE);
        auto [done, entries] = advance_page(*state.cursor, state.reverse, page_size);
        return { key_values_to_wire(entries), done };
    }

    wire::KvdbAdvanceCursorCountResponse advance_cursor_count(const wire::KvdbAdvanceCursorCount& req)
    {
        CursorState state;
        {
            std::lock_guard<std::mutex> lock(cursor_mutex_);
            state = cursors_.at(req.cursor);
        }
        auto [done, count] = advance_count(*state.cursor, state.reverse, req.endKey);
        return { count, done };
    }

    wire::KvdbCloseCursorResponse close_cursor(const wire::KvdbCloseCursor& req)
    {
        std::lock_guard<std::mutex> lock(cursor_mutex_);
        cursors_.erase(req.cursor);
        return { true };
    }

    wire::KvdbBatchResponse batch(const wire::KvdbBatch& req)
    {
        std::vector<lmdblib::LMDBStore::PutData> put_batches;
        put_batches.reserve(req.batches.size());
        for (const auto& entry : req.batches) {
            put_batches.push_back(lmdblib::LMDBStore::PutData{
                key_values_from_wire(entry.addEntries), key_optional_values_from_wire(entry.removeEntries), entry.db });
        }
        auto start = std::chrono::high_resolution_clock::now();
        store_.put(put_batches);
        auto end = std::chrono::high_resolution_clock::now();
        std::chrono::duration<uint64_t, std::nano> duration_ns = end - start;
        return { duration_ns.count() };
    }

    wire::KvdbStatsResponse get_stats()
    {
        std::vector<lmdblib::DBStats> stats;
        auto [map_size, physical_file_size] = store_.get_stats(stats);
        std::vector<wire::KvdbDbStats> wire_stats;
        wire_stats.reserve(stats.size());
        for (const auto& stat : stats) {
            wire_stats.push_back(
                { .name = stat.name, .numDataItems = stat.numDataItems, .totalUsedSize = stat.totalUsedSize });
        }
        return { std::move(wire_stats), map_size, physical_file_size };
    }

    wire::KvdbCloseResponse close()
    {
        // Drop all cursors so any in-flight reads release their transactions.
        std::lock_guard<std::mutex> lock(cursor_mutex_);
        cursors_.clear();
        return { true };
    }

    wire::KvdbCopyStoreResponse copy_store(const wire::KvdbCopyStore& req)
    {
        store_.copy_store(req.dstPath, req.compact.value_or(false));
        return { true };
    }

    static lmdblib::KeyDupValuesVector key_values_from_wire(const std::vector<wire::KvdbKeyValues>& entries)
    {
        lmdblib::KeyDupValuesVector result;
        result.reserve(entries.size());
        for (const auto& entry : entries) {
            result.emplace_back(entry.key, entry.values);
        }
        return result;
    }

    static std::vector<wire::KvdbKeyValues> key_values_to_wire(const lmdblib::KeyDupValuesVector& entries)
    {
        std::vector<wire::KvdbKeyValues> result;
        result.reserve(entries.size());
        for (const auto& [key, values] : entries) {
            result.push_back({ .key = key, .values = values });
        }
        return result;
    }

    static lmdblib::KeyOptionalValuesVector key_optional_values_from_wire(
        const std::vector<wire::KvdbKeyOptionalValues>& entries)
    {
        lmdblib::KeyOptionalValuesVector result;
        result.reserve(entries.size());
        for (const auto& entry : entries) {
            result.emplace_back(entry.key, entry.values);
        }
        return result;
    }

    static std::pair<bool, lmdblib::KeyDupValuesVector> advance_page(const lmdblib::LMDBCursor& cursor,
                                                                     bool reverse,
                                                                     uint64_t page_size)
    {
        lmdblib::KeyDupValuesVector entries;
        bool done = reverse ? cursor.read_prev(page_size, entries) : cursor.read_next(page_size, entries);
        return std::make_pair(done, std::move(entries));
    }

    static std::pair<bool, uint64_t> advance_count(const lmdblib::LMDBCursor& cursor,
                                                   bool reverse,
                                                   const lmdblib::Key& end_key)
    {
        uint64_t count = 0;
        bool done = reverse ? cursor.count_until_prev(end_key, count) : cursor.count_until_next(end_key, count);
        return std::make_pair(done, count);
    }

  private:
    lmdblib::LMDBStore& store_;
    std::mutex cursor_mutex_;
    std::unordered_map<uint64_t, CursorState> cursors_;
};

} // namespace

wire::KvdbOpenDatabaseResponse handle_open_database(KvdbServer& ctx, wire::KvdbOpenDatabase&& cmd);
wire::KvdbGetResponse handle_get(KvdbServer& ctx, wire::KvdbGet&& cmd);
wire::KvdbHasResponse handle_has(KvdbServer& ctx, wire::KvdbHas&& cmd);
wire::KvdbStartCursorResponse handle_start_cursor(KvdbServer& ctx, wire::KvdbStartCursor&& cmd);
wire::KvdbAdvanceCursorResponse handle_advance_cursor(KvdbServer& ctx, wire::KvdbAdvanceCursor&& cmd);
wire::KvdbAdvanceCursorCountResponse handle_advance_cursor_count(KvdbServer& ctx, wire::KvdbAdvanceCursorCount&& cmd);
wire::KvdbCloseCursorResponse handle_close_cursor(KvdbServer& ctx, wire::KvdbCloseCursor&& cmd);
wire::KvdbBatchResponse handle_batch(KvdbServer& ctx, wire::KvdbBatch&& cmd);
wire::KvdbStatsResponse handle_stats(KvdbServer& ctx, wire::KvdbStats&&);
wire::KvdbCloseResponse handle_close(KvdbServer& ctx, wire::KvdbClose&&);
wire::KvdbCopyStoreResponse handle_copy_store(KvdbServer& ctx, wire::KvdbCopyStore&& cmd);

} // namespace bb::kvdb

#include "barretenberg/kvdb/generated/kvdb_ipc_server.hpp"

namespace bb::kvdb {

wire::KvdbOpenDatabaseResponse handle_open_database(KvdbServer& ctx, wire::KvdbOpenDatabase&& cmd)
{
    return ctx.open_database(cmd);
}

wire::KvdbGetResponse handle_get(KvdbServer& ctx, wire::KvdbGet&& cmd)
{
    return ctx.get(cmd);
}

wire::KvdbHasResponse handle_has(KvdbServer& ctx, wire::KvdbHas&& cmd)
{
    return ctx.has(cmd);
}

wire::KvdbStartCursorResponse handle_start_cursor(KvdbServer& ctx, wire::KvdbStartCursor&& cmd)
{
    return ctx.start_cursor(cmd);
}

wire::KvdbAdvanceCursorResponse handle_advance_cursor(KvdbServer& ctx, wire::KvdbAdvanceCursor&& cmd)
{
    return ctx.advance_cursor(cmd);
}

wire::KvdbAdvanceCursorCountResponse handle_advance_cursor_count(KvdbServer& ctx, wire::KvdbAdvanceCursorCount&& cmd)
{
    return ctx.advance_cursor_count(cmd);
}

wire::KvdbCloseCursorResponse handle_close_cursor(KvdbServer& ctx, wire::KvdbCloseCursor&& cmd)
{
    return ctx.close_cursor(cmd);
}

wire::KvdbBatchResponse handle_batch(KvdbServer& ctx, wire::KvdbBatch&& cmd)
{
    return ctx.batch(cmd);
}

wire::KvdbStatsResponse handle_stats(KvdbServer& ctx, wire::KvdbStats&&)
{
    return ctx.get_stats();
}

wire::KvdbCloseResponse handle_close(KvdbServer& ctx, wire::KvdbClose&&)
{
    return ctx.close();
}

wire::KvdbCopyStoreResponse handle_copy_store(KvdbServer& ctx, wire::KvdbCopyStore&& cmd)
{
    return ctx.copy_store(cmd);
}

int execute_kvdb_server(const std::string& input_path,
                        const std::string& data_dir,
                        uint64_t map_size_bytes,
                        uint32_t max_readers,
                        size_t request_ring_size,
                        size_t response_ring_size)
{
    // Match the legacy NAPI wrapper's defaults (max_readers=16, kMaxDbs=2).
    auto store = std::make_unique<lmdblib::LMDBStore>(data_dir, map_size_bytes, max_readers, 2);
    KvdbServer kvdb_server(*store);

    ipc::ServerOptions opts;
    opts.max_shm_clients = 1;
    opts.shm_request_ring_size = request_ring_size;
    opts.shm_response_ring_size = response_ring_size;
    auto server = ipc::make_server(input_path, opts);
    if (!server) {
        std::cerr << "Error: --input path must end with .sock or .shm: " << input_path << '\n';
        return 1;
    }

    std::cerr << "aztec-kvdb listening on " << input_path << '\n';
    ipc::install_default_signal_handlers(*server);

    if (!server->listen()) {
        std::cerr << "Error: Could not start IPC server" << '\n';
        return 1;
    }
    std::cerr << "aztec-kvdb IPC server ready" << '\n';

    auto handler = make_kvdb_handler(kvdb_server);
    server->run([&handler](int /*client_id*/, std::span<const uint8_t> raw_request) -> std::vector<uint8_t> {
        return handler(std::vector<uint8_t>(raw_request.begin(), raw_request.end()));
    });

    server->close();
    return 0;
}

} // namespace bb::kvdb
