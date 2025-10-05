#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ipc/spsc_shm.h"
#include <benchmark/benchmark.h>
#include <cstring>
#include <signal.h>
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

BENCHMARK_DEFINE_F(Poseidon2IPCFixture, poseiden_hash_ipc_bench)(benchmark::State& state)
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
BENCHMARK_REGISTER_F(Poseidon2IPCFixture, poseiden_hash_ipc_bench)->Unit(benchmark::kMicrosecond);

BENCHMARK_MAIN();
