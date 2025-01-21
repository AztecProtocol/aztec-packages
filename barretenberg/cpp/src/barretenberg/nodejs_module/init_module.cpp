#include "barretenberg/nodejs_module/lmdb_store/lmdb_store_wrapper.hpp"
#include "barretenberg/nodejs_module/world_state/world_state.hpp"
#include "napi.h"

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set(Napi::String::New(env, "WorldState"), bb::nodejs::WorldStateWrapper::get_class(env));
    exports.Set(Napi::String::New(env, "LMDBStore"), bb::nodejs::lmdb_store::LMDBStoreWrapper::get_class(env));
    return exports;
}

// NOLINTNEXTLINE
NODE_API_MODULE(addon, Init)
