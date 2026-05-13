#include "barretenberg/kvdb/kvdb_ipc_server.hpp"

#include "barretenberg/common/try_catch_shim.hpp"
#include "barretenberg/ipc/ipc_server.hpp"
#include "barretenberg/kvdb/kvdb_messages.hpp"
#include "barretenberg/lmdblib/lmdb_store.hpp"
#include "barretenberg/messaging/dispatcher.hpp"
#include "barretenberg/messaging/header.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"

#include <chrono>
#include <csignal>
#include <cstdint>
#include <iostream>
#include <memory>
#include <mutex>
#include <span>
#include <thread>
#include <unistd.h>
#include <unordered_map>
#include <utility>
#include <vector>

#ifdef __linux__
#include <sys/prctl.h>
#elif defined(__APPLE__)
#include <sys/event.h>
#endif

namespace bb::kvdb {

namespace {

constexpr uint32_t DEFAULT_CURSOR_PAGE_SIZE = 10;

// Mirror wsdb's parent-death-monitoring: when the TS host dies, this child
// gets SIGTERM (Linux prctl) / kqueue NOTE_EXIT (macOS) and exits.
void setup_parent_death_monitoring()
{
#ifdef __linux__
    if (prctl(PR_SET_PDEATHSIG, SIGTERM) == -1) {
        std::cerr << "Warning: Could not set parent death signal" << '\n';
    }
#elif defined(__APPLE__)
    pid_t parent_pid = getppid();
    std::thread([parent_pid]() {
        int kq = kqueue();
        if (kq == -1) {
            std::cerr << "Warning: Could not create kqueue for parent monitoring" << '\n';
            return;
        }
        struct kevent change;
        EV_SET(&change, parent_pid, EVFILT_PROC, EV_ADD | EV_ENABLE, NOTE_EXIT, 0, nullptr);
        if (kevent(kq, &change, 1, nullptr, 0, nullptr) == -1) {
            std::cerr << "Warning: Could not monitor parent process" << '\n';
            close(kq);
            return;
        }
        struct kevent event;
        kevent(kq, nullptr, 0, &event, 1, nullptr);
        std::cerr << "Parent process exited, shutting down..." << '\n';
        close(kq);
        std::exit(0);
    }).detach();
#endif
}

struct CursorState {
    lmdblib::LMDBCursor::SharedPtr cursor;
    bool reverse;
};

class KvdbServer {
  public:
    KvdbServer(lmdblib::LMDBStore& store)
        : store_(store)
    {
        register_handler<OpenDatabaseRequest, BoolResponse>(
            OPEN_DATABASE, [this](const OpenDatabaseRequest& req) { return open_database(req); });
        register_handler<GetRequest, GetResponse>(GET, [this](const GetRequest& req) { return get(req); });
        register_handler<HasRequest, HasResponse>(HAS, [this](const HasRequest& req) { return has(req); });
        register_handler<StartCursorRequest, StartCursorResponse>(
            START_CURSOR, [this](const StartCursorRequest& req) { return start_cursor(req); });
        register_handler<AdvanceCursorRequest, AdvanceCursorResponse>(
            ADVANCE_CURSOR, [this](const AdvanceCursorRequest& req) { return advance_cursor(req); });
        register_handler<AdvanceCursorCountRequest, AdvanceCursorCountResponse>(
            ADVANCE_CURSOR_COUNT, [this](const AdvanceCursorCountRequest& req) { return advance_cursor_count(req); });
        register_handler<CloseCursorRequest, BoolResponse>(
            CLOSE_CURSOR, [this](const CloseCursorRequest& req) { return close_cursor(req); });
        register_handler<BatchRequest, BatchResponse>(BATCH, [this](const BatchRequest& req) { return batch(req); });
        register_no_arg_handler<StatsResponse>(STATS, [this]() { return get_stats(); });
        register_no_arg_handler<BoolResponse>(CLOSE, [this]() { return close(); }, /*unique=*/true);
        register_handler<CopyStoreRequest, BoolResponse>(
            COPY_STORE, [this](const CopyStoreRequest& req) { return copy_store(req); }, /*unique=*/true);
    }

    std::vector<uint8_t> dispatch(std::span<const uint8_t> raw_request)
    {
        auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(raw_request.data()), raw_request.size());
        auto obj = unpacked.get();
        msgpack::sbuffer response_buffer;
        dispatcher_.on_new_data(obj, response_buffer);
        return std::vector<uint8_t>(response_buffer.data(), response_buffer.data() + response_buffer.size());
    }

  private:
    lmdblib::LMDBStore& store_;
    bb::messaging::MessageDispatcher dispatcher_;
    std::mutex cursor_mutex_;
    std::unordered_map<uint64_t, CursorState> cursors_;

    template <typename Req, typename Resp> void register_handler(uint32_t msg_type, auto handler, bool unique = false)
    {
        dispatcher_.register_target(
            msg_type,
            [msg_type, handler](msgpack::object& obj, msgpack::sbuffer& buffer) {
                bb::messaging::TypedMessage<Req> req_msg;
                obj.convert(req_msg);
                Resp resp = handler(req_msg.value);
                bb::messaging::MsgHeader header(req_msg.header.messageId);
                bb::messaging::TypedMessage<Resp> resp_msg(msg_type, header, resp);
                msgpack::pack(buffer, resp_msg);
                return true;
            },
            unique);
    }

    template <typename Resp> void register_no_arg_handler(uint32_t msg_type, auto handler, bool unique = false)
    {
        dispatcher_.register_target(
            msg_type,
            [msg_type, handler](msgpack::object& obj, msgpack::sbuffer& buffer) {
                bb::messaging::HeaderOnlyMessage req_msg;
                obj.convert(req_msg);
                Resp resp = handler();
                bb::messaging::MsgHeader header(req_msg.header.messageId);
                bb::messaging::TypedMessage<Resp> resp_msg(msg_type, header, resp);
                msgpack::pack(buffer, resp_msg);
                return true;
            },
            unique);
    }

    BoolResponse open_database(const OpenDatabaseRequest& req)
    {
        store_.open_database(req.db, !req.uniqueKeys.value_or(true));
        return { true };
    }

    GetResponse get(const GetRequest& req)
    {
        lmdblib::OptionalValuesVector vals;
        lmdblib::KeysVector keys = req.keys;
        store_.get(keys, vals, req.db);
        return { std::move(vals) };
    }

    HasResponse has(const HasRequest& req)
    {
        std::vector<bool> exists;
        store_.has(req.entries, exists, req.db);
        return { std::move(exists) };
    }

    StartCursorResponse start_cursor(const StartCursorRequest& req)
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
            return { std::nullopt, std::move(first_page) };
        }

        auto cursor_id = cursor->id();
        {
            std::lock_guard<std::mutex> lock(cursor_mutex_);
            cursors_[cursor_id] = { cursor, reverse };
        }
        return { cursor_id, std::move(first_page) };
    }

    AdvanceCursorResponse advance_cursor(const AdvanceCursorRequest& req)
    {
        CursorState state;
        {
            std::lock_guard<std::mutex> lock(cursor_mutex_);
            state = cursors_.at(req.cursor);
        }
        uint32_t page_size = req.count.value_or(DEFAULT_CURSOR_PAGE_SIZE);
        auto [done, entries] = advance_page(*state.cursor, state.reverse, page_size);
        return { std::move(entries), done };
    }

    AdvanceCursorCountResponse advance_cursor_count(const AdvanceCursorCountRequest& req)
    {
        CursorState state;
        {
            std::lock_guard<std::mutex> lock(cursor_mutex_);
            state = cursors_.at(req.cursor);
        }
        auto [done, count] = advance_count(*state.cursor, state.reverse, req.endKey);
        return { count, done };
    }

    BoolResponse close_cursor(const CloseCursorRequest& req)
    {
        std::lock_guard<std::mutex> lock(cursor_mutex_);
        cursors_.erase(req.cursor);
        return { true };
    }

    BatchResponse batch(const BatchRequest& req)
    {
        std::vector<lmdblib::LMDBStore::PutData> put_batches;
        put_batches.reserve(req.batches.size());
        for (const auto& [db_name, entry] : req.batches) {
            put_batches.push_back(lmdblib::LMDBStore::PutData{ entry.addEntries, entry.removeEntries, db_name });
        }
        auto start = std::chrono::high_resolution_clock::now();
        store_.put(put_batches);
        auto end = std::chrono::high_resolution_clock::now();
        std::chrono::duration<uint64_t, std::nano> duration_ns = end - start;
        return { duration_ns.count() };
    }

    StatsResponse get_stats()
    {
        std::vector<lmdblib::DBStats> stats;
        auto [map_size, physical_file_size] = store_.get_stats(stats);
        return { std::move(stats), map_size, physical_file_size };
    }

    BoolResponse close()
    {
        // Drop all cursors so any in-flight reads release their transactions.
        std::lock_guard<std::mutex> lock(cursor_mutex_);
        cursors_.clear();
        return { true };
    }

    BoolResponse copy_store(const CopyStoreRequest& req)
    {
        store_.copy_store(req.dstPath, req.compact.value_or(false));
        return { true };
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
};

} // namespace

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

    std::unique_ptr<ipc::IpcServer> server;
    if (input_path.size() >= 4 && input_path.substr(input_path.size() - 4) == ".shm") {
        std::string base_name = input_path.substr(0, input_path.size() - 4);
        constexpr size_t MAX_SHM_CLIENTS = 1; // One TS client per kvdb subprocess.
        server = ipc::IpcServer::create_mpsc_shm(base_name, MAX_SHM_CLIENTS, request_ring_size, response_ring_size);
        std::cerr << "MPSC shared memory server at " << base_name << '\n';
    } else if (input_path.size() >= 5 && input_path.substr(input_path.size() - 5) == ".sock") {
        server = ipc::IpcServer::create_socket(input_path, 1);
        std::cerr << "Socket server at " << input_path << '\n';
    } else {
        std::cerr << "Error: --input path must end with .sock or .shm" << '\n';
        return 1;
    }

    static ipc::IpcServer* global_server = server.get();

    auto graceful_shutdown_handler = [](int signal) {
        std::cerr << "\nReceived signal " << signal << ", shutting down gracefully..." << '\n';
        if (global_server) {
            global_server->request_shutdown();
        }
    };
    auto fatal_error_handler = [](int signal) {
        const char* signal_name = (signal == SIGBUS) ? "SIGBUS" : (signal == SIGSEGV) ? "SIGSEGV" : "UNKNOWN";
        std::cerr << "\nFatal error: received " << signal_name << '\n';
        if (global_server) {
            global_server->close();
        }
        std::exit(1);
    };

    (void)std::signal(SIGTERM, graceful_shutdown_handler);
    (void)std::signal(SIGINT, graceful_shutdown_handler);
    (void)std::signal(SIGBUS, fatal_error_handler);
    (void)std::signal(SIGSEGV, fatal_error_handler);

    setup_parent_death_monitoring();

    if (!server->listen()) {
        std::cerr << "Error: Could not start IPC server" << '\n';
        return 1;
    }
    std::cerr << "aztec-kvdb IPC server ready" << '\n';

    server->run([&kvdb_server](int client_id, std::span<const uint8_t> raw_request) -> std::vector<uint8_t> {
        try {
            return kvdb_server.dispatch(raw_request);
        } catch (const std::exception& e) {
            // The msgpack-channel client expects a typed response. We don't have
            // an error message type defined; surface the failure on stderr and
            // return an empty buffer (the client will treat that as a protocol
            // error). Matches the NAPI wrapper's exception-handling shape.
            std::cerr << "Error processing request from client " << client_id << ": " << e.what() << '\n';
            std::cerr.flush();
            return {};
        }
    });

    server->close();
    return 0;
}

} // namespace bb::kvdb
