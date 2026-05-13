#include "barretenberg/kvdb/kvdb_execute.hpp"
#include "barretenberg/common/try_catch_shim.hpp"

#include <chrono>
#include <utility>

namespace bb::kvdb {

namespace {

constexpr uint32_t DEFAULT_CURSOR_PAGE_SIZE = 10;

std::pair<bool, lmdblib::KeyDupValuesVector> advance_cursor_page(const lmdblib::LMDBCursor& cursor,
                                                                 bool reverse,
                                                                 uint64_t page_size)
{
    lmdblib::KeyDupValuesVector entries;
    bool done = reverse ? cursor.read_prev(page_size, entries) : cursor.read_next(page_size, entries);
    return std::make_pair(done, std::move(entries));
}

std::pair<bool, uint64_t> advance_cursor_count_to_key(const lmdblib::LMDBCursor& cursor,
                                                      bool reverse,
                                                      const lmdblib::Key& end_key)
{
    uint64_t count = 0;
    bool done = reverse ? cursor.count_until_prev(end_key, count) : cursor.count_until_next(end_key, count);
    return std::make_pair(done, count);
}

} // namespace

KvdbOpenDatabase::Response KvdbOpenDatabase::execute(KvdbRequest& request) &&
{
    request.store.open_database(db, !uniqueKeys.value_or(true));
    return { true };
}

KvdbGet::Response KvdbGet::execute(KvdbRequest& request) &&
{
    lmdblib::OptionalValuesVector vals;
    lmdblib::KeysVector keys_in = std::move(keys);
    request.store.get(keys_in, vals, db);
    return { std::move(vals) };
}

KvdbHas::Response KvdbHas::execute(KvdbRequest& request) &&
{
    std::vector<bool> exists;
    request.store.has(entries, exists, db);
    return { std::move(exists) };
}

KvdbStartCursor::Response KvdbStartCursor::execute(KvdbRequest& request) &&
{
    bool reverse_ = reverse.value_or(false);
    uint32_t page_size = count.value_or(DEFAULT_CURSOR_PAGE_SIZE);
    bool one_page = onePage.value_or(false);
    lmdblib::Key key_in = std::move(key);

    auto tx = request.store.create_shared_read_transaction();
    lmdblib::LMDBCursor::SharedPtr cursor = request.store.create_cursor(tx, db);
    bool start_ok = cursor->set_at_key(key_in);

    if (!start_ok) {
        // No exact match: try the next greater key.
        start_ok = cursor->set_at_key_gte(key_in);
        if (start_ok && reverse_) {
            // Found a key greater than the start, but we want descending — step back one.
            lmdblib::KeyDupValuesVector throwaway;
            start_ok = !cursor->read_prev(1, throwaway);
        } else if (!start_ok && reverse_) {
            // Nothing greater exists; descending iteration starts at the end of the DB.
            start_ok = cursor->set_at_end();
        }
        // Ascending with no match-or-greater: nothing to read.
    }

    if (!start_ok) {
        return { std::nullopt, {} };
    }

    auto [done, first_page] = advance_cursor_page(*cursor, reverse_, page_size);
    if (done || one_page) {
        return { std::nullopt, std::move(first_page) };
    }

    auto cursor_id = cursor->id();
    {
        std::lock_guard<std::mutex> lock(request.cursor_mutex);
        request.cursors[cursor_id] = { cursor, reverse_ };
    }
    return { cursor_id, std::move(first_page) };
}

KvdbAdvanceCursor::Response KvdbAdvanceCursor::execute(KvdbRequest& request) &&
{
    CursorData data;
    {
        std::lock_guard<std::mutex> lock(request.cursor_mutex);
        data = request.cursors.at(cursor);
    }
    uint32_t page_size = count.value_or(DEFAULT_CURSOR_PAGE_SIZE);
    auto [done, entries] = advance_cursor_page(*data.cursor, data.reverse, page_size);
    return { std::move(entries), done };
}

KvdbAdvanceCursorCount::Response KvdbAdvanceCursorCount::execute(KvdbRequest& request) &&
{
    CursorData data;
    {
        std::lock_guard<std::mutex> lock(request.cursor_mutex);
        data = request.cursors.at(cursor);
    }
    auto [done, count_to_end] = advance_cursor_count_to_key(*data.cursor, data.reverse, endKey);
    return { count_to_end, done };
}

KvdbCloseCursor::Response KvdbCloseCursor::execute(KvdbRequest& request) &&
{
    {
        std::lock_guard<std::mutex> lock(request.cursor_mutex);
        request.cursors.erase(cursor);
    }
    return { true };
}

KvdbBatch::Response KvdbBatch::execute(KvdbRequest& request) &&
{
    std::vector<lmdblib::LMDBStore::PutData> put_batches;
    put_batches.reserve(batches.size());
    for (const auto& [db_name, entry] : batches) {
        put_batches.push_back(lmdblib::LMDBStore::PutData{ entry.addEntries, entry.removeEntries, db_name });
    }

    auto start = std::chrono::high_resolution_clock::now();
    request.store.put(put_batches);
    auto end = std::chrono::high_resolution_clock::now();
    std::chrono::duration<uint64_t, std::nano> duration_ns = end - start;
    return { duration_ns.count() };
}

KvdbStats::Response KvdbStats::execute(KvdbRequest& request) &&
{
    std::vector<lmdblib::DBStats> stats;
    auto [map_size, physical_file_size] = request.store.get_stats(stats);
    return { std::move(stats), map_size, physical_file_size };
}

KvdbCopyStore::Response KvdbCopyStore::execute(KvdbRequest& request) &&
{
    request.store.copy_store(dstPath, compact.value_or(false));
    return { true };
}

KvdbShutdown::Response KvdbShutdown::execute(KvdbRequest& /*request*/) &&
{
    return {};
}

KvdbCommandResponse kvdb(KvdbRequest& request, KvdbCommand&& command)
{
    return execute(request, std::move(command));
}

} // namespace bb::kvdb
