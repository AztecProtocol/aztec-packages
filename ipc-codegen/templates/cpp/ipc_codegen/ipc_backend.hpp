/**
 * @file ipc_backend.hpp
 * @brief ipc-runtime's IpcClient as a backend for any generated <Service>Api.
 *
 * The transport is chosen by the path suffix: ".sock" → UDS, ".shm" → MPSC-SHM.
 * Calls block until the response arrives. Needs the ipc_runtime library, which
 * FFI-only consumers never include.
 *
 * Every service's generated directory carries its own copy of this header, so
 * it is guarded by a fixed macro rather than #pragma once: two services in one
 * binary see one definition.
 */
#ifndef IPC_CODEGEN_IPC_BACKEND_HPP
#define IPC_CODEGEN_IPC_BACKEND_HPP

#include "ipc_runtime/ipc_client.hpp"
#include "throw.hpp"

#include <cstdint>
#include <memory>
#include <span>
#include <stdexcept>
#include <string>
#include <vector>

namespace ipc_codegen {

class IpcBackend {
public:
  /**
   * @param path Transport path (".sock" → UDS, ".shm" → MPSC-SHM).
   * @param call_timeout_ns Per-call send/receive timeout in nanoseconds. 0 (the
   *        default) waits indefinitely: commands like proving can take minutes.
   */
  explicit IpcBackend(const std::string &path, uint64_t call_timeout_ns = 0)
      : client_(::ipc::make_client(path)), call_timeout_ns_(call_timeout_ns) {
    if (!client_) {
      THROW std::runtime_error("ipc::make_client: unrecognised path suffix "
                               "(expected .sock or .shm): " +
                               path);
    }
    if (!client_->connect()) {
      THROW std::runtime_error("ipc::IpcClient::connect() failed for " + path);
    }
  }

  std::vector<uint8_t> call(std::span<const uint8_t> request) {
    if (!client_->send(request.data(), request.size(), call_timeout_ns_)) {
      THROW std::runtime_error("ipc::IpcClient::send failed");
    }
    auto response = client_->receive(call_timeout_ns_);
    if (response.data() == nullptr) {
      THROW std::runtime_error("ipc::IpcClient::receive failed or timed out");
    }
    // Copied out before release(): for SHM this gives up zero-copy, but the
    // Api's decode copies anyway.
    std::vector<uint8_t> bytes(response.begin(), response.end());
    client_->release(response.size());
    return bytes;
  }

private:
  std::unique_ptr<::ipc::IpcClient> client_;
  uint64_t call_timeout_ns_;
};

} // namespace ipc_codegen

#endif // IPC_CODEGEN_IPC_BACKEND_HPP
