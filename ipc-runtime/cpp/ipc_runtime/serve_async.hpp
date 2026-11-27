#pragma once
/**
 * @file serve_async.hpp
 * @brief Serves an asynchronous instance on a socket server, re-entrantly and
 * on one thread.
 *
 * The instance is any service's asynchronous FFI (`<svc>_ipc_ffi_create_async`,
 * `_submit`, `_deliver`, `_destroy_async`), so one loop serves every language's
 * services. Everything runs on the server's reactor thread: each request is
 * submitted to the instance as it arrives, each host call the instance makes is
 * written to its target's connection (one per target, calls matched to answers
 * by id), and each answer is delivered when that connection is readable, which
 * wakes the same loop. A request that arrives while host calls are out, one a
 * host call led to included, is submitted at once, so a target may call back
 * into this server.
 *
 * Shared memory is not re-entrant: serve_async refuses a server or a target
 * that is not a socket.
 */

#include "ipc_runtime/ffi_abi.h"
#include "ipc_runtime/ipc_server.hpp"

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace ipc {

/** A service's asynchronous FFI, as ipc_runtime/ffi_abi.h defines it. Its callbacks may be called on any thread. */
struct AsyncService {
    using Respond = ipc_async_respond_fn;
    using Call = ipc_async_call_fn;

    ipc_ffi_create_async_fn create;
    ipc_ffi_submit_fn submit;
    ipc_ffi_deliver_fn deliver;
    ipc_ffi_destroy_fn destroy;
};

/** A host-call target: the name a handler calls, and the socket of the service it reaches. */
struct HostCallTarget {
    std::string name;
    std::string path;
};

/**
 * Serves `service` on `server` (listening already) until shutdown, its host
 * calls going to `targets`. Returns an empty string once shut down, or why it
 * could not serve.
 */
std::string serve_async(IpcServer& server, const AsyncService& service, std::vector<HostCallTarget> targets);

} // namespace ipc
