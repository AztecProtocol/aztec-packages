#pragma once

#include "ipc_runtime/ipc_client.hpp"
#include "napi.h"
#include <memory>
#include <optional>
#include <sys/types.h>

namespace ipc::napi {

/**
 * @brief NAPI wrapper for synchronous msgpack calls over shared-memory IPC.
 *
 * Wraps an ipc::IpcClient (SHM transport) and exposes a blocking
 * `call(Buffer) -> Buffer` to JavaScript. One round-trip per `call`, with no
 * deadline. Given the server's pid, a call to a server that has died throws an
 * error with `serverExited: true`, `exitCode` and `signal` (number or null).
 */
class MsgpackClientWrapper : public Napi::ObjectWrap<MsgpackClientWrapper> {
  public:
    MsgpackClientWrapper(const Napi::CallbackInfo& info);
    ~MsgpackClientWrapper();

    Napi::Value call(const Napi::CallbackInfo& info);
    Napi::Value close(const Napi::CallbackInfo& info);

    static Napi::Function get_class(Napi::Env env);

  private:
    std::unique_ptr<ipc::IpcClient> client_;
    bool connected_ = false;
    std::optional<pid_t> server_pid_;
};

} // namespace ipc::napi
