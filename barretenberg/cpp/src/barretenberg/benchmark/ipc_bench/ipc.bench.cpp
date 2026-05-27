#include "barretenberg/bbapi/bbapi_wire_convert.hpp"
#include "barretenberg/bbapi/generated/bb_types.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "ipc_runtime/ipc_client.hpp"
#include <array>
#include <atomic>
#include <benchmark/benchmark.h>
#include <chrono>
#include <cstring>
#include <fcntl.h>
#include <signal.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <thread>
#include <unistd.h>

namespace {
// Pack a wire-typed command into the bb dispatcher's expected input:
// `[ [type_name, payload] ]` (1-element tuple containing a [name, payload] pair).
template <typename WireCmd> msgpack::sbuffer pack_wire_command(const WireCmd& cmd)
{
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(1);
    pk.pack_array(2);
    pk.pack(std::string(WireCmd::MSGPACK_SCHEMA_NAME));
    pk.pack(cmd);
    return buf;
}
} // namespace

using namespace benchmark;
using namespace bb;

namespace {

void poseidon_hash_direct(State& state) noexcept
{
    fr x = fr::random_element();
    fr y = fr::random_element();
    for (auto _ : state) {
        std::vector<fr> to_hash{ x, y };
        auto hash = bb::crypto::Poseidon2<bb::crypto::Poseidon2Bn254ScalarFieldParams>::hash(to_hash);
        DoNotOptimize(hash);
    }
}
BENCHMARK(poseidon_hash_direct)->Unit(benchmark::kMicrosecond)->Iterations(10000);

// Helper: Spawn bb binary for msgpack benchmarks
static pid_t spawn_bb_msgpack_server(const std::string& path)
{
    pid_t bb_pid = fork();
    if (bb_pid == 0) {
        // Child process - redirect stdout/stderr to /dev/null
        int devnull = open("/dev/null", O_WRONLY);
        if (devnull >= 0) {
            dup2(devnull, STDOUT_FILENO);
            dup2(devnull, STDERR_FILENO);
            close(devnull);
        }

        // Try multiple bb binary paths
        const std::array<const char*, 5> bb_paths = { "./bb",           // Same directory
                                                      "./build/bin/bb", // From cpp/
                                                      "./bin/bb",       // From cpp/build
                                                      "../bin/bb",      // From subdirectory
                                                      "bb" };           // From PATH
        for (const char* bb_path : bb_paths) {
            execl(bb_path, bb_path, "msgpack", "run", "--input", path.c_str(), nullptr);
        }
        _exit(1);
    }
    return bb_pid;
}

// Transport type enum for template specialization
enum class TransportType { Socket, Shm };

// BB Binary Msgpack Benchmark: Full stack test with actual bb binary
// Template parameters:
// - Transport: Socket or Shm
// - NumClients: Number of concurrent clients (1 for SPSC, >1 for MPSC)
template <TransportType Transport, size_t NumClients> class Poseidon2BBMsgpack : public Fixture {
  public:
    static_assert(NumClients >= 1, "Must have at least 1 client");

    std::array<std::unique_ptr<ipc::IpcClient>, NumClients> clients{};
    pid_t bb_pid{ 0 };
    std::array<std::thread, (NumClients > 1 ? NumClients - 1 : 1)> background_threads{};
    std::atomic<bool> stop_background{ false };
    fr x{};
    fr y{};

    std::string ipc_path;

    Poseidon2BBMsgpack()
    {
        if constexpr (Transport == TransportType::Socket) {
            ipc_path = "/tmp/poseidon_bb_msgpack_bench.sock";
        } else {
            // Use short name for macOS shm_open 31-char limit
            ipc_path = "/p2_bench.shm";
        }
    }

    // Helper to check if socket file exists (only for socket transport)
    bool socket_exists(const char* path, int max_attempts = 20)
    {
        for (int i = 0; i < max_attempts; i++) {
            struct stat st;
            if (stat(path, &st) == 0 && S_ISSOCK(st.st_mode)) {
                return true;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
        }
        return false;
    }

    void SetUp(const ::benchmark::State& /*unused*/) override
    {
        stop_background.store(false, std::memory_order_relaxed);

        // Spawn bb binary in IPC server mode
        bb_pid = spawn_bb_msgpack_server(ipc_path);
        if (bb_pid < 0) {
            throw std::runtime_error("Failed to fork bb process");
        }

        // Wait for server to be ready
        if constexpr (Transport == TransportType::Socket) {
            // Wait for socket file to be created
            if (!socket_exists(ipc_path.c_str())) {
                kill(bb_pid, SIGKILL);
                waitpid(bb_pid, nullptr, 0);
                throw std::runtime_error("BB binary failed to create socket within timeout");
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
        } else {
            // Shared memory needs more time to initialize
            std::this_thread::sleep_for(std::chrono::milliseconds(500));
        }

        // Create and connect all clients
        for (size_t i = 0; i < NumClients; i++) {
            if constexpr (Transport == TransportType::Socket) {
                clients[i] = ipc::IpcClient::create_socket(ipc_path);
            } else {
                // Strip .shm suffix for base name
                std::string base_name = ipc_path.substr(0, ipc_path.size() - 4);
                clients[i] = ipc::IpcClient::create_shm(base_name);
            }

            bool connected = false;
            for (int retry_count = 0; retry_count < 5; retry_count++) {
                if (clients[i]->connect()) {
                    connected = true;
                    break;
                }
                std::this_thread::sleep_for(std::chrono::milliseconds(50));
            }

            if (!connected) {
                kill(bb_pid, SIGKILL);
                waitpid(bb_pid, nullptr, 0);
                throw std::runtime_error("Failed to connect to BB IPC server after retries");
            }
        }

        // Spawn background threads for MPSC scenarios (NumClients > 1)
        if constexpr (NumClients > 1) {
            for (size_t i = 1; i < NumClients; i++) {
                background_threads[i - 1] = std::thread([this, i]() {
                    fr bx = fr::random_element();
                    fr by = fr::random_element();

                    while (!stop_background.load(std::memory_order_relaxed)) {
                        // Create wire Poseidon2Hash command
                        bb::bbapi::wire::Poseidon2Hash hash_cmd;
                        hash_cmd.inputs = { bb::bbapi::fr_to_wire(bx), bb::bbapi::fr_to_wire(by) };

                        // Pack as [ [name, payload] ] (matches the bb dispatcher's input shape).
                        msgpack::sbuffer cmd_buffer = pack_wire_command(hash_cmd);

                        // Send with retry on backpressure (100ms timeout)
                        constexpr uint64_t TIMEOUT_NS = 100000000; // 100ms
                        while (!clients[i]->send(cmd_buffer.data(), cmd_buffer.size(), TIMEOUT_NS)) {
                            // Ring buffer full, retry
                            if (stop_background.load(std::memory_order_relaxed)) {
                                return; // Exit if shutting down
                            }
                        }

                        // Receive with retry (100ms timeout)
                        std::span<const uint8_t> response;
                        while ((response = clients[i]->receive(TIMEOUT_NS)).empty()) {
                            // Response not ready, retry
                            if (stop_background.load(std::memory_order_relaxed)) {
                                return; // Exit if shutting down
                            }
                        }

                        // Release the message
                        clients[i]->release(response.size());
                    }
                });
            }
        }

        // Pre-generate test inputs for benchmark thread (client 0)
        x = fr::random_element();
        y = fr::random_element();
    }

    void TearDown(const ::benchmark::State& /*unused*/) override
    {
        // Stop background threads if any
        if constexpr (NumClients > 1) {
            stop_background.store(true, std::memory_order_relaxed);
            for (size_t i = 0; i < NumClients - 1; i++) {
                if (background_threads[i].joinable()) {
                    background_threads[i].join();
                }
            }
        }

        // Send Shutdown command to bb so it exits gracefully (use client 0)
        if (clients[0]) {
            bb::bbapi::wire::Shutdown shutdown_cmd;
            msgpack::sbuffer cmd_buffer = pack_wire_command(shutdown_cmd);

            // Send shutdown command with retry (1s timeout)
            constexpr uint64_t TIMEOUT_NS = 1000000000; // 1 second
            while (!clients[0]->send(cmd_buffer.data(), cmd_buffer.size(), TIMEOUT_NS)) {
                // Retry on backpressure
            }

            std::span<const uint8_t> response;
            while ((response = clients[0]->receive(TIMEOUT_NS)).empty()) {
                // Retry until response ready
            }

            clients[0]->release(response.size());
        }

        // Close all clients
        for (auto& client : clients) {
            if (client) {
                client->close();
            }
        }

        // Wait for bb to exit gracefully (destructors will clean up resources)
        if (bb_pid > 0) {
            int status = 0;
            pid_t result = waitpid(bb_pid, &status, 0); // Blocking wait
            if (result <= 0) {
                // If wait failed, force kill
                kill(bb_pid, SIGKILL);
                waitpid(bb_pid, nullptr, 0);
            }
        }
    }

    // Benchmark implementation shared across all variants
    void run_benchmark(benchmark::State& state)
    {
        constexpr uint64_t TIMEOUT_NS = 1000000000; // 1 second

        for (auto _ : state) {
            bb::bbapi::wire::Poseidon2Hash hash_cmd;
            hash_cmd.inputs = { bb::bbapi::fr_to_wire(x), bb::bbapi::fr_to_wire(y) };
            msgpack::sbuffer cmd_buffer = pack_wire_command(hash_cmd);

            // Send command with retry on backpressure
            while (!clients[0]->send(cmd_buffer.data(), cmd_buffer.size(), TIMEOUT_NS)) {
                // Ring buffer full, retry (shouldn't happen often in benchmarks)
            }

            // Receive response with retry
            std::span<const uint8_t> resp;
            while ((resp = clients[0]->receive(TIMEOUT_NS)).empty()) {
                // Response not ready, retry
            }

            // Deserialize response: expect `[name, payload]`. We only care that the
            // call succeeded and that we can extract the hash bytes.
            auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(resp.data()), resp.size());
            auto obj = unpacked.get();
            if (obj.type != msgpack::type::ARRAY || obj.via.array.size != 2) {
                clients[0]->release(resp.size());
                state.SkipWithError("Invalid response shape");
                break;
            }
            const auto& name_obj = obj.via.array.ptr[0];
            const auto& payload_obj = obj.via.array.ptr[1];
            std::string name(name_obj.via.str.ptr, name_obj.via.str.size);
            if (name != "Poseidon2HashResponse") {
                clients[0]->release(resp.size());
                state.SkipWithError("Invalid response type");
                break;
            }
            bb::bbapi::wire::Poseidon2HashResponse hash_response;
            payload_obj.convert(hash_response);
            clients[0]->release(resp.size());

            auto hash = hash_response.hash;
            DoNotOptimize(hash);
        }
    }
};

// Type aliases for specific test cases
// SPSC: Single client
using Poseidon2BBSocketSPSC = Poseidon2BBMsgpack<TransportType::Socket, 1>;
using Poseidon2BBShmSPSC = Poseidon2BBMsgpack<TransportType::Shm, 1>;

// MPSC: Multiple clients (socket only - SHM is SPSC-only now)
using Poseidon2BBSocketMPSC = Poseidon2BBMsgpack<TransportType::Socket, 3>;

// Macro to register benchmark variants
#define REGISTER_BB_BENCHMARK(fixture_name)                                                                            \
    BENCHMARK_DEFINE_F(fixture_name, poseidon_hash_roundtrip)(benchmark::State & state)                                \
    {                                                                                                                  \
        run_benchmark(state);                                                                                          \
    }                                                                                                                  \
    BENCHMARK_REGISTER_F(fixture_name, poseidon_hash_roundtrip)->Unit(benchmark::kMicrosecond)->Iterations(10000)

REGISTER_BB_BENCHMARK(Poseidon2BBSocketSPSC);
REGISTER_BB_BENCHMARK(Poseidon2BBSocketMPSC);
REGISTER_BB_BENCHMARK(Poseidon2BBShmSPSC);

} // namespace

BENCHMARK_MAIN();
