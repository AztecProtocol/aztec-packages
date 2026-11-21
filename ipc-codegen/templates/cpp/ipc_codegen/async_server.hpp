/**
 * @file async_server.hpp
 * @brief Serves an asynchronous instance (async.hpp) in a server process, for
 * handlers that co_await their host calls.
 *
 * The instance runs under ipc-runtime's re-entrant loop (ipc::serve_async):
 * everything is on the server's one thread, requests are taken while host
 * calls are out, and each host call goes to its target over one connection per
 * target. A target that calls back into this server (directly or through other
 * services) is answered rather than deadlocking it. Shared memory is not
 * re-entrant, so a .shm server or target is refused.
 *
 * Guarded by a fixed macro rather than #pragma once, like async.hpp.
 */
#ifndef IPC_CODEGEN_ASYNC_SERVER_HPP
#define IPC_CODEGEN_ASYNC_SERVER_HPP

#include "async.hpp"
#include "ipc_runtime/ipc_server.hpp"
#include "ipc_runtime/serve_async.hpp"

#include <cstddef>
#include <cstdint>
#include <memory>
#include <span>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace ipc_codegen {

namespace detail {

/** The runtime's two callbacks, as the AsyncHost an AsyncInstance answers to.
 */
class CallbackHost final : public AsyncHost {
public:
  CallbackHost(void *ctx, ::ipc::AsyncService::Respond respond,
               ::ipc::AsyncService::Call call)
      : ctx_(ctx), respond_(respond), call_(call) {}

  void respond(uint64_t request_id,
               std::span<const uint8_t> response) override {
    respond_(ctx_, request_id, response.data(), response.size());
  }
  void call(uint64_t call_id, std::string_view target,
            std::span<const uint8_t> request) override {
    call_(ctx_, call_id, reinterpret_cast<const uint8_t *>(target.data()),
          target.size(), request.data(), request.size());
  }

private:
  void *ctx_;
  ::ipc::AsyncService::Respond respond_;
  ::ipc::AsyncService::Call call_;
};

template <typename Service> struct ServedInstance {
  ServedInstance(std::unique_ptr<Service> service, CallbackHost host)
      : host(host), instance(std::move(service), this->host) {}
  CallbackHost host;
  AsyncInstance<Service> instance;
};

/** The service serve_async hands to create(), which the runtime calls on the
 * same thread. */
template <typename Service>
inline thread_local std::unique_ptr<Service> pending_service;

template <typename Service>
void *create(void *ctx, ::ipc::AsyncService::Respond respond,
             ::ipc::AsyncService::Call call) {
  auto service = std::move(pending_service<Service>);
  if (!service) {
    return nullptr;
  }
  return new ServedInstance<Service>(std::move(service),
                                     CallbackHost(ctx, respond, call));
}

template <typename Service>
void submit(void *instance, uint64_t id, const uint8_t *input, size_t len) {
  static_cast<ServedInstance<Service> *>(instance)->instance.submit(
      id, std::span<const uint8_t>(input, len));
}

template <typename Service>
void deliver(void *instance, uint64_t call_id, int32_t status,
             const uint8_t *response, size_t len) {
  static_cast<ServedInstance<Service> *>(instance)->instance.deliver(
      call_id, status, std::span<const uint8_t>(response, len));
}

template <typename Service> void destroy(void *instance) {
  delete static_cast<ServedInstance<Service> *>(instance);
}

} // namespace detail

/**
 * Serves `service` as an AsyncInstance on `server` (listening already) until
 * shutdown, its host calls going to `targets` (name, socket path). Returns an
 * empty string once shut down, or why it could not serve.
 */
template <typename Service>
std::string
serve_async(::ipc::IpcServer &server, std::unique_ptr<Service> service,
            const std::vector<std::pair<std::string, std::string>> &targets) {
  detail::pending_service<Service> = std::move(service);
  ::ipc::AsyncService abi{.create = &detail::create<Service>,
                          .submit = &detail::submit<Service>,
                          .deliver = &detail::deliver<Service>,
                          .destroy = &detail::destroy<Service>};
  std::vector<::ipc::HostCallTarget> list;
  for (const auto &[name, path] : targets) {
    list.push_back({.name = name, .path = path});
  }
  auto error = ::ipc::serve_async(server, abi, std::move(list));
  detail::pending_service<Service>.reset();
  return error;
}

} // namespace ipc_codegen

#endif // IPC_CODEGEN_ASYNC_SERVER_HPP
