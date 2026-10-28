/**
 * @file host_call_backend.hpp
 * @brief A service the host reaches for a wasm module, as a backend for any
 * generated <Service>Api.
 *
 * A wasm module has no sockets, so a service it calls is one its host provides:
 * the module imports `ipc_runtime.host_call` and names the service by a
 * target string the host binds when it instantiates the module (ipc-runtime's
 * `hostCall` option: another module on the same worker, or a function of the
 * host's own, which may answer asynchronously). The call blocks, or is suspended
 * by the host (JSPI), until the host answers.
 *
 * The import's contract:
 *
 *   int32_t host_call(const uint8_t* target, size_t target_len,
 *                     const uint8_t* request, size_t request_len,
 *                     uint8_t** response, size_t* response_len)
 *
 * The host leaves the response in a buffer from the module's own
 * <service>_ipc_ffi_alloc (malloc-compatible), which the caller frees. 0 means
 * the bytes are the service's response (an error response included); anything
 * else means the call never reached the service, and the bytes are the host's
 * message saying why.
 *
 * Outside wasm, a native library's host is the process that loaded it, which hands the library
 * its host-call function through the generated <service>_ipc_ffi_set_host_call (ipc-runtime's
 * Node-API addon does when it loads one). The symbol is then a weak definition forwarding to that
 * function, or answering every call with an error before one is set, so binaries that link a
 * HostCallBackend they never use still link. A test can define the symbol to stand in for the
 * host; the file defining it defines IPC_CODEGEN_HOST_CALL_DEFINED first, which leaves only the
 * declaration here.
 *
 * Every service's generated directory carries its own copy of this header, so
 * it is guarded by a fixed macro rather than #pragma once: two services in one
 * binary see one definition.
 */
#ifndef IPC_CODEGEN_HOST_CALL_BACKEND_HPP
#define IPC_CODEGEN_HOST_CALL_BACKEND_HPP

#include "throw.hpp"

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <span>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

#ifdef __wasm__
extern "C" __attribute__((import_module("ipc_runtime"),
                          import_name("host_call"))) int32_t
ipc_runtime_host_call(const uint8_t *target, size_t target_len,
                      const uint8_t *request, size_t request_len,
                      uint8_t **response, size_t *response_len);
#elif defined(IPC_CODEGEN_HOST_CALL_DEFINED)
extern "C" int32_t ipc_runtime_host_call(const uint8_t *target,
                                         size_t target_len,
                                         const uint8_t *request,
                                         size_t request_len, uint8_t **response,
                                         size_t *response_len);
#else
namespace ipc_codegen {
/** The host-call contract above, as a function a native library's host provides. */
using HostCallFn = int32_t (*)(const uint8_t *target, size_t target_len,
                               const uint8_t *request, size_t request_len,
                               uint8_t **response, size_t *response_len);

/** This library's host-call function, set by <service>_ipc_ffi_set_host_call. */
inline std::atomic<HostCallFn> &native_host_call() {
  static std::atomic<HostCallFn> fn{nullptr};
  return fn;
}
} // namespace ipc_codegen

extern "C" __attribute__((weak)) int32_t
ipc_runtime_host_call(const uint8_t *target, size_t target_len,
                      const uint8_t *request, size_t request_len,
                      uint8_t **response, size_t *response_len) {
  if (auto fn = ipc_codegen::native_host_call().load()) {
    return fn(target, target_len, request, request_len, response,
              response_len);
  }
  static constexpr char message[] =
      "host_call: no host; a native library has one once the process that "
      "loaded it sets one with <service>_ipc_ffi_set_host_call";
  // NOLINTNEXTLINE(cppcoreguidelines-no-malloc)
  auto *out = static_cast<uint8_t *>(std::malloc(sizeof(message) - 1));
  std::memcpy(out, message, sizeof(message) - 1);
  *response = out;
  *response_len = sizeof(message) - 1;
  return 1;
}
#endif

namespace ipc_codegen {

class HostCallBackend {
public:
  /** @param target The name the host binds this service to (a `hostCall` key).
   */
  explicit HostCallBackend(std::string target) : target_(std::move(target)) {}

  std::vector<uint8_t> call(std::span<const uint8_t> request) {
    uint8_t *response = nullptr;
    size_t response_len = 0;
    int32_t status = ipc_runtime_host_call(
        reinterpret_cast<const uint8_t *>(target_.data()), target_.size(),
        request.data(), request.size(), &response, &response_len);
    std::vector<uint8_t> bytes(response, response + response_len);
    // NOLINTNEXTLINE(cppcoreguidelines-no-malloc)
    std::free(response);
    if (status != 0) {
      THROW std::runtime_error("host_call " + target_ + ": " +
                               std::string(bytes.begin(), bytes.end()));
    }
    return bytes;
  }

private:
  std::string target_;
};

} // namespace ipc_codegen

#endif // IPC_CODEGEN_HOST_CALL_BACKEND_HPP
