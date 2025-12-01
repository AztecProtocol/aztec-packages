#pragma once

#include "barretenberg/ipc/ipc_client.hpp"
#include "napi.h"
#include <memory>

namespace bb::nodejs::msgpack_client {

/**
 * @brief NAPI wrapper for msgpack calls via shared memory IPC
 *
 * Provides a simple synchronous interface to send msgpack buffers
 * to the bb binary via shared memory and receive responses.
 */
class MsgpackClientWrapper : public Napi::ObjectWrap<MsgpackClientWrapper> {
  public:
    MsgpackClientWrapper(const Napi::CallbackInfo& info);
    ~MsgpackClientWrapper();

    /**
     * @brief Send a msgpack buffer and receive response
     * @param info[0] - Buffer containing msgpack data
     * @returns Buffer containing msgpack response
     */
    Napi::Value call(const Napi::CallbackInfo& info);

    /**
     * @brief Close the shared memory connection
     */
    Napi::Value close(const Napi::CallbackInfo& info);

    static Napi::Function get_class(Napi::Env env);

  private:
    std::unique_ptr<bb::ipc::IpcClient> client_;
    bool connected_ = false;
};

} // namespace bb::nodejs::msgpack_client
