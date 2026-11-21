#include "ipc_runtime/serve_async.hpp"
#include "ipc_runtime/socket_client.hpp"

#include <algorithm>
#include <deque>
#include <map>
#include <memory>
#include <mutex>
#include <poll.h>
#include <span>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

namespace ipc {

namespace {

/** How long a frame already arriving may take to finish. */
constexpr uint64_t ANSWER_TIMEOUT_NS = 10'000'000'000ULL;

bool is_shm(const std::string& path)
{
    return path.ends_with(".shm");
}

bool readable(int fd)
{
    struct pollfd p{ .fd = fd, .events = POLLIN, .revents = 0 };
    return ::poll(&p, 1, 0) > 0 && (p.revents & (POLLIN | POLLHUP | POLLERR)) != 0;
}

class AsyncServeLoop {
  public:
    AsyncServeLoop(IpcServer& server, const AsyncService& service, std::vector<HostCallTarget> targets)
        : server_(server)
        , service_(service)
        , targets_(std::move(targets))
    {}

    std::string run()
    {
        instance_ = service_.create(this, &AsyncServeLoop::on_respond, &AsyncServeLoop::on_call);
        if (instance_ == nullptr) {
            return "the service could not create an asynchronous instance";
        }
        server_.run_reactor(
            [this](int /*client_id*/, std::span<const uint8_t> request, IpcServer::Respond respond) {
                uint64_t id = ++next_request_;
                {
                    std::lock_guard<std::mutex> lock(mutex_);
                    responders_.emplace(id, std::move(respond));
                }
                service_.submit(instance_, id, request.data(), request.size());
                pump();
            },
            [this] { pump(); });
        // run_reactor returns once every request is answered, so no call is still out.
        service_.destroy(instance_);
        for (auto& [name, connection] : connections_) {
            server_.unwatch_fd(connection.client->fd());
        }
        return {};
    }

  private:
    struct Call {
        uint64_t id;
        std::string target;
        std::vector<uint8_t> request;
    };
    struct Connection {
        std::unique_ptr<SocketClient> client;
        std::unordered_set<uint64_t> outstanding;
    };

    static void on_respond(void* ctx, uint64_t request_id, const uint8_t* response, size_t len)
    {
        auto* self = static_cast<AsyncServeLoop*>(ctx);
        IpcServer::Respond respond;
        {
            std::lock_guard<std::mutex> lock(self->mutex_);
            auto found = self->responders_.find(request_id);
            if (found == self->responders_.end()) {
                return;
            }
            respond = std::move(found->second);
            self->responders_.erase(found);
        }
        respond(std::vector<uint8_t>(response, response + len));
    }

    /** Only queues: the instance is inside submit() or deliver(), and is called back from pump(). */
    static void on_call(void* ctx,
                        uint64_t call_id,
                        const uint8_t* target,
                        size_t target_len,
                        const uint8_t* request,
                        size_t request_len)
    {
        auto* self = static_cast<AsyncServeLoop*>(ctx);
        {
            std::lock_guard<std::mutex> lock(self->mutex_);
            self->calls_.push_back({ call_id,
                                     std::string(reinterpret_cast<const char*>(target), target_len),
                                     std::vector<uint8_t>(request, request + request_len) });
        }
        self->server_.notify();
    }

    /** Sends the queued calls and delivers the answers that have arrived, until neither is left. */
    void pump()
    {
        for (;;) {
            const bool sent = send_calls();
            const bool delivered = read_answers();
            if (!sent && !delivered) {
                return;
            }
        }
    }

    bool send_calls()
    {
        std::deque<Call> calls;
        {
            std::lock_guard<std::mutex> lock(mutex_);
            calls.swap(calls_);
        }
        for (auto& call : calls) {
            std::string error = send(call);
            if (!error.empty()) {
                deliver(call.id, 1, std::vector<uint8_t>(error.begin(), error.end()));
            }
        }
        return !calls.empty();
    }

    std::string send(const Call& call)
    {
        auto target = std::find_if(
            targets_.begin(), targets_.end(), [&](const HostCallTarget& t) { return t.name == call.target; });
        if (target == targets_.end()) {
            return "no host-call target \"" + call.target + "\" (start the server with --host-call " + call.target +
                   "=<path>)";
        }
        auto found = connections_.find(call.target);
        if (found == connections_.end()) {
            auto client = std::make_unique<SocketClient>(target->path);
            if (!client->connect()) {
                return target->path + ": could not connect";
            }
            if (!server_.watch_fd(client->fd())) {
                return target->path + ": the server cannot watch its connection";
            }
            found = connections_.emplace(call.target, Connection{ .client = std::move(client), .outstanding = {} }).first;
        }
        if (!found->second.client->send(call.id, call.request.data(), call.request.size(), 0)) {
            close(found, target->path + ": the connection failed");
            return target->path + ": could not send";
        }
        found->second.outstanding.insert(call.id);
        return {};
    }

    bool read_answers()
    {
        bool delivered = false;
        for (auto it = connections_.begin(); it != connections_.end();) {
            auto& connection = it->second;
            if (!readable(connection.client->fd())) {
                ++it;
                continue;
            }
            if (connection.outstanding.empty()) {
                // Readable with nothing asked: the target closed it. The next call reconnects.
                it = close(it, {});
                continue;
            }
            uint64_t id = 0;
            auto answer = connection.client->receive(ANSWER_TIMEOUT_NS, id);
            if (answer.data() == nullptr) {
                it = close(it, targets_path(it->first) + ": the connection closed with calls out");
                delivered = true;
                continue;
            }
            std::vector<uint8_t> bytes(answer.begin(), answer.end());
            connection.client->release(answer.size());
            if (connection.outstanding.erase(id) != 0) {
                // Only queues further calls (on_call), so connections_ is unchanged.
                deliver(id, 0, bytes);
                delivered = true;
            }
        }
        return delivered;
    }

    /** Drops a connection, failing its calls still out with `error`. */
    std::map<std::string, Connection>::iterator close(std::map<std::string, Connection>::iterator it,
                                                      const std::string& error)
    {
        server_.unwatch_fd(it->second.client->fd());
        auto outstanding = std::move(it->second.outstanding);
        auto next = connections_.erase(it);
        for (uint64_t id : outstanding) {
            deliver(id, 1, std::vector<uint8_t>(error.begin(), error.end()));
        }
        return next;
    }

    std::string targets_path(const std::string& name) const
    {
        for (const auto& t : targets_) {
            if (t.name == name) {
                return t.path;
            }
        }
        return name;
    }

    void deliver(uint64_t call_id, int32_t status, const std::vector<uint8_t>& bytes)
    {
        service_.deliver(instance_, call_id, status, bytes.data(), bytes.size());
    }

    IpcServer& server_;
    const AsyncService& service_;
    std::vector<HostCallTarget> targets_;
    void* instance_ = nullptr;
    uint64_t next_request_ = 0;
    std::map<std::string, Connection> connections_; // reactor thread only
    std::mutex mutex_;                              // guards responders_ and calls_
    std::unordered_map<uint64_t, IpcServer::Respond> responders_;
    std::deque<Call> calls_;
};

} // namespace

std::string serve_async(IpcServer& server, const AsyncService& service, std::vector<HostCallTarget> targets)
{
    if (!server.can_watch_fds()) {
        return "asynchronous (re-entrant) serving needs a socket; shared memory is not re-entrant";
    }
    for (const auto& target : targets) {
        if (is_shm(target.path)) {
            return "host-call target \"" + target.name + "\" is shared memory (" + target.path +
                   "), which is not re-entrant; give it a socket";
        }
    }
    return AsyncServeLoop(server, service, std::move(targets)).run();
}

} // namespace ipc
