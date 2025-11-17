#include "barretenberg/ipc/ipc_client.hpp"
#include "barretenberg/ipc/ipc_server.hpp"
#include <array>
#include <atomic>
#include <chrono>
#include <cstddef>
#include <cstring>
#include <gtest/gtest.h>
#include <sstream>
#include <thread>
#include <vector>

using namespace bb::ipc;

namespace {

class ShmTest : public ::testing::Test {
  protected:
    static constexpr size_t MAX_CLIENTS = 3;
    std::string shm_name;

    std::unique_ptr<IpcServer> server;
    std::thread server_thread;
    std::atomic<bool> server_running{ false };
    std::atomic<size_t> requests_processed{ 0 };

    void SetUp() override
    {
        // Generate unique SHM name based on test name for parallel execution
        const ::testing::TestInfo* test_info = ::testing::UnitTest::GetInstance()->current_test_info();
        std::ostringstream oss;
        oss << "test_shm_" << test_info->test_suite_name() << "_" << test_info->name();
        shm_name = oss.str();

        // Create server
        server = IpcServer::create_shm(shm_name, MAX_CLIENTS);
        ASSERT_TRUE(server->listen()) << "Server failed to listen";

        // Start server thread
        server_running.store(true, std::memory_order_release);
        server_thread = std::thread([this]() {
            // Echo server: receive message and send it back

            while (server_running.load(std::memory_order_acquire)) {
                // Try to accept connections first (non-blocking)
                server->accept(0);

                int client_id = server->wait_for_data(100000000);
                if (client_id < 0) {
                    continue; // Timeout, check running flag
                }

                // Receive message (zero-copy for SHM!)
                auto request = server->receive(client_id);
                if (!request.empty()) {
                    // Echo the message back
                    server->send(client_id, request.data(), request.size());
                    requests_processed.fetch_add(1, std::memory_order_relaxed);

                    // Release the message
                    server->release(client_id, request.size());
                }
            }
        });

        // Give server more time to fully initialize all shared memory segments
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
    }

    void TearDown() override
    {
        // Stop server
        server_running.store(false, std::memory_order_release);

        // Request shutdown (wakes blocked threads)
        if (server_thread.joinable()) {
            server->request_shutdown();
            server_thread.join();
        }

        // Clean up resources
        server->close();
        server.reset();
    }
};

// Test basic send/receive with small messages
TEST_F(ShmTest, BasicEcho)
{
    std::cerr << "Creating client..." << '\n';
    auto client = IpcClient::create_shm(shm_name, MAX_CLIENTS);

    std::cerr << "Connecting client..." << '\n';
    ASSERT_TRUE(client->connect()) << "Client failed to connect";
    std::cerr << "Client connected successfully" << '\n';

    std::vector<uint8_t> send_data = { 1, 2, 3, 4, 5 };
    std::vector<uint8_t> recv_buffer(1024);

    std::cerr << "Sending data..." << '\n';
    ASSERT_TRUE(client->send(send_data.data(), send_data.size(), 1000000000)); // 1s timeout
    std::cerr << "Data sent, receiving..." << '\n';

    ssize_t n = client->recv(recv_buffer.data(), recv_buffer.size(), 5000000000); // 5s timeout
    std::cerr << "Received " << n << " bytes" << '\n';

    ASSERT_GT(n, 0) << "Failed to receive response";
    ASSERT_EQ(static_cast<size_t>(n), send_data.size());
    EXPECT_EQ(std::memcmp(recv_buffer.data(), send_data.data(), send_data.size()), 0);

    client->close();
}

// Test with varying message sizes to trigger ring buffer wrapping
TEST_F(ShmTest, VaryingMessageSizes)
{
    auto client = IpcClient::create_shm(shm_name, MAX_CLIENTS);
    ASSERT_TRUE(client->connect()) << "Client failed to connect";

    std::vector<uint8_t> recv_buffer(16UL * 1024 * 1024);

    // Test with different message sizes: 50, 100, 200, 400, 800, 1600 bytes
    // These sizes will cause the ring buffer head to advance to different positions
    std::vector<size_t> message_sizes = { 50, 100, 200, 400, 800, 1600 };

    for (size_t size : message_sizes) {
        std::vector<uint8_t> send_data(size);
        // Fill with recognizable pattern
        for (size_t i = 0; i < size; i++) {
            send_data[i] = static_cast<uint8_t>(i & 0xFF);
        }

        ASSERT_TRUE(client->send(send_data.data(), send_data.size(), 0)) << "Failed to send message of size " << size;

        ssize_t n = client->recv(recv_buffer.data(), recv_buffer.size(), 0);
        ASSERT_GT(n, 0) << "Failed to receive response for message size " << size;
        ASSERT_EQ(static_cast<size_t>(n), size) << "Received size mismatch for message size " << size;

        EXPECT_EQ(std::memcmp(recv_buffer.data(), send_data.data(), size), 0)
            << "Data mismatch for message size " << size;
    }

    client->close();
}

// This test reproduces the ring buffer wrapping issue from the TypeScript benchmark
// By sending many messages repeatedly, we advance the ring buffer head position
// Eventually, a message will hit the wrap boundary and fail with the unfixed implementation
TEST_F(ShmTest, RingBufferWrapStressTest)
{
    auto client = IpcClient::create_shm(shm_name, MAX_CLIENTS);
    ASSERT_TRUE(client->connect()) << "Client failed to connect";

    std::vector<uint8_t> recv_buffer(16UL * 1024 * 1024);

    // Simulate the benchmark: many iterations with varying message sizes
    // This will advance the ring head and eventually hit a wrap boundary
    const size_t num_iterations = 1000; // Reduced from 3000 for test speed

    // Test with message sizes similar to poseidon2 hash with different field counts
    // 2 fields: ~76 bytes, 4 fields: ~140 bytes, 8 fields: ~268 bytes, 16 fields: ~524 bytes
    std::vector<size_t> message_sizes = { 76, 140, 268, 524, 1036 };

    for (size_t iter = 0; iter < num_iterations; iter++) {
        for (size_t size : message_sizes) {
            std::vector<uint8_t> send_data(size);
            // Fill with iteration number so we can detect corruption
            uint32_t pattern = static_cast<uint32_t>(iter);
            for (size_t i = 0; i < size; i += 4) {
                std::memcpy(&send_data[i], &pattern, std::min(4UL, size - i));
            }

            bool send_ok = client->send(send_data.data(), send_data.size(), 100000000); // 100ms timeout
            ASSERT_TRUE(send_ok) << "Failed to send at iteration " << iter << " size " << size
                                 << " (requests processed: " << requests_processed.load() << ")";

            ssize_t n = client->recv(recv_buffer.data(), recv_buffer.size(), 100000000); // 100ms timeout
            ASSERT_GT(n, 0) << "Failed to receive at iteration " << iter << " size " << size
                            << " (requests processed: " << requests_processed.load() << ")";

            ASSERT_EQ(static_cast<size_t>(n), size) << "Size mismatch at iteration " << iter << " size " << size;

            EXPECT_EQ(std::memcmp(recv_buffer.data(), send_data.data(), size), 0)
                << "Data corruption at iteration " << iter << " size " << size;
        }
    }

    client->close();
}

// Test multiple concurrent clients to stress MPSC behavior
TEST_F(ShmTest, ConcurrentClients)
{
    constexpr size_t num_clients = 3;
    std::vector<std::thread> client_threads;
    std::atomic<size_t> failures{ 0 };

    client_threads.reserve(num_clients);
    for (size_t client_idx = 0; client_idx < num_clients; client_idx++) {
        client_threads.emplace_back([client_idx, &failures, shm_name = this->shm_name]() {
            auto client = IpcClient::create_shm(shm_name, MAX_CLIENTS);
            if (!client->connect()) {
                failures.fetch_add(1);
                return;
            }

            std::vector<uint8_t> recv_buffer(1024);

            // Each client sends 100 messages
            for (size_t i = 0; i < 100; i++) {
                std::vector<uint8_t> send_data = { static_cast<uint8_t>(client_idx), static_cast<uint8_t>(i & 0xFF) };

                if (!client->send(send_data.data(), send_data.size(), 100000000)) {
                    failures.fetch_add(1);
                    break;
                }

                ssize_t n = client->recv(recv_buffer.data(), recv_buffer.size(), 100000000);
                if (n < 0 || static_cast<size_t>(n) != send_data.size()) {
                    failures.fetch_add(1);
                    break;
                }

                if (std::memcmp(recv_buffer.data(), send_data.data(), send_data.size()) != 0) {
                    failures.fetch_add(1);
                    break;
                }
            }

            client->close();
        });
    }

    for (auto& t : client_threads) {
        t.join();
    }

    EXPECT_EQ(failures.load(), 0) << failures.load() << " failures occurred in concurrent client test";
}

} // namespace
