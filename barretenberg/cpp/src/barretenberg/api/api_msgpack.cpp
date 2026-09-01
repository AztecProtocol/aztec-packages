#include "barretenberg/api/api_msgpack.hpp"
#include "barretenberg/bbapi/bbapi_handlers.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/generated/bb_dispatch.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include <cstdint>
#include <fstream>
#include <iostream>
#include <string>
#include <utility>
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
        if (length < sizeof(uint64_t)) {
            std::cerr << "Error: frame shorter than its request id" << '\n';
            std::cout.rdbuf(original_cout_buf);
            return 1;
        }

        uint64_t request_id = 0;
        input_stream.read(reinterpret_cast<char*>(&request_id), sizeof(request_id));
        if (input_stream.gcount() != sizeof(request_id)) {
            std::cerr << "Error: Incomplete request id read" << '\n';
            std::cout.rdbuf(original_cout_buf);
            return 1;
        }

        const auto payload_length = static_cast<std::streamsize>(length - sizeof(uint64_t));
        std::vector<uint8_t> buffer(static_cast<size_t>(payload_length));
        input_stream.read(reinterpret_cast<char*>(buffer.data()), payload_length);
        if (input_stream.gcount() != payload_length) {
            std::cerr << "Error: Incomplete msgpack buffer read" << '\n';
            std::cout.rdbuf(original_cout_buf);
            return 1;
        }

        // The generated dispatch responds through a callback; handlers here
        // complete synchronously, so capture the response and write it out.
        std::vector<uint8_t> response;
        const uint64_t draws_before = bb::numeric::debug_randomness_draws();
        handler(buffer, [&response](std::vector<uint8_t> r) { response = std::move(r); });
        if (std::getenv("BB_RNG_COUNT") != nullptr) {
            std::cerr << "[rng] frame drew " << (bb::numeric::debug_randomness_draws() - draws_before)
                      << " (total " << bb::numeric::debug_randomness_draws() << ")\n";
        }

        auto response_length = static_cast<uint32_t>(response.size() + sizeof(uint64_t));
        stdout_stream.write(reinterpret_cast<const char*>(&response_length), sizeof(response_length));
        stdout_stream.write(reinterpret_cast<const char*>(&request_id), sizeof(request_id));
        stdout_stream.write(reinterpret_cast<const char*>(response.data()),
                            static_cast<std::streamsize>(response.size()));
        stdout_stream.flush();
    }

    std::cout.rdbuf(original_cout_buf);
    return 0;
}

int execute_msgpack_run(const std::string& msgpack_input_file,
                        [[maybe_unused]] int max_clients,
                        [[maybe_unused]] size_t request_ring_size,
                        [[maybe_unused]] size_t response_ring_size)
{
#if !defined(__wasm__) && !defined(_WIN32)
    // Live transports: stdio pipe ("" / "-"), UDS (*.sock), MPSC-SHM (*.shm),
    // all served by the shared ipc-runtime server with envelope framing.
    const std::string input_path = msgpack_input_file.empty() ? "-" : msgpack_input_file;
    ipc::ServerOptions opts{
        .max_shm_clients = static_cast<std::size_t>(max_clients),
        .shm_request_ring_size = request_ring_size,
        .shm_response_ring_size = response_ring_size,
        .socket_backlog = max_clients,
    };
    if (auto server = ipc::make_server(input_path, opts)) {
        // Install runtime lifecycle handlers (SIGTERM/SIGINT → request_shutdown,
        // SIGBUS/SIGSEGV → close+exit, parent-death watch, SIGPIPE → EPIPE)
        // before listen(): SIGBUS can occur during init when SHM is exhausted.
        ipc::install_default_signal_handlers(*server);
        if (!server->listen()) {
            std::cerr << "Error: Could not start IPC server at " << input_path << '\n';
            return 1;
        }
        std::cerr << "bb msgpack serving " << input_path << '\n';

        // One request context for the whole serve so stateful command
        // sequences (ChonkStart/Load/Accumulate/Prove) share IVC state.
        bb::bbapi::BBApiRequest request;
        auto handler = bb::bbapi::make_bb_handler(request);
        server->run_reactor([&handler](int /*client_id*/,
                                       std::span<const uint8_t> raw,
                                       ipc::IpcServer::Respond respond) { handler(raw, std::move(respond)); });

        server->close();
        return 0;
    }
#endif

    // Offline replay: bare length-prefixed commands from a file.
    std::ifstream file_stream(msgpack_input_file, std::ios::binary);
    if (!file_stream.is_open()) {
        std::cerr << "Error: Could not open input file: " << msgpack_input_file << '\n';
        return 1;
    }
    return process_msgpack_commands(file_stream);
}

} // namespace bb
