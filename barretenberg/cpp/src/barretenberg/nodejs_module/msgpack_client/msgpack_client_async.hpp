#pragma once

#include "barretenberg/ipc/ipc_client.hpp"
#include "napi.h"
#include <atomic>
#include <mutex>
#include <thread>

namespace bb::nodejs::msgpack_client {

/**
 * @brief Asynchronous NAPI wrapper for msgpack calls via shared memory IPC
 *
 * Provides an asynchronous interface with request pipelining for sending msgpack
 * buffers to the bb binary via shared memory. Multiple requests can be in flight
 * simultaneously, with responses matched to requests in FIFO order by TypeScript.
 *
 * Architecture (matches socket backend pattern):
 * - TypeScript: Creates promises, manages queue, handles request/response matching
 * - C++ Main thread: Sends requests to shared memory ring buffer
 * - C++ Background thread: Polls response ring buffer, invokes JS callback via ThreadSafeFunction
 * - ThreadSafeFunction: Safely bridges C++ background thread to JavaScript main thread
 *
 * This design eliminates the need for C++ mutex/queue by leveraging JavaScript's
 * single-threaded nature for queue management.
 */
class MsgpackClientAsync : public Napi::ObjectWrap<MsgpackClientAsync> {
  public:
    MsgpackClientAsync(const Napi::CallbackInfo& info);

    /**
     * @brief Set the JavaScript callback to be invoked when responses arrive
     * @param info[0] - JavaScript function to call with response buffer
     *
     * The callback will be invoked from the background thread via ThreadSafeFunction.
     * TypeScript code should use this to resolve promises from its queue.
     */
    Napi::Value setResponseCallback(const Napi::CallbackInfo& info);

    /**
     * @brief Send a msgpack buffer asynchronously
     * @param info[0] - Buffer containing msgpack data
     * @returns undefined (promise management handled in TypeScript)
     *
     * Writes request to shared memory. TypeScript should create and manage promises.
     */
    Napi::Value call(const Napi::CallbackInfo& info);

    /**
     * @brief Acquire a reference to keep the event loop alive
     * Called by TypeScript when there are pending callbacks
     */
    Napi::Value acquire(const Napi::CallbackInfo& info);

    /**
     * @brief Release a reference to allow the event loop to exit
     * Called by TypeScript when there are no pending callbacks
     */
    Napi::Value release(const Napi::CallbackInfo& info);

    static Napi::Function get_class(Napi::Env env);

  private:
    /**
     * @brief Background thread function that polls for responses
     *
     * Continuously polls the response ring buffer using recv() with timeout.
     * When a response arrives, invokes the registered JavaScript callback via ThreadSafeFunction.
     * Runs until process exits (thread is detached, no explicit shutdown needed).
     */
    void poll_responses();

    // IPC client for shared memory communication
    std::unique_ptr<bb::ipc::IpcClient> client_;

    // Background polling thread (detached - will be cleaned up by OS on process exit)
    std::thread poll_thread_;

    // Mutex protecting TSFN access from multiple threads
    std::mutex tsfn_mutex_;

    // JavaScript callback stored for lazy TSFN creation
    Napi::FunctionReference js_callback_;

    // ThreadSafeFunction for invoking JavaScript callback from background thread
    // Created lazily when first needed, destroyed when no longer needed
    Napi::ThreadSafeFunction tsfn_;

    // Reference count for TSFN lifecycle management
    // When 0→1: create TSFN, when 1→0: destroy TSFN
    int ref_count_ = 0;
};

} // namespace bb::nodejs::msgpack_client
