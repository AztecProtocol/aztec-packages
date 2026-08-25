#pragma once

#include "barretenberg/lmdblib/lmdb_cursor.hpp"
#include "barretenberg/lmdblib/lmdb_store.hpp"
#include "barretenberg/lmdblib/types.hpp"
#include "barretenberg/messaging/dispatcher.hpp"
#include "barretenberg/messaging/header.hpp"
#include "barretenberg/nodejs_module/lmdb_store/lmdb_store_message.hpp"
#include "barretenberg/nodejs_module/util/message_processor.hpp"
#include <atomic>
#include <cstdint>
#include <map>
#include <memory>
#include <mutex>
#include <napi.h>

namespace bb::nodejs::lmdb_store {

/**
 * @brief A read transaction kept open on behalf of the JavaScript side, together with the mutex that serializes
 * access to it. LMDB read transactions may move between threads (the env is opened with `MDB_NOTLS`) but must never
 * be used by two threads at once, and messages are dispatched onto a pool of libuv workers.
 */
struct ReadTxData {
    lmdblib::LMDBReadTransaction::SharedPtr tx;
    std::shared_ptr<std::mutex> mtx;
};

struct CursorData {
    lmdblib::LMDBCursor::SharedPtr cursor;
    bool reverse;
    // Serializes access to the read transaction backing this cursor, which may be shared with other cursors and gets
    std::shared_ptr<std::mutex> txMtx;
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

    std::mutex _read_tx_mutex;
    std::unordered_map<uint64_t, ReadTxData> _read_txs;
    std::atomic<uint64_t> _next_read_tx_id{ 1 };

    bb::nodejs::AsyncMessageProcessor _msg_processor;

    void verify_store() const;

    // Returns the registered read transaction, throwing if it is unknown (never opened, or already closed)
    ReadTxData get_read_tx(uint64_t id);

    BoolResponse open_database(const OpenDatabaseRequest& req);

    StartReadTxResponse start_read_tx();
    BoolResponse close_read_tx(const CloseReadTxRequest& req);

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
