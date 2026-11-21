#include "ipc_runtime/serve_async.hpp"
#include "ipc_runtime/ipc_client.hpp"
#include "ipc_runtime/ipc_server.hpp"

#include <algorithm>
#include <cstdint>
#include <dirent.h>
#include <gtest/gtest.h>
#include <string>
#include <thread>
#include <unistd.h>
#include <unordered_map>
#include <vector>

using namespace ipc;

namespace {

/**
 * A service over the asynchronous FFI that counts down: a request [n] answers [0] when n is 0,
 * and otherwise calls "peer" with [n - 1] and answers one more than the peer did. With "peer"
 * bound to the server itself, each request nests n deep into the same instance.
 */
struct Countdown {
    void* host_ctx;
    AsyncService::Respond respond;
    AsyncService::Call call;
    uint64_t next_call = 0;
    std::unordered_map<uint64_t, uint64_t> waiting; // call id -> request id
    size_t most_waiting = 0;
};

size_t g_most_waiting = 0;

void* countdown_create(void* host_ctx, AsyncService::Respond respond, AsyncService::Call call)
{
    return new Countdown{ .host_ctx = host_ctx, .respond = respond, .call = call };
}

void countdown_submit(void* instance, uint64_t request_id, const uint8_t* input, size_t len)
{
    auto* self = static_cast<Countdown*>(instance);
    const uint8_t n = len > 0 ? input[0] : 0;
    if (n == 0) {
        const uint8_t zero = 0;
        self->respond(self->host_ctx, request_id, &zero, 1);
        return;
    }
    const uint64_t call_id = self->next_call++;
    self->waiting.emplace(call_id, request_id);
    self->most_waiting = std::max(self->most_waiting, self->waiting.size());
    const uint8_t next = n - 1;
    self->call(self->host_ctx, call_id, reinterpret_cast<const uint8_t*>("peer"), 4, &next, 1);
}

void countdown_deliver(void* instance, uint64_t call_id, int32_t status, const uint8_t* response, size_t len)
{
    auto* self = static_cast<Countdown*>(instance);
    const uint64_t request_id = self->waiting.at(call_id);
    self->waiting.erase(call_id);
    if (status != 0) {
        self->respond(self->host_ctx, request_id, response, len);
        return;
    }
    const uint8_t answer = len > 0 ? response[0] + 1 : 0;
    self->respond(self->host_ctx, request_id, &answer, 1);
}

void countdown_destroy(void* instance)
{
    auto* self = static_cast<Countdown*>(instance);
    g_most_waiting = self->most_waiting;
    delete self;
}

const AsyncService countdown{
    .create = countdown_create, .submit = countdown_submit, .deliver = countdown_deliver, .destroy = countdown_destroy
};

size_t thread_count()
{
    size_t n = 0;
    if (DIR* dir = opendir("/proc/self/task")) {
        while (readdir(dir) != nullptr) {
            n++;
        }
        closedir(dir);
    }
    return n > 2 ? n - 2 : 0; // less . and ..
}

std::vector<uint8_t> call(IpcClient& client, uint8_t n)
{
    EXPECT_TRUE(client.send(&n, 1, 1'000'000'000ULL));
    auto response = client.receive(10'000'000'000ULL);
    std::vector<uint8_t> bytes(response.begin(), response.end());
    client.release(response.size());
    return bytes;
}

} // namespace

TEST(ServeAsyncTest, NestedCallsBackIntoTheServerOnItsOneThread)
{
    const std::string path = "/tmp/ipc_serve_async_" + std::to_string(getpid()) + ".sock";
    auto server = IpcServer::create_socket(path, 8);
    ASSERT_TRUE(server->listen());
    const size_t threads_before = thread_count();
    std::string error = "not run";
    std::thread server_thread([&] { error = serve_async(*server, countdown, { { "peer", path } }); });

    auto client = IpcClient::create_socket(path);
    ASSERT_TRUE(client->connect());
    EXPECT_EQ(call(*client, 5), std::vector<uint8_t>{ 5 });
    EXPECT_EQ(call(*client, 0), std::vector<uint8_t>{ 0 });
#ifdef __linux__
    // The test's own thread and the server's: no thread per call, and none for the connection.
    EXPECT_EQ(thread_count(), threads_before + 1);
#endif

    client->close();
    server->request_shutdown();
    server_thread.join();
    server->close();
    EXPECT_EQ(error, "");
    EXPECT_EQ(g_most_waiting, 5U) << "every level waited on the next, in the one instance";
}

TEST(ServeAsyncTest, ACallToAnUnboundTargetFailsWithTheMessage)
{
    const std::string path = "/tmp/ipc_serve_async_unbound_" + std::to_string(getpid()) + ".sock";
    auto server = IpcServer::create_socket(path, 4);
    ASSERT_TRUE(server->listen());
    std::thread server_thread([&] { (void)serve_async(*server, countdown, {}); });

    auto client = IpcClient::create_socket(path);
    ASSERT_TRUE(client->connect());
    auto response = call(*client, 1);
    EXPECT_NE(std::string(response.begin(), response.end()).find("no host-call target \"peer\""), std::string::npos);

    client->close();
    server->request_shutdown();
    server_thread.join();
    server->close();
}

TEST(ServeAsyncTest, SharedMemoryIsRefused)
{
    auto server = IpcServer::create_mpsc_shm("ipc_serve_async_" + std::to_string(getpid()), 1);
    EXPECT_NE(serve_async(*server, countdown, {}).find("not re-entrant"), std::string::npos);

    auto socket = IpcServer::create_socket("/tmp/ipc_serve_async_target_" + std::to_string(getpid()) + ".sock", 1);
    EXPECT_NE(serve_async(*socket, countdown, { { "peer", "/tmp/peer.shm" } }).find("not re-entrant"),
              std::string::npos);
}
