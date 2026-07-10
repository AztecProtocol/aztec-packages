#include "barretenberg/avm/avm_ffi.h"
#include "barretenberg/wsdb/wsdb_ffi.h"

#include <napi.h>

#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <exception>
#include <future>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

// Thin NAPI wrapper over the avm_sim_ffi C ABI (barretenberg). Runs the AVM
// in-process — no bb-avm-sim subprocess.
//
//   new InProcessAvm(wsdbPath, cdbPath)      -> Slice A: CDB over its socket
//   new InProcessAvm(wsdbPath, onHostCall)   -> Slice B: CDB via a host_call
//                                               into JS (no CDB socket)
//
// `call(request)` runs a simulation on a worker thread and returns a Promise.
// The AVM MUST run off the JS thread: for Slice A it blocks on the CDB socket
// (served by the event loop), and for Slice B it blocks on host_call into JS —
// either would deadlock on the JS thread. host_call is the generic reverse
// channel: onHostCall(target, req) routes to the right host service; it's the
// native twin of the wasm host_call import (same (target, bytes) contract).
namespace {

// ———————————————————————————————————————————————————————————————————————————
// In-process world state (wsdb), co-hosted with the AVM (Slice C).
//
//   new InProcessWsdb(dataDir, options)   -> owns a WorldState behind wsdb_ffi
//
// `call(request)` runs a wsdb request on a worker thread and returns a Promise.
// The TS world-state service (a generated AsyncApi) drives it exactly like the
// spawned aztec-wsdb backend, but with no child process. A co-hosted
// InProcessAvm reaches the SAME WorldState C++<->C++ (see the AVM's co-hosting
// constructor below) — so a TXE session runs with zero child processes.
// ———————————————————————————————————————————————————————————————————————————

// The scheduler's inline fast path is only safe when requests arrive on a
// single thread (as for the socket server's reactor). In-process, requests
// arrive on libuv worker threads (InProcessWsdb.call) AND the AVM worker
// thread, so we report "always pending" to force every request through the
// scheduler's locked per-fork path, keeping read/write ordering correct under
// concurrent callers.
extern "C" int wsdb_always_pending(void * /*ctx*/) { return 1; }

// Drive one wsdb request to completion synchronously: wsdb_call schedules the
// work and fires our callback (possibly from a wsdb pool thread); we block on a
// future until it does. Called only OFF the JS thread (a libuv worker for
// InProcessWsdb.call, or the AVM worker for its world-state reads), so blocking
// here never stalls the event loop.
std::vector<uint8_t> drive_wsdb_call_sync(wsdb_instance_t *handle,
                                          const uint8_t *req, size_t req_len) {
  std::promise<std::vector<uint8_t>> promise;
  auto future = promise.get_future();
  int rc = wsdb_call(
      handle, req, req_len, &promise,
      [](void *ctx, const uint8_t *resp, size_t resp_len) {
        static_cast<std::promise<std::vector<uint8_t>> *>(ctx)->set_value(
            std::vector<uint8_t>(resp, resp + resp_len));
      });
  if (rc != 0) {
    throw std::runtime_error("wsdb_call failed");
  }
  return future.get();
}

// AsyncWorker that runs one wsdb_call off the JS thread and settles a Promise.
class WsdbCallWorker : public Napi::AsyncWorker {
public:
  WsdbCallWorker(Napi::Env env, wsdb_instance_t *instance,
                 std::vector<uint8_t> request, Napi::Promise::Deferred deferred)
      : Napi::AsyncWorker(env), instance_(instance),
        request_(std::move(request)), deferred_(deferred) {}

  void Execute() override {
    try {
      response_ =
          drive_wsdb_call_sync(instance_, request_.data(), request_.size());
    } catch (const std::exception &e) {
      SetError(e.what());
    }
  }

  void OnOK() override {
    Napi::HandleScope scope(Env());
    deferred_.Resolve(
        Napi::Buffer<uint8_t>::Copy(Env(), response_.data(), response_.size()));
  }

  void OnError(const Napi::Error &e) override {
    Napi::HandleScope scope(Env());
    deferred_.Reject(e.Value());
  }

private:
  wsdb_instance_t *instance_;
  std::vector<uint8_t> request_;
  std::vector<uint8_t> response_;
  Napi::Promise::Deferred deferred_;
};

class InProcessWsdb : public Napi::ObjectWrap<InProcessWsdb> {
public:
  static Napi::Function get_class(Napi::Env env) {
    return DefineClass(env, "InProcessWsdb",
                       {
                           InstanceMethod("call", &InProcessWsdb::call),
                           InstanceMethod("destroy", &InProcessWsdb::destroy),
                       });
  }

  InProcessWsdb(const Napi::CallbackInfo &info)
      : Napi::ObjectWrap<InProcessWsdb>(info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsObject()) {
      Napi::TypeError::New(env, "InProcessWsdb(dataDir, options)")
          .ThrowAsJavaScriptException();
      return;
    }
    std::string data_dir = info[0].As<Napi::String>().Utf8Value();
    Napi::Object opts = info[1].As<Napi::Object>();
    auto opt_str = [&](const char *key) -> std::string {
      Napi::Value v = opts.Get(key);
      return v.IsString() ? v.As<Napi::String>().Utf8Value() : std::string();
    };
    auto opt_u32 = [&](const char *key, uint32_t def) -> uint32_t {
      Napi::Value v = opts.Get(key);
      return v.IsNumber() ? v.As<Napi::Number>().Uint32Value() : def;
    };
    auto opt_u64 = [&](const char *key, uint64_t def) -> uint64_t {
      Napi::Value v = opts.Get(key);
      return v.IsNumber()
                 ? static_cast<uint64_t>(v.As<Napi::Number>().Int64Value())
                 : def;
    };

    std::string tree_heights = opt_str("treeHeightsJson");
    std::string tree_prefill = opt_str("treePrefillJson");
    std::string map_sizes = opt_str("mapSizesJson");
    uint32_t threads = opt_u32("threads", 1);
    uint32_t ihgp = opt_u32("initialHeaderGeneratorPoint", 0);
    std::string prefilled = opt_str("prefilledPublicDataJson");
    uint64_t genesis_ts = opt_u64("genesisTimestamp", 0);

    instance_ = wsdb_create(data_dir.c_str(), tree_heights.c_str(),
                            tree_prefill.c_str(), map_sizes.c_str(), threads,
                            ihgp, prefilled.c_str(), genesis_ts,
                            &wsdb_always_pending, nullptr);
    if (instance_ == nullptr) {
      Napi::Error::New(env, "failed to create in-process wsdb")
          .ThrowAsJavaScriptException();
    }
  }

  ~InProcessWsdb() override { free_instance(); }

  // The raw handle, borrowed by a co-hosted InProcessAvm so both share one
  // WorldState. The AVM must not outlive this instance.
  wsdb_instance_t *raw() const { return instance_; }

  Napi::Value call(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    auto deferred = Napi::Promise::Deferred::New(env);
    if (instance_ == nullptr) {
      deferred.Reject(
          Napi::Error::New(env, "InProcessWsdb already destroyed").Value());
      return deferred.Promise();
    }
    if (info.Length() < 1 || !info[0].IsBuffer()) {
      deferred.Reject(
          Napi::TypeError::New(env, "call(request: Buffer) expects a Buffer")
              .Value());
      return deferred.Promise();
    }
    auto request = info[0].As<Napi::Buffer<uint8_t>>();
    std::vector<uint8_t> request_copy(request.Data(),
                                      request.Data() + request.Length());
    auto *worker =
        new WsdbCallWorker(env, instance_, std::move(request_copy), deferred);
    worker->Queue();
    return deferred.Promise();
  }

  Napi::Value destroy(const Napi::CallbackInfo &info) {
    free_instance();
    return info.Env().Undefined();
  }

private:
  void free_instance() {
    if (instance_ != nullptr) {
      wsdb_destroy(instance_);
      instance_ = nullptr;
    }
  }

  wsdb_instance_t *instance_ = nullptr;
};

// C-linkage trampoline giving avm_create_inprocess a synchronous world-state
// byte transport: it drives wsdb_call on the co-hosted WorldState handle
// (passed as ctx). Runs on the AVM worker thread; world state stays C++<->C++.
extern "C" void avm_wsdb_call_trampoline(void *ctx, const uint8_t *req,
                                         size_t req_len, uint8_t **resp_out,
                                         size_t *resp_len_out) {
  *resp_out = nullptr;
  *resp_len_out = 0;
  try {
    std::vector<uint8_t> resp =
        drive_wsdb_call_sync(static_cast<wsdb_instance_t *>(ctx), req, req_len);
    auto *buffer =
        static_cast<uint8_t *>(std::malloc(resp.empty() ? 1 : resp.size()));
    if (buffer == nullptr) {
      return;
    }
    std::memcpy(buffer, resp.data(), resp.size());
    *resp_out = buffer;
    *resp_len_out = resp.size();
  } catch (...) {
    // Leave *resp_out null → WsdbIpcClient sees an empty response → avm_call
    // errors.
  }
}

// Forward-declared C-linkage trampoline so avm_create_hostcall (a C ABI) gets a
// plain function pointer; it dispatches back to the owning InProcessAvm.
extern "C" void avm_host_call_trampoline(void *ctx, uint32_t target,
                                         const uint8_t *req, size_t req_len,
                                         uint8_t **resp_out,
                                         size_t *resp_len_out);

// Payload handed to the JS thread for one host_call. `resp` outlives this
// struct (shared with the async .then handlers), so the worker's future stays
// valid even though the JS resolution happens later.
struct HostCallData {
  uint32_t target;
  std::vector<uint8_t> req;
  std::shared_ptr<std::promise<std::vector<uint8_t>>> resp;
};

// Runs on the JS thread: invoke onHostCall(target, req) and wire its result
// (Buffer or Promise<Buffer>) to the shared promise.
void host_call_on_js(Napi::Env env, Napi::Function on_host_call,
                     HostCallData *data) {
  auto resp = data->resp; // copy the shared_ptr so it outlives `data`
  uint32_t target = data->target;
  Napi::Buffer<uint8_t> req_buf =
      Napi::Buffer<uint8_t>::Copy(env, data->req.data(), data->req.size());
  delete data;

  try {
    Napi::Value result =
        on_host_call.Call({Napi::Number::New(env, target), req_buf});
    if (result.IsPromise()) {
      Napi::Object promise = result.As<Napi::Object>();
      Napi::Function then = promise.Get("then").As<Napi::Function>();
      Napi::Function on_ok =
          Napi::Function::New(env, [resp](const Napi::CallbackInfo &info) {
            auto b = info[0].As<Napi::Buffer<uint8_t>>();
            resp->set_value(
                std::vector<uint8_t>(b.Data(), b.Data() + b.Length()));
            return info.Env().Undefined();
          });
      Napi::Function on_err =
          Napi::Function::New(env, [resp](const Napi::CallbackInfo &info) {
            std::string msg = info.Length() > 0 ? info[0].ToString().Utf8Value()
                                                : "onHostCall rejected";
            resp->set_exception(
                std::make_exception_ptr(std::runtime_error(msg)));
            return info.Env().Undefined();
          });
      then.Call(promise, {on_ok, on_err});
    } else {
      auto b = result.As<Napi::Buffer<uint8_t>>();
      resp->set_value(std::vector<uint8_t>(b.Data(), b.Data() + b.Length()));
    }
  } catch (const std::exception &e) {
    resp->set_exception(std::make_exception_ptr(
        std::runtime_error(std::string("onHostCall failed: ") + e.what())));
  }
}

// AsyncWorker that runs one avm_call off the JS thread and settles a Promise.
class CallWorker : public Napi::AsyncWorker {
public:
  CallWorker(Napi::Env env, avm_instance_t *instance,
             std::vector<uint8_t> request, Napi::Promise::Deferred deferred)
      : Napi::AsyncWorker(env), instance_(instance),
        request_(std::move(request)), deferred_(deferred) {}

  void Execute() override {
    uint8_t *out = nullptr;
    size_t out_len = 0;
    int rc =
        avm_call(instance_, request_.data(), request_.size(), &out, &out_len);
    if (rc != 0) {
      SetError("avm_call failed");
      return;
    }
    response_.assign(out, out + out_len);
    std::free(out);
  }

  void OnOK() override {
    Napi::HandleScope scope(Env());
    deferred_.Resolve(
        Napi::Buffer<uint8_t>::Copy(Env(), response_.data(), response_.size()));
  }

  void OnError(const Napi::Error &e) override {
    Napi::HandleScope scope(Env());
    deferred_.Reject(e.Value());
  }

private:
  avm_instance_t *instance_;
  std::vector<uint8_t> request_;
  std::vector<uint8_t> response_;
  Napi::Promise::Deferred deferred_;
};

class InProcessAvm : public Napi::ObjectWrap<InProcessAvm> {
public:
  static Napi::Function get_class(Napi::Env env) {
    return DefineClass(env, "InProcessAvm",
                       {
                           InstanceMethod("call", &InProcessAvm::call),
                           InstanceMethod("destroy", &InProcessAvm::destroy),
                       });
  }

  InProcessAvm(const Napi::CallbackInfo &info)
      : Napi::ObjectWrap<InProcessAvm>(info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2) {
      Napi::TypeError::New(
          env, "InProcessAvm(wsdbPath|inProcessWsdb, cdbPath|onHostCall)")
          .ThrowAsJavaScriptException();
      return;
    }

    if (info[0].IsString()) {
      std::string wsdb_path = info[0].As<Napi::String>().Utf8Value();
      if (info[1].IsString()) {
        // Slice A: world state + contract data both over sockets.
        std::string cdb_path = info[1].As<Napi::String>().Utf8Value();
        instance_ = avm_create_ipc(wsdb_path.c_str(), cdb_path.c_str());
      } else if (info[1].IsFunction()) {
        // Slice B: world state over a socket, contract data via host_call into
        // JS. The TSFN lets the worker-thread AVM call the (JS-thread)
        // onHostCall and block for it.
        host_call_ = Napi::ThreadSafeFunction::New(
            env, info[1].As<Napi::Function>(), "avm_host_call", 0, 1);
        has_host_call_ = true;
        instance_ = avm_create_hostcall(wsdb_path.c_str(),
                                        &avm_host_call_trampoline, this);
      } else {
        Napi::TypeError::New(
            env,
            "second arg must be a cdb path (string) or onHostCall (function)")
            .ThrowAsJavaScriptException();
        return;
      }
    } else if (info[0].IsObject() && info[1].IsFunction()) {
      // Slice C: no sockets. World state is a co-hosted InProcessWsdb (shared
      // WorldState, reached C++<->C++), contract data via host_call into JS.
      InProcessWsdb *wsdb =
          Napi::ObjectWrap<InProcessWsdb>::Unwrap(info[0].As<Napi::Object>());
      host_call_ = Napi::ThreadSafeFunction::New(
          env, info[1].As<Napi::Function>(), "avm_host_call", 0, 1);
      has_host_call_ = true;
      instance_ = avm_create_inprocess(&avm_wsdb_call_trampoline, wsdb->raw(),
                                       &avm_host_call_trampoline, this);
    } else {
      Napi::TypeError::New(
          env, "InProcessAvm(wsdbPath|inProcessWsdb, cdbPath|onHostCall)")
          .ThrowAsJavaScriptException();
      return;
    }

    if (instance_ == nullptr) {
      Napi::Error::New(env, "failed to create in-process AVM")
          .ThrowAsJavaScriptException();
    }
  }

  ~InProcessAvm() override { free_instance(); }

  // Invoked (on the AVM worker thread) by the C trampoline for each host_call.
  void run_host_call(uint32_t target, const uint8_t *req, size_t req_len,
                     uint8_t **resp_out, size_t *resp_len_out) {
    *resp_out = nullptr;
    *resp_len_out = 0;
    auto *data = new HostCallData{
        target, std::vector<uint8_t>(req, req + req_len),
        std::make_shared<std::promise<std::vector<uint8_t>>>()};
    auto future = data->resp->get_future();
    napi_status status = host_call_.BlockingCall(data, host_call_on_js);
    if (status != napi_ok) {
      delete data; // the JS callback will not run
      return;
    }
    try {
      std::vector<uint8_t> resp =
          future.get(); // blocks the worker until JS resolves
      auto *buffer =
          static_cast<uint8_t *>(std::malloc(resp.empty() ? 1 : resp.size()));
      if (buffer == nullptr) {
        return;
      }
      std::memcpy(buffer, resp.data(), resp.size());
      *resp_out = buffer;
      *resp_len_out = resp.size();
    } catch (...) {
      // Leave *resp_out null → HostCallContractDB throws → avm_call errors.
    }
  }

  Napi::Value call(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    auto deferred = Napi::Promise::Deferred::New(env);
    if (instance_ == nullptr) {
      deferred.Reject(
          Napi::Error::New(env, "InProcessAvm already destroyed").Value());
      return deferred.Promise();
    }
    if (info.Length() < 1 || !info[0].IsBuffer()) {
      deferred.Reject(
          Napi::TypeError::New(env, "call(request: Buffer) expects a Buffer")
              .Value());
      return deferred.Promise();
    }
    auto request = info[0].As<Napi::Buffer<uint8_t>>();
    std::vector<uint8_t> request_copy(request.Data(),
                                      request.Data() + request.Length());
    auto *worker =
        new CallWorker(env, instance_, std::move(request_copy), deferred);
    worker->Queue();
    return deferred.Promise();
  }

  Napi::Value destroy(const Napi::CallbackInfo &info) {
    free_instance();
    return info.Env().Undefined();
  }

private:
  void free_instance() {
    if (instance_ != nullptr) {
      avm_destroy(instance_);
      instance_ = nullptr;
    }
    if (has_host_call_) {
      host_call_.Release();
      has_host_call_ = false;
    }
  }

  avm_instance_t *instance_ = nullptr;
  Napi::ThreadSafeFunction host_call_;
  bool has_host_call_ = false;
};

extern "C" void avm_host_call_trampoline(void *ctx, uint32_t target,
                                         const uint8_t *req, size_t req_len,
                                         uint8_t **resp_out,
                                         size_t *resp_len_out) {
  static_cast<InProcessAvm *>(ctx)->run_host_call(target, req, req_len,
                                                  resp_out, resp_len_out);
}

} // namespace

static Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(Napi::String::New(env, "InProcessAvm"),
              InProcessAvm::get_class(env));
  exports.Set(Napi::String::New(env, "InProcessWsdb"),
              InProcessWsdb::get_class(env));
  return exports;
}

// NOLINTNEXTLINE
NODE_API_MODULE(avm_inprocess, Init)
