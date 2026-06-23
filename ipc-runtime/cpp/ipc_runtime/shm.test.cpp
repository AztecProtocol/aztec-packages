#include "ipc_runtime/ipc_client.hpp"
#include "ipc_runtime/ipc_server.hpp"
#include "ipc_runtime/shm/spsc_shm.hpp"
#include "ipc_runtime/shm_client.hpp"
#include "ipc_runtime/shm_common.hpp"
#include "ipc_runtime/shm_server.hpp"
#include <array>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <csignal>
#include <cstddef>
#include <cstring>
#include <functional>
#include <gtest/gtest.h>
#include <iostream>
#include <mutex>
#include <queue>
#include <random>
#include <sstream>
#include <thread>
#include <unistd.h>
#include <vector>

using namespace ipc;

namespace {

/**
 * You can really stress test this with grind_ipc.sh
 */
TEST(ShmTest, SingleClientSmallRingHighVolume)
{
    constexpr size_t RING_SIZE = 2UL * 1024;
    constexpr size_t NUM_ITERATIONS = 10000000;
    // Sizing ensures that no matter that state of the internal ring buffer, we
    // can't deadlock.
    constexpr size_t MAX_MSG_SIZE = (RING_SIZE / 2) - 4;

    // Use short name for macOS compatibility (31-char limit)
    std::string wrap_test_shm = "shm_wrap_" + std::to_string(getpid());
    auto server = IpcServer::create_shm(wrap_test_shm, RING_SIZE, RING_SIZE);
    ASSERT_TRUE(server->listen()) << "Wrap test server failed to listen";

    std::atomic<bool> server_running{ true };
    std::atomic<size_t> corruptions{ 0 };

    // Echo server with validation
    std::thread server_thread([&]() {
        size_t iter = 0;
        while (server_running.load(std::memory_order_acquire)) {
            server->accept();

            int client_id = server->wait_for_data(10000000); // 10ms
            if (client_id < 0) {
                continue;
            }

            auto request_buf = server->receive(client_id);
            // std::cerr << "Server received " << request.size() << " bytes" << '\n';

            if (request_buf.empty()) {
                continue;
            }

            // Take a copy of the request so we can release.
            std::vector<uint8_t> request(request_buf.begin(), request_buf.end());
            server->release(client_id, request.size());

            // Validate pattern: first byte should be XOR with offsets
            // Check a few bytes to detect corruption without slowing down too much
            if (request.size() > 0) {
                uint8_t first = request[0];
                for (size_t i = 0; i < std::min(request.size(), size_t(16)); i++) {
                    uint8_t expected = static_cast<uint8_t>((first ^ i) & 0xFF);
                    if (request[i] != expected) {
                        corruptions.fetch_add(1);
                        std::cerr << "Pattern mismatch at offset " << i << ": expected=" << (int)expected
                                  << " actual=" << (int)request[i] << '\n';
                        break;
                    }
                }
            }

            // Retry send until success.
            while (!server->send(client_id, request.data(), request.size())) {
                // Timeout - retry (response ring might be full)
                std::cerr << iter << " Server send size " << request.size() << " timeout, retrying..." << '\n';
                dynamic_cast<ShmServer*>(server.get())->debug_dump();
            }
            // std::cerr << "Server sent response of " << request.size() << " bytes"
            // << '\n';
            iter++;
        }
    });

    std::this_thread::sleep_for(std::chrono::milliseconds(300));

    auto client = IpcClient::create_shm(wrap_test_shm);
    ASSERT_TRUE(client->connect());

    // Random message sizes.
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<size_t> size_dist(1, MAX_MSG_SIZE);

    // Store sizes for each iteration so receiver knows what to expect
    std::vector<size_t> iteration_sizes(NUM_ITERATIONS);
    for (size_t i = 0; i < NUM_ITERATIONS; i++) {
        iteration_sizes[i] = size_dist(gen);
        // iteration_sizes[i] = MAX_MSG_SIZE - 1;
    }

    // Sender thread: continuously send requests
    std::thread sender_thread([&]() {
        std::vector<uint8_t> send_buffer(MAX_MSG_SIZE);

        for (size_t iter = 0; iter < NUM_ITERATIONS; iter++) {
            size_t size = iteration_sizes[iter];
            // std::cerr << "Client: Iteration " << iter << ": sending " << size << "
            // bytes" << '\n';

            // Fill buffer with iteration-specific pattern
            // First byte is iteration number (mod 256), rest is XOR pattern with
            // offset
            uint8_t iter_byte = static_cast<uint8_t>(iter & 0xFF);
            for (size_t i = 0; i < size; i++) {
                send_buffer[i] = static_cast<uint8_t>((iter_byte ^ i) & 0xFF);
            }

            // Retry send until success - timeouts are expected under extreme load
            while (!client->send(send_buffer.data(), size, 100000000)) {
                // Timeout - retry (ring might be full, server might be slow)
                std::cerr << iter << " Client send size " << size << " timeout, retrying..." << '\n';
                dynamic_cast<ShmClient*>(client.get())->debug_dump();
            }
        }
    });

    // Receiver thread: continuously receive and validate responses
    std::thread receiver_thread([&]() {
        for (size_t iter = 0; iter < NUM_ITERATIONS; iter++) {
            size_t expected_size = iteration_sizes[iter];

            // Retry recv until success - timeouts are expected under extreme load
            std::span<const uint8_t> response;
            while ((response = client->receive(100000000)).empty()) {
                std::cerr << iter << " Client receive timeout, retrying..." << '\n';
                // Timeout - retry
            }
            // std::cerr << "Client received response of " << response.size() << "
            // bytes" << '\n';

            ASSERT_EQ(response.size(), expected_size) << "Size mismatch at iteration " << iter;

            // Validate entire response - check iteration byte and pattern
            uint8_t iter_byte = static_cast<uint8_t>(iter & 0xFF);
            if (response.size() > 0) {
                ASSERT_EQ(response[0], iter_byte) << "Iteration byte mismatch at iteration " << iter;
                for (size_t i = 0; i < response.size(); i++) {
                    uint8_t expected = static_cast<uint8_t>((iter_byte ^ i) & 0xFF);
                    if (response[i] != expected) {
                        FAIL() << "Data corruption at iteration " << iter << " offset " << i
                               << ": expected=" << (int)expected << " actual=" << (int)response[i];
                    }
                }
            }

            client->release(response.size());
        }
    });

    sender_thread.join();
    receiver_thread.join();

    client->close();

    server_running.store(false);
    server->request_shutdown();
    server_thread.join();
    server->close();

    EXPECT_EQ(corruptions.load(), 0) << "Corruptions detected in single-threaded wrap test";
}

/**
 * A handler returning an empty vector must still produce a (zero-length)
 * response frame, otherwise the client deadlocks waiting for it.
 */
TEST(ShmTest, ZeroLengthResponseRoundTrip)
{
    constexpr size_t RING_SIZE = 4UL * 1024;
    std::string base_name = "shm_zlen_" + std::to_string(getpid());
    auto server = IpcServer::create_shm(base_name, RING_SIZE, RING_SIZE);
    ASSERT_TRUE(server->listen());

    std::thread server_thread(
        [&] { server->run([](int, std::span<const uint8_t>) { return std::vector<uint8_t>{}; }); });

    auto client = IpcClient::create_shm(base_name);
    ASSERT_TRUE(client->connect());

    uint8_t byte = 42;
    ASSERT_TRUE(client->send(&byte, 1, 1'000'000'000ULL));

    // Bounded retry loop: data() == nullptr means timeout, a non-null span of
    // size 0 is a successful zero-length response.
    std::span<const uint8_t> resp;
    for (int i = 0; i < 50 && resp.data() == nullptr; i++) {
        resp = client->receive(100'000'000ULL);
    }
    EXPECT_NE(resp.data(), nullptr) << "zero-length response should be success, not timeout";
    EXPECT_EQ(resp.size(), 0U);
    client->release(resp.size());

    client->close();
    server->request_shutdown();
    server_thread.join();
    server->close();
}

/**
 * A timeout ≥ ~4.295s must be honored at full width: the ring API takes a
 * uint64 ns timeout, so it must not narrow to uint32 and wrap (e.g. 4.5s →
 * ~205ms). Verify a 4.5s wait_for_data survives past the 32-bit-ns wrap point
 * and sees data published at the 2s mark.
 */
TEST(ShmTest, TimeoutDoesNotWrapAbove4Seconds)
{
    constexpr size_t RING_SIZE = 4UL * 1024;
    std::string base_name = "shm_tmo_" + std::to_string(getpid());
    auto server = IpcServer::create_shm(base_name, RING_SIZE, RING_SIZE);
    ASSERT_TRUE(server->listen());

    auto client = IpcClient::create_shm(base_name);
    ASSERT_TRUE(client->connect());

    std::thread sender([&] {
        std::this_thread::sleep_for(std::chrono::seconds(2));
        uint8_t byte = 1;
        client->send(&byte, 1, 1'000'000'000ULL);
    });

    auto start = std::chrono::steady_clock::now();
    int client_id = server->wait_for_data(4'500'000'000ULL); // 4.5s — would wrap to ~205ms as uint32
    auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start);

    EXPECT_EQ(client_id, 0) << "wait_for_data should see the data sent at the 2s mark";
    EXPECT_GE(elapsed.count(), 1500) << "returned before the 2s publish — timeout wrapped";
    EXPECT_LT(elapsed.count(), 4400);

    sender.join();
    auto request = server->receive(0);
    if (!request.empty()) {
        server->release(0, request.size());
    }
    client->close();
    server->close();
}

/**
 * A corrupt length prefix in the ring (larger than any message the send side
 * could legally publish) must error out rather than waiting forever for the
 * bytes to arrive.
 */
TEST(ShmTest, RingRejectsCorruptLengthPrefix)
{
    constexpr size_t RING_SIZE = 4UL * 1024;
    std::string ring_name = "shm_corrupt_" + std::to_string(getpid());
    SpscShm::unlink(ring_name);
    auto producer = SpscShm::create(ring_name, RING_SIZE);
    auto consumer = SpscShm::connect(ring_name);

    // Forge a frame whose length prefix claims far more than capacity/2.
    void* buf = producer.claim(8, 1'000'000'000ULL);
    ASSERT_NE(buf, nullptr);
    uint32_t bogus_len = 0xFFFFFF00;
    std::memcpy(buf, &bogus_len, sizeof(bogus_len));
    producer.publish(8);

    EXPECT_THROW((void)ring_receive_msg(consumer, 10'000'000ULL), std::runtime_error);

    SpscShm::unlink(ring_name);
}

/**
 * Sanity check for the MPSC (multi-producer single-consumer) SHM transport: two
 * clients concurrently send distinct payloads and each receives back its own
 * echoed response. This is the load-bearing property MPSC adds over SPSC —
 * multiple producers must not mix up responses or block each other.
 */
TEST(ShmTest, MpscEchoTwoClients)
{
    constexpr size_t NUM_CLIENTS = 2;
    constexpr size_t NUM_MESSAGES = 200;
    constexpr size_t MSG_SIZE = 64;
    constexpr size_t RING_SIZE = 4UL * 1024;

    std::string base_name = "shm_mpsc_" + std::to_string(getpid());
    auto server = IpcServer::create_mpsc_shm(base_name, NUM_CLIENTS, RING_SIZE, RING_SIZE);
    ASSERT_TRUE(server->listen()) << "MPSC server failed to listen";

    std::atomic<bool> server_running{ true };

    // Echo server: poll for any client with data, echo it back to that client.
    std::thread server_thread([&]() {
        while (server_running.load(std::memory_order_acquire)) {
            server->accept();
            int client_id = server->wait_for_data(1000000); // 1ms
            if (client_id < 0) {
                continue;
            }
            auto request_buf = server->receive(client_id);
            if (request_buf.empty()) {
                continue;
            }
            std::vector<uint8_t> request(request_buf.begin(), request_buf.end());
            server->release(client_id, request.size());
            while (!server->send(client_id, request.data(), request.size())) {
                // Retry if the client's response ring is full.
            }
        }
    });

    std::this_thread::sleep_for(std::chrono::milliseconds(100));

    auto run_client = [&](size_t client_id) {
        auto client = IpcClient::create_mpsc_shm(base_name, client_id);
        ASSERT_TRUE(client->connect()) << "Client " << client_id << " failed to connect";

        for (size_t iter = 0; iter < NUM_MESSAGES; iter++) {
            std::vector<uint8_t> payload(MSG_SIZE);
            // First byte tags the client; remaining bytes encode (client_id, iter,
            // offset).
            payload[0] = static_cast<uint8_t>(client_id);
            for (size_t i = 1; i < MSG_SIZE; i++) {
                payload[i] = static_cast<uint8_t>((client_id ^ iter ^ i) & 0xFF);
            }

            while (!client->send(payload.data(), payload.size(), 100000000)) {
                // Retry on send timeout.
            }

            std::span<const uint8_t> response;
            while ((response = client->receive(100000000)).empty()) {
                // Retry on receive timeout.
            }

            ASSERT_EQ(response.size(), MSG_SIZE) << "client " << client_id << " iter " << iter;
            // The crucial MPSC invariant: client sees its own payload back, not
            // another client's.
            ASSERT_EQ(response[0], static_cast<uint8_t>(client_id))
                << "client " << client_id << " got cross-client response at iter " << iter;
            for (size_t i = 1; i < MSG_SIZE; i++) {
                uint8_t expected = static_cast<uint8_t>((client_id ^ iter ^ i) & 0xFF);
                ASSERT_EQ(response[i], expected) << "client " << client_id << " iter " << iter << " offset " << i;
            }
            client->release(response.size());
        }
        client->close();
    };

    std::vector<std::thread> client_threads;
    client_threads.reserve(NUM_CLIENTS);
    for (size_t id = 0; id < NUM_CLIENTS; id++) {
        client_threads.emplace_back(run_client, id);
    }
    for (auto& t : client_threads) {
        t.join();
    }

    server_running.store(false);
    server->request_shutdown();
    server_thread.join();
    server->close();
}


namespace {
// Minimal fixed-size thread pool used as a run_reactor() executor.
class ReactorTestPool {
  public:
    explicit ReactorTestPool(size_t n)
    {
        for (size_t i = 0; i < n; i++) {
            workers_.emplace_back([this] { loop(); });
        }
    }
    ~ReactorTestPool()
    {
        {
            std::lock_guard<std::mutex> lock(m_);
            stop_ = true;
        }
        cv_.notify_all();
        for (auto& w : workers_) {
            w.join();
        }
    }
    ReactorTestPool(const ReactorTestPool&) = delete;
    ReactorTestPool& operator=(const ReactorTestPool&) = delete;

    void enqueue(std::function<void()> task)
    {
        {
            std::lock_guard<std::mutex> lock(m_);
            q_.push(std::move(task));
        }
        cv_.notify_one();
    }

  private:
    void loop()
    {
        for (;;) {
            std::function<void()> task;
            {
                std::unique_lock<std::mutex> lock(m_);
                cv_.wait(lock, [this] { return stop_ || !q_.empty(); });
                if (stop_ && q_.empty()) {
                    return;
                }
                task = std::move(q_.front());
                q_.pop();
            }
            task();
        }
    }

    std::vector<std::thread> workers_;
    std::queue<std::function<void()>> q_;
    std::mutex m_;
    std::condition_variable cv_;
    bool stop_ = false;
};
} // namespace

// run_reactor() over MPSC-SHM: this is the wsdb's actual SHM transport, and the
// trickiest correctness path — the completion wake is a doorbell-seq bump that
// the reactor must observe inside its futex-arm window (see MpscConsumer::notify
// / wait_for_data). Pipeline N requests on one connection whose handlers sleep
// LONGER for earlier indices, so completions arrive reversed: a lost wake would
// stall, and a missing reorder buffer would deliver out of order.
TEST(ShmTest, MpscReactorPipelinedConcurrencyAndOrder)
{
    constexpr uint32_t N = 16;
    constexpr size_t NUM_CLIENTS = 1;
    constexpr size_t RING_SIZE = 16UL * 1024;

    std::string base_name = "shm_mpsc_reactor_" + std::to_string(getpid());
    auto server = IpcServer::create_mpsc_shm(base_name, NUM_CLIENTS, RING_SIZE, RING_SIZE);
    ASSERT_TRUE(server->listen()) << "MPSC reactor server failed to listen";

    ReactorTestPool pool(8);
    std::thread server_thread([&]() {
        server->run_reactor([&pool](int, std::span<const uint8_t> req, IpcServer::Respond respond) {
            std::vector<uint8_t> r(req.begin(), req.end());
            pool.enqueue([r = std::move(r), respond = std::move(respond)]() mutable {
                uint32_t idx = 0;
                std::memcpy(&idx, r.data(), sizeof(idx));
                std::this_thread::sleep_for(std::chrono::milliseconds(20 + (N - idx)));
                respond(std::move(r));
            });
        });
    });

    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    auto client = IpcClient::create_mpsc_shm(base_name, 0);
    ASSERT_TRUE(client->connect()) << "MPSC reactor client failed to connect";

    auto t0 = std::chrono::steady_clock::now();
    for (uint32_t i = 0; i < N; i++) {
        while (!client->send(&i, sizeof(i), 100'000'000ULL)) {
            // Retry on a transient full request ring.
        }
    }
    bool stalled = false;
    for (uint32_t i = 0; i < N; i++) {
        std::span<const uint8_t> resp;
        size_t empties = 0;
        while ((resp = client->receive(100'000'000ULL)).empty()) {
            if (++empties > 50) { // 5s grace — a lost wake shows up as a stall
                stalled = true;
                break;
            }
        }
        if (stalled) {
            break;
        }
        ASSERT_EQ(resp.size(), sizeof(uint32_t));
        uint32_t got = 0;
        std::memcpy(&got, resp.data(), sizeof(got));
        EXPECT_EQ(got, i) << "responses must arrive in per-connection request order";
        client->release(resp.size());
    }
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - t0).count();

    EXPECT_FALSE(stalled) << "receiver stalled — a completion wake was lost over MPSC";
    // Serial would be the sum of sleeps (~456ms); 8 workers should be far less.
    EXPECT_LT(ms, 250) << "pipelined requests did not execute concurrently (took " << ms << "ms)";

    client->close();
    server->request_shutdown();
    server_thread.join();
    server->close();
}

TEST(ShmTest, MpscReactorMultiClientResponseRouting)
{
    constexpr uint32_t NUM_CLIENTS = 4;
    constexpr uint32_t K = 128;
    constexpr size_t RING_SIZE = 64UL * 1024;

    std::string base_name = "shm_mpsc_multi_" + std::to_string(getpid());
    auto server = IpcServer::create_mpsc_shm(base_name, NUM_CLIENTS, RING_SIZE, RING_SIZE);
    ASSERT_TRUE(server->listen()) << "MPSC multi-client server failed to listen";

    ReactorTestPool pool(8);
    std::thread server_thread([&]() {
        server->run_reactor([&pool](int, std::span<const uint8_t> req, IpcServer::Respond respond) {
            std::vector<uint8_t> r(req.begin(), req.end());
            pool.enqueue([r = std::move(r), respond = std::move(respond)]() mutable {
                uint32_t seq = 0;
                std::memcpy(&seq, r.data() + sizeof(uint32_t), sizeof(uint32_t));
                std::this_thread::sleep_for(std::chrono::microseconds(20 * (seq % 8)));
                respond(std::move(r));
            });
        });
    });
    std::this_thread::sleep_for(std::chrono::milliseconds(100));

    std::atomic<int> wrong_client{ 0 };
    std::atomic<int> out_of_order{ 0 };
    std::atomic<int> stalls{ 0 };

    auto run_client = [&](uint32_t c) {
        auto client = IpcClient::create_mpsc_shm(base_name, c);
        if (!client->connect()) {
            stalls++;
            return;
        }
        for (uint32_t s = 0; s < K; s++) {
            uint32_t msg[2] = { c, s };
            while (!client->send(msg, sizeof(msg), 100'000'000ULL)) {
            }
        }
        for (uint32_t s = 0; s < K; s++) {
            std::span<const uint8_t> resp;
            size_t empties = 0;
            while ((resp = client->receive(100'000'000ULL)).empty()) {
                if (++empties > 50) {
                    stalls++;
                    break;
                }
            }
            if (resp.empty()) {
                break;
            }
            uint32_t got[2] = { 0, 0 };
            std::memcpy(got, resp.data(), sizeof(got));
            if (got[0] != c) {
                wrong_client++;
            }
            if (got[1] != s) {
                out_of_order++;
            }
            client->release(resp.size());
        }
        client->close();
    };

    std::vector<std::thread> clients;
    for (uint32_t c = 0; c < NUM_CLIENTS; c++) {
        clients.emplace_back(run_client, c);
    }
    for (auto& t : clients) {
        t.join();
    }

    server->request_shutdown();
    server_thread.join();
    server->close();

    EXPECT_EQ(wrong_client.load(), 0) << "responses were routed to the wrong client";
    EXPECT_EQ(out_of_order.load(), 0) << "responses arrived out of order within a client";
    EXPECT_EQ(stalls.load(), 0) << "a client stalled waiting for its responses";
}

TEST(ShmTest, MpscReactorAutoClaimMultiClient)
{
    constexpr uint32_t NUM_CLIENTS = 4;
    constexpr uint32_t K = 128;
    constexpr size_t RING_SIZE = 64UL * 1024;

    std::string base_name = "shm_mpsc_autoclaim_" + std::to_string(getpid());
    auto server = IpcServer::create_mpsc_shm(base_name, NUM_CLIENTS, RING_SIZE, RING_SIZE);
    ASSERT_TRUE(server->listen()) << "MPSC auto-claim server failed to listen";

    ReactorTestPool pool(8);
    std::thread server_thread([&]() {
        server->run_reactor([&pool](int, std::span<const uint8_t> req, IpcServer::Respond respond) {
            std::vector<uint8_t> r(req.begin(), req.end());
            pool.enqueue([r = std::move(r), respond = std::move(respond)]() mutable {
                uint32_t seq = 0;
                std::memcpy(&seq, r.data() + sizeof(uint32_t), sizeof(uint32_t));
                std::this_thread::sleep_for(std::chrono::microseconds(20 * (seq % 8)));
                respond(std::move(r));
            });
        });
    });
    std::this_thread::sleep_for(std::chrono::milliseconds(100));

    std::atomic<int> wrong_client{ 0 };
    std::atomic<int> out_of_order{ 0 };
    std::atomic<int> stalls{ 0 };

    auto run_client = [&](uint32_t c) {
        auto client = IpcClient::create_mpsc_shm(base_name);
        if (!client->connect()) {
            stalls++;
            return;
        }
        for (uint32_t s = 0; s < K; s++) {
            uint32_t msg[2] = { c, s };
            while (!client->send(msg, sizeof(msg), 100'000'000ULL)) {
            }
        }
        for (uint32_t s = 0; s < K; s++) {
            std::span<const uint8_t> resp;
            size_t empties = 0;
            while ((resp = client->receive(100'000'000ULL)).empty()) {
                if (++empties > 50) {
                    stalls++;
                    break;
                }
            }
            if (resp.empty()) {
                break;
            }
            uint32_t got[2] = { 0, 0 };
            std::memcpy(got, resp.data(), sizeof(got));
            if (got[0] != c) {
                wrong_client++;
            }
            if (got[1] != s) {
                out_of_order++;
            }
            client->release(resp.size());
        }
        client->close();
    };

    std::vector<std::thread> clients;
    for (uint32_t c = 0; c < NUM_CLIENTS; c++) {
        clients.emplace_back(run_client, c);
    }
    for (auto& t : clients) {
        t.join();
    }

    server->request_shutdown();
    server_thread.join();
    server->close();

    EXPECT_EQ(wrong_client.load(), 0) << "self-allocated clients aliased onto a shared slot";
    EXPECT_EQ(out_of_order.load(), 0) << "responses arrived out of order within a client";
    EXPECT_EQ(stalls.load(), 0) << "a client stalled";
}

TEST(ShmTest, MpscSlotFreedOnDisconnectAndReclaimed)
{
    constexpr size_t NUM_CLIENTS = 1;
    constexpr size_t RING_SIZE = 16UL * 1024;

    std::string base_name = "shm_mpsc_reuse_" + std::to_string(getpid());
    auto server = IpcServer::create_mpsc_shm(base_name, NUM_CLIENTS, RING_SIZE, RING_SIZE);
    ASSERT_TRUE(server->listen()) << "server failed to listen";

    ReactorTestPool pool(2);
    std::thread server_thread([&]() {
        server->run_reactor([&pool](int, std::span<const uint8_t> req, IpcServer::Respond respond) {
            std::vector<uint8_t> r(req.begin(), req.end());
            pool.enqueue([r = std::move(r), respond = std::move(respond)]() mutable { respond(std::move(r)); });
        });
    });
    std::this_thread::sleep_for(std::chrono::milliseconds(100));

    auto round_trip = [](IpcClient& client, uint32_t value) -> bool {
        if (!client.send(&value, sizeof(value), 100'000'000ULL)) {
            return false;
        }
        std::span<const uint8_t> resp;
        size_t empties = 0;
        while ((resp = client.receive(100'000'000ULL)).empty()) {
            if (++empties > 50) {
                return false;
            }
        }
        uint32_t got = 0;
        std::memcpy(&got, resp.data(), sizeof(got));
        client.release(resp.size());
        return got == value;
    };

    {
        auto a = IpcClient::create_mpsc_shm(base_name);
        ASSERT_TRUE(a->connect()) << "client A failed to connect";
        EXPECT_TRUE(round_trip(*a, 0x1111)) << "client A round-trip failed";
        a->close();
    }

    auto b = IpcClient::create_mpsc_shm(base_name);
    ASSERT_TRUE(b->connect()) << "client B failed to reclaim the freed slot";
    EXPECT_TRUE(round_trip(*b, 0x2222)) << "client B round-trip over the reused ring failed";
    b->close();

    server->request_shutdown();
    server_thread.join();
    server->close();
}

} // namespace
