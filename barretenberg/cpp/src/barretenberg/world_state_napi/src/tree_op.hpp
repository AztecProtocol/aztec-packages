#pragma once

#include "barretenberg/common/log.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_tree.hpp"
#include "barretenberg/world_state_napi/src/tree_with_store.hpp"
#include <memory>
#include <napi.h>

#include <chrono>
#include <thread>

namespace bb::world_state {

using namespace Napi;

class TreeOp : public AsyncWorker {
  public:
    TreeOp(Napi::Env env, std::shared_ptr<bb::world_state::Tree>& tree)
        : AsyncWorker(env)
        , _tree(tree)
        , _deferred(env)
    {}

    ~TreeOp() override = default;
    // This code will be executed on the worker thread
    void Execute() override
    {
        Signal signal(1);
        auto completion =
            [&](const std::string&, uint32_t, const bb::crypto::merkle_tree::index_t&, const bb::fr& r) -> void {
            std::cout << "Got root " << format(_root) << "\n";
            _root = r;
            signal.signal_level(0);
        };

        _tree->get_meta_data(false, completion);
        signal.wait_for_level(0);
    }

    void OnOK() override
    {
        HandleScope scope(Env());
        _deferred.Resolve(Napi::String::New(scope.Env(), format(_root)));
        // Callback().Call({ Env().Null(), String::New(Env(), echo) });
    }

    Napi::Promise GetPromise() { return _deferred.Promise(); }

  private:
    std::shared_ptr<Tree> _tree;
    bb::fr _root;
    Napi::Promise::Deferred _deferred;
};

} // namespace bb::world_state
