#pragma once

#include "lmdblib/lmdb_cursor.hpp"
#include "lmdblib/lmdb_store.hpp"
#include "lmdblib/types.hpp"
#include "messaging/dispatcher.hpp"
#include "messaging/header.hpp"
#include "lmdb_store/lmdb_store_message.hpp"
#include "util/message_processor.hpp"
#include <cstdint>
#include <map>
#include <memory>
#include <mutex>
#include <napi.h>
#include <unordered_map>

namespace azteclabs::kvdb::lmdb_store {

/**
 * @brief A read transaction held open on behalf of the JavaScript side, together with the mutex that serializes
 * access to it. The environment is opened with `MDB_NOTLS`, so a read transaction may move between the libuv worker
 * threads, but it must never be used by two of them at once.
 */
struct ReadTxData {
    lmdblib::LMDBReadTransaction::SharedPtr tx;
    std::shared_ptr<std::mutex> mtx;
};

struct CursorData {
    lmdblib::LMDBCursor::SharedPtr cursor;
    bool reverse;
    // Guards the cursor's read transaction, which may be shared with gets and other cursors
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

    azteclabs::kvdb::AsyncMessageProcessor _msg_processor;

    void verify_store() const;

    /**
     * @brief Returns a copy of the registered read transaction, which keeps it alive even if it is closed concurrently.
     * @throws std::runtime_error if no read transaction with this id is open
     */
    ReadTxData get_read_tx(uint64_t id);

    BoolResponse open_database(const OpenDatabaseRequest& req);

    /**
     * @brief Opens a read transaction that stays open until CLOSE_READ_TX (or CLOSE) and returns its id. It holds one
     * of the environment's reader slots for its whole lifetime and blocks while none is free.
     */
    StartReadTxResponse start_read_tx();

    /**
     * @brief Unregisters a read transaction. Cursors already opened against it keep it alive until they are closed.
     * @return ok is false if no read transaction with this id was open
     */
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

    static bool _set_cursor_start(const lmdblib::LMDBCursor& cursor, lmdblib::Key& key, bool reverse);

    static std::pair<bool, lmdblib::KeyDupValuesVector> _advance_cursor(const lmdblib::LMDBCursor& cursor,
                                                                        bool reverse,
                                                                        uint64_t page_size);

    static std::pair<bool, uint64_t> _advance_cursor_count(const lmdblib::LMDBCursor& cursor,
                                                           bool reverse,
                                                           const lmdblib::Key& end_key);
};

} // namespace azteclabs::kvdb::lmdb_store
