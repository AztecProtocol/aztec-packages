#include "barretenberg/nodejs_module/avm_simulate/avm_simulate_napi.hpp"
#include "barretenberg/nodejs_module/lmdb_store/lmdb_store_wrapper.hpp"
#include "barretenberg/nodejs_module/msgpack_client/msgpack_client_wrapper.hpp"
#include "barretenberg/nodejs_module/world_state/world_state.hpp"
#include "napi.h"

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set(Napi::String::New(env, "WorldState"), bb::nodejs::WorldStateWrapper::get_class(env));
    exports.Set(Napi::String::New(env, "LMDBStore"), bb::nodejs::lmdb_store::LMDBStoreWrapper::get_class(env));
    exports.Set(Napi::String::New(env, "MsgpackClient"),
                bb::nodejs::msgpack_client::MsgpackClientWrapper::get_class(env));
    exports.Set(Napi::String::New(env, "avmSimulate"), Napi::Function::New(env, bb::nodejs::AvmSimulateNapi::simulate));
    exports.Set(Napi::String::New(env, "avmSimulateWithHintedDbs"),
                Napi::Function::New(env, bb::nodejs::AvmSimulateNapi::simulateWithHintedDbs));
    return exports;
}

// NOLINTNEXTLINE
NODE_API_MODULE(addon, Init)
