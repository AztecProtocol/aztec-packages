#include "barretenberg/api/api_msgpack.hpp"
#include "barretenberg/bbapi/bbapi_handlers.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/generated/bb_dispatch.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

#if !defined(__wasm__) && !defined(_WIN32)
#include "ipc_runtime/serve_helper.hpp"
#include "ipc_runtime/signal_handlers.hpp"
#endif

namespace bb {

int process_msgpack_commands(std::istream& input_stream)
{
    // Redirect std::cout to stderr to prevent accidental writes to stdout
    auto* original_cout_buf = std::cout.rdbuf();
    std::cout.rdbuf(std::cerr.rdbuf());
    std::ostream stdout_stream(original_cout_buf);

    // Dispatcher is the codegen-emitted handler that owns the
    // command-name → handle_<method> table and runs the per-call
    // serialize / deserialize / exception → ErrorResponse plumbing.
    // BBApiRequest lives across calls so IVC state (loaded circuit,
    // accumulator, etc.) persists between Chonk* invocations.
    bb::bbapi::BBApiRequest request;
    auto handler = bb::bbapi::make_bb_handler(request);

    while (!input_stream.eof()) {
        uint32_t length = 0;
        input_stream.read(reinterpret_cast<char*>(&length), sizeof(length));
        if (input_stream.gcount() != sizeof(length)) {
            break; // EOF or incomplete length
        }

        std::vector<uint8_t> buffer(length);
        input_stream.read(reinterpret_cast<char*>(buffer.data()), static_cast<std::streamsize>(length));
        if (input_stream.gcount() != static_cast<std::streamsize>(length)) {
            std::cerr << "Error: Incomplete msgpack buffer read" << '\n';
            std::cout.rdbuf(original_cout_buf);
            return 1;
        }

        std::vector<uint8_t> response = handler(buffer);

        uint32_t response_length = static_cast<uint32_t>(response.size());
        stdout_stream.write(reinterpret_cast<const char*>(&response_length), sizeof(response_length));
        stdout_stream.write(reinterpret_cast<const char*>(response.data()),
                            static_cast<std::streamsize>(response.size()));
        stdout_stream.flush();
    }

    std::cout.rdbuf(original_cout_buf);
    return 0;
}

#if !defined(__wasm__) && !defined(_WIN32)
int execute_msgpack_ipc_server(std::unique_ptr<ipc::IpcServer> server)
{
    // Install runtime lifecycle handlers (SIGTERM/SIGINT → request_shutdown,
    // SIGBUS/SIGSEGV → close+exit, parent-death watch via prctl/kqueue).
    // MUST be installed before listen() since SIGBUS can occur during init
    // when shared memory is exhausted.
    ipc::install_default_signal_handlers(*server);

    if (!server->listen()) {
        std::cerr << "Error: Could not start IPC server" << '\n';
        return 1;
    }

    std::cerr << "IPC server ready" << '\n';

    // Keep one request context for the command stream so stateful command
    // sequences, such as ChonkStart/Load/Accumulate/Prove, share IVC state.
    bb::bbapi::BBApiRequest request;
    auto handler = bb::bbapi::make_bb_handler(request);
    server->run([&handler](int /*client_id*/, std::span<const uint8_t> raw) {
        return handler(std::vector<uint8_t>(raw.begin(), raw.end()));
    });

    server->close();
    return 0;
}
#endif

int execute_msgpack_run(const std::string& msgpack_input_file,
                        [[maybe_unused]] int max_clients,
                        [[maybe_unused]] size_t request_ring_size,
                        [[maybe_unused]] size_t response_ring_size)
{
#if !defined(__wasm__) && !defined(_WIN32)
    if (!msgpack_input_file.empty()) {
        ipc::ServerOptions opts{
            .max_shm_clients = static_cast<std::size_t>(max_clients),
            .shm_request_ring_size = request_ring_size,
            .shm_response_ring_size = response_ring_size,
            .socket_backlog = max_clients,
        };
        auto server = ipc::make_server(msgpack_input_file, opts);
        if (server) {
            std::cerr << "IPC server at " << msgpack_input_file << '\n';
            return execute_msgpack_ipc_server(std::move(server));
        }
    }
#endif

    // Process msgpack API commands from stdin or file
    std::istream* input_stream = &std::cin;
    std::ifstream file_stream;

    if (!msgpack_input_file.empty()) {
        file_stream.open(msgpack_input_file, std::ios::binary);
        if (!file_stream.is_open()) {
            std::cerr << "Error: Could not open input file: " << msgpack_input_file << '\n';
            return 1;
        }
        input_stream = &file_stream;
    }

    return process_msgpack_commands(*input_stream);
}

} // namespace bb
