#include "ffi_library.hpp"
#include "msgpack_client_wrapper.hpp"
#include "napi.h"
#include "service_thread.hpp"

// Node addon entry point for ipc-runtime: the synchronous SHM-IPC msgpack client; FfiLibrary, which loads a
// service's shared library and calls instances of it in-process; and ServiceThread, a native thread hosting instances
// of such libraries for asynchronous calls. Services ship no addon of their own.
static Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    exports.Set(Napi::String::New(env, "MsgpackClient"), ipc::napi::MsgpackClientWrapper::get_class(env));
    exports.Set(Napi::String::New(env, "FfiLibrary"), ipc::napi::FfiLibrary::get_class(env));
    exports.Set(Napi::String::New(env, "ServiceThread"), ipc::napi::ServiceThread::get_class(env));
    return exports;
}

// NOLINTNEXTLINE
NODE_API_MODULE(ipc_runtime_napi, Init)
