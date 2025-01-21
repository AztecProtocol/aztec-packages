#pragma once

#include "barretenberg/messaging/dispatcher.hpp"
#include "barretenberg/messaging/header.hpp"
#include "barretenberg/nodejs_module/lmdb_store/lmdb_store_message.hpp"
#include "barretenberg/nodejs_module/util/message_processor.hpp"
#include <cstdint>
#include <map>
#include <mutex>
#include <napi.h>

namespace bb::nodejs::lmdb_store {

struct CursorData {
    std::string current;
    bool reverse;
};
/**
 * @brief Manages the interaction between the JavaScript runtime and the LMDB instance.
 */
class LMDBStoreWrapper : public Napi::ObjectWrap<LMDBStoreWrapper> {
  public:
    LMDBStoreWrapper(const Napi::CallbackInfo&);

    /**
     * @brief The only instance method exposed to JavaScript. Takes a msgpack Message and returns a Promise
     */
    Napi::Value call(const Napi::CallbackInfo&);

    static Napi::Function get_class(Napi::Env env);

  private:
    // coarse thread safety for dummy implementation. This will be handled by LMDB
    std::mutex _mutex;

    bb::nodejs::AsyncMessageProcessor _msg_processor;

    std::map<std::string, std::vector<std::byte>> _data;
    std::map<std::string, std::set<std::vector<std::byte>>> _index_data;

    uint64_t _next_cursor = 1;
    std::map<uint64_t, CursorData> _cursors;

    GetResponse get(const KeyRequest& req);
    BoolResponse has(const KeyRequest& req);

    IndexGetResponse index_get(const KeyRequest& req);
    BoolResponse index_has(const EntryRequest& req);
    BoolResponse index_has_key(const KeyRequest& req);

    CursorStartResponse start_cursor(const CursorStartRequest& req);
    CursorAdvanceResponse advance_cursor(const CursorRequest& req);
    BoolResponse close_cursor(const CursorRequest& req);
    IndexCursorAdvanceResponse advance_index_cursor(const CursorRequest& req);

    BoolResponse batch(const BatchRequest& req);
};

} // namespace bb::nodejs::lmdb_store
