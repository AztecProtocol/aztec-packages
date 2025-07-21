#include "barretenberg/nodejs_module/lmdb_store/lmdb_store_wrapper.hpp"
#include "barretenberg/lmdblib/lmdb_store.hpp"
#include "barretenberg/lmdblib/types.hpp"
#include "barretenberg/nodejs_module/lmdb_store/lmdb_store_message.hpp"
#include "napi.h"
#include <algorithm>
#include <bits/chrono.h>
#include <chrono>
#include <cstdint>
#include <iterator>
#include <memory>
#include <optional>
#include <ratio>
#include <stdexcept>
#include <utility>

using namespace bb::nodejs;
using namespace bb::nodejs::lmdb_store;

const uint64_t DEFAULT_MAP_SIZE = 1024UL * 1024;
const uint64_t DEFAULT_MAX_READERS = 16;
const uint64_t DEFAULT_CURSOR_PAGE_SIZE = 10;

LMDBStoreWrapper::LMDBStoreWrapper(const Napi::CallbackInfo& info)
    : ObjectWrap(info)
{
    Napi::Env env = info.Env();

    size_t data_dir_index = 0;
    std::string data_dir;
    if (info.Length() > data_dir_index && info[data_dir_index].IsString()) {
        data_dir = info[data_dir_index].As<Napi::String>();
    } else {
        throw Napi::TypeError::New(env, "Directory needs to be a string");
    }

    size_t map_size_index = 1;
    uint64_t map_size = DEFAULT_MAP_SIZE;
    if (info.Length() > map_size_index) {
        if (info[map_size_index].IsNumber()) {
            map_size = info[map_size_index].As<Napi::Number>().Uint32Value();
        } else {
            throw Napi::TypeError::New(env, "Map size must be a number or an object");
        }
    }

    size_t max_readers_index = 2;
    uint max_readers = DEFAULT_MAX_READERS;
    if (info.Length() > max_readers_index) {
        if (info[max_readers_index].IsNumber()) {
            max_readers = info[max_readers_index].As<Napi::Number>().Uint32Value();
        } else if (!info[max_readers_index].IsUndefined()) {
            throw Napi::TypeError::New(env, "The number of readers must be a number");
        }
    }

    _store = std::make_unique<lmdblib::LMDBStore>(data_dir, map_size, max_readers, 2);

    _msg_processor.register_handler(LMDBStoreMessageType::OPEN_DATABASE, this, &LMDBStoreWrapper::open_database);

    _msg_processor.register_handler(LMDBStoreMessageType::GET, this, &LMDBStoreWrapper::get);
    _msg_processor.register_handler(LMDBStoreMessageType::HAS, this, &LMDBStoreWrapper::has);

    _msg_processor.register_handler(LMDBStoreMessageType::START_CURSOR, this, &LMDBStoreWrapper::start_cursor);
    _msg_processor.register_handler(LMDBStoreMessageType::ADVANCE_CURSOR, this, &LMDBStoreWrapper::advance_cursor);
    _msg_processor.register_handler(
        LMDBStoreMessageType::ADVANCE_CURSOR_COUNT, this, &LMDBStoreWrapper::advance_cursor_count);
    _msg_processor.register_handler(LMDBStoreMessageType::CLOSE_CURSOR, this, &LMDBStoreWrapper::close_cursor);

    _msg_processor.register_handler(LMDBStoreMessageType::BATCH, this, &LMDBStoreWrapper::batch);

    _msg_processor.register_handler(LMDBStoreMessageType::STATS, this, &LMDBStoreWrapper::get_stats);

    // The close operation requires exclusive execution, no other operations can be run concurrently with it
    _msg_processor.register_handler(LMDBStoreMessageType::CLOSE, this, &LMDBStoreWrapper::close, true);

    _msg_processor.register_handler(LMDBStoreMessageType::COPY_STORE, this, &LMDBStoreWrapper::copy_store, true);
}

Napi::Value LMDBStoreWrapper::call(const Napi::CallbackInfo& info)
{
    return _msg_processor.process_message(info);
}

Napi::Function LMDBStoreWrapper::get_class(Napi::Env env)
{
    return DefineClass(env,
                       "Store",
                       {
                           LMDBStoreWrapper::InstanceMethod("call", &LMDBStoreWrapper::call),
                       });
}

// Simply verify that the store is still valid and that close has not been called
void LMDBStoreWrapper::verify_store() const
{
    if (_store) {
        return;
    }
    throw std::runtime_error(format("LMDB store unavailable, was close already called?"));
}

BoolResponse LMDBStoreWrapper::open_database(const OpenDatabaseRequest& req)
{
    verify_store();
    _store->open_database(req.db, !req.uniqueKeys.value_or(true));
    return { true };
}

GetResponse LMDBStoreWrapper::get(const GetRequest& req)
{
    verify_store();
    lmdblib::OptionalValuesVector vals;
    lmdblib::KeysVector keys = req.keys;
    _store->get(keys, vals, req.db);
    return { vals };
}

HasResponse LMDBStoreWrapper::has(const HasRequest& req)
{
    verify_store();
    std::set<lmdblib::Key> key_set;
    for (const auto& entry : req.entries) {
        key_set.insert(entry.first);
    }

    lmdblib::KeysVector keys(key_set.begin(), key_set.end());
    lmdblib::OptionalValuesVector vals;
    _store->get(keys, vals, req.db);

    std::vector<bool> exists;

    for (const auto& entry : req.entries) {
        const auto& key = entry.first;
        const auto& requested_values = entry.second;

        const auto& key_it = std::find(keys.begin(), keys.end(), key);
        if (key_it == keys.end()) {
            // this shouldn't happen. It means we missed a key when we created the key_set
            exists.push_back(false);
            continue;
        }

        // should be fine to convert this to an index in the array?
        const auto& values = vals[static_cast<size_t>(key_it - keys.begin())];

        if (!values.has_value()) {
            exists.push_back(false);
            continue;
        }

        // client just wanted to know if the key exists
        if (!requested_values.has_value()) {
            exists.push_back(true);
            continue;
        }

        exists.push_back(std::all_of(requested_values->begin(), requested_values->end(), [&](const auto& val) {
            return std::find(values->begin(), values->end(), val) != values->begin();
        }));
    }

    return { exists };
}

StartCursorResponse LMDBStoreWrapper::start_cursor(const StartCursorRequest& req)
{
    verify_store();
    bool reverse = req.reverse.value_or(false);
    uint32_t page_size = req.count.value_or(DEFAULT_CURSOR_PAGE_SIZE);
    bool one_page = req.onePage.value_or(false);
    lmdblib::Key key = req.key;

    auto tx = _store->create_shared_read_transaction();
    lmdblib::LMDBCursor::SharedPtr cursor = _store->create_cursor(tx, req.db);
    bool start_ok = cursor->set_at_key(key);

    if (!start_ok) {
        // we couldn't find exactly the requested key. Find the next biggest one.
        start_ok = cursor->set_at_key_gte(key);
        // if we found a key that's greater _and_ we want to go in reverse order
        // then we're actually outside the requested bounds, we need to go back one position
        if (start_ok && reverse) {
            lmdblib::KeyDupValuesVector entries;
            // read_prev returns `true` if there's nothing more to read
            // turn this into a "not ok" because there's nothing in the db for this cursor to read
            start_ok = !cursor->read_prev(1, entries);
        } else if (!start_ok && reverse) {
            // we couldn't find a key greater than our starting point _and_ we want to go in reverse..
            // then we start at the end of the database (the client requested to start at a key greater than anything in
            // the DB)
            start_ok = cursor->set_at_end();
        }

        // in case we're iterating in ascending order and we can't find the exact key or one that's greater than it
        // then that means theren's nothing in the DB for the cursor to read
    }

    // we couldn't find a starting position
    if (!start_ok) {
        return { std::nullopt, {} };
    }

    auto [done, first_page] = _advance_cursor(*cursor, reverse, page_size);
    // cursor finished after reading a single page or client only wanted the first page
    if (done || one_page) {
        return { std::nullopt, first_page };
    }

    auto cursor_id = cursor->id();
    {
        std::lock_guard<std::mutex> lock(_cursor_mutex);
        _cursors[cursor_id] = { cursor, reverse };
    }

    return { cursor_id, first_page };
}

BoolResponse LMDBStoreWrapper::close_cursor(const CloseCursorRequest& req)
{
    {
        std::lock_guard<std::mutex> lock(_cursor_mutex);
        _cursors.erase(req.cursor);
    }
    return { true };
}

AdvanceCursorResponse LMDBStoreWrapper::advance_cursor(const AdvanceCursorRequest& req)
{
    CursorData data;

    {
        std::lock_guard<std::mutex> lock(_cursor_mutex);
        data = _cursors.at(req.cursor);
    }

    uint32_t page_size = req.count.value_or(DEFAULT_CURSOR_PAGE_SIZE);
    auto [done, entries] = _advance_cursor(*data.cursor, data.reverse, page_size);
    return { entries, done };
}

AdvanceCursorCountResponse LMDBStoreWrapper::advance_cursor_count(const AdvanceCursorCountRequest& req)
{
    CursorData data;

    {
        std::lock_guard<std::mutex> lock(_cursor_mutex);
        data = _cursors.at(req.cursor);
    }

    auto [done, count] = _advance_cursor_count(*data.cursor, data.reverse, req.endKey);
    return { count, done };
}

BatchResponse LMDBStoreWrapper::batch(const BatchRequest& req)
{
    verify_store();
    std::vector<lmdblib::LMDBStore::PutData> batches;
    batches.reserve(req.batches.size());

    for (const auto& data : req.batches) {
        lmdblib::LMDBStore::PutData batch{ data.second.addEntries, data.second.removeEntries, data.first };
        batches.push_back(batch);
    }

    auto start = std::chrono::high_resolution_clock::now();
    _store->put(batches);
    auto end = std::chrono::high_resolution_clock::now();
    std::chrono::duration<uint64_t, std::nano> duration_ns = end - start;

    return { duration_ns.count() };
}

StatsResponse LMDBStoreWrapper::get_stats()
{
    verify_store();
    std::vector<lmdblib::DBStats> stats;
    auto [map_size, physical_file_size] = _store->get_stats(stats);
    return { stats, map_size, physical_file_size };
}

BoolResponse LMDBStoreWrapper::close()
{
    // prevent this store from receiving further messages
    _msg_processor.close();

    {
        // close all of the open read cursors
        std::lock_guard cursors(_cursor_mutex);
        _cursors.clear();
    }

    // and finally close the database handle
    _store.reset(nullptr);

    return { true };
}

BoolResponse LMDBStoreWrapper::copy_store(const CopyStoreRequest& req)
{
    verify_store();
    _store->copy_store(req.dstPath, req.compact.value_or(false));

    return { true };
}

std::pair<bool, bb::lmdblib::KeyDupValuesVector> LMDBStoreWrapper::_advance_cursor(const lmdblib::LMDBCursor& cursor,
                                                                                   bool reverse,
                                                                                   uint64_t page_size)
{
    lmdblib::KeyDupValuesVector entries;
    bool done = reverse ? cursor.read_prev(page_size, entries) : cursor.read_next(page_size, entries);
    return std::make_pair(done, entries);
}

std::pair<bool, uint64_t> LMDBStoreWrapper::_advance_cursor_count(const lmdblib::LMDBCursor& cursor,
                                                                  bool reverse,
                                                                  const lmdblib::Key& end_key)
{
    uint64_t count = 0;
    bool done = reverse ? cursor.count_until_prev(end_key, count) : cursor.count_until_next(end_key, count);
    return std::make_pair(done, count);
}
