#pragma once

#include "serialization.hpp"
#include <functional>
#include <memory>
#include <napi.h>
#include <thread>
#include <utility>

#ifndef _WIN32
#include <pthread.h>
#endif

namespace bb::nodejs {

using async_fn = std::function<void(msgpack::sbuffer&)>;

/**
 * @brief Encapsulatest some work that can be done off the JavaScript main thread
 *
 * This class takes a Deferred instance (i.e. a Promise to JS), execute some work in a separate thread, and then report
 * back on the result. The async execution _must not_ touch the JS environment. Everything that's needed to complete the
 * work must be copied into memory owned by the C++ code. The same has to be done when reporting back the result: keep
 * the result in memory owned by the C++ code and copy it back to the JS environment in the OnOK/OnError methods.
 *
 * OnOK/OnError will be called on the main JS thread, so it's safe to interact with the JS environment there.
 *
 * Instances of this class are managed by the NodeJS environment and execute on a libuv thread.
 * Docs
 * . - https://github.com/nodejs/node-addon-api/blob/cc06369aa4dd29e585600b8b47839c1297df962d/doc/async_worker.md
 * . - https://nodejs.github.io/node-addon-examples/special-topics/asyncworker
 */
class AsyncOperation : public Napi::AsyncWorker {
  public:
    AsyncOperation(Napi::Env env, std::shared_ptr<Napi::Promise::Deferred> deferred, async_fn fn)
        : Napi::AsyncWorker(env)
        , _fn(std::move(fn))
        , _deferred(std::move(deferred))
    {}

    AsyncOperation(const AsyncOperation&) = delete;
    AsyncOperation& operator=(const AsyncOperation&) = delete;
    AsyncOperation(AsyncOperation&&) = delete;
    AsyncOperation& operator=(AsyncOperation&&) = delete;

    ~AsyncOperation() override = default;

    void Execute() override
    {
        try {
            _fn(_result);
        } catch (const std::exception& e) {
            SetError(e.what());
        } catch (...) {
            // Catch any other exception type that's not derived from std::exception
            // This ensures the promise is always rejected rather than leaving it hanging
            SetError("Unknown exception occurred during async operation");
        }
    }

    void OnOK() override
    {
        auto buf = Napi::Buffer<char>::Copy(Env(), _result.data(), _result.size());
        _deferred->Resolve(buf);
    }
    void OnError(const Napi::Error& e) override { _deferred->Reject(e.Value()); }

  private:
    async_fn _fn;
    std::shared_ptr<Napi::Promise::Deferred> _deferred;
    msgpack::sbuffer _result;
};

/**
 * @brief Runs work on a dedicated std::thread instead of the libuv thread pool.
 *
 * Unlike AsyncOperation (which uses Napi::AsyncWorker and occupies a libuv thread),
 * this class spawns a new OS thread for each operation. This prevents AVM simulations
 * from exhausting the libuv thread pool, which would deadlock when C++ callbacks need
 * to invoke JS functions that themselves require libuv threads (e.g., LMDB reads).
 *
 * The completion callback (resolve/reject) is posted back to the JS main thread via
 * a Napi::ThreadSafeFunction, so the event loop returns immediately after launch
 * and is woken up only when the work is done.
 *
 * Prevent use-after-free: the TSFN callback runs asynchronously on the JS thread
 * (napi_tsfn_blocking only blocks on queue insertion, NOT on callback completion).
 * Both the worker thread lambda and the callback capture a shared_ptr to keep the
 * object alive until both are done.
 *
 * Usage: `ThreadedAsyncOperation::Run(env, deferred, fn);`
 */
class ThreadedAsyncOperation : public std::enable_shared_from_this<ThreadedAsyncOperation> {
  public:
    ThreadedAsyncOperation(Napi::Env env, std::shared_ptr<Napi::Promise::Deferred> deferred, async_fn fn)
        : _fn(std::move(fn))
        , _deferred(std::move(deferred))
    {
        auto dummy = Napi::Function::New(env, [](const Napi::CallbackInfo&) {});
        _completion_tsfn = Napi::ThreadSafeFunction::New(env, dummy, "ThreadedAsyncOpComplete", 0, 1);
    }

    ThreadedAsyncOperation(const ThreadedAsyncOperation&) = delete;
    ThreadedAsyncOperation& operator=(const ThreadedAsyncOperation&) = delete;
    ThreadedAsyncOperation(ThreadedAsyncOperation&&) = delete;
    ThreadedAsyncOperation& operator=(ThreadedAsyncOperation&&) = delete;

    ~ThreadedAsyncOperation() = default;

    static void Run(Napi::Env env, std::shared_ptr<Napi::Promise::Deferred> deferred, async_fn fn)
    {
        auto op = std::make_shared<ThreadedAsyncOperation>(env, std::move(deferred), std::move(fn));
        op->Queue();
    }

  private:
    // AVM simulation call chains are deep. Non-main threads get a 512 KB default stack on
    // macOS versus 8 MB on Linux, so a default std::thread overflows its stack-guard page and
    // aborts with SIGBUS on macOS arm64. The libuv pool that AsyncOperation runs on sizes its
    // threads from RLIMIT_STACK, which is why that path never hit this. Pin a generous stack so
    // the worker has the same headroom on every platform.
    static constexpr size_t WORKER_STACK_SIZE = 32UL * 1024 * 1024;

    void Queue()
    {
        auto self = shared_from_this();
        launch_detached_with_large_stack([self]() {
            try {
                self->_fn(self->_result);
                self->_success = true;
            } catch (const std::exception& e) {
                self->_error = e.what();
                self->_success = false;
            } catch (...) {
                self->_error = "Unknown exception occurred during threaded async operation";
                self->_success = false;
            }

            // Post completion to the JS main thread. The callback captures `self`
            // (shared_ptr) so the object stays alive until the callback runs.
            // napi_tsfn_blocking only blocks on queue insertion, not on callback
            // completion, so we cannot use raw pointers here.
            self->_completion_tsfn.BlockingCall([self](Napi::Env env, Napi::Function /*js_callback*/) {
                if (self->_success) {
                    auto buf = Napi::Buffer<char>::Copy(env, self->_result.data(), self->_result.size());
                    self->_deferred->Resolve(buf);
                } else {
                    auto error = Napi::Error::New(env, self->_error);
                    self->_deferred->Reject(error.Value());
                }
                self->_completion_tsfn.Release();
            });
        });
    }

    // Launch `work` on a detached OS thread with an explicitly large stack (see WORKER_STACK_SIZE).
    // std::thread cannot set a stack size, so use pthreads where available and fall back to a
    // default-stack std::thread only if pthread creation is unavailable or fails.
    static void launch_detached_with_large_stack(std::function<void()> work)
    {
#ifndef _WIN32
        pthread_attr_t attr;
        if (pthread_attr_init(&attr) == 0) {
            pthread_attr_setstacksize(&attr, WORKER_STACK_SIZE);
            pthread_attr_setdetachstate(&attr, PTHREAD_CREATE_DETACHED);

            auto* heap_work = new std::function<void()>(std::move(work));
            pthread_t tid;
            int rc = pthread_create(
                &tid,
                &attr,
                [](void* arg) -> void* {
                    std::unique_ptr<std::function<void()>> fn(static_cast<std::function<void()>*>(arg));
                    (*fn)();
                    return nullptr;
                },
                heap_work);
            pthread_attr_destroy(&attr);

            if (rc == 0) {
                return;
            }

            // pthread_create failed; reclaim the work and fall back to a default std::thread.
            std::unique_ptr<std::function<void()>> reclaimed(heap_work);
            work = std::move(*reclaimed);
        }
#endif
        std::thread(std::move(work)).detach();
    }

    async_fn _fn;
    std::shared_ptr<Napi::Promise::Deferred> _deferred;
    Napi::ThreadSafeFunction _completion_tsfn;
    msgpack::sbuffer _result;
    bool _success = false;
    std::string _error;
};

} // namespace bb::nodejs
