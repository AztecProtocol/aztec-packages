/**
 * @file backend.hpp
 * @brief The byte backend a generated <Service>Api runs over.
 *
 * A backend takes one msgpack-encoded command and returns the msgpack-encoded
 * response; the Api does all the typing on either side. Implementations:
 *   - ipc_codegen::IpcBackend (ipc_backend.hpp): UDS / MPSC-SHM transport from
 * ipc-runtime
 *   - <ns>::FfiBackend (<service>_ffi_backend.hpp, --client --ffi): the
 * service's in-process FFI, linked into the binary or any type of your
 * own with the same call(). Resources are released by the backend's destructor.
 */
#ifndef IPC_CODEGEN_BACKEND_HPP
#define IPC_CODEGEN_BACKEND_HPP

#include <concepts>
#include <cstdint>
#include <span>
#include <stdexcept>
#include <string>
#include <vector>

namespace ipc_codegen {

/**
 * Thrown by a generated <Service>Api when the service answers a command with its
 * error response: the request arrived and was refused. what() is the service's
 * message. Any other exception from the Api is a fault on the way there or back.
 */
class ServiceError : public std::runtime_error {
public:
  explicit ServiceError(const std::string &message)
      : std::runtime_error(message) {}
};

template <typename B>
concept Backend = requires(B &backend, std::span<const uint8_t> request) {
  { backend.call(request) } -> std::same_as<std::vector<uint8_t>>;
};

} // namespace ipc_codegen

#endif // IPC_CODEGEN_BACKEND_HPP
