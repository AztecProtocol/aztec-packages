#include "barretenberg/nodejs_module/lmdb_store/lmdb_store_wrapper.hpp"
#include "barretenberg/nodejs_module/lmdb_store/lmdb_store_message.hpp"
#include "napi.h"
#include <iterator>
#include <stdexcept>

using namespace bb::nodejs;
using namespace bb::nodejs::lmdb_store;

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

    _msg_processor.register_handler(LMDBStoreMessageType::GET, this, &LMDBStoreWrapper::get);
    _msg_processor.register_handler(LMDBStoreMessageType::HAS, this, &LMDBStoreWrapper::has);
    _msg_processor.register_handler(LMDBStoreMessageType::BATCH, this, &LMDBStoreWrapper::batch);

    _msg_processor.register_handler(LMDBStoreMessageType::CURSOR_START, this, &LMDBStoreWrapper::start_cursor);
    _msg_processor.register_handler(LMDBStoreMessageType::CURSOR_ADVANCE, this, &LMDBStoreWrapper::advance_cursor);
    _msg_processor.register_handler(LMDBStoreMessageType::CURSOR_CLOSE, this, &LMDBStoreWrapper::close_cursor);

    _msg_processor.register_handler(LMDBStoreMessageType::INDEX_GET, this, &LMDBStoreWrapper::index_get);
    _msg_processor.register_handler(LMDBStoreMessageType::INDEX_HAS, this, &LMDBStoreWrapper::index_has);
    _msg_processor.register_handler(LMDBStoreMessageType::INDEX_HAS_KEY, this, &LMDBStoreWrapper::index_has_key);

    _msg_processor.register_handler(
        LMDBStoreMessageType::INDEX_CURSOR_ADVANCE, this, &LMDBStoreWrapper::advance_index_cursor);
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

GetResponse LMDBStoreWrapper::get(const KeyRequest& req)
{
    std::lock_guard<std::mutex> lock(_mutex);
    auto it = _data.find(req.key);
    if (it == _data.end()) {
        return { std::nullopt };
    }
    return { (*it).second };
}

BoolResponse LMDBStoreWrapper::has(const KeyRequest& req)
{
    std::lock_guard<std::mutex> lock(_mutex);
    auto key_it = _data.find(req.key);
    return { key_it != _data.end() };
}

CursorStartResponse LMDBStoreWrapper::start_cursor(const CursorStartRequest& req)
{
    std::lock_guard<std::mutex> lock(_mutex);
    uint64_t cursor = _next_cursor++;
    _cursors[cursor] = { req.key, req.reverse.value_or(false) };
    return { cursor };
}

BoolResponse LMDBStoreWrapper::close_cursor(const CursorRequest& req)
{
    std::lock_guard<std::mutex> lock(_mutex);
    _cursors.erase(req.cursor);
    return { true };
}

CursorAdvanceResponse LMDBStoreWrapper::advance_cursor(const CursorRequest& req)
{
    std::lock_guard<std::mutex> lock(_mutex);
    auto it = _cursors.find(req.cursor);
    if (it == _cursors.end()) {
        throw std::runtime_error("Cursor does not exist");
    }

    auto& cursor = (*it).second;

    std::string key = cursor.current;
    auto data_it = _data.find(key);
    if (data_it == _data.end()) {
        throw std::runtime_error("Data does not exist");
    }
    std::vector<std::byte> value = (*data_it).second;
    bool done = false;

    std::string next;
    if (cursor.reverse) {
        data_it--;
    } else {
        data_it++;
    }

    // if we're after the end or after decrementing we're on the same key
    if (data_it == _data.end() || (*data_it).first == key) {
        done = true;
    } else {
        next = (*data_it).first;
    }

    cursor.current = next;

    return { key, value, done };
}

IndexGetResponse LMDBStoreWrapper::index_get(const KeyRequest& req)
{
    std::lock_guard<std::mutex> lock(_mutex);
    std::vector<std::vector<std::byte>> values;
    std::copy(_index_data[req.key].begin(), _index_data[req.key].end(), std::back_inserter(values));
    return { values };
}

BoolResponse LMDBStoreWrapper::index_has(const EntryRequest& req)
{
    std::lock_guard<std::mutex> lock(_mutex);
    auto key_it = _index_data.find(req.key);
    if (key_it == _index_data.end()) {
        return { false };
    }

    auto& values = (*key_it).second;
    auto value_it = values.find(req.value);
    return { value_it != values.end() };
}

BoolResponse LMDBStoreWrapper::index_has_key(const KeyRequest& req)
{
    std::lock_guard<std::mutex> lock(_mutex);
    auto key_it = _index_data.find(req.key);
    return { key_it != _index_data.end() };
}

IndexCursorAdvanceResponse LMDBStoreWrapper::advance_index_cursor(const CursorRequest& req)
{
    std::lock_guard<std::mutex> lock(_mutex);
    auto it = _cursors.find(req.cursor);
    if (it == _cursors.end()) {
        throw std::runtime_error("Cursor does not exist");
    }

    auto& cursor = (*it).second;

    std::string key = cursor.current;
    auto data_it = _index_data.find(key);
    if (data_it == _index_data.end()) {
        throw std::runtime_error("Data does not exist");
    }
    std::vector<std::vector<std::byte>> values;
    std::copy((*data_it).second.begin(), (*data_it).second.end(), std::back_inserter(values));
    bool done = false;

    std::string next;
    if (cursor.reverse) {
        data_it--;
    } else {
        data_it++;
    }

    // if we're after the end or after decrementing we're on the same key
    if (data_it == _index_data.end() || (*data_it).first == key) {
        done = true;
    } else {
        next = (*data_it).first;
    }

    cursor.current = next;

    return { key, values, done };
}

BoolResponse LMDBStoreWrapper::batch(const BatchRequest& req)
{
    std::lock_guard<std::mutex> lock(_mutex);

    for (const auto& op : req.set) {
        _data[op.first] = op.second;
    }

    for (const auto& key : req.remove) {
        _data.erase(key);
    }

    for (const auto& op : req.setIndex) {
        _index_data[op.first].clear();
        _index_data[op.first].insert(op.second.begin(), op.second.end());
    }

    for (const auto& op : req.addIndex) {
        _index_data[op.first].insert(op.second.begin(), op.second.end());
    }

    for (const auto& op : req.removeIndex) {
        auto& values = _index_data[op.first];
        for (const auto& val : op.second) {
            values.erase(val);
        }
    }

    for (const auto& key : req.resetIndex) {
        _index_data.erase(key);
    }

    return { true };
}
