#include "barretenberg/avm/avm_ffi.h"

#include <napi.h>

#include <cstdlib>
#include <string>

// Thin NAPI wrapper over the avm_sim_ffi C ABI (barretenberg). It runs the AVM
// in-process — no bb-avm-sim subprocess. Deliberately tiny and generic: the
// only AVM-specific part is the constructor wiring its deps (wsdb/cdb paths);
// `call` is byte-in/byte-out and knows nothing about AVM commands. Barretenberg
// stays free of any Node/NAPI code; this wrapper is the in-process consumer of
// its C ABI, mirroring how bb-avm-sim is the out-of-process consumer.
namespace {

class InProcessAvm : public Napi::ObjectWrap<InProcessAvm> {
public:
  static Napi::Function get_class(Napi::Env env) {
    return DefineClass(env, "InProcessAvm",
                       {
                           InstanceMethod("call", &InProcessAvm::call),
                           InstanceMethod("destroy", &InProcessAvm::destroy),
                       });
  }

  // new InProcessAvm(wsdbPath, cdbPath) — connects to the WSDB + CDB servers
  // (Slice A keeps those out-of-process, reached over their sockets).
  InProcessAvm(const Napi::CallbackInfo &info)
      : Napi::ObjectWrap<InProcessAvm>(info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
      Napi::TypeError::New(
          env, "InProcessAvm(wsdbPath, cdbPath) expects two strings")
          .ThrowAsJavaScriptException();
      return;
    }
    std::string wsdb_path = info[0].As<Napi::String>().Utf8Value();
    std::string cdb_path = info[1].As<Napi::String>().Utf8Value();
    instance_ = avm_create_ipc(wsdb_path.c_str(), cdb_path.c_str());
    if (instance_ == nullptr) {
      Napi::Error::New(env, "avm_create_ipc failed")
          .ThrowAsJavaScriptException();
    }
  }

  ~InProcessAvm() override {
    if (instance_ != nullptr) {
      avm_destroy(instance_);
      instance_ = nullptr;
    }
  }

  // call(request: Buffer): Buffer — one msgpack AvmSimulate frame in/out.
  Napi::Value call(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (instance_ == nullptr) {
      Napi::Error::New(env, "InProcessAvm already destroyed")
          .ThrowAsJavaScriptException();
      return env.Null();
    }
    if (info.Length() < 1 || !info[0].IsBuffer()) {
      Napi::TypeError::New(env, "call(request: Buffer) expects a Buffer")
          .ThrowAsJavaScriptException();
      return env.Null();
    }
    auto request = info[0].As<Napi::Buffer<uint8_t>>();
    uint8_t *out = nullptr;
    size_t out_len = 0;
    int rc =
        avm_call(instance_, request.Data(), request.Length(), &out, &out_len);
    if (rc != 0) {
      Napi::Error::New(env, "avm_call failed").ThrowAsJavaScriptException();
      return env.Null();
    }
    Napi::Buffer<uint8_t> result =
        Napi::Buffer<uint8_t>::Copy(env, out, out_len);
    std::free(out);
    return result;
  }

  Napi::Value destroy(const Napi::CallbackInfo &info) {
    if (instance_ != nullptr) {
      avm_destroy(instance_);
      instance_ = nullptr;
    }
    return info.Env().Undefined();
  }

private:
  avm_instance_t *instance_ = nullptr;
};

} // namespace

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "InProcessAvm"),
              InProcessAvm::get_class(env));
  return exports;
}

// NOLINTNEXTLINE
NODE_API_MODULE(avm_inprocess, Init)
