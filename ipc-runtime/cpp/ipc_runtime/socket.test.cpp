#include "ipc_runtime/ipc_client.hpp"
#include "ipc_runtime/ipc_server.hpp"
#include <cerrno>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstring>
#include <functional>
#include <gtest/gtest.h>
#include <mutex>
#include <queue>
#include <span>
#include <string>
#include <sys/socket.h>
#include <sys/un.h>
#include <thread>
#include <unistd.h>
#include <vector>

using namespace ipc;

namespace {

std::string test_socket_path(const char* tag)
{
    return "/tmp/ipc_socket_test_" + std::string(tag) + "_" + std::to_string(getpid()) + ".sock";
}

// Minimal fixed-size thread pool used as a run_reactor() executor in tests.
class TestPool {
  public:
    explicit TestPool(size_t n)
    {
        for (size_t i = 0; i < n; i++) {
            workers_.emplace_back([this] { loop(); });
        }
    }
    ~TestPool()
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
    TestPool(const TestPool&) = delete;
    TestPool& operator=(const TestPool&) = delete;

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

// run_reactor() must (a) execute pipelined requests on one connection
// concurrently across the pool, and (b) still deliver responses in
// per-connection request order even when handlers complete out of order. The
// handler sleeps LONGER for earlier indices, so completions arrive roughly
// reversed — the reorder buffer has to hold them until each is next-in-sequence.
TEST(SocketTest, ReactorPipelinedConcurrencyAndOrder)
{
    std::string path = test_socket_path("reactor");
    auto server = IpcServer::create_socket(path, 4);
    ASSERT_TRUE(server->listen());

    constexpr uint32_t N = 16;
    TestPool pool(8);

    std::thread server_thread([&] {
        server->run_reactor(
            [](int, std::span<const uint8_t> req) {
                uint32_t idx = 0;
                std::memcpy(&idx, req.data(), sizeof(idx));
                std::this_thread::sleep_for(std::chrono::milliseconds(20 + (N - idx)));
                return std::vector<uint8_t>(req.begin(), req.end());
            },
            [&pool](const std::function<void()>& task) { pool.enqueue(task); });
    });

    auto client = IpcClient::create_socket(path);
    ASSERT_TRUE(client->connect());

    auto t0 = std::chrono::steady_clock::now();
    for (uint32_t i = 0; i < N; i++) {
        ASSERT_TRUE(client->send(&i, sizeof(i), 1'000'000'000ULL));
    }
    for (uint32_t i = 0; i < N; i++) {
        auto resp = client->receive(5'000'000'000ULL);
        ASSERT_EQ(resp.size(), sizeof(uint32_t));
        uint32_t got = 0;
        std::memcpy(&got, resp.data(), sizeof(got));
        EXPECT_EQ(got, i) << "responses must arrive in per-connection request order";
        client->release(resp.size());
    }
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - t0).count();

    // Serial execution would be the sum of all sleeps (~456ms). With 8 workers
    // it should be a small multiple of the longest single sleep; allow headroom.
    EXPECT_LT(ms, 250) << "pipelined requests did not execute concurrently (took " << ms << "ms)";

    client->close();
    server->request_shutdown();
    server_thread.join();
    server->close();
}

TEST(SocketTest, EchoRoundTrip)
{
    std::string path = test_socket_path("echo");
    auto server = IpcServer::create_socket(path, 2);
    ASSERT_TRUE(server->listen());

    std::thread server_thread([&] {
        server->run([](int, std::span<const uint8_t> req) { return std::vector<uint8_t>(req.begin(), req.end()); });
    });

    auto client = IpcClient::create_socket(path);
    ASSERT_TRUE(client->connect());

    std::vector<uint8_t> payload = { 1, 2, 3, 4, 5 };
    ASSERT_TRUE(client->send(payload.data(), payload.size(), 1'000'000'000ULL));
    auto resp = client->receive(5'000'000'000ULL);
    ASSERT_EQ(resp.size(), payload.size());
    EXPECT_EQ(std::memcmp(resp.data(), payload.data(), payload.size()), 0);
    client->release(resp.size());

    client->close();
    server->request_shutdown();
    server_thread.join();
    server->close();
}

// A handler returning an empty vector must still produce a (zero-length)
// response frame, otherwise the client deadlocks waiting for it.
TEST(SocketTest, ZeroLengthResponseRoundTrip)
{
    std::string path = test_socket_path("zlen");
    auto server = IpcServer::create_socket(path, 2);
    ASSERT_TRUE(server->listen());

    std::thread server_thread(
        [&] { server->run([](int, std::span<const uint8_t>) { return std::vector<uint8_t>{}; }); });

    auto client = IpcClient::create_socket(path);
    ASSERT_TRUE(client->connect());

    uint8_t byte = 42;
    ASSERT_TRUE(client->send(&byte, 1, 1'000'000'000ULL));
    auto resp = client->receive(5'000'000'000ULL);
    EXPECT_NE(resp.data(), nullptr) << "zero-length response should be success, not timeout";
    EXPECT_EQ(resp.size(), 0U);
    client->release(resp.size());

    client->close();
    server->request_shutdown();
    server_thread.join();
    server->close();
}

// A corrupt/malicious length prefix must cause the server to drop the
// connection, not allocate the claimed amount.
TEST(SocketTest, ServerRejectsOversizedLengthPrefix)
{
    std::string path = test_socket_path("oversize_srv");
    auto server = IpcServer::create_socket(path, 2);
    ASSERT_TRUE(server->listen());

    std::thread server_thread([&] {
        server->run([](int, std::span<const uint8_t> req) { return std::vector<uint8_t>(req.begin(), req.end()); });
    });

    // Raw client so we can write a bogus frame.
    int fd = socket(AF_UNIX, SOCK_STREAM, 0);
    ASSERT_GE(fd, 0);
    struct sockaddr_un addr;
    std::memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    std::strncpy(addr.sun_path, path.c_str(), sizeof(addr.sun_path) - 1);
    ASSERT_EQ(::connect(fd, reinterpret_cast<struct sockaddr*>(&addr), sizeof(addr)), 0);

    uint32_t bogus_len = 0x7FFFFFFF; // ~2 GiB, way over MAX_FRAME_SIZE
    ASSERT_EQ(::send(fd, &bogus_len, sizeof(bogus_len), 0), static_cast<ssize_t>(sizeof(bogus_len)));

    // Server should close the connection. recv with a timeout so a buggy
    // server (waiting for 2 GiB of payload) fails the test instead of hanging.
    struct timeval tv = { .tv_sec = 5, .tv_usec = 0 };
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    uint8_t buf[4];
    ssize_t n = ::recv(fd, buf, sizeof(buf), 0);
    EXPECT_EQ(n, 0) << "server should have closed the connection on oversized frame";
    ::close(fd);

    server->request_shutdown();
    server_thread.join();
    server->close();
}

// Same on the client side: a bogus length prefix from the server must be
// rejected (connection closed), not trusted as an allocation size.
TEST(SocketTest, ClientRejectsOversizedLengthPrefix)
{
    std::string path = test_socket_path("oversize_cli");

    int listen_fd = socket(AF_UNIX, SOCK_STREAM, 0);
    ASSERT_GE(listen_fd, 0);
    ::unlink(path.c_str());
    struct sockaddr_un addr;
    std::memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    std::strncpy(addr.sun_path, path.c_str(), sizeof(addr.sun_path) - 1);
    ASSERT_EQ(bind(listen_fd, reinterpret_cast<struct sockaddr*>(&addr), sizeof(addr)), 0);
    ASSERT_EQ(::listen(listen_fd, 1), 0);

    std::thread fake_server([&] {
        int conn_fd = ::accept(listen_fd, nullptr, nullptr);
        if (conn_fd < 0) {
            return;
        }
        uint32_t bogus_len = 0x7FFFFFFF;
        ::send(conn_fd, &bogus_len, sizeof(bogus_len), 0);
        // Leave the connection open: a buggy client would block waiting for
        // ~2 GiB of payload (bounded by its receive timeout).
        uint8_t buf[1];
        ::recv(conn_fd, buf, sizeof(buf), 0); // returns when client closes
        ::close(conn_fd);
    });

    auto client = IpcClient::create_socket(path);
    ASSERT_TRUE(client->connect());
    auto resp = client->receive(2'000'000'000ULL);
    EXPECT_EQ(resp.data(), nullptr) << "oversized frame must be an error";

    client->close();
    fake_server.join();
    ::close(listen_fd);
    ::unlink(path.c_str());
}

} // namespace
