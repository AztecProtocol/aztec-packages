#include "barretenberg/kvdb/kvdb_ipc_server.hpp"

#include "barretenberg/common/try_catch_shim.hpp"
#include "barretenberg/ipc/ipc_server.hpp"
#include "barretenberg/kvdb/kvdb_execute.hpp"
#include "barretenberg/lmdblib/lmdb_store.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"

#include <csignal>
#include <cstdint>
#include <iostream>
#include <memory>
#include <mutex>
#include <thread>
#include <unistd.h>
#include <unordered_map>

#ifdef __linux__
#include <sys/prctl.h>
#elif defined(__APPLE__)
#include <sys/event.h>
#endif

namespace bb::kvdb {

namespace {

// Mirror wsdb's parent-death-monitoring: when the TS host process dies,
// the child kvdb gets a SIGTERM (linux) or kqueue NOTE_EXIT (macOS) and exits.
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

} // namespace

int execute_kvdb_server(const std::string& input_path,
                        const std::string& data_dir,
                        uint64_t map_size_bytes,
                        uint32_t max_readers,
                        size_t request_ring_size,
                        size_t response_ring_size)
{
    // The LMDB store is single-writer; the IPC server is also single-threaded
    // per client. We pass kMaxDbs=2 to match the NAPI wrapper's default.
    auto store = std::make_unique<lmdblib::LMDBStore>(data_dir, map_size_bytes, max_readers, 2);

    std::mutex cursor_mutex;
    std::unordered_map<uint64_t, CursorData> cursors;

    KvdbRequest request{ .store = *store, .cursor_mutex = cursor_mutex, .cursors = cursors };

    std::unique_ptr<ipc::IpcServer> server;
    if (input_path.size() >= 4 && input_path.substr(input_path.size() - 4) == ".shm") {
        std::string base_name = input_path.substr(0, input_path.size() - 4);
        // kvdb is consumed by a single TS process per consumer (archiver, p2p,
        // pxe, slasher, ha-signer). One SHM client suffices.
        constexpr size_t MAX_SHM_CLIENTS = 1;
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

    server->run([&request](int client_id, std::span<const uint8_t> raw_request) -> std::vector<uint8_t> {
        try {
            auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(raw_request.data()), raw_request.size());
            auto obj = unpacked.get();

            // Expect [["CommandName", {payload}]] — a 1-element tuple wrapping the NamedUnion.
            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
            if (obj.type != msgpack::type::ARRAY || obj.via.array.size != 1) {
                std::cerr << "Error: Expected array of size 1 from client " << client_id << '\n';
                return {};
            }

            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
            auto& command_obj = obj.via.array.ptr[0];

            // Peek for shutdown so we can signal the server to exit after responding.
            bool is_shutdown = false;
            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
            if (command_obj.type == msgpack::type::ARRAY && command_obj.via.array.size == 2 &&
                command_obj.via.array.ptr[0].type == msgpack::type::STR) {
                std::string_view command_name(
                    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
                    command_obj.via.array.ptr[0].via.str.ptr,
                    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
                    command_obj.via.array.ptr[0].via.str.size);
                is_shutdown = (command_name == "KvdbShutdown");
            }

            KvdbCommand command;
            command_obj.convert(command);
            auto response = kvdb(request, std::move(command));

            msgpack::sbuffer response_buffer;
            msgpack::pack(response_buffer, response);
            std::vector<uint8_t> result(response_buffer.data(), response_buffer.data() + response_buffer.size());

            if (is_shutdown) {
                throw ipc::ShutdownRequested(std::move(result));
            }
            return result;
        } catch (const ipc::ShutdownRequested&) {
            throw;
        } catch (const std::exception& e) {
            std::cerr << "Error processing request from client " << client_id << ": " << e.what() << '\n';
            std::cerr.flush();
            KvdbErrorResponse error_response{ .message = std::string(e.what()) };
            KvdbCommandResponse response = error_response;
            msgpack::sbuffer response_buffer;
            msgpack::pack(response_buffer, response);
            return std::vector<uint8_t>(response_buffer.data(), response_buffer.data() + response_buffer.size());
        }
    });

    server->close();
    return 0;
}

} // namespace bb::kvdb
