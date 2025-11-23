#include "barretenberg/ipc/ipc_client.hpp"
#include "barretenberg/ipc/ipc_server.hpp"
#include "barretenberg/ipc/shm/spsc_shm.hpp"
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
    constexpr size_t RING_SIZE = 8UL * 1024;
    constexpr size_t NUM_ITERATIONS = 300000;
    // Sizing ensures that no matter that state of the internal ring buffer, we can't deadlock.
    constexpr size_t MAX_MSG_SIZE = RING_SIZE / 2 - 4;

    // Use short name for macOS compatibility (31-char limit)
    std::string wrap_test_shm = "shm_wrap_" + std::to_string(getpid());
    auto server = IpcServer::create_shm(wrap_test_shm, RING_SIZE, RING_SIZE);
    ASSERT_TRUE(server->listen()) << "Wrap test server failed to listen";

    std::atomic<bool> server_running{ true };
    std::atomic<size_t> corruptions{ 0 };

    // Echo server with validation
    std::thread server_thread([&]() {
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
                std::cerr << "Server send timeout, retrying..." << '\n';
            }
            // std::cerr << "Server sent response of " << request.size() << " bytes" << '\n';
        }
    });

    std::this_thread::sleep_for(std::chrono::milliseconds(300));

    auto client = IpcClient::create_shm(wrap_test_shm);
    ASSERT_TRUE(client->connect());

    // Random message sizes between 1 byte and 8KB
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<size_t> size_dist(1, MAX_MSG_SIZE);

    // Store sizes for each iteration so receiver knows what to expect
    std::vector<size_t> iteration_sizes(NUM_ITERATIONS);
    for (size_t i = 0; i < NUM_ITERATIONS; i++) {
        iteration_sizes[i] = size_dist(gen);
        // iteration_sizes[i] = MAX_MSG_SIZE;
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
                std::cerr << "Client send timeout, retrying..." << '\n';
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

} // namespace
