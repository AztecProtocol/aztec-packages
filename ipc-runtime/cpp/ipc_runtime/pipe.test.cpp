#include "ipc_runtime/ipc_client.hpp"
#include "ipc_runtime/ipc_server.hpp"
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <csignal>
#include <cstdint>
#include <cstring>
#include <functional>
#include <gtest/gtest.h>
#include <mutex>
#include <queue>
#include <thread>
#include <unistd.h>
#include <vector>

using namespace ipc;

namespace {

// Pipe writes to a closed peer must yield EPIPE, not kill the test process —
// the documented requirement on the pipe transport (bb installs
// install_default_signal_handlers, which does the same).
struct IgnoreSigpipe {
    IgnoreSigpipe() { std::signal(SIGPIPE, SIG_IGN); }
} ignore_sigpipe;

// A client<->server fd-pair link built from two pipes, as a parent spawning a
// child with piped stdio would hold them.
struct PipeLink {
    int server_in = -1;  // child stdin,  read end
    int client_out = -1; // child stdin,  write end
    int client_in = -1;  // child stdout, read end
    int server_out = -1; // child stdout, write end

    PipeLink()
    {
        int to_server[2];
        int to_client[2];
        if (::pipe(to_server) != 0 || ::pipe(to_client) != 0) {
            return;
        }
        server_in = to_server[0];
        client_out = to_server[1];
        client_in = to_client[0];
        server_out = to_client[1];
    }
};

// Minimal fixed-size thread pool used as a run_reactor() executor in tests.
class PipeTestPool {
  public:
    explicit PipeTestPool(size_t n)
    {
        for (size_t i = 0; i < n; i++) {
            workers_.emplace_back([this] {
                while (true) {
                    std::function<void()> job;
                    {
                        std::unique_lock<std::mutex> lock(m_);
                        cv_.wait(lock, [this] { return stop_ || !q_.empty(); });
                        if (stop_ && q_.empty()) {
                            return;
                        }
                        job = std::move(q_.front());
                        q_.pop();
                    }
                    job();
                }
            });
        }
    }
    ~PipeTestPool()
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
    void enqueue(std::function<void()> job)
    {
        {
            std::lock_guard<std::mutex> lock(m_);
            q_.push(std::move(job));
        }
        cv_.notify_one();
    }

  private:
    std::vector<std::thread> workers_;
    std::queue<std::function<void()>> q_;
    std::mutex m_;
    std::condition_variable cv_;
    bool stop_ = false;
};

TEST(PipeTest, ServesEchoOverFdPair)
{
    PipeLink link;
    ASSERT_GE(link.server_in, 0);

    auto server = IpcServer::create_pipe(link.server_in, link.server_out);
    ASSERT_TRUE(server->listen());
    std::thread server_thread([&] {
        server->run([](int, std::span<const uint8_t> req) { return std::vector<uint8_t>(req.begin(), req.end()); });
    });

    auto client = IpcClient::create_pipe(link.client_in, link.client_out);
    ASSERT_TRUE(client->connect());

    for (uint32_t i = 0; i < 100; i++) {
        ASSERT_TRUE(client->send(&i, sizeof(i), 1'000'000'000ULL));
        auto resp = client->receive(5'000'000'000ULL);
        ASSERT_EQ(resp.size(), sizeof(uint32_t));
        uint32_t got = 0;
        std::memcpy(&got, resp.data(), sizeof(got));
        EXPECT_EQ(got, i);
        client->release(resp.size());
    }

    // Zero-length round trip: an empty request/response is a valid frame.
    ASSERT_TRUE(client->send(nullptr, 0, 1'000'000'000ULL));
    auto empty = client->receive(5'000'000'000ULL);
    ASSERT_NE(empty.data(), nullptr);
    EXPECT_EQ(empty.size(), 0U);
    client->release(empty.size());

    // Closing the client's fds is peer EOF on the server: its lifetime is the
    // pipe, so run() must return without an explicit request_shutdown().
    client->close();
    server_thread.join();
    server->close();
}

TEST(PipeTest, PipelinedExplicitIdsEchoInOrder)
{
    PipeLink link;
    auto server = IpcServer::create_pipe(link.server_in, link.server_out);
    ASSERT_TRUE(server->listen());
    std::thread server_thread([&] {
        server->run([](int, std::span<const uint8_t> req) { return std::vector<uint8_t>(req.begin(), req.end()); });
    });

    auto client = IpcClient::create_pipe(link.client_in, link.client_out);
    ASSERT_TRUE(client->connect());

    // Several requests in flight before the first receive; the serial run()
    // loop answers FIFO and each response carries its request's echoed id.
    constexpr uint32_t N = 16;
    for (uint32_t id = 1; id <= N; id++) {
        ASSERT_TRUE(client->send(id, &id, sizeof(id), 1'000'000'000ULL));
    }
    for (uint32_t n = 0; n < N; n++) {
        uint64_t rid = 0;
        auto resp = client->receive(5'000'000'000ULL, rid);
        ASSERT_EQ(resp.size(), sizeof(uint32_t));
        uint32_t got = 0;
        std::memcpy(&got, resp.data(), sizeof(got));
        EXPECT_EQ(got, static_cast<uint32_t>(rid)) << "response payload does not match its echoed request id";
        EXPECT_EQ(rid, n + 1) << "serial pipe server must answer in request order";
        client->release(resp.size());
    }

    client->close();
    server_thread.join();
    server->close();
}

TEST(PipeTest, RunReactorDeliversCompletionOrderWithEchoedIds)
{
    PipeLink link;
    auto server = IpcServer::create_pipe(link.server_in, link.server_out);
    ASSERT_TRUE(server->listen());

    constexpr uint32_t N = 8;
    PipeTestPool pool(4);
    std::thread server_thread([&] {
        server->run_reactor([&pool](int, std::span<const uint8_t> req, IpcServer::Respond respond) {
            std::vector<uint8_t> r(req.begin(), req.end());
            pool.enqueue([r = std::move(r), respond = std::move(respond)]() mutable {
                uint32_t id = 0;
                std::memcpy(&id, r.data(), sizeof(id));
                // Earlier ids sleep longer, so completions arrive roughly
                // reversed — exercising the notify() self-pipe wake.
                std::this_thread::sleep_for(std::chrono::milliseconds(5 + 5 * (N - id)));
                respond(std::move(r));
            });
        });
    });

    auto client = IpcClient::create_pipe(link.client_in, link.client_out);
    ASSERT_TRUE(client->connect());

    for (uint32_t id = 1; id <= N; id++) {
        ASSERT_TRUE(client->send(id, &id, sizeof(id), 1'000'000'000ULL));
    }
    std::vector<bool> seen(N + 1, false);
    bool in_send_order = true;
    uint64_t prev_rid = 0;
    for (uint32_t n = 0; n < N; n++) {
        uint64_t rid = 0;
        auto resp = client->receive(5'000'000'000ULL, rid);
        ASSERT_EQ(resp.size(), sizeof(uint32_t));
        uint32_t got = 0;
        std::memcpy(&got, resp.data(), sizeof(got));
        ASSERT_GE(rid, 1U);
        ASSERT_LE(rid, N);
        EXPECT_EQ(got, static_cast<uint32_t>(rid));
        EXPECT_FALSE(seen[rid]) << "duplicate response for request id " << rid;
        seen[rid] = true;
        if (rid < prev_rid) {
            in_send_order = false;
        }
        prev_rid = rid;
        client->release(resp.size());
    }
    for (uint32_t id = 1; id <= N; id++) {
        EXPECT_TRUE(seen[id]) << "request id " << id << " was never answered";
    }
    // Reversed sleeps guarantee out-of-order completions; strictly in-order
    // arrival would mean responses are being re-serialized somewhere.
    EXPECT_FALSE(in_send_order) << "responses arrived strictly in send order over run_reactor";

    client->close();
    server_thread.join();
    server->close();
}

TEST(PipeTest, SerialClientClosesOnForeignFrame)
{
    PipeLink link;
    // A fake server that echoes a WRONG id: the serial convenience receive()
    // must treat it as a desync (pipes cannot have stale ring leftovers) and
    // close rather than deliver another request's payload.
    std::thread fake_server([&] {
        uint32_t len = 0;
        uint64_t id = 0;
        ASSERT_EQ(::read(link.server_in, &len, sizeof(len)), static_cast<ssize_t>(sizeof(len)));
        ASSERT_EQ(::read(link.server_in, &id, sizeof(id)), static_cast<ssize_t>(sizeof(id)));
        std::vector<uint8_t> payload(len - sizeof(id));
        size_t got = 0;
        while (got < payload.size()) {
            ssize_t n = ::read(link.server_in, payload.data() + got, payload.size() - got);
            ASSERT_GT(n, 0);
            got += static_cast<size_t>(n);
        }
        uint64_t wrong_id = id ^ 0xdeadbeefULL;
        ASSERT_EQ(::write(link.server_out, &len, sizeof(len)), static_cast<ssize_t>(sizeof(len)));
        ASSERT_EQ(::write(link.server_out, &wrong_id, sizeof(wrong_id)), static_cast<ssize_t>(sizeof(wrong_id)));
        ASSERT_EQ(::write(link.server_out, payload.data(), payload.size()), static_cast<ssize_t>(payload.size()));
        ::close(link.server_in);
        ::close(link.server_out);
    });

    auto client = IpcClient::create_pipe(link.client_in, link.client_out);
    ASSERT_TRUE(client->connect());
    uint32_t msg = 42;
    ASSERT_TRUE(client->send(&msg, sizeof(msg), 1'000'000'000ULL));
    auto resp = client->receive(5'000'000'000ULL);
    EXPECT_EQ(resp.data(), nullptr) << "a mis-addressed frame over a pipe must fail the call, not deliver data";
    fake_server.join();
    client->close();
}

TEST(PipeTest, ServerRejectsIdlessFrameAsProtocolMismatch)
{
    PipeLink link;
    auto server = IpcServer::create_pipe(link.server_in, link.server_out);
    ASSERT_TRUE(server->listen());

    // An old-protocol (id-less) frame: length prefix smaller than the id field.
    uint32_t len = 4;
    uint32_t payload = 7;
    ASSERT_EQ(::write(link.client_out, &len, sizeof(len)), static_cast<ssize_t>(sizeof(len)));
    ASSERT_EQ(::write(link.client_out, &payload, sizeof(payload)), static_cast<ssize_t>(sizeof(payload)));

    ASSERT_EQ(server->wait_for_data(1'000'000'000ULL), 0);
    uint64_t rid = 0;
    auto req = server->receive(0, rid);
    EXPECT_TRUE(req.empty());

    // The desync also ends the serve lifetime: a further wait reports no client.
    EXPECT_EQ(server->wait_for_data(0), -1);
    server->close();
    ::close(link.client_out);
    ::close(link.client_in);
}

TEST(PipeTest, NotifyWakesBlockedWait)
{
    PipeLink link;
    auto server = IpcServer::create_pipe(link.server_in, link.server_out);
    ASSERT_TRUE(server->listen());

    std::atomic<bool> woke{ false };
    std::thread waiter([&] {
        // 30s: only the notify() below can plausibly end this wait in time.
        server->wait_for_data(30'000'000'000ULL);
        woke.store(true);
    });
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    EXPECT_FALSE(woke.load());
    server->notify();
    waiter.join();
    EXPECT_TRUE(woke.load());

    server->close();
    ::close(link.client_out);
    ::close(link.client_in);
}

} // namespace
