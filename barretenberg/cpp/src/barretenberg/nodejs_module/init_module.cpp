#include "barretenberg/nodejs_module/msgpack_client/msgpack_client_async.hpp"
#include "barretenberg/nodejs_module/msgpack_client/msgpack_client_wrapper.hpp"
#include "napi.h"

// nodejs_module.node now exposes only the SHM transport. All other former NAPI
// classes (LMDBStore, NativeAvm, NativeWorldState) have been moved out-of-process
// into aztec-{kvdb,avm,wsdb}. This addon is a thin transport library.
Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set(Napi::String::New(env, "MsgpackClient"),
                bb::nodejs::msgpack_client::MsgpackClientWrapper::get_class(env));
    exports.Set(Napi::String::New(env, "MsgpackClientAsync"),
                bb::nodejs::msgpack_client::MsgpackClientAsync::get_class(env));
    return exports;
}

// NOLINTNEXTLINE
NODE_API_MODULE(addon, Init)
