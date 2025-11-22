#include "barretenberg/ipc/ipc_client.hpp"
#include "barretenberg/ipc/ipc_server.hpp"
#include "barretenberg/ipc/shm/spsc_shm.hpp"
#include <array>
#include <atomic>
#include <chrono>
#include <cstddef>
#include <cstring>
#include <functional>
#include <gtest/gtest.h>
#include <random>
#include <sstream>
#include <thread>
#include <unistd.h>
#include <vector>

using namespace bb::ipc;

namespace {

class ShmTest : public ::testing::Test {
  protected:
    std::string shm_name;

    std::unique_ptr<IpcServer> server;
    std::thread server_thread;
    std::atomic<bool> server_running{ false };
    std::atomic<size_t> requests_processed{ 0 };

    void SetUp() override
    {
        // Generate unique SHM name based on test name + PID for parallel execution
        // Use short hash-based names (macOS has 31-char limit)
        const ::testing::TestInfo* test_info = ::testing::UnitTest::GetInstance()->current_test_info();
        std::string full_name = std::string(test_info->test_suite_name()) + "_" + test_info->name();
        std::hash<std::string> hasher;
        std::ostringstream oss;
        oss << "shm_" << std::hex << (hasher(full_name) & 0xFFFFFF) << "_" << getpid();
        shm_name = oss.str();

        // Create server (SPSC - single client only)
        server = IpcServer::create_shm(shm_name);
        ASSERT_TRUE(server->listen()) << "Server failed to listen";

        // Start server thread
        server_running.store(true, std::memory_order_release);
        server_thread = std::thread([this]() {
            // Echo server: receive message and send it back

            while (server_running.load(std::memory_order_acquire)) {
                // Try to accept connections first (non-blocking)
                server->accept();

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
    auto client = IpcClient::create_shm(shm_name);

    std::cerr << "Connecting client..." << '\n';
    ASSERT_TRUE(client->connect()) << "Client failed to connect";
    std::cerr << "Client connected successfully" << '\n';

    std::vector<uint8_t> send_data = { 1, 2, 3, 4, 5 };

    std::cerr << "Sending data..." << '\n';
    ASSERT_TRUE(client->send(send_data.data(), send_data.size(), 1000000000)); // 1s timeout
    std::cerr << "Data sent, receiving..." << '\n';

    auto response = client->recv(5000000000); // 5s timeout
    std::cerr << "Received " << response.size() << " bytes" << '\n';

    ASSERT_FALSE(response.empty()) << "Failed to receive response";
    ASSERT_EQ(response.size(), send_data.size());
    EXPECT_EQ(std::memcmp(response.data(), send_data.data(), send_data.size()), 0);

    client->release(response.size());
    client->close();
}

// Test with varying message sizes to trigger ring buffer wrapping
TEST_F(ShmTest, VaryingMessageSizes)
{
    auto client = IpcClient::create_shm(shm_name);
    ASSERT_TRUE(client->connect()) << "Client failed to connect";

    // Test with different message sizes: 50, 100, 200, 400, 800, 1600 bytes
    // These sizes will cause the ring buffer head to advance to different positions
    std::vector<size_t> message_sizes = { 50, 100, 200, 400, 800, 1600 };

    for (size_t size : message_sizes) {
        std::vector<uint8_t> send_data(size);
        // Fill with recognizable pattern
        for (size_t i = 0; i < size; i++) {
            send_data[i] = static_cast<uint8_t>(i & 0xFF);
        }

        ASSERT_TRUE(client->send(send_data.data(), send_data.size(), 100000000))
            << "Failed to send message of size " << size;

        auto response = client->recv(100000000); // 100ms timeout
        ASSERT_FALSE(response.empty()) << "Failed to receive response for message size " << size;
        ASSERT_EQ(response.size(), size) << "Received size mismatch for message size " << size;

        EXPECT_EQ(std::memcmp(response.data(), send_data.data(), size), 0) << "Data mismatch for message size " << size;

        client->release(response.size());
    }

    client->close();
}

// High-volume sequential message test
// Single client sends 5000 messages (1000 iterations × 5 sizes) to validate
// sustained high-throughput single-client workloads with natural ring buffer advancement
TEST_F(ShmTest, HighVolumeSequentialMessages)
{
    auto client = IpcClient::create_shm(shm_name);
    ASSERT_TRUE(client->connect()) << "Client failed to connect";

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

            auto response = client->recv(100000000); // 100ms timeout
            ASSERT_FALSE(response.empty()) << "Failed to receive at iteration " << iter << " size " << size
                                           << " (requests processed: " << requests_processed.load() << ")";

            ASSERT_EQ(response.size(), size) << "Size mismatch at iteration " << iter << " size " << size;

            EXPECT_EQ(std::memcmp(response.data(), send_data.data(), size), 0)
                << "Data corruption at iteration " << iter << " size " << size;

            client->release(response.size());
        }
    }

    client->close();
}

// Single client with constrained buffer under high volume
// Single client sends 3000 large messages (12-18KB) to a tiny ring buffer (40KB)
// Tests buffer management under aggressive constraints isolated from concurrency issues
TEST_F(ShmTest, SingleClientSmallRingHighVolume)
{
    // VERY AGGRESSIVE: Wrap on most messages
    // 40KB ring with 12-18KB messages = wraps every 2-3 messages
    constexpr size_t TINY_RING_SIZE = 40 * 1024; // 40KB per ring
    constexpr size_t NUM_ITERATIONS = 3000;

    // Use short name for macOS compatibility (31-char limit)
    std::string wrap_test_shm = "shm_wrap_" + std::to_string(getpid());
    auto wrap_server = IpcServer::create_shm(wrap_test_shm, TINY_RING_SIZE, TINY_RING_SIZE);
    ASSERT_TRUE(wrap_server->listen()) << "Wrap test server failed to listen";

    std::atomic<bool> server_running{ true };
    std::atomic<size_t> corruptions{ 0 };

    // Echo server with validation
    std::thread server_thread([&]() {
        while (server_running.load(std::memory_order_acquire)) {
            wrap_server->accept();

            int client_id = wrap_server->wait_for_data(10000000); // 10ms
            if (client_id < 0) {
                continue;
            }

            auto request = wrap_server->receive(client_id);
            if (!request.empty()) {
                // Validate magic pattern
                if (request.size() >= 4) {
                    uint32_t magic;
                    std::memcpy(&magic, request.data(), sizeof(uint32_t));
                    if (magic != 0xDEADBEEF) {
                        corruptions.fetch_add(1);
                        std::cerr << "Magic mismatch: expected=0xDEADBEEF actual=0x" << std::hex << magic << std::dec
                                  << '\n';
                    }
                }

                wrap_server->send(client_id, request.data(), request.size());
                wrap_server->release(client_id, request.size());
            }
        }
    });

    std::this_thread::sleep_for(std::chrono::milliseconds(300));

    auto client = IpcClient::create_shm(wrap_test_shm);
    ASSERT_TRUE(client->connect());

    std::vector<uint8_t> send_buffer(24 * 1024);

    // Fill with magic pattern
    uint32_t magic = 0xDEADBEEF;
    for (size_t i = 0; i < send_buffer.size(); i += 4) {
        std::memcpy(send_buffer.data() + i, &magic, sizeof(uint32_t));
    }

    // AGGRESSIVE: Messages close to ring size = wrap every 2-3 messages
    // 40KB ring with 12-18KB messages
    std::vector<size_t> sizes = { 12288, 14336, 16384, 18432, 15360 };

    for (size_t iter = 0; iter < NUM_ITERATIONS; iter++) {
        size_t size = sizes[iter % sizes.size()];

        ASSERT_TRUE(client->send(send_buffer.data(), size, 50000000)) // 50ms
            << "Send failed at iteration " << iter;

        auto response = client->recv(50000000);
        ASSERT_FALSE(response.empty()) << "Recv failed at iteration " << iter;
        ASSERT_EQ(response.size(), size) << "Size mismatch at iteration " << iter;

        ASSERT_EQ(std::memcmp(response.data(), send_buffer.data(), size), 0) << "Data corruption at iteration " << iter;

        client->release(response.size());
    }

    client->close();

    server_running.store(false);
    wrap_server->request_shutdown();
    server_thread.join();
    wrap_server->close();

    EXPECT_EQ(corruptions.load(), 0) << "Corruptions detected in single-threaded wrap test";
}

// ================================================================================================
// DIRECT SpscShm LOW-LEVEL API TEST
// ================================================================================================
// This test directly exercises the SpscShm ring buffer API (bypassing IpcClient/Server)
// to validate low-level buffer operations with split claim/publish pattern.
//
// Tests the split operations pattern where length prefix and message data are
// claimed and published separately, ensuring correct buffer management at the lowest level.
//
// 10,000 iterations with 24KB ring and RANDOM message sizes (9 bytes to 15KB) to exercise
// many edge cases including small messages, large messages, and frequent wrap boundaries.
//
// You can really stress test this with:
// $ ./ci3/start_interactive
// $ while true; do
//     echo 'dump_fail "build/bin/ipc_tests --gtest_filter='SpscShmDirectTest.*'" >/dev/null'
//   done | parallel -j64 --halt now,fail=1
// ================================================================================================

TEST(SpscShmDirectTest, LowLevelSplitOperations)
{
    // Use VERY small ring to force wrapping on nearly every message
    constexpr size_t RING_SIZE = 24 * 1024; // 24KB
    constexpr size_t NUM_ITERATIONS = 100000;
    constexpr size_t MIN_MESSAGE_SIZE = sizeof(uint64_t) + 1; // Minimum: iteration (8 bytes) + 1 pattern byte
    constexpr size_t MAX_MESSAGE_SIZE = 15 * 1024;            // Maximum message size (15KB)

    // Create unique shared memory name with PID
    std::string shm_name = "direct_spsc_race_test_" + std::to_string(getpid());

    // Create the ring buffer
    auto producer_ring = SpscShm::create(shm_name, RING_SIZE);

    std::atomic<size_t> corruption_detected{ 0 };
    std::atomic<size_t> messages_validated{ 0 };

    // Generate random message sizes ahead of time
    // Use high-resolution clock + random_device for better entropy
    std::random_device rd;
    auto seed = rd() ^ static_cast<unsigned>(std::chrono::high_resolution_clock::now().time_since_epoch().count());
    std::mt19937 gen(seed);
    std::uniform_int_distribution<size_t> size_dist(MIN_MESSAGE_SIZE, MAX_MESSAGE_SIZE);

    std::vector<size_t> message_sizes(NUM_ITERATIONS);
    for (size_t i = 0; i < NUM_ITERATIONS; i++) {
        message_sizes[i] = size_dist(gen);
    }

    // Log seed for reproducibility if needed
    std::cerr << "Random seed: " << seed << " (save this to reproduce the exact sequence)\n";

    // Consumer thread: Consume exactly NUM_ITERATIONS messages
    std::thread consumer([&]() {
        auto consumer_ring = SpscShm::connect(shm_name);

        for (size_t expected_iteration = 0; expected_iteration < NUM_ITERATIONS; expected_iteration++) {
            // Peek and release the length prefix (4 bytes) - retry on timeout
            void* len_ptr = nullptr;
            while ((len_ptr = consumer_ring.peek(sizeof(uint32_t), 100000000)) == nullptr) {
                // Producer is behind, wait and retry
            }

            // Read message length
            uint32_t msg_len;
            std::memcpy(&msg_len, len_ptr, sizeof(uint32_t));

            // Release the length prefix
            consumer_ring.release(sizeof(uint32_t));

            // Now peek the message data - retry on timeout
            void* msg_ptr = nullptr;
            while ((msg_ptr = consumer_ring.peek(msg_len, 100000000)) == nullptr) {
                // Producer is behind, wait and retry
            }

            // Read iteration value (now at the start of message data)
            uint64_t msg_iteration;
            std::memcpy(&msg_iteration, msg_ptr, sizeof(uint64_t));

            // CHECK: Iteration must match expected sequence!
            if (msg_iteration != expected_iteration) {
                corruption_detected.fetch_add(1, std::memory_order_relaxed);
                std::cerr << "CORRUPTION: iteration mismatch expected=" << expected_iteration
                          << " actual=" << msg_iteration << "\n";
            }

            // Validate pattern: starts after iteration
            bool corrupted = false;
            auto* bytes = static_cast<uint8_t*>(msg_ptr);

            for (size_t i = sizeof(uint64_t); i < msg_len; i++) {
                // XOR offset now relative to message data start (after length was released)
                uint8_t expected = static_cast<uint8_t>((msg_iteration ^ i) & 0xFF);
                if (bytes[i] != expected) {
                    corrupted = true;
                    corruption_detected.fetch_add(1, std::memory_order_relaxed);
                    std::cerr << "CORRUPTION at iteration " << msg_iteration << " offset " << i << " expected=0x"
                              << std::hex << (int)expected << " actual=0x" << (int)bytes[i] << std::dec << "\n";
                    break;
                }
            }

            if (!corrupted && msg_iteration == expected_iteration) {
                messages_validated.fetch_add(1, std::memory_order_relaxed);
            }

            // Release the message data
            consumer_ring.release(msg_len);
        }
    });

    // Give consumer time to connect
    std::this_thread::sleep_for(std::chrono::milliseconds(100));

    // Producer thread: Write messages with random sizes
    // Allocate buffer for max message size
    std::vector<uint8_t> message_buffer(MAX_MESSAGE_SIZE + sizeof(uint32_t));

    for (size_t iter = 0; iter < NUM_ITERATIONS; iter++) {
        // Get random message size for this iteration
        size_t total_message_size = message_sizes[iter] + sizeof(uint32_t); // Include length prefix

        // Prepare message pattern: [4-byte length][8-byte iteration][pattern bytes]
        // Length excludes the length field itself
        uint32_t data_len = static_cast<uint32_t>(message_sizes[iter]);
        std::memcpy(message_buffer.data(), &data_len, sizeof(uint32_t));

        uint64_t iteration_value = iter;
        std::memcpy(message_buffer.data() + sizeof(uint32_t), &iteration_value, sizeof(uint64_t));

        // Pattern starts after length+iteration
        for (size_t i = sizeof(uint32_t) + sizeof(uint64_t); i < total_message_size; i++) {
            message_buffer[i] = static_cast<uint8_t>((iter ^ (i - sizeof(uint32_t))) & 0xFF);
        }

        // Claim and publish length prefix separately (retry on timeout)
        void* len_buf = nullptr;
        while ((len_buf = producer_ring.claim(sizeof(uint32_t), 100000000)) == nullptr) {
            // Consumer is behind, wait and retry
        }
        std::memcpy(len_buf, message_buffer.data(), sizeof(uint32_t));
        producer_ring.publish(sizeof(uint32_t));

        // Claim and publish message data separately (retry on timeout)
        void* data_buf = nullptr;
        while ((data_buf = producer_ring.claim(data_len, 100000000)) == nullptr) {
            // Consumer is behind, wait and retry
        }
        std::memcpy(data_buf, message_buffer.data() + sizeof(uint32_t), data_len);
        producer_ring.publish(data_len);
    }

    // Wait for consumer to finish processing all messages
    consumer.join();

    // Cleanup
    SpscShm::unlink(shm_name);

    // Report results
    // std::cerr << "\n=== Low-Level Split Operations Test Results ===" << '\n';
    // std::cerr << "Total iterations:         " << NUM_ITERATIONS << '\n';
    // std::cerr << "Messages validated:       " << messages_validated.load() << '\n';
    // std::cerr << "Corruption detected:      " << corruption_detected.load() << '\n';

    // Test expectations
    EXPECT_EQ(corruption_detected.load(), 0) << "*** DATA CORRUPTION DETECTED - WRAP RACE TRIGGERED! ***";
    EXPECT_EQ(messages_validated.load(), NUM_ITERATIONS) << "Not all messages were validated";
}

} // namespace
