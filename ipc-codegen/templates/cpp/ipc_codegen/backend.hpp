/**
 * @file backend.hpp
 * @brief The byte backend a generated <Service>Api runs over.
 *
 * A backend takes one msgpack-encoded command and returns the msgpack-encoded
 * response; the Api does all the typing on either side. Implementations:
 *   - ipc_codegen::IpcBackend (ipc_backend.hpp): UDS / MPSC-SHM transport from
 * ipc-runtime
 *   - <ns>::FfiBackend (<service>_ffi_backend.hpp, --client --ffi): the
 * service's in-process FFI entry, linked into the binary or any type of your
 * own with the same call(). Resources are released by the backend's destructor.
 *
 * Every service's generated directory carries its own copy of this header, so
 * it is guarded by a fixed macro rather than #pragma once: two services in one
 * binary see one definition.
 */
#ifndef IPC_CODEGEN_BACKEND_HPP
#define IPC_CODEGEN_BACKEND_HPP

#include <concepts>
#include <cstdint>
#include <span>
#include <vector>

namespace ipc_codegen {

template <typename B>
concept Backend = requires(B &backend, std::span<const uint8_t> request) {
  { backend.call(request) } -> std::same_as<std::vector<uint8_t>>;
};

} // namespace ipc_codegen

#endif // IPC_CODEGEN_BACKEND_HPP
