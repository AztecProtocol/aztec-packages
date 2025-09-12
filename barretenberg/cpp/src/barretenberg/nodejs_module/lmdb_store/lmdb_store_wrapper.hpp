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
    lmdblib::LMDBCursor::SharedPtr cursor;
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

    void verify_store() const;

    BoolResponse open_database(const OpenDatabaseRequest& req);

    GetResponse get(const GetRequest& req);
    HasResponse has(const HasRequest& req);

    StartCursorResponse start_cursor(const StartCursorRequest& req);
    AdvanceCursorResponse advance_cursor(const AdvanceCursorRequest& req);
    AdvanceCursorCountResponse advance_cursor_count(const AdvanceCursorCountRequest& req);
    BoolResponse close_cursor(const CloseCursorRequest& req);

    BatchResponse batch(const BatchRequest& req);

    StatsResponse get_stats();

    BoolResponse close();

    BoolResponse copy_store(const CopyStoreRequest& req);

    static std::pair<bool, lmdblib::KeyDupValuesVector> _advance_cursor(const lmdblib::LMDBCursor& cursor,
                                                                        bool reverse,
                                                                        uint64_t page_size);

    static std::pair<bool, uint64_t> _advance_cursor_count(const lmdblib::LMDBCursor& cursor,
                                                           bool reverse,
                                                           const lmdblib::Key& end_key);
};

} // namespace bb::nodejs::lmdb_store
