#pragma once

#include "ffi_library.hpp"
#include "napi.h"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <deque>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace ipc::napi {

/**
 * @brief A native thread hosting instances of services' shared libraries, for asynchronous calls.
 *
 *   new ServiceThread(onHostCall)
 *   load(libraryPath, ffiName, siblings): Promise<number>   a new instance, in a slot of its own
 *   call(slot, input: Uint8Array): Promise<Buffer>
 *   unload(slot): Promise<void>
 *   answer(token, status: number, bytes: Uint8Array): void   settles a host call (see onHostCall)
 *   destroy(): Promise<void>                                  ends every instance and the thread
 *
 * Calls queue to the thread and run there one at a time, across all its instances; the calling
 * thread only queues them, and each result settles its promise through one wake of the event loop.
 * An instance's host call to a target in `siblings` (the slot of an instance loaded earlier on this
 * thread) calls that instance directly on this thread. Any other target is asked of JS:
 * onHostCall(slot, target, request, token) runs on the event loop while this thread blocks, and
 * whoever answers calls answer(token, ...) once, synchronously or later. A handler must therefore
 * not wait on a call to this thread, which cannot run until the host call is answered.
 *
 * A library with asynchronous instances is loaded with loadAsync(libraryPath, ffiName): its instance
 * takes requests with submit(slot, requestId, input) and the answers to its host calls with
 * deliver(slot, callId, status, bytes), neither of which blocks, and reports its responses and host
 * calls through onAsyncEvent(slot, kind, id, target, bytes) on the event loop (kind 0 a response to
 * request `id`, 1 a host call `id` to `target`). The thread keeps running other jobs (more requests
 * to the same instance among them) while a host call is out.
 *
 * The thread keeps the event loop alive only while a load, call, unload or destroy, or a submitted
 * request, is in flight.
 * When the environment is torn down (process exit, or a worker ending) without destroy(), a cleanup
 * hook ends every instance and the thread, failing a host call still waiting on JS.
 * With IPC_NAPI_SPIN_US set, the thread spins that long for the next job before it sleeps.
 */
class ServiceThread : public Napi::ObjectWrap<ServiceThread> {
  public:
    ServiceThread(const Napi::CallbackInfo& info);
    ServiceThread(const ServiceThread&) = delete;
    ServiceThread& operator=(const ServiceThread&) = delete;
    ServiceThread(ServiceThread&&) = delete;
    ServiceThread& operator=(ServiceThread&&) = delete;
    ~ServiceThread() override;

    Napi::Value load(const Napi::CallbackInfo& info);
    Napi::Value call(const Napi::CallbackInfo& info);
    Napi::Value unload(const Napi::CallbackInfo& info);
    Napi::Value answer(const Napi::CallbackInfo& info);
    Napi::Value destroy(const Napi::CallbackInfo& info);
    Napi::Value load_async(const Napi::CallbackInfo& info);
    Napi::Value submit(const Napi::CallbackInfo& info);
    Napi::Value deliver(const Napi::CallbackInfo& info);

    static Napi::Function get_class(Napi::Env env);

    /** A host call this thread is blocked on, until JS answers it. */
    struct HostCallWait {
        std::mutex mutex;
        std::condition_variable answered;
        bool done = false;
        int32_t status = 0;
        std::vector<uint8_t> bytes;
    };

    /** Something for the event loop: a promise to settle, or a host call to ask. */
    struct ToJs {
        enum class Kind : uint8_t { Settle, HostCall, AsyncRespond, AsyncCall } kind = Kind::Settle;
        /** What a Settle resolves its promise with, unless it failed. */
        enum class Value : uint8_t { Bytes, Slot, None } value = Value::None;
        Napi::Promise::Deferred* deferred = nullptr;
        bool failed = false;
        /** The thread has stopped: the event loop joins it and releases the thread-safe function. */
        bool stopped = false;
        std::string error;
        std::vector<uint8_t> bytes;
        int64_t slot = -1;
        std::string target;
        HostCallWait* wait = nullptr;
        /** An asynchronous instance's request or call id. */
        uint64_t id = 0;
    };

    static void call_js(Napi::Env env, Napi::Function, ServiceThread* self, ToJs* message);

  private:
    struct Job {
        enum class Kind : uint8_t { Load, LoadAsync, Call, Submit, Deliver, Unload, Stop } kind = Kind::Call;
        Napi::Promise::Deferred* deferred = nullptr;
        int64_t slot = -1;
        std::vector<uint8_t> input;
        uint64_t id = 0;
        int32_t status = 0;
        std::shared_ptr<FfiLibrary::Loaded> loaded;
        std::map<std::string, int64_t> siblings;
    };

    /** What an asynchronous instance's callbacks are given: which slot they report for. */
    struct AsyncCtx {
        ServiceThread* thread = nullptr;
        int64_t slot = -1;
    };

    struct Slot {
        std::shared_ptr<FfiLibrary::Loaded> loaded;
        void* handle = nullptr;
        bool busy = false;
        std::map<std::string, int64_t> siblings;
        /** Set for an asynchronous instance. */
        std::unique_ptr<AsyncCtx> async;
    };

    static void on_async_respond(void* ctx, uint64_t request_id, const uint8_t* response, size_t len);
    static void on_async_call(
        void* ctx, uint64_t call_id, const uint8_t* target, size_t target_len, const uint8_t* request, size_t len);
    /** Queues a job that settles no promise, keeping the loop alive while `pending` is set. */
    void enqueue_unsettled(Napi::Env env, Job job, bool pending);

    class Router;

    using Tsfn = Napi::TypedThreadSafeFunction<ServiceThread, ToJs, &ServiceThread::call_js>;

    Napi::Promise enqueue(Napi::Env env, Job job);
    void run();
    void run_job(Job& job);
    /** Calls the instance in `slot` on this thread; its host calls go through a Router for it. */
    int32_t call_slot(int64_t slot, const uint8_t* input, size_t input_len, std::vector<uint8_t>& output);
    int32_t ask_js(
        int64_t slot, std::string_view target, const uint8_t* request, size_t len, std::vector<uint8_t>& answer);
    /** Hands `message` to the event loop; false once the thread-safe function is closing. */
    bool post(std::unique_ptr<ToJs> message);
    /**
     * Ends every instance and the thread, and releases the thread-safe function, unless destroy() has.
     * It must run before node closes the thread-safe function at teardown: node finalizes this object
     * while holding that function's lock, where releasing it would deadlock.
     */
    void stop();
    static void on_env_cleanup(void* self);
    void remove_cleanup_hook();

    Napi::FunctionReference on_host_call_;
    Napi::FunctionReference on_async_event_;
    Tsfn tsfn_;
    std::thread thread_;
    // Guarded by mutex_.
    std::mutex mutex_;
    std::condition_variable has_jobs_;
    std::deque<Job> jobs_;
    /** jobs_.size(), readable without the mutex, for the spin before the thread sleeps. */
    std::atomic<size_t> queued_{ 0 };
    /** The host call the thread is blocked on, for stop() to fail when JS can no longer answer. */
    HostCallWait* waiting_ = nullptr;
    bool stopping_ = false;
    std::chrono::microseconds spin_{ 0 };
    // Owned by the native thread.
    std::map<int64_t, Slot> slots_;
    // The event loop's own.
    int64_t next_slot_ = 0;
    int64_t in_flight_ = 0;
    /** Requests submitted to each asynchronous instance and not yet responded to. */
    std::map<int64_t, int64_t> outstanding_;
    bool destroyed_ = false;
    napi_env env_ = nullptr;
    bool cleanup_hooked_ = false;
};

} // namespace ipc::napi
