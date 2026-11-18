#pragma once

#include "ipc_runtime/ipc_client.hpp"
#include "napi.h"
#include <memory>
#include <optional>
#include <span>
#include <sys/types.h>

namespace ipc::napi {

/**
 * @brief NAPI wrapper for synchronous msgpack calls over shared-memory IPC.
 *
 * Wraps an ipc::IpcClient (SHM transport) and exposes a blocking
 * `call(Buffer) -> Buffer` to JavaScript. One round-trip per `call`, with no
 * deadline. `callTransient(Buffer) -> Uint8Array` does the same round trip but
 * returns a view of a scratch buffer the client reuses, valid only until its next
 * call, so a call allocates no new ArrayBuffer. Given the server's pid, a call to a server that has died throws an
 * error with `serverExited: true`, `exitCode` and `signal` (number or null).
 */
class MsgpackClientWrapper : public Napi::ObjectWrap<MsgpackClientWrapper> {
  public:
    MsgpackClientWrapper(const Napi::CallbackInfo& info);
    ~MsgpackClientWrapper();

    Napi::Value call(const Napi::CallbackInfo& info);
    Napi::Value call_transient(const Napi::CallbackInfo& info);
    Napi::Value close(const Napi::CallbackInfo& info);

    static Napi::Function get_class(Napi::Env env);

  private:
    /** One round trip for `info[0]`. The response stays in the ring until client_->release(size). */
    std::span<const uint8_t> round_trip(const Napi::CallbackInfo& info);

    std::unique_ptr<ipc::IpcClient> client_;
    Napi::Reference<Napi::ArrayBuffer> scratch_;
    bool connected_ = false;
    std::optional<pid_t> server_pid_;
};

} // namespace ipc::napi
