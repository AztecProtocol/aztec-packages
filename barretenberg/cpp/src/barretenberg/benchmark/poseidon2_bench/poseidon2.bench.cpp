#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/bbapi/bbapi.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ipc/ipc_client.hpp"
#include "barretenberg/ipc/shm/mpsc_shm.h"
#include "barretenberg/ipc/shm/spsc_shm.h"
#include "barretenberg/ipc/socket/uds_client.h"
#include "barretenberg/ipc/socket/uds_server.h"
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
        (poseidon_function(count));
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

template <size_t NumProducers> class Poseidon2ShmFixture : public Fixture {
  public:
    static_assert(NumProducers >= 1, "Must have at least 1 producer");
    static constexpr size_t MAX_PRODUCERS = 3; // Maximum across all benchmark variants

    std::array<struct mpsc_producer*, NumProducers> producers{};
    struct spsc_shm* response_ring; // Only for producer 0 (benchmark thread)
    pid_t worker_pid;
    std::array<std::thread, (NumProducers > 1 ? NumProducers - 1 : 1)> background_threads{}; // Avoid zero-size array
    std::atomic<bool> stop_background;
    grumpkin::fq x, y;

    const char* request_ring = "/poseidon2_bench_req";
    const char* response_name = "/poseidon2_bench_resp";

    void SetUp(const ::benchmark::State& /*unused*/) override
    {
        stop_background.store(false);

        // Clean up any leftover rings (use MAX_PRODUCERS to handle all variants)
        mpsc_unlink(request_ring, MAX_PRODUCERS);
        spsc_shm_unlink(response_name);

        // Create MPSC consumer for requests
        struct mpsc_consumer* req_consumer_parent = mpsc_consumer_create(request_ring, NumProducers, 1 << 20);
        if (!req_consumer_parent) {
            throw std::runtime_error("Failed to create MPSC request rings");
        }

        // Create SPSC response ring for producer 0 only
        response_ring = spsc_shm_create(response_name, 1 << 20);
        if (!response_ring) {
            mpsc_consumer_close(req_consumer_parent);
            throw std::runtime_error("Failed to create response ring");
        }

        // Fork worker process (consumer of requests, producer of responses)
        worker_pid = fork();
        if (worker_pid == 0) {
            // Child process - close output to prevent benchmark framework noise
            close(STDOUT_FILENO);
            close(STDERR_FILENO);

            struct mpsc_consumer* req_consumer = req_consumer_parent;
            struct spsc_shm* resp_producer = spsc_shm_connect(response_name);

            if (!resp_producer) {
                _exit(1);
            }

            // Worker loop: process requests from all producers
            while (true) {
                int ring_idx = mpsc_wait_for_data(req_consumer, 100000000); // 100ms
                if (ring_idx < 0) {
                    continue;
                }

                size_t n = 0;
                void* data = mpsc_peek(req_consumer, static_cast<size_t>(ring_idx), &n);
                if (n >= 2 * sizeof(grumpkin::fq)) {
                    grumpkin::fq x;
                    grumpkin::fq y;
                    std::memcpy(&x, data, sizeof(grumpkin::fq));
                    std::memcpy(&y, static_cast<uint8_t*>(data) + sizeof(grumpkin::fq), sizeof(grumpkin::fq));
                    mpsc_release(req_consumer, static_cast<size_t>(ring_idx), n);

                    grumpkin::fq result = poseiden_hash_impl(x, y);

                    // Only send response for ring 0 (benchmark thread)
                    if (ring_idx == 0) {
                        while (true) {
                            if (spsc_wait_for_space(resp_producer, sizeof(grumpkin::fq), 100000) > 0) {
                                size_t granted = 0;
                                void* buf = spsc_claim(resp_producer, sizeof(grumpkin::fq), &granted);
                                if (granted >= sizeof(grumpkin::fq)) {
                                    std::memcpy(buf, &result, sizeof(grumpkin::fq));
                                    spsc_publish(resp_producer, sizeof(grumpkin::fq));
                                    break;
                                }
                            }
                        }
                    }
                } else if (n > 0) {
                    mpsc_release(req_consumer, static_cast<size_t>(ring_idx), n);
                }
            }

            spsc_shm_close(resp_producer);
            _exit(0);
        }

        if (worker_pid < 0) {
            mpsc_consumer_close(req_consumer_parent);
            spsc_shm_close(response_ring);
            throw std::runtime_error("Failed to fork worker");
        }

        mpsc_consumer_close(req_consumer_parent); // Parent doesn't need consumer

        // Connect all producers
        for (size_t i = 0; i < NumProducers; i++) {
            producers[i] = mpsc_producer_connect(request_ring, i);
            if (!producers[i]) {
                // Cleanup on failure
                for (size_t j = 0; j < i; j++) {
                    mpsc_producer_close(producers[j]);
                }
                kill(worker_pid, SIGKILL);
                waitpid(worker_pid, nullptr, 0);
                spsc_shm_close(response_ring);
                throw std::runtime_error("Failed to connect producer");
            }
        }

        // Spawn background threads if NumProducers > 1
        if constexpr (NumProducers > 1) {
            for (size_t i = 1; i < NumProducers; i++) {
                background_threads[i - 1] = std::thread([this, i]() {
                    grumpkin::fq x = grumpkin::fq::random_element();
                    grumpkin::fq y = grumpkin::fq::random_element();

                    while (!stop_background.load(std::memory_order_relaxed)) {
                        // Send requests continuously to create contention
                        size_t input_size = 2 * sizeof(grumpkin::fq);
                        if (mpsc_wait_for_space(producers[i], input_size, 1000000)) {
                            size_t granted = 0;
                            void* buf = mpsc_claim(producers[i], input_size, &granted);
                            if (granted >= input_size) {
                                std::memcpy(buf, &x, sizeof(grumpkin::fq));
                                std::memcpy(
                                    static_cast<uint8_t*>(buf) + sizeof(grumpkin::fq), &y, sizeof(grumpkin::fq));
                                mpsc_publish(producers[i], input_size);
                            }
                        }
                    }
                });
            }
        }

        // Wait for worker to be ready
        std::this_thread::sleep_for(std::chrono::milliseconds(50));

        // Pre-generate test inputs for benchmark thread
        x = grumpkin::fq::random_element();
        y = grumpkin::fq::random_element();
    }

    void TearDown(const ::benchmark::State& /*unused*/) override
    {
        // Stop background threads if any
        if constexpr (NumProducers > 1) {
            stop_background.store(true);
            for (size_t i = 0; i < NumProducers - 1; i++) {
                if (background_threads[i].joinable()) {
                    background_threads[i].join();
                }
            }
        }

        // Kill worker process
        kill(worker_pid, SIGTERM);
        waitpid(worker_pid, nullptr, 0);

        // Close all producers
        for (size_t i = 0; i < NumProducers; i++) {
            mpsc_producer_close(producers[i]);
        }

        spsc_shm_close(response_ring);
        mpsc_unlink(request_ring, MAX_PRODUCERS);
        spsc_shm_unlink(response_name);
    }
};

// Type aliases for specific cases
using Poseidon2ShmSPSC = Poseidon2ShmFixture<1>;
using Poseidon2ShmMPSC = Poseidon2ShmFixture<3>;

BENCHMARK_DEFINE_F(Poseidon2ShmSPSC, poseiden_hash_roundtrip)(benchmark::State& state)
{
    for (auto _ : state) {
        // Send request via producer 0
        size_t input_size = 2 * sizeof(grumpkin::fq);
        while (true) {
            if (mpsc_wait_for_space(producers[0], input_size, 20000000) > 0) {
                size_t granted = 0;
                void* buf = mpsc_claim(producers[0], input_size, &granted);
                if (granted >= input_size) {
                    std::memcpy(buf, &x, sizeof(grumpkin::fq));
                    std::memcpy(static_cast<uint8_t*>(buf) + sizeof(grumpkin::fq), &y, sizeof(grumpkin::fq));
                    mpsc_publish(producers[0], input_size);
                    break;
                }
            }
        }

        // Receive response
        grumpkin::fq result;
        while (true) {
            if (spsc_wait_for_data(response_ring, 20000)) {
                size_t n = 0;
                void* data = spsc_peek(response_ring, &n);
                if (n >= sizeof(grumpkin::fq)) {
                    std::memcpy(&result, data, sizeof(grumpkin::fq));
                    spsc_release(response_ring, n);
                    break;
                }
                if (n > 0) {
                    spsc_release(response_ring, n);
                }
            }
        }

        DoNotOptimize(result);
    }
}
BENCHMARK_REGISTER_F(Poseidon2ShmSPSC, poseiden_hash_roundtrip)
    ->Unit(benchmark::kMicrosecond)
    ->Iterations(10000); // Fixed iterations to avoid expensive warmup phase with process forking

// MPSC benchmark using unified template
BENCHMARK_DEFINE_F(Poseidon2ShmMPSC, poseiden_hash_roundtrip)(benchmark::State& state)
{
    // Background threads (producers 1 & 2) create contention, benchmark thread uses producer 0
    for (auto _ : state) {
        // Send request via producer 0
        size_t input_size = 2 * sizeof(grumpkin::fq);
        while (true) {
            if (mpsc_wait_for_space(producers[0], input_size, 20000000)) {
                size_t granted = 0;
                void* buf = mpsc_claim(producers[0], input_size, &granted);
                if (granted >= input_size) {
                    std::memcpy(buf, &x, sizeof(grumpkin::fq));
                    std::memcpy(static_cast<uint8_t*>(buf) + sizeof(grumpkin::fq), &y, sizeof(grumpkin::fq));
                    mpsc_publish(producers[0], input_size);
                    break;
                }
            }
        }

        // Receive response
        grumpkin::fq result;
        while (true) {
            if (spsc_wait_for_data(response_ring, 20000)) {
                size_t n = 0;
                void* data = spsc_peek(response_ring, &n);
                if (n >= sizeof(grumpkin::fq)) {
                    std::memcpy(&result, data, sizeof(grumpkin::fq));
                    spsc_release(response_ring, n);
                    break;
                }
                if (n > 0) {
                    spsc_release(response_ring, n);
                }
            }
        }

        DoNotOptimize(result);
    }
}
BENCHMARK_REGISTER_F(Poseidon2ShmMPSC, poseiden_hash_roundtrip)
    ->Unit(benchmark::kMicrosecond)
    ->Iterations(10000); // Fixed iterations to avoid expensive warmup phase with process forking

// Unified Unix Domain Socket fixture template: supports both SPSC (NumClients=1) and MPSC (NumClients>1)
template <size_t NumClients> class Poseidon2SocketFixture : public Fixture {
  public:
    static_assert(NumClients >= 1, "Must have at least 1 client");

    std::array<struct uds_client*, NumClients> clients;
    pid_t server_pid;
    std::array<std::thread, (NumClients > 1 ? NumClients - 1 : 1)> background_threads;
    std::atomic<bool> stop_background;
    grumpkin::fq x, y;

    const char* socket_path = "/tmp/poseidon_socket_bench";

    void SetUp(const ::benchmark::State& /*unused*/) override
    {
        stop_background.store(false);

        // Clean up any leftover socket
        unlink(socket_path);

        // Fork server process
        server_pid = fork();
        if (server_pid == 0) {
            // Child process - server
            close(STDOUT_FILENO);
            close(STDERR_FILENO);

            struct uds_server* server = uds_server_create(socket_path, static_cast<int>(NumClients));
            if (!server) {
                _exit(1);
            }

            // Accept NumClients connections
            for (size_t i = 0; i < NumClients; i++) {
                int client_id = uds_server_accept(server, -1); // Blocking accept
                if (client_id < 0) {
                    uds_server_close(server);
                    _exit(1);
                }
            }

            // Server loop: process requests from all clients
            while (true) {
                int client_id = uds_server_wait_for_data(server, 100000);
                if (client_id < 0) {
                    continue;
                }

                std::array<uint8_t, 64> req_buf;
                ssize_t n = uds_server_recv(server, client_id, req_buf.data(), sizeof(req_buf));
                if (n >= 64) {
                    grumpkin::fq x;
                    grumpkin::fq y;
                    std::memcpy(&x, req_buf.data(), 32);
                    std::memcpy(&y, req_buf.data() + 32, 32);

                    // Process hash
                    grumpkin::fq result = poseiden_hash_impl(x, y);

                    // Send response
                    std::array<uint8_t, 32> resp_buf;
                    std::memcpy(resp_buf.data(), &result, 32);
                    uds_server_send(server, client_id, resp_buf.data(), 32);
                }
            }

            uds_server_close(server);
            _exit(0);
        }

        if (server_pid < 0) {
            throw std::runtime_error("Failed to fork server");
        }

        // Wait for server to start
        std::this_thread::sleep_for(std::chrono::milliseconds(100));

        // Connect all clients
        for (size_t i = 0; i < NumClients; i++) {
            clients[i] = uds_client_connect(socket_path);
            if (!clients[i]) {
                throw std::runtime_error("Failed to connect socket client");
            }
        }

        // Spawn background client threads if NumClients > 1
        if constexpr (NumClients > 1) {
            for (size_t i = 1; i < NumClients; i++) {
                background_threads[i - 1] = std::thread([this, i]() {
                    struct uds_client* c = clients[i];
                    grumpkin::fq bx = grumpkin::fq::random_element();
                    grumpkin::fq by = grumpkin::fq::random_element();

                    uint8_t req_buf[64];
                    uint8_t resp_buf[32];

                    while (!stop_background.load(std::memory_order_relaxed)) {
                        // Send request at max rate to create contention
                        std::memcpy(req_buf, &bx, 32);
                        std::memcpy(req_buf + 32, &by, 32);

                        if (uds_client_send(c, req_buf, 64) > 0) {
                            uds_client_recv(c, resp_buf, 32);
                        }
                    }
                });
            }
        }

        // Pre-generate test inputs for benchmark thread
        x = grumpkin::fq::random_element();
        y = grumpkin::fq::random_element();
    }

    void TearDown(const ::benchmark::State&) override
    {
        // Stop background threads if any
        if constexpr (NumClients > 1) {
            stop_background.store(true);
            for (size_t i = 0; i < NumClients - 1; i++) {
                if (background_threads[i].joinable()) {
                    background_threads[i].join();
                }
            }
        }

        // Close all clients
        for (size_t i = 0; i < NumClients; i++) {
            if (clients[i]) {
                uds_client_close(clients[i]);
            }
        }

        // Kill server process
        kill(server_pid, SIGTERM);
        waitpid(server_pid, nullptr, 0);

        // Cleanup socket
        unlink(socket_path);
    }
};

// Type aliases for specific cases
using Poseidon2SocketSPSC = Poseidon2SocketFixture<1>;
using Poseidon2SocketMPSC = Poseidon2SocketFixture<3>;

BENCHMARK_DEFINE_F(Poseidon2SocketSPSC, poseiden_hash_roundtrip)(benchmark::State& state)
{
    uint8_t req_buf[64];
    uint8_t resp_buf[32];

    for (auto _ : state) {
        // Measure full roundtrip latency with single client (no contention)

        // Send request via client 0
        std::memcpy(req_buf, &x, 32);
        std::memcpy(req_buf + 32, &y, 32);
        uds_client_send(clients[0], req_buf, 64);

        // Receive response
        grumpkin::fq result;
        uds_client_recv(clients[0], resp_buf, 32);
        std::memcpy(&result, resp_buf, 32);

        DoNotOptimize(result);
    }
}
BENCHMARK_REGISTER_F(Poseidon2SocketSPSC, poseiden_hash_roundtrip)
    ->Unit(benchmark::kMicrosecond)
    ->Iterations(10000); // Fixed iterations to avoid expensive warmup phase with process forking

// MPSC benchmark using unified template
BENCHMARK_DEFINE_F(Poseidon2SocketMPSC, poseiden_hash_roundtrip)(benchmark::State& state)
{
    // Background threads (clients 1 & 2) create contention, benchmark thread uses client 0
    uint8_t req_buf[64];
    uint8_t resp_buf[32];

    for (auto _ : state) {
        // Measure full roundtrip latency under multi-client contention

        // Send request via client 0
        std::memcpy(req_buf, &x, 32);
        std::memcpy(req_buf + 32, &y, 32);
        uds_client_send(clients[0], req_buf, 64);

        // Receive response
        grumpkin::fq result;
        uds_client_recv(clients[0], resp_buf, 32);
        std::memcpy(&result, resp_buf, 32);

        DoNotOptimize(result);
    }
}
BENCHMARK_REGISTER_F(Poseidon2SocketMPSC, poseiden_hash_roundtrip)
    ->Unit(benchmark::kMicrosecond)
    ->Iterations(10000); // Fixed iterations to avoid expensive warmup phase with process forking

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
        const char* bb_paths[] = {
            "./bin/bb",              // From build-no-avm/ or build/
            "./build-no-avm/bin/bb", // From cpp/
            "./build/bin/bb",        // From cpp/
            "../bin/bb",             // From subdirectory
            "bb"                     // From PATH
        };
        for (const char* bb_path : bb_paths) {
            execl(bb_path, bb_path, "msgpack", "run", "--input", path.c_str(), nullptr);
        }
        _exit(1);
    }
    return bb_pid;
}

// BB Binary Msgpack Benchmark: Full stack test with actual bb binary
class Poseidon2BBMsgpackSocket : public Fixture {
  public:
    std::unique_ptr<ipc::IpcClient> client;
    pid_t bb_pid;
    grumpkin::fq x, y;

    const char* socket_path = "/tmp/poseidon_bb_msgpack_bench.sock";

    // Helper to check if socket file exists
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
        // Clean up any leftover socket
        unlink(socket_path);

        // Spawn bb binary in socket server mode
        bb_pid = spawn_bb_msgpack_server(socket_path);
        if (bb_pid < 0) {
            throw std::runtime_error("Failed to fork bb process");
        }

        // Wait for socket server to start (socket file to be created)
        if (!socket_exists(socket_path)) {
            kill(bb_pid, SIGKILL);
            waitpid(bb_pid, nullptr, 0);
            throw std::runtime_error("BB binary failed to create socket within timeout");
        }

        // Give server a bit more time to be fully ready
        std::this_thread::sleep_for(std::chrono::milliseconds(50));

        // Create and connect client with retries
        client = ipc::IpcClient::create_socket(socket_path);
        bool connected = false;
        for (int retry_count = 0; retry_count < 5; retry_count++) {
            if (client->connect()) {
                connected = true;
                break;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
        }

        if (!connected) {
            kill(bb_pid, SIGKILL);
            waitpid(bb_pid, nullptr, 0);
            throw std::runtime_error("Failed to connect to BB msgpack socket server after retries");
        }

        // Pre-generate test inputs
        x = grumpkin::fq::random_element();
        y = grumpkin::fq::random_element();
    }

    void TearDown(const ::benchmark::State& /*unused*/) override
    {
        if (client) {
            client->close();
        }

        // Kill bb process
        if (bb_pid > 0) {
            kill(bb_pid, SIGTERM);
            waitpid(bb_pid, nullptr, 0);
        }

        // Cleanup socket
        unlink(socket_path);
    }
};

BENCHMARK_DEFINE_F(Poseidon2BBMsgpackSocket, poseiden_hash_roundtrip)(benchmark::State& state)
{
    // Pre-allocate buffer for responses
    std::vector<uint8_t> resp_buffer(1024 * 1024); // 1MB should be enough for hash response

    for (auto _ : state) {
        // Create Poseidon2Hash command wrapped in Command NamedUnion
        bb::bbapi::Poseidon2Hash hash_cmd;
        hash_cmd.inputs = { uint256_t(x), uint256_t(y) };
        bb::bbapi::Command command{ std::move(hash_cmd) };

        // Serialize command to msgpack
        msgpack::sbuffer cmd_buffer;
        msgpack::pack(cmd_buffer, command);

        // Send command
        if (!client->send(cmd_buffer.data(), cmd_buffer.size())) {
            state.SkipWithError("Failed to send command");
            break;
        }

        // Receive response
        ssize_t n = client->recv(resp_buffer.data(), resp_buffer.size());
        if (n < 0) {
            state.SkipWithError("Failed to receive response");
            break;
        }

        // Deserialize response
        auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(resp_buffer.data()), static_cast<size_t>(n));
        bb::bbapi::CommandResponse response;
        unpacked.get().convert(response);

        // Extract hash from response (NamedUnion has conversion operator to variant)
        const auto& response_variant = static_cast<const bb::bbapi::CommandResponse::VariantType&>(response);
        const auto* hash_response = std::get_if<bb::bbapi::Poseidon2Hash::Response>(&response_variant);
        if (!hash_response) {
            state.SkipWithError("Invalid response type");
            break;
        }

        DoNotOptimize(hash_response->hash);
    }
}
BENCHMARK_REGISTER_F(Poseidon2BBMsgpackSocket, poseiden_hash_roundtrip)
    ->Unit(benchmark::kMicrosecond)
    ->Iterations(10000); // Fixed iterations to avoid expensive warmup phase with process forking

// BB Binary Msgpack Shared Memory Benchmark: Full stack test with bb binary using shared memory IPC
class Poseidon2BBMsgpackShm : public Fixture {
  public:
    std::unique_ptr<ipc::IpcClient> client;
    pid_t bb_pid;
    grumpkin::fq x, y;

    const std::string base_name = "/poseidon_bb_msgpack_shm_bench";

    void SetUp(const ::benchmark::State& /*unused*/) override
    {
        // Clean up any leftover shared memory
        mpsc_unlink(base_name.c_str(), 10);
        for (int i = 0; i < 10; i++) {
            std::string resp_name = base_name + "_response_" + std::to_string(i);
            spsc_shm_unlink(resp_name.c_str());
        }
        shm_unlink((base_name + "_next_id").c_str());

        // Spawn bb binary in shared memory server mode (path ends with .shm to activate shared memory)
        std::string shm_path = base_name + ".shm";
        bb_pid = spawn_bb_msgpack_server(shm_path);
        if (bb_pid < 0) {
            throw std::runtime_error("Failed to fork bb process");
        }

        // Wait for server to create shared memory resources
        std::this_thread::sleep_for(std::chrono::milliseconds(500));

        // Create and connect shared memory client
        client = ipc::IpcClient::create_shm(base_name, 10);
        if (!client->connect()) {
            kill(bb_pid, SIGKILL);
            waitpid(bb_pid, nullptr, 0);
            throw std::runtime_error("Failed to connect to BB shared memory server");
        }

        // Pre-generate test inputs
        x = grumpkin::fq::random_element();
        y = grumpkin::fq::random_element();
    }

    void TearDown(const ::benchmark::State& /*unused*/) override
    {
        if (client) {
            client->close();
        }

        // Kill bb process
        if (bb_pid > 0) {
            kill(bb_pid, SIGTERM);
            waitpid(bb_pid, nullptr, 0);
        }

        // Cleanup shared memory
        mpsc_unlink(base_name.c_str(), 10);
        for (int i = 0; i < 10; i++) {
            std::string resp_name = base_name + "_response_" + std::to_string(i);
            spsc_shm_unlink(resp_name.c_str());
        }
        std::string id_name = base_name + "_next_id";
        shm_unlink(id_name.c_str());
    }
};

BENCHMARK_DEFINE_F(Poseidon2BBMsgpackShm, poseiden_hash_roundtrip)(benchmark::State& state)
{
    // Pre-allocate buffer for responses
    std::vector<uint8_t> resp_buffer(1024 * 1024); // 1MB should be enough for hash response

    for (auto _ : state) {
        // Create Poseidon2Hash command wrapped in Command NamedUnion
        bb::bbapi::Poseidon2Hash hash_cmd;
        hash_cmd.inputs = { uint256_t(x), uint256_t(y) };
        bb::bbapi::Command command{ std::move(hash_cmd) };

        // Serialize command to msgpack
        msgpack::sbuffer cmd_buffer;
        msgpack::pack(cmd_buffer, command);

        // Send request
        if (!client->send(cmd_buffer.data(), cmd_buffer.size(), 1000000000)) {
            state.SkipWithError("Failed to send command");
            break;
        }

        // Receive response
        ssize_t n = client->recv(resp_buffer.data(), resp_buffer.size(), 1000000000);
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
        if (!hash_response) {
            state.SkipWithError("Invalid response type");
            break;
        }

        DoNotOptimize(hash_response->hash);
    }
}
BENCHMARK_REGISTER_F(Poseidon2BBMsgpackShm, poseiden_hash_roundtrip)
    ->Unit(benchmark::kMicrosecond)
    ->Iterations(10000); // Fixed iterations to avoid expensive warmup phase with process forking

} // namespace

BENCHMARK_MAIN();
