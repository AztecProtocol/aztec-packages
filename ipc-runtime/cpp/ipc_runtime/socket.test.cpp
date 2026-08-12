#include "ipc_runtime/ipc_client.hpp"
#include "ipc_runtime/ipc_server.hpp"
#include <cerrno>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstring>
#include <functional>
#include <future>
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

    auto client = IpcClient::create_socket(path);
    ASSERT_TRUE(client->connect());

    auto t0 = std::chrono::steady_clock::now();
    for (uint32_t i = 0; i < N; i++) {
        ASSERT_TRUE(client->send(i + 1, &i, sizeof(i), 1'000'000'000ULL));
    }
    // Responses arrive in completion order (earlier indices sleep longer, so
    // they arrive out of send order); the echoed request id pairs each frame
    // with its request.
    uint32_t seen_mask = 0;
    bool in_send_order = true;
    for (uint32_t i = 0; i < N; i++) {
        uint64_t rid = 0;
        auto resp = client->receive(5'000'000'000ULL, rid);
        ASSERT_EQ(resp.size(), sizeof(uint32_t));
        uint32_t got = 0;
        std::memcpy(&got, resp.data(), sizeof(got));
        ASSERT_GE(rid, 1U);
        ASSERT_LE(rid, N);
        EXPECT_EQ(got, static_cast<uint32_t>(rid - 1)) << "response payload does not match its echoed request id";
        EXPECT_EQ(seen_mask & (1U << got), 0U) << "duplicate response for index " << got;
        seen_mask |= 1U << got;
        if (got != i) {
            in_send_order = false;
        }
        client->release(resp.size());
    }
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - t0).count();

    EXPECT_EQ(seen_mask, (1U << N) - 1) << "not every request was answered exactly once";
    // Reversed sleeps guarantee out-of-order completions; a fully in-order
    // arrival would mean responses are being re-serialized somewhere.
    EXPECT_FALSE(in_send_order) << "responses arrived strictly in send order — head-of-line blocking is back?";

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

// A connection that dies with a request still in flight leaves a late respond(). Client ids are
// never reused, so that response has nowhere valid to go — the reactor must drop it, and the next
// connection (a fresh id) must see only its own frames. Positional clients (the TS AsyncApi)
// depend on this: a single leaked frame shifts every subsequent response onto the wrong caller.
//
// Protocol: request = [tag]; response = [tag, client_id]. Tag 'A' defers its response behind a
// test-controlled gate (scripted completion order, no sleeps-as-sync); any other tag responds
// inline. The client_id echo pins the never-reused-id invariant directly.
// Sockets have no ring reuse: a frame whose id matches nothing the client sent
// means the correlation is genuinely broken, and the serial convenience
// receive() must close rather than skip (contrast the SHM stale-frame test).
TEST(SocketTest, SerialClientClosesOnForeignFrame)
{
    std::string path = test_socket_path("foreign");
    auto server = IpcServer::create_socket(path, 2);
    ASSERT_TRUE(server->listen());

    std::atomic<bool> server_running{ true };
    std::thread server_thread([&]() {
        while (server_running.load(std::memory_order_acquire)) {
            server->accept();
            int client_id = server->wait_for_data(10000000); // 10ms
            if (client_id < 0) {
                continue;
            }
            uint64_t request_id = 0;
            auto request = server->receive(client_id, request_id);
            if (request.data() == nullptr) {
                continue;
            }
            std::vector<uint8_t> payload(request.begin(), request.end());
            server->release(client_id, payload.size());
            // Respond with a wrong id first: over UDS this is a protocol error,
            // not a leftover, and the client must refuse the stream.
            uint8_t junk[3] = { 0xBA, 0xAD, 0x02 };
            server->send(client_id, 0xDEADBEEFULL, junk, sizeof(junk));
            server->send(client_id, request_id, payload.data(), payload.size());
        }
    });

    auto client = IpcClient::create_socket(path);
    ASSERT_TRUE(client->connect());

    uint8_t msg[4] = { 5, 6, 7, 8 };
    ASSERT_TRUE(client->send(msg, sizeof(msg), 1'000'000'000ULL));
    auto resp = client->receive(2'000'000'000ULL);
    EXPECT_EQ(resp.data(), nullptr) << "foreign frame over UDS must fail the call, not be skipped";

    client->close();
    server_running.store(false);
    server->request_shutdown();
    server_thread.join();
    server->close();
}

TEST(SocketTest, ReactorDropsStaleResponsesAndNeverReusesIds)
{
    std::string path = test_socket_path("staleresp");
    auto server = IpcServer::create_socket(path, 4);
    ASSERT_TRUE(server->listen());

    std::mutex gate_m;
    std::condition_variable gate_cv;
    bool gate_open = false;
    auto release_gate = [&] {
        {
            std::lock_guard<std::mutex> lock(gate_m);
            gate_open = true;
        }
        gate_cv.notify_all();
    };

    std::promise<int> a_request_seen; // fulfilled with the client_id that sent 'A'
    TestPool pool(2);

    std::thread server_thread([&] {
        server->run_reactor([&](int client_id, std::span<const uint8_t> req, IpcServer::Respond respond) {
            uint8_t tag = req[0];
            if (tag == 'A') {
                a_request_seen.set_value(client_id);
                pool.enqueue([&gate_m, &gate_cv, &gate_open, client_id, respond = std::move(respond)]() mutable {
                    std::unique_lock<std::mutex> lock(gate_m);
                    gate_cv.wait(lock, [&] { return gate_open; });
                    respond({ 'A', static_cast<uint8_t>(client_id) });
                });
            } else {
                respond({ tag, static_cast<uint8_t>(client_id) });
            }
        });
    });

    // Connection A: send 'A' (its response is now in flight behind the gate), then vanish.
    auto client_a = IpcClient::create_socket(path);
    ASSERT_TRUE(client_a->connect());
    uint8_t tag_a = 'A';
    ASSERT_TRUE(client_a->send(&tag_a, 1, 1'000'000'000ULL));
    auto a_seen = a_request_seen.get_future();
    ASSERT_EQ(a_seen.wait_for(std::chrono::seconds(2)), std::future_status::ready) << "server never saw A's request";
    int a_id = a_seen.get();
    client_a->close();

    // Let the reactor observe A's EOF before B connects — the window in which A's id would be
    // freed for reuse if ids were recycled.
    std::this_thread::sleep_for(std::chrono::milliseconds(100));

    // Connection B: sends 'B' (inline response), THEN A's zombie completes.
    auto client_b = IpcClient::create_socket(path);
    ASSERT_TRUE(client_b->connect());
    uint8_t tag_b = 'B';
    ASSERT_TRUE(client_b->send(&tag_b, 1, 1'000'000'000ULL));
    std::this_thread::sleep_for(std::chrono::milliseconds(50)); // let B's response reach the stash
    release_gate();

    auto first = client_b->receive(2'000'000'000ULL);
    ASSERT_EQ(first.size(), 2U) << "no response frame reached connection B";
    uint8_t first_tag = first[0];
    uint8_t first_id = first[1];
    client_b->release(first.size());

    EXPECT_EQ(first_tag, 'B') << "connection B's first response frame carries the dead connection A's payload "
                                 "(tag '"
                              << static_cast<char>(first_tag) << "', id " << int(first_id)
                              << ") — a stale response was delivered across connections";
    EXPECT_NE(int(first_id), a_id) << "client id was reused across connections";

    // And there must be exactly one frame: a leaked zombie shifts B's real response into a
    // second frame (which a positional client would hand to the NEXT caller).
    auto extra = client_b->receive(300'000'000ULL);
    EXPECT_TRUE(extra.empty()) << "extra frame leaked to connection B (tag '"
                               << static_cast<char>(extra.empty() ? '?' : extra[0]) << "')";
    if (!extra.empty()) {
        client_b->release(extra.size());
    }

    client_b->close();
    server->request_shutdown();
    server_thread.join();
    server->close();
}

// Control for the scenario above: when the first connection's response completes and is read
// BEFORE it disconnects, the second connection (fresh id) sees exactly its own response. Pins the
// invariant and validates the harness.
TEST(SocketTest, ReactorSequentialConnectionsAreIndependent)
{
    std::string path = test_socket_path("seq_conns");
    auto server = IpcServer::create_socket(path, 4);
    ASSERT_TRUE(server->listen());

    std::thread server_thread([&] {
        server->run_reactor([&](int client_id, std::span<const uint8_t> req, IpcServer::Respond respond) {
            respond({ req[0], static_cast<uint8_t>(client_id) });
        });
    });

    auto client_a = IpcClient::create_socket(path);
    ASSERT_TRUE(client_a->connect());
    uint8_t tag_a = 'A';
    ASSERT_TRUE(client_a->send(&tag_a, 1, 1'000'000'000ULL));
    auto resp_a = client_a->receive(2'000'000'000ULL);
    ASSERT_EQ(resp_a.size(), 2U);
    EXPECT_EQ(resp_a[0], 'A');
    uint8_t a_id = resp_a[1];
    client_a->release(resp_a.size());
    client_a->close();

    std::this_thread::sleep_for(std::chrono::milliseconds(100));

    auto client_b = IpcClient::create_socket(path);
    ASSERT_TRUE(client_b->connect());
    uint8_t tag_b = 'B';
    ASSERT_TRUE(client_b->send(&tag_b, 1, 1'000'000'000ULL));
    auto resp_b = client_b->receive(2'000'000'000ULL);
    ASSERT_EQ(resp_b.size(), 2U);
    EXPECT_EQ(resp_b[0], 'B');
    EXPECT_NE(resp_b[1], a_id) << "client id was reused across connections";
    client_b->release(resp_b.size());
    auto extra = client_b->receive(300'000'000ULL);
    EXPECT_TRUE(extra.empty());

    client_b->close();
    server->request_shutdown();
    server_thread.join();
    server->close();
}

// The reactor must survive a client that disconnects with responses still in flight: the
// reactor drops the late responses (their connection's state is gone) instead of writing them
// to the dead fd, and any
// write that does hit a peer-closed fd yields EPIPE (MSG_NOSIGNAL / SO_NOSIGPIPE), never a
// process-killing SIGPIPE. NOTE: an in-process peer-closed write can be absorbed by kernel
// buffering, so this test alone cannot prove SIGPIPE immunity — the cross-process guard is
// yarn-project/world-state's wsdb churn test, where the server lives in its own process.
TEST(SocketTest, ReactorSurvivesResponseToDeadClient)
{
    std::string path = test_socket_path("sigpipe");
    auto server = IpcServer::create_socket(path, 4);
    ASSERT_TRUE(server->listen());

    std::mutex gate_m;
    std::condition_variable gate_cv;
    bool gate_open = false;
    TestPool pool(2);

    std::thread server_thread([&] {
        server->run_reactor([&](int, std::span<const uint8_t> req, IpcServer::Respond respond) {
            std::vector<uint8_t> big(64 * 1024, req[0]); // big frames: force multiple send() calls
            pool.enqueue([&gate_m, &gate_cv, &gate_open, big = std::move(big), respond = std::move(respond)]() mutable {
                std::unique_lock<std::mutex> lock(gate_m);
                gate_cv.wait(lock, [&] { return gate_open; });
                respond(std::move(big));
            });
        });
    });

    // Pipeline several requests, then vanish without reading anything.
    auto client = IpcClient::create_socket(path);
    ASSERT_TRUE(client->connect());
    for (uint8_t t = 0; t < 4; t++) {
        ASSERT_TRUE(client->send(&t, 1, 1'000'000'000ULL));
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(100)); // let the reactor ingest all four
    client->close();

    // Release all four responses; the reactor must drop or fail them without dying.
    {
        std::lock_guard<std::mutex> lock(gate_m);
        gate_open = true;
    }
    gate_cv.notify_all();
    std::this_thread::sleep_for(std::chrono::milliseconds(300));

    // If we are still alive, the server survived its client's mid-flight death.
    server->request_shutdown();
    server_thread.join();
    server->close();
    SUCCEED();
}

} // namespace
