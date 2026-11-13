#include "wsdb/wsdb_ipc_server.hpp"
#include "ipc_runtime/ipc_server.hpp"
#include "ipc_runtime/serve_helper.hpp"
#include "ipc_runtime/signal_handlers.hpp"
#include "wsdb/wsdb_service.hpp"

#include <iostream>
#include <string>

namespace azteclabs::wsdb {

int execute_wsdb_server(const std::string& input_path,
                        const WsdbConfig& config,
                        size_t request_ring_size,
                        size_t response_ring_size)
{
    // Create the IPC server and listen BEFORE the (potentially slow) WorldState
    // construction: LMDB open and genesis prefill can take arbitrarily long on
    // a loaded machine. With the socket already listening, clients connect into
    // the accept backlog immediately and their first requests wait in the
    // socket buffer until the reactor starts, so the client-side connect
    // backstop only has to cover exec + linking + reaching listen() — it never
    // races database initialization.
    //
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
        std::cerr << "Error: --input path must end with .sock or .shm: " << input_path << '\n';
        return 1;
    }
    ipc::install_default_signal_handlers(*server);

    if (!server->listen()) {
        std::cerr << "Error: Could not start IPC server" << '\n';
        return 1;
    }
    std::cerr << "aztec-wsdb listening on " << input_path << '\n';

    WsdbService service(config, [&server]() { return server->has_pending_request(); });
    std::cerr << "aztec-wsdb IPC server ready" << '\n';

    // Async dispatch: the reactor reads each request and hands it to the
    // generated handler with a respond callback; the handler decodes, schedules
    // its work, and responds when done (possibly from a pool thread).
    auto& handler = service.handler();
    server->run_reactor([&handler](int /*client_id*/, std::span<const uint8_t> raw, ipc::IpcServer::Respond respond) {
        handler(raw, std::move(respond));
    });

    server->close();
    return 0;
}

} // namespace azteclabs::wsdb
