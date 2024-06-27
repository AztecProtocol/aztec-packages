#include "world_state.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_tree.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_store.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/world_state_napi/src/tree_with_store.hpp"
#include "napi.h"
#include <memory>

WorldStateAddon::WorldStateAddon(const Napi::CallbackInfo& info)
    : ObjectWrap(info)
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

    bb::crypto::merkle_tree::LMDBEnvironment lmdb_env(info[0].ToString(), 1, 2, 16);
    bb::crypto::merkle_tree::LMDBStore lmdb_store(lmdb_env, "world_state");

    // auto store = std::make_unique<bb::world_state::TreeStore>(name, 32, lmdb_store);
    bb::world_state::TreeStore store("notes", 2, lmdb_store);
    bb::ThreadPool workers(2);
    _notes_tree = std::make_unique<bb::world_state::Tree>(store, workers);
    // this->_notes_tree = std::make_unique<bb::world_state::TreeWithStore>(tree, store);
}

Napi::Value WorldStateAddon::get_root(const Napi::CallbackInfo& info)
{
    std::cout << "Getting root\n";
    Napi::Env env = info.Env();
    bb::crypto::merkle_tree::Signal signal(1);
    bb::fr r;
    auto completion =
        [&](const std::string&, uint32_t, const bb::crypto::merkle_tree::index_t&, const bb::fr& root) -> void {
        std::cout << "Got root " << format(root) << "\n";
        r = root;
        signal.signal_level(0);
    };
    std::cout << "Requesting tree metadata\n";
    _notes_tree->get_meta_data(false, completion);
    std::cout << "Requested tree meta\n";
    signal.wait_for_level(0);
    std::cout << "Finishing func\n";
    return Napi::String::New(env, format(r));
}

Napi::Value WorldStateAddon::insert_leaf(const Napi::CallbackInfo& info)
{
    return Napi::Boolean::New(info.Env(), true);
}

Napi::Function WorldStateAddon::get_class(Napi::Env env)
{
    return DefineClass(env,
                       "WorldState",
                       {
                           WorldStateAddon::InstanceMethod("get_root", &WorldStateAddon::get_root),
                           WorldStateAddon::InstanceMethod("insert_leaf", &WorldStateAddon::insert_leaf),
                       });
}

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    Napi::String name = Napi::String::New(env, "WorldState");
    exports.Set(name, WorldStateAddon::get_class(env));
    return exports;
}

NODE_API_MODULE(addon, Init)
