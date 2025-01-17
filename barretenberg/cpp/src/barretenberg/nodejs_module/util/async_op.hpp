#pragma once

#include "barretenberg/serialize/cbind.hpp"
#include <memory>
#include <napi.h>
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

} // namespace bb::nodejs
