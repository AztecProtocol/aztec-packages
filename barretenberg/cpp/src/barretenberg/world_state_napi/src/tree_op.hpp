#pragma once

#include "barretenberg/common/log.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_tree.hpp"
#include "barretenberg/world_state_napi/src/tree_with_store.hpp"
#include <memory>
#include <napi.h>

#include <chrono>
#include <thread>
#include <utility>

namespace bb::world_state {

using namespace Napi;

using tree_op_callback = std::function<bb::fr()>;

class TreeOp : public AsyncWorker {
  public:
    TreeOp(Napi::Env env, tree_op_callback& callback)
        : AsyncWorker(env)
        , _callback(callback)
        , _deferred(env)
        , _result(0)
    {}

    TreeOp(Napi::Env env, Promise::Deferred& deferred, tree_op_callback& callback)
        : AsyncWorker(env)
        , _callback(callback)
        , _deferred(deferred)
        , _result(0)
    {}

    TreeOp(Napi::Env env, tree_op_callback callback)
        : AsyncWorker(env)
        , _callback(std::move(callback))
        , _deferred(env)
        , _result(0)
    {}

    TreeOp(Napi::Env env, Promise::Deferred& deferred, tree_op_callback callback)
        : AsyncWorker(env)
        , _callback(std::move(callback))
        , _deferred(deferred)
        , _result(0)
    {}

    TreeOp(const TreeOp&) = delete;
    TreeOp& operator=(const TreeOp&) = delete;
    TreeOp(TreeOp&&) = delete;
    TreeOp& operator=(TreeOp&&) = delete;

    ~TreeOp() override = default;

    void Execute() override
    {
        try {
            _result = _callback();
        } catch (const std::exception& e) {
            SetError(e.what());
        }
    }

    void OnOK() override { _deferred.Resolve(String::New(Env(), format(_result))); }
    void OnError(const Napi::Error& e) override { _deferred.Reject(e.Value()); }

    Promise GetPromise() { return _deferred.Promise(); }

  private:
    tree_op_callback _callback;
    Promise::Deferred _deferred;
    bb::fr _result;
};

} // namespace bb::world_state
