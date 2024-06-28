#include "world_state.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_tree.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_store.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/dsl/acir_format/serde/serde.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/world_state_napi/src/tree_op.hpp"
#include "barretenberg/world_state_napi/src/tree_with_store.hpp"
#include "napi.h"
#include <cstdint>
#include <memory>
#include <stdexcept>
#include <thread>

WorldStateAddon::WorldStateAddon(const Napi::CallbackInfo& info)
    : ObjectWrap(info)
    , _workers(4)
{
    Napi::Env env = info.Env();

    if (info.Length() < 1) {
        Napi::TypeError::New(env, "Wrong number of arguments").ThrowAsJavaScriptException();
        return;
    }

    if (!info[0].IsString()) {
        Napi::TypeError::New(env, "Directory needs to be a string").ThrowAsJavaScriptException();
        return;
    }

    // bb::crypto::merkle_tree::LMDBEnvironment lmdb_env(info[0].ToString(), 1, 2, 16);
    _lmdb_env = std::make_unique<bb::crypto::merkle_tree::LMDBEnvironment>(info[0].ToString(), 1, 2, 16);
    // bb::crypto::merkle_tree::LMDBStore lmdb_store(*_lmdb_env, "world_state");
    _lmdb_store = std::make_unique<bb::crypto::merkle_tree::LMDBStore>(*_lmdb_env, "world_state");

    // bb::world_state::TreeStore store("notes", 2, *_lmdb_store);
    _notes_store = std::make_unique<bb::world_state::TreeStore>("notes", 2, *_lmdb_store);
    _notes_tree = std::make_shared<bb::world_state::Tree>(*_notes_store, _workers);
    // _store = std::make_shared<bb::world_state::TreeStore>("notes", 2, lmdb_store);
    // _notes_tree = std::make_shared<bb::world_state::Tree>(*_store, _workers);
    // this->_notes_tree = std::make_unique<bb::world_state::TreeWithStore>(tree, store);
}

Napi::Value WorldStateAddon::get_root(const Napi::CallbackInfo& info)
{
    bool uncomitted = info.Length() > 0;
    auto* tree_op = new bb::world_state::TreeOp(info.Env(), [=]() {
        bb::crypto::merkle_tree::Signal signal(1);
        bb::fr root(0);
        auto completion =
            [&](const std::string&, uint32_t, const bb::crypto::merkle_tree::index_t&, const bb::fr& r) -> void {
            root = r;
            signal.signal_level(0);
        };

        _notes_tree->get_meta_data(uncomitted, completion);
        signal.wait_for_level(0);

        return root;
    });
    tree_op->Queue();
    return tree_op->GetPromise();
}

Napi::Value WorldStateAddon::insert_leaf(const Napi::CallbackInfo& info)
{
    auto env = info.Env();
    auto deferred = Napi::Promise::Deferred::New(env);

    if (info.Length() < 1) {
        deferred.Reject(Napi::TypeError::New(env, "Wrong number of arguments").Value());
        return deferred.Promise();
    }

    if (!info[0].IsString()) {
        deferred.Reject(Napi::TypeError::New(env, "Leaf must be a string").Value());
        return deferred.Promise();
    }

    bb::fr leaf(info[0].As<Napi::String>());
    auto* tree_op = new bb::world_state::TreeOp(env, deferred, [&]() {
        bb::crypto::merkle_tree::Signal signal(1);
        bb::fr leaf_index(0);
        auto completion = [&](bb::fr leaf, bb::crypto::merkle_tree::index_t index) -> void {
            (void)leaf;
            leaf_index = index;
            signal.signal_level(0);
        };

        _notes_tree->add_value(leaf, completion);
        signal.wait_for_level(0);
        return leaf_index;
    });
    tree_op->Queue();

    return deferred.Promise();
}

Napi::Value WorldStateAddon::commit(const Napi::CallbackInfo& info)
{
    auto* tree_op = new bb::world_state::TreeOp(info.Env(), [&]() {
        bb::crypto::merkle_tree::Signal signal(1);
        auto completion = [&]() -> void { signal.signal_level(0); };

        _notes_tree->commit(completion);
        signal.wait_for_level(0);
        return 0;
    });
    tree_op->Queue();

    return tree_op->GetPromise();
}

Napi::Function WorldStateAddon::get_class(Napi::Env env)
{
    return DefineClass(env,
                       "WorldState",
                       {
                           WorldStateAddon::InstanceMethod("get_root", &WorldStateAddon::get_root),
                           WorldStateAddon::InstanceMethod("insert_leaf", &WorldStateAddon::insert_leaf),
                           WorldStateAddon::InstanceMethod("commit", &WorldStateAddon::commit),
                       });
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    Napi::String name = Napi::String::New(env, "WorldState");
    exports.Set(name, WorldStateAddon::get_class(env));
    return exports;
}

NODE_API_MODULE(addon, Init)
