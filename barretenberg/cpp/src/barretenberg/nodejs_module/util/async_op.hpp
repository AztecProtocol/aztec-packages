#pragma once

#include "barretenberg/serialize/msgpack_impl.hpp"
#include <memory>
#include <napi.h>
#include <thread>
#include <utility>

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
 * Usage: `auto* op = new ThreadedAsyncOperation(env, deferred, fn); op->Queue();`
 * The object self-destructs after resolving/rejecting the promise.
 */
class ThreadedAsyncOperation {
  public:
    ThreadedAsyncOperation(Napi::Env env, std::shared_ptr<Napi::Promise::Deferred> deferred, async_fn fn)
        : _fn(std::move(fn))
        , _deferred(std::move(deferred))
    {
        // Create a no-op JS function as the TSFN target — we use the native callback form of BlockingCall
        // to resolve/reject the promise, so the JS function is never actually called directly.
        auto dummy = Napi::Function::New(env, [](const Napi::CallbackInfo&) {});
        _completion_tsfn = Napi::ThreadSafeFunction::New(env, dummy, "ThreadedAsyncOpComplete", 0, 1);
    }

    ThreadedAsyncOperation(const ThreadedAsyncOperation&) = delete;
    ThreadedAsyncOperation& operator=(const ThreadedAsyncOperation&) = delete;
    ThreadedAsyncOperation(ThreadedAsyncOperation&&) = delete;
    ThreadedAsyncOperation& operator=(ThreadedAsyncOperation&&) = delete;

    ~ThreadedAsyncOperation() = default;

    void Queue()
    {
        std::thread([this]() {
            try {
                _fn(_result);
                _success = true;
            } catch (const std::exception& e) {
                _error = e.what();
                _success = false;
            } catch (...) {
                _error = "Unknown exception occurred during threaded async operation";
                _success = false;
            }

            // Post completion back to the JS main thread
            _completion_tsfn.BlockingCall(
                this, [](Napi::Env env, Napi::Function /*js_callback*/, ThreadedAsyncOperation* op) {
                    if (op->_success) {
                        auto buf = Napi::Buffer<char>::Copy(env, op->_result.data(), op->_result.size());
                        op->_deferred->Resolve(buf);
                    } else {
                        auto error = Napi::Error::New(env, op->_error);
                        op->_deferred->Reject(error.Value());
                    }
                    // Release the TSFN and self-destruct
                    op->_completion_tsfn.Release();
                    delete op;
                });
        }).detach();
    }

  private:
    async_fn _fn;
    std::shared_ptr<Napi::Promise::Deferred> _deferred;
    Napi::ThreadSafeFunction _completion_tsfn;
    msgpack::sbuffer _result;
    bool _success = false;
    std::string _error;
};

} // namespace bb::nodejs
