#include "msgpack_client_async.hpp"
#include "msgpack_client_wrapper.hpp"
#include "napi.h"

// Node addon entry point for ipc-runtime's SHM-IPC client bindings.
// Exports only the transport-agnostic msgpack clients; service-specific
// bindings live in their own addons and consume @aztec-foundation/ipc-runtime separately.
static Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set(Napi::String::New(env, "MsgpackClient"), ipc::napi::MsgpackClientWrapper::get_class(env));
    exports.Set(Napi::String::New(env, "MsgpackClientAsync"), ipc::napi::MsgpackClientAsync::get_class(env));
    return exports;
}

// NOLINTNEXTLINE
NODE_API_MODULE(ipc_runtime_napi, Init)
