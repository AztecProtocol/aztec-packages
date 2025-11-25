#include "barretenberg/ipc/ipc_client.hpp"
#include "barretenberg/ipc/ipc_server.hpp"
#include "barretenberg/ipc/shm/spsc_shm.hpp"
#include "barretenberg/ipc/shm_client.hpp"
#include "barretenberg/ipc/shm_server.hpp"
#include <array>
#include <atomic>
#include <chrono>
#include <csignal>
#include <cstddef>
#include <cstring>
#include <functional>
#include <gtest/gtest.h>
#include <iostream>
#include <random>
#include <sstream>
#include <thread>
#include <unistd.h>
#include <vector>

using namespace bb::ipc;

namespace {

/**
 * You can really stress test this with grind_ipc.sh
 */
TEST(ShmTest, SingleClientSmallRingHighVolume)
{
    constexpr size_t RING_SIZE = 2UL * 1024;
    constexpr size_t NUM_ITERATIONS = 10000000;
    // Sizing ensures that no matter that state of the internal ring buffer, we can't deadlock.
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
            // std::cerr << "Server sent response of " << request.size() << " bytes" << '\n';
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
            // std::cerr << "Client: Iteration " << iter << ": sending " << size << " bytes" << '\n';

            // Fill buffer with iteration-specific pattern
            // First byte is iteration number (mod 256), rest is XOR pattern with offset
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
            // std::cerr << "Client received response of " << response.size() << " bytes" << '\n';

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
 * Test to reproduce deadlock with specific message size sequence
 * This test uses a single-threaded, deterministic approach to control
 * the exact ordering of client and server operations.
 */
// TEST(ShmTest, DeadlockReproduction)
// {
//     constexpr size_t RING_SIZE = 8UL * 1024; // 8KB rings
//     // Max message size is half capacity minus 4 bytes (length prefix)
//     constexpr size_t MAX_MSG_SIZE = RING_SIZE / 2 - 4;

//     std::string test_shm = "shm_deadlock_" + std::to_string(getpid());
//     auto server = IpcServer::create_shm(test_shm, RING_SIZE, RING_SIZE);
//     ASSERT_TRUE(server->listen()) << "Deadlock test server failed to listen";

//     auto client = IpcClient::create_shm(test_shm);
//     ASSERT_TRUE(client->connect());

// #define snd(s)                                                                                                         \
//     {                                                                                                                  \
//         ASSERT_TRUE(client->send(std::vector<uint8_t>(s, 0).data(), s, 0));                                            \
//         dynamic_cast<ShmClient*>(client.get())->debug_dump();                                                          \
//     }
// #define rcv()                                                                                                          \
//     {                                                                                                                  \
//         auto request = server->receive(0);                                                                             \
//         ASSERT_FALSE(request.empty());                                                                                 \
//         server->release(0, request.size());                                                                            \
//         dynamic_cast<ShmServer*>(server.get())->debug_dump();                                                          \
//     }

//     snd(MAX_MSG_SIZE - 1);
//     snd(MAX_MSG_SIZE);
//     rcv();
//     rcv();
//     snd(MAX_MSG_SIZE);

//     client->close();
//     server->close();
// } // namespace

} // namespace
