#include "barretenberg/nodejs_module/lmdb_store/lmdb_store_wrapper.hpp"
#include "barretenberg/nodejs_module/msgpack_client/msgpack_client_async.hpp"
#include "barretenberg/nodejs_module/msgpack_client/msgpack_client_wrapper.hpp"
#include "napi.h"

Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set(Napi::String::New(env, "LMDBStore"), bb::nodejs::lmdb_store::LMDBStoreWrapper::get_class(env));
    exports.Set(Napi::String::New(env, "MsgpackClient"),
                bb::nodejs::msgpack_client::MsgpackClientWrapper::get_class(env));
    exports.Set(Napi::String::New(env, "MsgpackClientAsync"),
                bb::nodejs::msgpack_client::MsgpackClientAsync::get_class(env));
    return exports;
}

// NOLINTNEXTLINE
NODE_API_MODULE(addon, Init)
