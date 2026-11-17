#include "ffi_library.hpp"
#include "msgpack_client_wrapper.hpp"
#include "napi.h"

// Node addon entry point for ipc-runtime: the synchronous SHM-IPC msgpack client, and FfiLibrary, which loads a
// service's shared library and calls its FFI entry in-process. Services ship no addon of their own.
static Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set(Napi::String::New(env, "MsgpackClient"), ipc::napi::MsgpackClientWrapper::get_class(env));
    exports.Set(Napi::String::New(env, "FfiLibrary"), ipc::napi::FfiLibrary::get_class(env));
    return exports;
}

// NOLINTNEXTLINE
NODE_API_MODULE(ipc_runtime_napi, Init)
