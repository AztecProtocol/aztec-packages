#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/bbapi/bbapi.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ipc/ipc_client.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include <array>
#include <benchmark/benchmark.h>
#include <chrono>
#include <cstring>
#include <fcntl.h>
#include <signal.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <thread>
#include <unistd.h>

using namespace benchmark;
using namespace bb;

namespace {

grumpkin::fq poseidon_function(const size_t count)
{
    std::vector<grumpkin::fq> inputs(count);
    for (size_t i = 0; i < count; ++i) {
        inputs[i] = grumpkin::fq::random_element();
    }
    // hash count many field elements
    inputs[0] = bb::crypto::Poseidon2<bb::crypto::Poseidon2Bn254ScalarFieldParams>::hash(inputs);
    return inputs[0];
}

void native_poseidon2_commitment_bench(State& state) noexcept
{
    for (auto _ : state) {
        const size_t count = (static_cast<size_t>(state.range(0)));
        DoNotOptimize(poseidon_function(count));
    }
}

BENCHMARK(native_poseidon2_commitment_bench)->Arg(10)->Arg(1000)->Arg(10000);

grumpkin::fq poseiden_hash_impl(const grumpkin::fq& x, const grumpkin::fq& y)
{
    std::vector<grumpkin::fq> to_hash{ x, y };
    return bb::crypto::Poseidon2<bb::crypto::Poseidon2Bn254ScalarFieldParams>::hash(to_hash);
}

void poseiden_hash_bench(State& state) noexcept
{
    grumpkin::fq x = grumpkin::fq::random_element();
    grumpkin::fq y = grumpkin::fq::random_element();
    for (auto _ : state) {
        DoNotOptimize(poseiden_hash_impl(x, y));
    }
}
BENCHMARK(poseiden_hash_bench)->Unit(benchmark::kMicrosecond);

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
        const std::array<const char*, 5> bb_paths = { "./bin/bb",              // From build-no-avm/ or build/
                                                      "./build-no-avm/bin/bb", // From cpp/
                                                      "./build/bin/bb",        // From cpp/
                                                      "../bin/bb",             // From subdirectory
                                                      "bb" };                  // From PATH
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
    grumpkin::fq x{};
    grumpkin::fq y{};

    std::string ipc_path;

    Poseidon2BBMsgpack()
    {
        if constexpr (Transport == TransportType::Socket) {
            ipc_path = "/tmp/poseidon_bb_msgpack_bench.sock";
        } else {
            ipc_path = "/poseidon_bb_msgpack_shm_bench.shm";
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
                clients[i] = ipc::IpcClient::create_shm(base_name, 10);
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
                    grumpkin::fq bx = grumpkin::fq::random_element();
                    grumpkin::fq by = grumpkin::fq::random_element();
                    std::array<uint8_t, 1024 * 1024> resp_buffer{};

                    while (!stop_background.load(std::memory_order_relaxed)) {
                        // Create Poseidon2Hash command
                        bb::bbapi::Poseidon2Hash hash_cmd;
                        hash_cmd.inputs = { uint256_t(bx), uint256_t(by) };
                        bb::bbapi::Command command{ std::move(hash_cmd) };

                        // Serialize command
                        msgpack::sbuffer cmd_buffer;
                        msgpack::pack(cmd_buffer, command);

                        // Send and receive (keep load on server)
                        if (clients[i]->send(cmd_buffer.data(), cmd_buffer.size())) {
                            clients[i]->recv(resp_buffer.data(), resp_buffer.size());
                        }
                    }
                });
            }
        }

        // Pre-generate test inputs for benchmark thread (client 0)
        x = grumpkin::fq::random_element();
        y = grumpkin::fq::random_element();
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
            // Create Shutdown command
            bb::bbapi::Shutdown shutdown_cmd;
            bb::bbapi::Command command{ std::move(shutdown_cmd) };

            // Serialize command to msgpack
            msgpack::sbuffer cmd_buffer;
            msgpack::pack(cmd_buffer, command);

            // Send shutdown command
            std::array<uint8_t, 1024> resp_buffer{};
            clients[0]->send(cmd_buffer.data(), cmd_buffer.size());
            clients[0]->recv(resp_buffer.data(), resp_buffer.size());
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
};

// Type aliases for specific test cases
using Poseidon2BBSocketSPSC = Poseidon2BBMsgpack<TransportType::Socket, 1>;
using Poseidon2BBSocketMPSC = Poseidon2BBMsgpack<TransportType::Socket, 3>;
using Poseidon2BBShmSPSC = Poseidon2BBMsgpack<TransportType::Shm, 1>;
using Poseidon2BBShmMPSC = Poseidon2BBMsgpack<TransportType::Shm, 3>;

BENCHMARK_DEFINE_F(Poseidon2BBSocketSPSC, poseiden_hash_roundtrip)(benchmark::State& state)
{
    // Pre-allocate buffer for responses
    std::array<uint8_t, 1024 * 1024> resp_buffer{};

    for (auto _ : state) {
        // Create Poseidon2Hash command
        bb::bbapi::Poseidon2Hash hash_cmd;
        hash_cmd.inputs = { uint256_t(x), uint256_t(y) };
        bb::bbapi::Command command{ std::move(hash_cmd) };

        // Serialize command to msgpack
        msgpack::sbuffer cmd_buffer;
        msgpack::pack(cmd_buffer, command);

        // Send command
        if (!clients[0]->send(cmd_buffer.data(), cmd_buffer.size())) {
            state.SkipWithError("Failed to send command");
            break;
        }

        // Receive response
        ssize_t n = clients[0]->recv(resp_buffer.data(), resp_buffer.size());
        if (n < 0) {
            state.SkipWithError("Failed to receive response");
            break;
        }

        // Deserialize response
        auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(resp_buffer.data()), static_cast<size_t>(n));
        bb::bbapi::CommandResponse response;
        unpacked.get().convert(response);

        // Extract hash from response
        const auto& response_variant = static_cast<const bb::bbapi::CommandResponse::VariantType&>(response);
        const auto* hash_response = std::get_if<bb::bbapi::Poseidon2Hash::Response>(&response_variant);
        if (hash_response == nullptr) {
            state.SkipWithError("Invalid response type");
            break;
        }

        DoNotOptimize(hash_response->hash);
    }
}
BENCHMARK_REGISTER_F(Poseidon2BBSocketSPSC, poseiden_hash_roundtrip)->Unit(benchmark::kMicrosecond)->Iterations(10000);

BENCHMARK_DEFINE_F(Poseidon2BBSocketMPSC, poseiden_hash_roundtrip)(benchmark::State& state)
{
    // Background threads (clients 1 & 2) create contention
    std::array<uint8_t, 1024 * 1024> resp_buffer{};

    for (auto _ : state) {
        // Create Poseidon2Hash command
        bb::bbapi::Poseidon2Hash hash_cmd;
        hash_cmd.inputs = { uint256_t(x), uint256_t(y) };
        bb::bbapi::Command command{ std::move(hash_cmd) };

        // Serialize command to msgpack
        msgpack::sbuffer cmd_buffer;
        msgpack::pack(cmd_buffer, command);

        // Send command
        if (!clients[0]->send(cmd_buffer.data(), cmd_buffer.size())) {
            state.SkipWithError("Failed to send command");
            break;
        }

        // Receive response
        ssize_t n = clients[0]->recv(resp_buffer.data(), resp_buffer.size());
        if (n < 0) {
            state.SkipWithError("Failed to receive response");
            break;
        }

        // Deserialize response
        auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(resp_buffer.data()), static_cast<size_t>(n));
        bb::bbapi::CommandResponse response;
        unpacked.get().convert(response);

        // Extract hash from response
        const auto& response_variant = static_cast<const bb::bbapi::CommandResponse::VariantType&>(response);
        const auto* hash_response = std::get_if<bb::bbapi::Poseidon2Hash::Response>(&response_variant);
        if (hash_response == nullptr) {
            state.SkipWithError("Invalid response type");
            break;
        }

        DoNotOptimize(hash_response->hash);
    }
}
BENCHMARK_REGISTER_F(Poseidon2BBSocketMPSC, poseiden_hash_roundtrip)->Unit(benchmark::kMicrosecond)->Iterations(10000);

BENCHMARK_DEFINE_F(Poseidon2BBShmSPSC, poseiden_hash_roundtrip)(benchmark::State& state)
{
    std::array<uint8_t, 1024 * 1024> resp_buffer{};

    for (auto _ : state) {
        // Create Poseidon2Hash command
        bb::bbapi::Poseidon2Hash hash_cmd;
        hash_cmd.inputs = { uint256_t(x), uint256_t(y) };
        bb::bbapi::Command command{ std::move(hash_cmd) };

        // Serialize command to msgpack
        msgpack::sbuffer cmd_buffer;
        msgpack::pack(cmd_buffer, command);

        // Send request
        if (!clients[0]->send(cmd_buffer.data(), cmd_buffer.size(), 1000000000)) {
            state.SkipWithError("Failed to send command");
            break;
        }

        // Receive response
        ssize_t n = clients[0]->recv(resp_buffer.data(), resp_buffer.size(), 1000000000);
        if (n < 0) {
            state.SkipWithError("Failed to receive response");
            break;
        }

        // Deserialize response
        auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(resp_buffer.data()), static_cast<size_t>(n));
        bb::bbapi::CommandResponse response;
        unpacked.get().convert(response);

        // Extract hash from response
        const auto& response_variant = static_cast<const bb::bbapi::CommandResponse::VariantType&>(response);
        const auto* hash_response = std::get_if<bb::bbapi::Poseidon2Hash::Response>(&response_variant);
        if (hash_response == nullptr) {
            state.SkipWithError("Invalid response type");
            break;
        }

        DoNotOptimize(hash_response->hash);
    }
}
BENCHMARK_REGISTER_F(Poseidon2BBShmSPSC, poseiden_hash_roundtrip)->Unit(benchmark::kMicrosecond)->Iterations(10000);

BENCHMARK_DEFINE_F(Poseidon2BBShmMPSC, poseiden_hash_roundtrip)(benchmark::State& state)
{
    // Background threads (clients 1 & 2) create contention
    std::array<uint8_t, 1024 * 1024> resp_buffer{};

    for (auto _ : state) {
        // Create Poseidon2Hash command
        bb::bbapi::Poseidon2Hash hash_cmd;
        hash_cmd.inputs = { uint256_t(x), uint256_t(y) };
        bb::bbapi::Command command{ std::move(hash_cmd) };

        // Serialize command to msgpack
        msgpack::sbuffer cmd_buffer;
        msgpack::pack(cmd_buffer, command);

        // Send request
        if (!clients[0]->send(cmd_buffer.data(), cmd_buffer.size(), 1000000000)) {
            state.SkipWithError("Failed to send command");
            break;
        }

        // Receive response
        ssize_t n = clients[0]->recv(resp_buffer.data(), resp_buffer.size(), 1000000000);
        if (n < 0) {
            state.SkipWithError("Failed to receive response");
            break;
        }

        // Deserialize response
        auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(resp_buffer.data()), static_cast<size_t>(n));
        bb::bbapi::CommandResponse response;
        unpacked.get().convert(response);

        // Extract hash from response
        const auto& response_variant = static_cast<const bb::bbapi::CommandResponse::VariantType&>(response);
        const auto* hash_response = std::get_if<bb::bbapi::Poseidon2Hash::Response>(&response_variant);
        if (hash_response == nullptr) {
            state.SkipWithError("Invalid response type");
            break;
        }

        DoNotOptimize(hash_response->hash);
    }
}
BENCHMARK_REGISTER_F(Poseidon2BBShmMPSC, poseiden_hash_roundtrip)->Unit(benchmark::kMicrosecond)->Iterations(10000);

} // namespace

BENCHMARK_MAIN();
