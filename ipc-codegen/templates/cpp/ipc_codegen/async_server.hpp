/**
 * @file async_server.hpp
 * @brief Serves an asynchronous instance (async.hpp) in a server process, for
 * handlers that co_await their host calls.
 *
 * The server's loop only queues requests; the instance runs on a thread of its
 * own, and each call out is made on a thread of its own through the process's
 * host-call routing (process_host_calls.hpp: route_host_calls), so every call
 * has its own connection to its target. The server keeps taking requests while
 * calls are out, so a target that calls back into this server (directly or
 * through other services) is answered rather than deadlocking it.
 *
 * Guarded by a fixed macro rather than #pragma once, like async.hpp.
 */
#ifndef IPC_CODEGEN_ASYNC_SERVER_HPP
#define IPC_CODEGEN_ASYNC_SERVER_HPP

#include "async.hpp"
#include "host_call_backend.hpp"
#include "ipc_runtime/ipc_server.hpp"

#include <condition_variable>
#include <cstdint>
#include <cstdlib>
#include <deque>
#include <memory>
#include <mutex>
#include <span>
#include <string>
#include <string_view>
#include <thread>
#include <unordered_map>
#include <utility>
#include <vector>

namespace ipc_codegen {

namespace detail {

class ProcessAsyncHost final : public AsyncHost {
public:
  struct Job {
    bool deliver = false;
    uint64_t id = 0;
    int32_t status = 0;
    std::vector<uint8_t> bytes;
    ::ipc::IpcServer::Respond respond;
  };

  void respond(uint64_t request_id,
               std::span<const uint8_t> response) override {
    ::ipc::IpcServer::Respond respond;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      auto found = responders_.find(request_id);
      if (found == responders_.end()) {
        return;
      }
      respond = std::move(found->second);
      responders_.erase(found);
    }
    respond(std::vector<uint8_t>(response.begin(), response.end()));
  }

  void call(uint64_t call_id, std::string_view target,
            std::span<const uint8_t> request) override {
    std::lock_guard<std::mutex> lock(mutex_);
    callers_.emplace_back(
        [this, call_id, target = std::string(target),
         request = std::vector<uint8_t>(request.begin(), request.end())] {
          uint8_t *response = nullptr;
          size_t response_len = 0;
          int32_t status = ipc_runtime_host_call(
              reinterpret_cast<const uint8_t *>(target.data()), target.size(),
              request.data(), request.size(), &response, &response_len);
          Job job{.deliver = true,
                  .id = call_id,
                  .status = status,
                  .bytes = {response, response + response_len}};
          // NOLINTNEXTLINE(cppcoreguidelines-no-malloc)
          std::free(response);
          post(std::move(job));
        });
  }

  void post(Job job) {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      if (!job.deliver) {
        responders_.emplace(job.id, std::move(job.respond));
      }
      jobs_.push_back(std::move(job));
    }
    has_jobs_.notify_one();
  }

  /** The instance's thread: runs jobs until finish(). */
  template <typename Service> void drive(AsyncInstance<Service> &instance) {
    for (;;) {
      Job job;
      {
        std::unique_lock<std::mutex> lock(mutex_);
        has_jobs_.wait(lock, [this] { return finished_ || !jobs_.empty(); });
        if (jobs_.empty()) {
          return;
        }
        job = std::move(jobs_.front());
        jobs_.pop_front();
      }
      if (job.deliver) {
        instance.deliver(job.id, job.status, job.bytes);
      } else {
        instance.submit(job.id, job.bytes);
      }
    }
  }

  /** Ends drive() once the queue is empty. */
  void finish() {
    {
      std::lock_guard<std::mutex> lock(mutex_);
      finished_ = true;
    }
    has_jobs_.notify_one();
  }

  void join_callers() {
    std::vector<std::thread> callers;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      callers.swap(callers_);
    }
    for (auto &caller : callers) {
      caller.join();
    }
  }

private:
  std::mutex mutex_;
  std::condition_variable has_jobs_;
  std::deque<Job> jobs_;
  std::unordered_map<uint64_t, ::ipc::IpcServer::Respond> responders_;
  std::vector<std::thread> callers_;
  bool finished_ = false;
};

} // namespace detail

/**
 * Serves `service` as an AsyncInstance on `server` (listening already) until
 * shutdown; its host calls go wherever the process routes them
 * (route_host_calls).
 */
template <typename Service>
void serve_async(::ipc::IpcServer &server, std::unique_ptr<Service> service) {
  detail::ProcessAsyncHost host;
  AsyncInstance<Service> instance(std::move(service), host);
  std::thread driver([&] { host.drive(instance); });
  uint64_t next_request = 0;
  server.run_reactor([&](int /*client_id*/, std::span<const uint8_t> request,
                         ::ipc::IpcServer::Respond respond) {
    host.post({.id = ++next_request,
               .bytes = std::vector<uint8_t>(request.begin(), request.end()),
               .respond = std::move(respond)});
  });
  // Every request has been answered, so every call has been delivered.
  host.finish();
  driver.join();
  host.join_callers();
}

} // namespace ipc_codegen

#endif // IPC_CODEGEN_ASYNC_SERVER_HPP
