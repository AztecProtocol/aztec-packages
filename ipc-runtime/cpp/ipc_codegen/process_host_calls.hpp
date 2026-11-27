/**
 * @file process_host_calls.hpp
 * @brief Host calls for a service run as a server process: each target name
 * reaches another service over its .sock/.shm path, as `--host-call name=path`
 * names it.
 *
 * In-process, the host that loaded a service answers its host calls
 * (ipc-runtime binds each target to another instance, or to JavaScript). A
 * server process is its own host, so it connects to each target itself. Each
 * calling thread has its own connection to a target, made on its first call,
 * and remade after a call on it fails.
 */
#ifndef IPC_CODEGEN_PROCESS_HOST_CALLS_HPP
#define IPC_CODEGEN_PROCESS_HOST_CALLS_HPP

#include "host_call_backend.hpp"
#include "ipc_backend.hpp"

#include <chrono>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <memory>
#include <span>
#include <stdexcept>
#include <string>
#include <thread>
#include <unordered_map>
#include <utility>
#include <vector>

#if !defined(__wasm__) && !defined(IPC_CODEGEN_HOST_CALL_DEFINED)

namespace ipc_codegen {

/** Reads a `--host-call` value: `name=path`. */
inline std::pair<std::string, std::string>
parse_host_call(const std::string &spec) {
  auto eq = spec.find('=');
  if (eq == std::string::npos || eq == 0 || eq + 1 == spec.size()) {
    throw std::invalid_argument("--host-call expects name=path, got: " + spec);
  }
  return {spec.substr(0, eq), spec.substr(eq + 1)};
}

namespace detail {

inline std::unordered_map<std::string, std::string> &host_call_paths() {
  static std::unordered_map<std::string, std::string> paths;
  return paths;
}

inline std::unordered_map<std::string, std::unique_ptr<IpcBackend>> &
host_call_connections() {
  thread_local std::unordered_map<std::string, std::unique_ptr<IpcBackend>>
      connections;
  return connections;
}

/** The target may still be starting when the first call is made, so connecting
 * is retried for a minute. */
inline IpcBackend &host_call_connection(const std::string &name,
                                        const std::string &path) {
  constexpr int attempts = 600;
  constexpr auto retry_delay = std::chrono::milliseconds(100);
  auto &connection = host_call_connections()[name];
  for (int attempt = 1; !connection; attempt++) {
    try {
      connection = std::make_unique<IpcBackend>(path);
    } catch (const std::exception &) {
      if (attempt == attempts) {
        throw;
      }
      std::this_thread::sleep_for(retry_delay);
    }
  }
  return *connection;
}

inline int32_t host_call_answer(int32_t status, const uint8_t *bytes,
                                size_t len, uint8_t **response,
                                size_t *response_len) {
  // NOLINTNEXTLINE(cppcoreguidelines-no-malloc)
  auto *out = static_cast<uint8_t *>(std::malloc(len == 0 ? 1 : len));
  if (len != 0) {
    std::memcpy(out, bytes, len);
  }
  *response = out;
  *response_len = len;
  return status;
}

inline int32_t host_call_error(const std::string &message, uint8_t **response,
                               size_t *response_len) {
  return host_call_answer(1, reinterpret_cast<const uint8_t *>(message.data()),
                          message.size(), response, response_len);
}

inline int32_t route_host_call(const uint8_t *target, size_t target_len,
                               const uint8_t *request, size_t request_len,
                               uint8_t **response, size_t *response_len) {
  std::string name(reinterpret_cast<const char *>(target), target_len);
  auto path = host_call_paths().find(name);
  if (path == host_call_paths().end()) {
    return host_call_error("no host-call target \"" + name +
                               "\" (start the server with --host-call " + name +
                               "=<path>)",
                           response, response_len);
  }
  try {
    auto bytes = host_call_connection(name, path->second)
                     .call(std::span<const uint8_t>(request, request_len));
    return host_call_answer(0, bytes.data(), bytes.size(), response,
                            response_len);
  } catch (const std::exception &e) {
    host_call_connections().erase(name);
    return host_call_error(path->second + ": " + e.what(), response,
                           response_len);
  }
}

} // namespace detail

/** Sends this process's host calls to the services at the given paths. Call
 * before serving. */
inline void route_host_calls(
    const std::vector<std::pair<std::string, std::string>> &targets) {
  for (const auto &[name, path] : targets) {
    detail::host_call_paths()[name] = path;
  }
  native_host_call().store(&detail::route_host_call);
}

} // namespace ipc_codegen

#endif

#endif // IPC_CODEGEN_PROCESS_HOST_CALLS_HPP
