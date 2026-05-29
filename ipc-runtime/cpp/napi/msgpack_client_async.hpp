#pragma once

#include "ipc_runtime/ipc_client.hpp"
#include "napi.h"
#include <atomic>
#include <memory>
#include <mutex>
#include <thread>

namespace ipc::napi {

/**
 * @brief Asynchronous NAPI wrapper for msgpack calls over shared-memory IPC.
 *
 * Provides an asynchronous, pipelined `call(Buffer)` to JavaScript. Multiple
 * requests can be in flight simultaneously; responses are matched in FIFO
 * order by the TypeScript wrapper.
 *
 * Architecture:
 * - TypeScript:        owns the promise queue + matches requests to responses
 * - C++ main thread:   writes requests to the SHM request ring
 * - C++ poll thread:   polls the response ring; invokes the JS callback via
 * ThreadSafeFunction
 *
 * TS owns the queue (single-threaded JS makes that natural), so we don't need
 * a C++-side mutex/queue.
 */
class MsgpackClientAsync : public Napi::ObjectWrap<MsgpackClientAsync> {
public:
  MsgpackClientAsync(const Napi::CallbackInfo &info);

  /// info[0]: JS Function invoked once per response from the poll thread.
  Napi::Value setResponseCallback(const Napi::CallbackInfo &info);

  /// info[0]: Buffer containing the msgpack request. Returns undefined.
  Napi::Value call(const Napi::CallbackInfo &info);

  /// Acquire / release a ThreadSafeFunction reference that keeps the
  /// libuv loop alive while requests are in flight.
  Napi::Value acquire(const Napi::CallbackInfo &info);
  Napi::Value release(const Napi::CallbackInfo &info);

  static Napi::Function get_class(Napi::Env env);

private:
  /// Background loop: blocks on the response ring, invokes the JS callback
  /// per message via tsfn_. Detached — torn down on process exit.
  void poll_responses();

  std::unique_ptr<ipc::IpcClient> client_;
  std::thread poll_thread_;

  std::mutex tsfn_mutex_;
  Napi::FunctionReference js_callback_;
  Napi::ThreadSafeFunction tsfn_;
  int ref_count_ = 0;
};

} // namespace ipc::napi
