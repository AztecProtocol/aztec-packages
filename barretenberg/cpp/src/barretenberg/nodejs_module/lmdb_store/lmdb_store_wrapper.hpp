#pragma once

#include "barretenberg/lmdblib/lmdb_cursor.hpp"
#include "barretenberg/lmdblib/lmdb_store.hpp"
#include "barretenberg/lmdblib/types.hpp"
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
    lmdblib::LMDBCursor::Ptr cursor;
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
    std::unique_ptr<lmdblib::LMDBStore> _store;

    std::mutex _cursor_mutex;
    std::unordered_map<uint64_t, CursorData> _cursors;

    bb::nodejs::AsyncMessageProcessor _msg_processor;

    BoolResponse open_database(const OpenDatabaseRequest& req);

    GetResponse get(const GetRequest& req);
    HasResponse has(const HasRequest& req);

    StartCursorResponse start_cursor(const StartCursorRequest& req);
    AdvanceCursorResponse advance_cursor(const AdvanceCursorRequest& req);
    BoolResponse close_cursor(const CloseCursorRequest& req);

    BatchResponse batch(const BatchRequest& req);

    BoolResponse close();
};

} // namespace bb::nodejs::lmdb_store
