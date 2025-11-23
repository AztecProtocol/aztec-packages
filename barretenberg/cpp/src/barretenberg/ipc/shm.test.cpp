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

// Global cleanup for signal handling
std::atomic<bool> signal_received{ false };
void signal_handler(int signum)
{
    (void)signum;
    signal_received.store(true);
    // Exit immediately - gtest TearDown won't be called, so we rely on close() being called in destructors
    std::_Exit(128 + signum);
}

// Register signal handlers on test startup
struct SignalHandlerRegistrar {
    SignalHandlerRegistrar()
    {
        std::signal(SIGINT, signal_handler);
        std::signal(SIGTERM, signal_handler);
    }
} signal_handler_registrar;

// class ShmTest : public ::testing::Test {
//   protected:
//     std::string shm_name;

//     std::unique_ptr<IpcServer> server;
//     std::thread server_thread;
//     std::atomic<bool> server_running{ false };
//     std::atomic<size_t> requests_processed{ 0 };

//     void SetUp() override
//     {
//         // Generate unique SHM name based on test name + PID for parallel execution
//         // Use short hash-based names (macOS has 31-char limit)
//         const ::testing::TestInfo* test_info = ::testing::UnitTest::GetInstance()->current_test_info();
//         std::string full_name = std::string(test_info->test_suite_name()) + "_" + test_info->name();
//         std::hash<std::string> hasher;
//         std::ostringstream oss;
//         oss << "shm_" << std::hex << (hasher(full_name) & 0xFFFFFF) << "_" << getpid();
//         shm_name = oss.str();

//         // Create server (SPSC - single client only)
//         server = IpcServer::create_shm(shm_name);
//         ASSERT_TRUE(server->listen()) << "Server failed to listen";

//         // Start server thread
//         server_running.store(true, std::memory_order_release);
//         server_thread = std::thread([this]() {
//             // Echo server: receive message and send it back

//             while (server_running.load(std::memory_order_acquire)) {
//                 // Try to accept connections first (non-blocking)
//                 server->accept();

//                 int client_id = server->wait_for_data(100000000);
//                 if (client_id < 0) {
//                     continue; // Timeout, check running flag
//                 }

//                 // Receive message (zero-copy for SHM!)
//                 auto request = server->receive(client_id);
//                 if (!request.empty()) {
//                     // Echo the message back
//                     server->send(client_id, request.data(), request.size());
//                     requests_processed.fetch_add(1, std::memory_order_relaxed);

//                     // Release the message
//                     server->release(client_id, request.size());
//                 }
//             }
//         });

//         // Give server more time to fully initialize all shared memory segments
//         std::this_thread::sleep_for(std::chrono::milliseconds(500));
//     }

//     void TearDown() override
//     {
//         // Stop server
//         server_running.store(false, std::memory_order_release);

//         // Request shutdown (wakes blocked threads)
//         if (server_thread.joinable()) {
//             server->request_shutdown();
//             server_thread.join();
//         }

//         // Clean up resources
//         server->close();
//         server.reset();
//     }
// };

// // Test basic send/receive with small messages
// TEST_F(ShmTest, BasicEcho)
// {
//     auto client = IpcClient::create_shm(shm_name);

//     ASSERT_TRUE(client->connect()) << "Client failed to connect";

//     std::vector<uint8_t> send_data = { 1, 2, 3, 4, 5 };

//     ASSERT_TRUE(client->send(send_data.data(), send_data.size(), 1000000000)); // 1s timeout

//     auto response = client->recv(5000000000); // 5s timeout

//     ASSERT_FALSE(response.empty()) << "Failed to receive response";
//     ASSERT_EQ(response.size(), send_data.size());
//     EXPECT_EQ(std::memcmp(response.data(), send_data.data(), send_data.size()), 0);

//     client->release(response.size());
//     client->close();
// }

/**
You can really stress test this with e.g.:
$ ./ci3/start_interactive
$ while true; do
    echo 'dump_fail "build/bin/ipc_tests --gtest_filter='*SingleClientSmallRingHighVolume'" >/dev/null'
  done | parallel -j250 --halt now,fail=1
*/
TEST(ShmTest, SingleClientSmallRingHighVolume)
{
    constexpr size_t TINY_RING_SIZE = 8UL * 1024;
    constexpr size_t NUM_ITERATIONS = 100000;

    // Use short name for macOS compatibility (31-char limit)
    std::string wrap_test_shm = "shm_wrap_" + std::to_string(getpid());
    auto server = IpcServer::create_shm(wrap_test_shm, TINY_RING_SIZE, TINY_RING_SIZE);
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

    // Use 8KB buffer to allow testing up to full ring size messages
    std::vector<uint8_t> send_buffer(TINY_RING_SIZE / 2 - 4);

    // Random message sizes between 1 byte and 8KB
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<size_t> size_dist(1, send_buffer.size());

    for (size_t iter = 0; iter < NUM_ITERATIONS; iter++) {
        size_t size = size_dist(gen);
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

        // Retry recv until success - timeouts are expected under extreme load
        std::span<const uint8_t> response;
        while ((response = client->receive(100000000)).empty()) {
            // Timeout - retry
        }
        // std::cerr << "Client received response of " << response.size() << " bytes" << '\n';

        ASSERT_EQ(response.size(), size) << "Size mismatch at iteration " << iter;

        // Validate entire response - check iteration byte and pattern
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

    client->close();

    server_running.store(false);
    server->request_shutdown();
    server_thread.join();
    server->close();

    EXPECT_EQ(corruptions.load(), 0) << "Corruptions detected in single-threaded wrap test";
}

} // namespace
