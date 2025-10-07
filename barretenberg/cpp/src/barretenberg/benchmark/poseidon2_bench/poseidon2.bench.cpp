#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/bbapi/bbapi.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ipc/shm/mpsc_shm.h"
#include "barretenberg/ipc/shm/spsc_shm.h"
#include "barretenberg/ipc/socket/uds_client.h"
#include "barretenberg/ipc/socket/uds_server.h"
#include "barretenberg/serialize/msgpack_impl.hpp"
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

// IPC benchmark fixture: setup/teardown outside timing loop
class Poseidon2IPCFixture : public Fixture {
  public:
    struct spsc_shm *req_producer, *resp_consumer;
    pid_t worker_pid;
    grumpkin::fq x, y;

    const char* request_ring = "/poseidon2_bench_req";
    const char* response_ring = "/poseidon2_bench_resp";

    void SetUp(const ::benchmark::State&) override
    {
        // Clean up any leftover rings
        spsc_shm_unlink(request_ring);
        spsc_shm_unlink(response_ring);

        // Create rings
        req_producer = spsc_shm_create(request_ring, 1 << 20);
        resp_consumer = spsc_shm_create(response_ring, 1 << 20);

        if (!req_producer || !resp_consumer) {
            throw std::runtime_error("Failed to create SPSC rings");
        }

        // Fork worker process
        pid_t pid = fork();
        if (pid == 0) {
            // Child process - close output to prevent benchmark framework noise
            close(STDOUT_FILENO);
            close(STDERR_FILENO);

            struct spsc_shm* req_consumer = spsc_shm_connect(request_ring);
            struct spsc_shm* resp_producer = spsc_shm_connect(response_ring);

            if (!req_consumer || !resp_producer) {
                if (req_consumer)
                    spsc_shm_close(req_consumer);
                if (resp_producer)
                    spsc_shm_close(resp_producer);
                _exit(1);
            }

            // Worker loop
            while (true) {
                if (!spsc_wait_for_data(req_consumer, 100000)) {
                    continue;
                }

                size_t n;
                void* data = spsc_peek(req_consumer, &n);
                if (n >= 2 * sizeof(grumpkin::fq)) {
                    grumpkin::fq x, y;
                    std::memcpy(&x, data, sizeof(grumpkin::fq));
                    std::memcpy(&y, static_cast<uint8_t*>(data) + sizeof(grumpkin::fq), sizeof(grumpkin::fq));
                    spsc_release(req_consumer, n);

                    grumpkin::fq result = poseiden_hash_impl(x, y);

                    // Send response
                    while (true) {
                        if (spsc_wait_for_space(resp_producer, sizeof(grumpkin::fq), 100000)) {
                            size_t granted;
                            void* buf = spsc_claim(resp_producer, sizeof(grumpkin::fq), &granted);
                            if (granted >= sizeof(grumpkin::fq)) {
                                std::memcpy(buf, &result, sizeof(grumpkin::fq));
                                spsc_publish(resp_producer, sizeof(grumpkin::fq));
                                break;
                            }
                        }
                    }
                } else if (n > 0) {
                    spsc_release(req_consumer, n);
                }
            }

            spsc_shm_close(req_consumer);
            spsc_shm_close(resp_producer);
            _exit(0);
        }

        worker_pid = pid;

        // Wait for worker to be ready
        std::this_thread::sleep_for(std::chrono::milliseconds(50));

        // Pre-generate test inputs
        x = grumpkin::fq::random_element();
        y = grumpkin::fq::random_element();
    }

    void TearDown(const ::benchmark::State&) override
    {
        // Kill worker process
        kill(worker_pid, SIGTERM);
        waitpid(worker_pid, nullptr, 0);

        spsc_shm_close(req_producer);
        spsc_shm_close(resp_consumer);
        spsc_shm_unlink(request_ring);
        spsc_shm_unlink(response_ring);
    }
};

BENCHMARK_DEFINE_F(Poseidon2IPCFixture, poseiden_hash_spsc_roundtrip)(benchmark::State& state)
{
    for (auto _ : state) {
        // Send request
        size_t input_size = 2 * sizeof(grumpkin::fq);
        while (true) {
            if (spsc_wait_for_space(req_producer, input_size, 20000)) {
                size_t granted;
                void* buf = spsc_claim(req_producer, input_size, &granted);
                if (granted >= input_size) {
                    std::memcpy(buf, &x, sizeof(grumpkin::fq));
                    std::memcpy(static_cast<uint8_t*>(buf) + sizeof(grumpkin::fq), &y, sizeof(grumpkin::fq));
                    spsc_publish(req_producer, input_size);
                    break;
                }
            }
        }

        // Receive response
        grumpkin::fq result;
        while (true) {
            if (spsc_wait_for_data(resp_consumer, 20000)) {
                size_t n;
                void* data = spsc_peek(resp_consumer, &n);
                if (n >= sizeof(grumpkin::fq)) {
                    std::memcpy(&result, data, sizeof(grumpkin::fq));
                    spsc_release(resp_consumer, n);
                    break;
                } else if (n > 0) {
                    spsc_release(resp_consumer, n);
                }
            }
        }

        DoNotOptimize(result);
    }
}
BENCHMARK_REGISTER_F(Poseidon2IPCFixture, poseiden_hash_spsc_roundtrip)->Unit(benchmark::kMicrosecond);

// MPSC benchmark: Multiple producers, single consumer (hybrid: forked consumer + thread producers)
class Poseidon2MPSCFixture : public Fixture {
  public:
    static constexpr size_t NUM_PRODUCERS = 3;
    struct mpsc_producer* producers[NUM_PRODUCERS];
    struct spsc_shm* response_ring; // Response ring for benchmark thread (producer 0) only
    pid_t consumer_pid;
    std::thread background_threads[NUM_PRODUCERS - 1]; // All but benchmark thread
    std::atomic<bool> stop_background;
    grumpkin::fq x, y;

    const char* mpsc_name = "poseidon_mpsc_bench";
    const char* response_ring_name = "poseidon_mpsc_bench_response";

    void SetUp(const ::benchmark::State&) override
    {
        // Clean up any leftover shared memory
        mpsc_unlink(mpsc_name, NUM_PRODUCERS);
        spsc_shm_unlink(response_ring_name);

        // Fork consumer process
        consumer_pid = fork();
        if (consumer_pid == 0) {
            // Child process - close output to prevent benchmark framework noise
            close(STDOUT_FILENO);
            close(STDERR_FILENO);

            struct mpsc_consumer* consumer = mpsc_consumer_create(mpsc_name, NUM_PRODUCERS, 1 << 20);
            if (!consumer) {
                _exit(1);
            }

            // Create response ring for producer 0 (benchmark thread)
            struct spsc_shm* resp_ring = spsc_shm_create(response_ring_name, 1 << 20);
            if (!resp_ring) {
                mpsc_consumer_close(consumer);
                _exit(1);
            }

            // Consumer loop: process requests from all producers
            while (true) {
                int ring_idx = mpsc_wait_for_data(consumer, 100000);
                if (ring_idx < 0)
                    continue;

                size_t n;
                void* data = mpsc_peek(consumer, static_cast<size_t>(ring_idx), &n);
                if (n >= 2 * sizeof(grumpkin::fq)) {
                    grumpkin::fq x, y;
                    std::memcpy(&x, data, sizeof(grumpkin::fq));
                    std::memcpy(&y, static_cast<uint8_t*>(data) + sizeof(grumpkin::fq), sizeof(grumpkin::fq));

                    // Process the hash
                    grumpkin::fq result = poseiden_hash_impl(x, y);

                    // Only send response for ring 0 (benchmark thread)
                    if (ring_idx == 0) {
                        while (true) {
                            if (spsc_wait_for_space(resp_ring, sizeof(grumpkin::fq), 100000)) {
                                size_t granted;
                                void* buf = spsc_claim(resp_ring, sizeof(grumpkin::fq), &granted);
                                if (granted >= sizeof(grumpkin::fq)) {
                                    std::memcpy(buf, &result, sizeof(grumpkin::fq));
                                    spsc_publish(resp_ring, sizeof(grumpkin::fq));
                                    break;
                                }
                            }
                        }
                    }
                }
                mpsc_release(consumer, static_cast<size_t>(ring_idx), n);
            }

            spsc_shm_close(resp_ring);
            mpsc_consumer_close(consumer);
            _exit(0);
        }

        // Wait for consumer to create rings
        std::this_thread::sleep_for(std::chrono::milliseconds(100));

        // Connect all producers
        for (size_t i = 0; i < NUM_PRODUCERS; i++) {
            producers[i] = mpsc_producer_connect(mpsc_name, i);
            if (!producers[i]) {
                throw std::runtime_error("Failed to connect MPSC producer");
            }
        }

        // Connect to response ring (for benchmark thread only)
        response_ring = spsc_shm_connect(response_ring_name);
        if (!response_ring) {
            throw std::runtime_error("Failed to connect to response ring");
        }

        // Spawn background producer threads (all except producer 0 which is the benchmark thread)
        stop_background.store(false, std::memory_order_relaxed);
        for (size_t i = 0; i < NUM_PRODUCERS - 1; i++) {
            background_threads[i] = std::thread([this, i]() {
                struct mpsc_producer* p = producers[i + 1]; // Producers 1 and 2
                grumpkin::fq bx = grumpkin::fq::random_element();
                grumpkin::fq by = grumpkin::fq::random_element();

                while (!stop_background.load(std::memory_order_relaxed)) {
                    // Send request at maximum rate to create contention
                    size_t input_size = 2 * sizeof(grumpkin::fq);
                    if (mpsc_wait_for_space(p, input_size, 20000)) {
                        size_t granted;
                        void* buf = mpsc_claim(p, input_size, &granted);
                        if (granted >= input_size) {
                            std::memcpy(buf, &bx, sizeof(grumpkin::fq));
                            std::memcpy(static_cast<uint8_t*>(buf) + sizeof(grumpkin::fq), &by, sizeof(grumpkin::fq));
                            mpsc_publish(p, input_size);
                        }
                    }
                }
            });
        }

        // Pre-generate test inputs for benchmark thread
        x = grumpkin::fq::random_element();
        y = grumpkin::fq::random_element();
    }

    void TearDown(const ::benchmark::State&) override
    {
        // Stop background threads
        stop_background.store(true, std::memory_order_relaxed);
        for (auto& background_thread : background_threads) {
            if (background_thread.joinable()) {
                background_thread.join();
            }
        }

        // Close all producers
        for (auto& producer : producers) {
            if (producer) {
                mpsc_producer_close(producer);
            }
        }

        // Close response ring
        if (response_ring) {
            spsc_shm_close(response_ring);
        }

        // Kill consumer process
        kill(consumer_pid, SIGTERM);
        waitpid(consumer_pid, nullptr, 0);

        // Cleanup shared memory
        mpsc_unlink(mpsc_name, NUM_PRODUCERS);
        spsc_shm_unlink(response_ring_name);
    }
};

BENCHMARK_DEFINE_F(Poseidon2MPSCFixture, poseiden_hash_mpsc_roundtrip)(benchmark::State& state)
{
    struct mpsc_producer* p = producers[0]; // Benchmark thread uses producer 0

    for (auto _ : state) {
        // Measure full roundtrip latency under multi-producer contention
        // (Background threads are sending via producers 1 & 2 concurrently)

        // Send request via MPSC
        size_t input_size = 2 * sizeof(grumpkin::fq);
        while (true) {
            if (mpsc_wait_for_space(p, input_size, 20000)) {
                size_t granted;
                void* buf = mpsc_claim(p, input_size, &granted);
                if (granted >= input_size) {
                    std::memcpy(buf, &x, sizeof(grumpkin::fq));
                    std::memcpy(static_cast<uint8_t*>(buf) + sizeof(grumpkin::fq), &y, sizeof(grumpkin::fq));
                    mpsc_publish(p, input_size);
                    break;
                }
            }
        }

        // Receive response via SPSC response ring
        grumpkin::fq result;
        while (true) {
            if (spsc_wait_for_data(response_ring, 20000)) {
                size_t n;
                void* data = spsc_peek(response_ring, &n);
                if (n >= sizeof(grumpkin::fq)) {
                    std::memcpy(&result, data, sizeof(grumpkin::fq));
                    spsc_release(response_ring, n);
                    break;
                } else if (n > 0) {
                    spsc_release(response_ring, n);
                }
            }
        }

        DoNotOptimize(result);
    }
}
BENCHMARK_REGISTER_F(Poseidon2MPSCFixture, poseiden_hash_mpsc_roundtrip)->Unit(benchmark::kMicrosecond);

// Unix Domain Socket SPSC benchmark: Single client, single server
class Poseidon2SocketSPSCFixture : public Fixture {
  public:
    struct uds_client* client;
    pid_t server_pid;
    grumpkin::fq x, y;

    const char* socket_path = "/tmp/poseidon_socket_spsc_bench";

    void SetUp(const ::benchmark::State&) override
    {
        // Clean up any leftover socket
        unlink(socket_path);

        // Fork server process
        server_pid = fork();
        if (server_pid == 0) {
            // Child process - server
            close(STDOUT_FILENO);
            close(STDERR_FILENO);

            struct uds_server* server = uds_server_create(socket_path, 1);
            if (!server) {
                _exit(1);
            }

            // Accept single client
            int client_id = uds_server_accept(server, -1);
            if (client_id < 0) {
                uds_server_close(server);
                _exit(1);
            }

            // Server loop: process requests from single client
            while (true) {
                int cid = uds_server_wait_for_data(server, 100000);
                if (cid < 0)
                    continue;

                uint8_t req_buf[64];
                ssize_t n = uds_server_recv(server, cid, req_buf, sizeof(req_buf));
                if (n >= 64) {
                    grumpkin::fq x, y;
                    std::memcpy(&x, req_buf, 32);
                    std::memcpy(&y, req_buf + 32, 32);

                    // Process hash
                    grumpkin::fq result = poseiden_hash_impl(x, y);

                    // Send response
                    uint8_t resp_buf[32];
                    std::memcpy(resp_buf, &result, 32);
                    uds_server_send(server, cid, resp_buf, 32);
                }
            }

            uds_server_close(server);
            _exit(0);
        }

        // Wait for server to start
        std::this_thread::sleep_for(std::chrono::milliseconds(100));

        // Connect client
        client = uds_client_connect(socket_path);
        if (!client) {
            throw std::runtime_error("Failed to connect socket client");
        }

        // Pre-generate test inputs
        x = grumpkin::fq::random_element();
        y = grumpkin::fq::random_element();
    }

    void TearDown(const ::benchmark::State&) override
    {
        if (client) {
            uds_client_close(client);
        }

        // Kill server process
        kill(server_pid, SIGTERM);
        waitpid(server_pid, nullptr, 0);

        // Cleanup socket
        unlink(socket_path);
    }
};

BENCHMARK_DEFINE_F(Poseidon2SocketSPSCFixture, poseiden_hash_socket_spsc_roundtrip)(benchmark::State& state)
{
    uint8_t req_buf[64];
    uint8_t resp_buf[32];

    for (auto _ : state) {
        // Measure full roundtrip latency with single client (no contention)

        // Send request via socket
        std::memcpy(req_buf, &x, 32);
        std::memcpy(req_buf + 32, &y, 32);
        uds_client_send(client, req_buf, 64);

        // Receive response
        grumpkin::fq result;
        uds_client_recv(client, resp_buf, 32);
        std::memcpy(&result, resp_buf, 32);

        DoNotOptimize(result);
    }
}
BENCHMARK_REGISTER_F(Poseidon2SocketSPSCFixture, poseiden_hash_socket_spsc_roundtrip)->Unit(benchmark::kMicrosecond);

// Unix Domain Socket MPSC benchmark: Multiple clients, single server
class Poseidon2SocketFixture : public Fixture {
  public:
    static constexpr size_t NUM_CLIENTS = 3;
    struct uds_client* clients[NUM_CLIENTS];
    pid_t server_pid;
    std::thread background_threads[NUM_CLIENTS - 1];
    std::atomic<bool> stop_background;
    grumpkin::fq x, y;

    const char* socket_path = "/tmp/poseidon_socket_bench";

    void SetUp(const ::benchmark::State&) override
    {
        // Clean up any leftover socket
        unlink(socket_path);

        // Fork server process
        server_pid = fork();
        if (server_pid == 0) {
            // Child process - server
            close(STDOUT_FILENO);
            close(STDERR_FILENO);

            struct uds_server* server = uds_server_create(socket_path, NUM_CLIENTS);
            if (!server) {
                _exit(1);
            }

            // Accept NUM_CLIENTS connections
            for (size_t i = 0; i < NUM_CLIENTS; i++) {
                int client_id = uds_server_accept(server, -1); // Blocking accept
                if (client_id < 0) {
                    uds_server_close(server);
                    _exit(1);
                }
            }

            // Server loop: process requests from all clients
            while (true) {
                int client_id = uds_server_wait_for_data(server, 100000);
                if (client_id < 0)
                    continue;

                uint8_t req_buf[64];
                ssize_t n = uds_server_recv(server, client_id, req_buf, sizeof(req_buf));
                if (n >= 64) {
                    grumpkin::fq x, y;
                    std::memcpy(&x, req_buf, 32);
                    std::memcpy(&y, req_buf + 32, 32);

                    // Process hash
                    grumpkin::fq result = poseiden_hash_impl(x, y);

                    // Send response
                    uint8_t resp_buf[32];
                    std::memcpy(resp_buf, &result, 32);
                    uds_server_send(server, client_id, resp_buf, 32);
                }
            }

            uds_server_close(server);
            _exit(0);
        }

        // Wait for server to start
        std::this_thread::sleep_for(std::chrono::milliseconds(100));

        // Connect all clients
        for (size_t i = 0; i < NUM_CLIENTS; i++) {
            clients[i] = uds_client_connect(socket_path);
            if (!clients[i]) {
                throw std::runtime_error("Failed to connect socket client");
            }
        }

        // Spawn background client threads (all except client 0)
        stop_background.store(false, std::memory_order_relaxed);
        for (size_t i = 0; i < NUM_CLIENTS - 1; i++) {
            background_threads[i] = std::thread([this, i]() {
                struct uds_client* c = clients[i + 1]; // Clients 1 and 2
                grumpkin::fq bx = grumpkin::fq::random_element();
                grumpkin::fq by = grumpkin::fq::random_element();

                uint8_t req_buf[64];
                uint8_t resp_buf[32];

                while (!stop_background.load(std::memory_order_relaxed)) {
                    // Send request at max rate
                    std::memcpy(req_buf, &bx, 32);
                    std::memcpy(req_buf + 32, &by, 32);

                    if (uds_client_send(c, req_buf, 64) > 0) {
                        uds_client_recv(c, resp_buf, 32);
                    }
                }
            });
        }

        // Pre-generate test inputs for benchmark thread
        x = grumpkin::fq::random_element();
        y = grumpkin::fq::random_element();
    }

    void TearDown(const ::benchmark::State&) override
    {
        // Stop background threads
        stop_background.store(true, std::memory_order_relaxed);
        for (auto& background_thread : background_threads) {
            if (background_thread.joinable()) {
                background_thread.join();
            }
        }

        // Close all clients
        for (auto& client : clients) {
            if (client) {
                uds_client_close(client);
            }
        }

        // Kill server process
        kill(server_pid, SIGTERM);
        waitpid(server_pid, nullptr, 0);

        // Cleanup socket
        unlink(socket_path);
    }
};

BENCHMARK_DEFINE_F(Poseidon2SocketFixture, poseiden_hash_socket_roundtrip)(benchmark::State& state)
{
    struct uds_client* c = clients[0]; // Benchmark thread uses client 0
    uint8_t req_buf[64];
    uint8_t resp_buf[32];

    for (auto _ : state) {
        // Measure full roundtrip latency under multi-client contention
        // (Background threads are sending via clients 1 & 2 concurrently)

        // Send request via socket
        std::memcpy(req_buf, &x, 32);
        std::memcpy(req_buf + 32, &y, 32);
        uds_client_send(c, req_buf, 64);

        // Receive response
        grumpkin::fq result;
        uds_client_recv(c, resp_buf, 32);
        std::memcpy(&result, resp_buf, 32);

        DoNotOptimize(result);
    }
}
BENCHMARK_REGISTER_F(Poseidon2SocketFixture, poseiden_hash_socket_roundtrip)->Unit(benchmark::kMicrosecond);

// BB Binary Msgpack Benchmark: Full stack test with actual bb binary
class Poseidon2BBMsgpackFixture : public Fixture {
  public:
    struct uds_client* client;
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

    void SetUp(const ::benchmark::State&) override
    {
        // Clean up any leftover socket
        unlink(socket_path);

        // Spawn bb binary in socket server mode
        bb_pid = fork();
        if (bb_pid == 0) {
            // Child process - run bb binary
            // Redirect stdout/stderr to /dev/null to prevent noise in benchmark output
            int devnull = open("/dev/null", O_WRONLY);
            if (devnull >= 0) {
                dup2(devnull, STDOUT_FILENO);
                dup2(devnull, STDERR_FILENO);
                close(devnull);
            }

            // Execute bb binary with msgpack socket server
            // Use absolute path - bb binary is in ../bin/bb relative to benchmark executable
            // or we can search in known locations
            const char* bb_paths[] = {
                "./build-no-avm/bin/bb", // Relative to repo root
                "./build/bin/bb",        // Alternative build dir
                "../bin/bb",             // Relative to benchmark location
                "bb"                     // Fall back to PATH
            };

            for (const char* bb_path : bb_paths) {
                execl(bb_path, bb_path, "msgpack", "run", "--input", socket_path, nullptr);
            }

            // If all exec attempts fail, try execlp as last resort
            execlp("bb", "bb", "msgpack", "run", "--input", socket_path, nullptr);

            // If execlp fails, exit
            _exit(1);
        }

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

        // Connect client with retries
        int retry_count = 0;
        while (retry_count < 5) {
            client = uds_client_connect(socket_path);
            if (client) {
                break;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(50));
            retry_count++;
        }

        if (!client) {
            kill(bb_pid, SIGKILL);
            waitpid(bb_pid, nullptr, 0);
            throw std::runtime_error("Failed to connect to BB msgpack socket server after retries");
        }

        // Pre-generate test inputs
        x = grumpkin::fq::random_element();
        y = grumpkin::fq::random_element();
    }

    void TearDown(const ::benchmark::State&) override
    {
        if (client) {
            uds_client_close(client);
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

BENCHMARK_DEFINE_F(Poseidon2BBMsgpackFixture, poseiden_hash_bb_msgpack_roundtrip)(benchmark::State& state)
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

        // Send command (uds_client_send handles length prefix automatically)
        ssize_t sent = uds_client_send(client, cmd_buffer.data(), cmd_buffer.size());
        if (sent < 0) {
            state.SkipWithError("Failed to send command");
            break;
        }

        // Receive response (uds_client_recv handles length prefix automatically)
        ssize_t n = uds_client_recv(client, resp_buffer.data(), resp_buffer.size());
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
        auto* hash_response = std::get_if<bb::bbapi::Poseidon2Hash::Response>(&response_variant);
        if (!hash_response) {
            state.SkipWithError("Invalid response type");
            break;
        }

        DoNotOptimize(hash_response->hash);
    }
}
BENCHMARK_REGISTER_F(Poseidon2BBMsgpackFixture, poseiden_hash_bb_msgpack_roundtrip)
    ->Unit(benchmark::kMicrosecond)
    ->Iterations(10000); // Fixed iterations to avoid expensive warmup phase with process forking

// BB Binary Msgpack Shared Memory Benchmark: Full stack test with bb binary using shared memory IPC
class Poseidon2BBMsgpackShmFixture : public Fixture {
  public:
    pid_t bb_pid;
    uint32_t client_id;
    struct mpsc_producer* producer;
    struct spsc_shm* response_ring;
    grumpkin::fq x, y;
    std::string base_name;

    void SetUp(const ::benchmark::State&) override
    {
        // Create unique name for this benchmark run to avoid conflicts with multiple SetUp() calls
        base_name = "/poseidon_bb_msgpack_shm_bench_" + std::to_string(getpid()) + "_" +
                    std::to_string(std::chrono::steady_clock::now().time_since_epoch().count());

        // Clean up any leftover shared memory from previous runs
        mpsc_unlink(base_name.c_str(), 10);
        for (int i = 0; i < 10; i++) {
            std::string resp_name = base_name + "_response_" + std::to_string(i);
            spsc_shm_unlink(resp_name.c_str());
        }
        shm_unlink((base_name + "_next_id").c_str());

        // Spawn bb binary in shared memory server mode
        bb_pid = fork();
        if (bb_pid == 0) {
            // Child process - run bb binary
            // Redirect stdout/stderr to /dev/null to prevent noise in benchmark output
            int devnull = open("/dev/null", O_WRONLY);
            if (devnull >= 0) {
                dup2(devnull, STDOUT_FILENO);
                dup2(devnull, STDERR_FILENO);
                close(devnull);
            }

            // Execute bb binary with msgpack shared memory server
            // Path ends with .shm to activate shared memory mode
            std::string shm_path = std::string(base_name) + ".shm";
            const char* bb_paths[] = {
                "./build-no-avm/bin/bb", // Relative to repo root
                "./build/bin/bb",        // Alternative build dir
                "../bin/bb",             // Relative to benchmark location
                "bb"                     // Fall back to PATH
            };

            for (const char* bb_path : bb_paths) {
                execl(bb_path, bb_path, "msgpack", "run", "--input", shm_path.c_str(), nullptr);
            }

            // If all exec attempts fail, try execlp as last resort
            execlp("bb", "bb", "msgpack", "run", "--input", shm_path.c_str(), nullptr);

            // If execlp fails, exit
            _exit(1);
        }

        if (bb_pid < 0) {
            throw std::runtime_error("Failed to fork bb process");
        }

        // Wait for server to create shared memory resources
        std::this_thread::sleep_for(std::chrono::milliseconds(500));

        // Atomically claim a client ID
        std::string id_name = base_name + "_next_id";
        int id_fd = shm_open(id_name.c_str(), O_RDWR, 0666);
        if (id_fd < 0) {
            kill(bb_pid, SIGKILL);
            waitpid(bb_pid, nullptr, 0);
            throw std::runtime_error("Failed to open client ID allocator");
        }

        auto* next_id = static_cast<std::atomic<uint32_t>*>(
            mmap(nullptr, sizeof(std::atomic<uint32_t>), PROT_READ | PROT_WRITE, MAP_SHARED, id_fd, 0));
        if (next_id == MAP_FAILED) {
            close(id_fd);
            kill(bb_pid, SIGKILL);
            waitpid(bb_pid, nullptr, 0);
            throw std::runtime_error("Failed to map client ID allocator");
        }

        client_id = next_id->fetch_add(1, std::memory_order_relaxed);
        munmap(next_id, sizeof(std::atomic<uint32_t>));
        close(id_fd);

        if (client_id >= 10) {
            kill(bb_pid, SIGKILL);
            waitpid(bb_pid, nullptr, 0);
            throw std::runtime_error("Too many clients (max 10)");
        }

        // Connect as MPSC producer (for requests)
        producer = mpsc_producer_connect(base_name.c_str(), client_id);
        if (!producer) {
            kill(bb_pid, SIGKILL);
            waitpid(bb_pid, nullptr, 0);
            throw std::runtime_error("Failed to connect as MPSC producer");
        }

        // Connect to response ring as SPSC consumer
        std::string resp_name = base_name + "_response_" + std::to_string(client_id);
        response_ring = spsc_shm_connect(resp_name.c_str());
        if (!response_ring) {
            mpsc_producer_close(producer);
            kill(bb_pid, SIGKILL);
            waitpid(bb_pid, nullptr, 0);
            throw std::runtime_error("Failed to connect to response ring");
        }

        // Pre-generate test inputs
        x = grumpkin::fq::random_element();
        y = grumpkin::fq::random_element();
    }

    void TearDown(const ::benchmark::State&) override
    {
        if (response_ring) {
            spsc_shm_close(response_ring);
        }

        if (producer) {
            mpsc_producer_close(producer);
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

BENCHMARK_DEFINE_F(Poseidon2BBMsgpackShmFixture, poseiden_hash_bb_msgpack_shm_roundtrip)(benchmark::State& state)
{
    for (auto _ : state) {
        bool error = false;

        // Create Poseidon2Hash command wrapped in Command NamedUnion
        bb::bbapi::Poseidon2Hash hash_cmd;
        hash_cmd.inputs = { uint256_t(x), uint256_t(y) };
        bb::bbapi::Command command{ std::move(hash_cmd) };

        // Serialize command to msgpack
        msgpack::sbuffer cmd_buffer;
        msgpack::pack(cmd_buffer, command);

        // Send request via MPSC (retry until we get enough space)
        while (true) {
            if (mpsc_wait_for_space(producer, cmd_buffer.size(), 1000000000)) {
                size_t granted;
                void* buf = mpsc_claim(producer, cmd_buffer.size(), &granted);
                if (granted >= cmd_buffer.size()) {
                    std::memcpy(buf, cmd_buffer.data(), cmd_buffer.size());
                    mpsc_publish(producer, cmd_buffer.size());
                    break;
                }
            } else {
                state.SkipWithError("Timeout waiting for space in request ring");
                error = true;
                break;
            }
        }

        if (error)
            break;

        // Receive response via SPSC
        if (!spsc_wait_for_data(response_ring, 1000000000)) {
            state.SkipWithError("Timeout waiting for response");
            break;
        }

        size_t n;
        void* data = spsc_peek(response_ring, &n);
        if (!data || n == 0) {
            spsc_release(response_ring, n);
            state.SkipWithError("Empty response");
            break;
        }

        // Deserialize response
        auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(data), n);
        bb::bbapi::CommandResponse response;
        unpacked.get().convert(response);

        // Release response data
        spsc_release(response_ring, n);

        // Extract hash from response
        const auto& response_variant = static_cast<const bb::bbapi::CommandResponse::VariantType&>(response);
        auto* hash_response = std::get_if<bb::bbapi::Poseidon2Hash::Response>(&response_variant);
        if (!hash_response) {
            state.SkipWithError("Invalid response type");
            break;
        }

        DoNotOptimize(hash_response->hash);
    }
}
BENCHMARK_REGISTER_F(Poseidon2BBMsgpackShmFixture, poseiden_hash_bb_msgpack_shm_roundtrip)
    ->Unit(benchmark::kMicrosecond)
    ->Iterations(10000); // Fixed iterations to avoid expensive warmup phase with process forking

BENCHMARK_MAIN();
