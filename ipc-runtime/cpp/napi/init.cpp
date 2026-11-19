#include "ffi_library.hpp"
#include "msgpack_client_async.hpp"
#include "msgpack_client_wrapper.hpp"
#include "napi.h"

// Node addon entry point for ipc-runtime: the SHM-IPC msgpack clients, and FfiLibrary, which loads a
// service's shared library and calls its FFI entry in-process. Services ship no addon of their own.
static Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set(Napi::String::New(env, "MsgpackClient"), ipc::napi::MsgpackClientWrapper::get_class(env));
    exports.Set(Napi::String::New(env, "MsgpackClientAsync"), ipc::napi::MsgpackClientAsync::get_class(env));
    exports.Set(Napi::String::New(env, "FfiLibrary"), ipc::napi::FfiLibrary::get_class(env));
    return exports;
}

// NOLINTNEXTLINE
NODE_API_MODULE(ipc_runtime_napi, Init)
