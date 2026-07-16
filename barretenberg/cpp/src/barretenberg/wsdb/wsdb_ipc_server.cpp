#include "barretenberg/wsdb/wsdb_ipc_server.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/wsdb/wsdb_ffi.h"
#include "ipc_runtime/ipc_server.hpp"
#include "ipc_runtime/serve_helper.hpp"
#include "ipc_runtime/signal_handlers.hpp"

#include <cstdint>
#include <memory>
#include <span>
#include <string>
#include <vector>

namespace bb::wsdb {

// ---------------------------------------------------------------------------
// Socket transport adapter over the wsdb FFI.
//
// The WorldState, scheduler, and dispatch live behind the plain-C `wsdb_ffi`
// ABI (wsdb_create / wsdb_call / wsdb_destroy). This server owns only the
// transport: it builds the IPC server, then feeds each wire frame into
// `wsdb_call` and bridges the (async) response back onto the connection. An
// in-process host (NAPI wrapper, or a co-linked AVM) drives the same ABI without
// a socket.
// ---------------------------------------------------------------------------

int execute_wsdb_server(const std::string& input_path,
                        const std::string& data_dir,
                        const std::string& tree_heights_json,
                        const std::string& tree_prefill_json,
                        const std::string& map_sizes_json,
                        uint32_t threads,
                        uint32_t initial_header_generator_point,
                        const std::string& prefilled_public_data_json,
                        uint64_t genesis_timestamp,
                        size_t request_ring_size,
                        size_t response_ring_size)
{
    // Pick UDS vs MPSC-SHM by path suffix; install the runtime's default
    // lifecycle signal handlers (SIGTERM/SIGINT → request_shutdown, SIGBUS/SIGSEGV
    // → close+exit, plus parent-death monitoring via prctl/kqueue).
    ipc::ServerOptions opts;
    // TS backend (client 0) + the AVM simulator pool (one connection per
    // bb-avm-sim process). Sized to cover a default-size pool with headroom so
    // SHM isn't capped to a single AVM client. (UDS, the default transport, is
    // unaffected — it admits connections via the listen backlog.)
    opts.max_shm_clients = 8;
    opts.shm_request_ring_size = request_ring_size;
    opts.shm_response_ring_size = response_ring_size;
    auto server = ipc::make_server(input_path, opts);
    if (!server) {
        info("Error: --input path must end with .sock or .shm: ", input_path);
        return 1;
    }
    info("aztec-wsdb listening on ", input_path);
    ipc::install_default_signal_handlers(*server);

    if (!server->listen()) {
        info("Error: Could not start IPC server");
        return 1;
    }

    // Build the WorldState + scheduler + dispatch behind the FFI. The scheduler's
    // inline fast path is gated on the server's own has_pending_request(): a
    // synchronous single-in-flight client runs on the dispatch thread, but once a
    // second request is queued we hand off to the pool so reads run concurrently.
    wsdb_instance_t* instance = wsdb_create(
        data_dir.c_str(),
        tree_heights_json.c_str(),
        tree_prefill_json.c_str(),
        map_sizes_json.c_str(),
        threads,
        initial_header_generator_point,
        prefilled_public_data_json.c_str(),
        genesis_timestamp,
        [](void* ctx) -> int { return static_cast<ipc::IpcServer*>(ctx)->has_pending_request() ? 1 : 0; },
        server.get());
    if (instance == nullptr) {
        info("Error: Could not create WorldState");
        return 1;
    }

    info("aztec-wsdb IPC server ready");

    // Async dispatch: the reactor reads each request and hands it to wsdb_call
    // with a respond callback; the FFI decodes, schedules its work, and responds
    // when done (possibly from a pool thread). The connection's Respond is boxed
    // onto the heap and freed by the trampoline once fired, so it outlives the
    // reactor callback for deferred (pool-thread) responses.
    server->run_reactor([instance](int /*client_id*/, std::span<const uint8_t> raw, ipc::IpcServer::Respond respond) {
        auto* boxed = new ipc::IpcServer::Respond(std::move(respond));
        wsdb_call(instance, raw.data(), raw.size(), boxed, [](void* ctx, const uint8_t* resp, size_t resp_len) {
            auto* r = static_cast<ipc::IpcServer::Respond*>(ctx);
            (*r)(std::vector<uint8_t>(resp, resp + resp_len));
            delete r;
        });
    });

    server->close();
    wsdb_destroy(instance);
    return 0;
}

} // namespace bb::wsdb
