#include "ipc_runtime_jsi.hpp"

#include <dlfcn.h>

#include <condition_variable>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <exception>
#include <map>
#include <memory>
#include <mutex>
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>
#include <thread>
#include <utility>
#include <vector>

namespace fj = facebook::jsi;

namespace ipc::jsi {

namespace {

using HostCallFn = ipc_ffi_host_call_fn;

/** A host call's answer: response bytes (or an error message) and status, 0 for a response. */
struct Answer {
    std::vector<uint8_t> bytes;
    int32_t status = 0;
};

/** Where the host calls of the instance call in progress on a thread go. */
using Router = std::function<Answer(std::string_view target, std::vector<uint8_t> request)>;

thread_local const Router* current_router = nullptr;
thread_local void* (*current_alloc)(size_t) = nullptr;

int32_t respond(void* (*alloc)(size_t), const Answer& answer, uint8_t** response, size_t* response_len)
{
    auto* out = static_cast<uint8_t*>(alloc(answer.bytes.empty() ? 1 : answer.bytes.size()));
    if (!answer.bytes.empty()) {
        std::memcpy(out, answer.bytes.data(), answer.bytes.size());
    }
    *response = out;
    *response_len = answer.bytes.size();
    return answer.status;
}

/** Every library's host-call function: answered by the router of the call in progress on this thread. */
int32_t host_call(const uint8_t* target,
                  size_t target_len,
                  const uint8_t* request,
                  size_t request_len,
                  uint8_t** response,
                  size_t* response_len)
{
    if (current_router == nullptr) {
        static const std::string message = "host_call: nothing is bound for this call's host calls (pass hostCall)";
        // NOLINTNEXTLINE(cppcoreguidelines-no-malloc)
        return respond(std::malloc, { { message.begin(), message.end() }, 1 }, response, response_len);
    }
    Answer answer;
    try {
        answer = (*current_router)(std::string_view(reinterpret_cast<const char*>(target), target_len),
                                   std::vector<uint8_t>(request, request + request_len));
    } catch (const std::exception& e) {
        std::string message = e.what();
        answer = { { message.begin(), message.end() }, 1 };
    }
    return respond(current_alloc, answer, response, response_len);
}

class RouterScope {
  public:
    RouterScope(const Router* router, void* (*alloc)(size_t))
        : previous_router_(current_router)
        , previous_alloc_(current_alloc)
    {
        current_router = router;
        current_alloc = alloc;
    }
    RouterScope(const RouterScope&) = delete;
    RouterScope& operator=(const RouterScope&) = delete;
    RouterScope(RouterScope&&) = delete;
    RouterScope& operator=(RouterScope&&) = delete;
    ~RouterScope()
    {
        current_router = previous_router_;
        current_alloc = previous_alloc_;
    }

  private:
    const Router* previous_router_;
    void* (*previous_alloc_)(size_t);
};

std::mutex& registry_mutex()
{
    static std::mutex mutex;
    return mutex;
}

std::map<std::string, std::shared_ptr<const FfiSymbols>>& registry()
{
    static std::map<std::string, std::shared_ptr<const FfiSymbols>> libraries;
    return libraries;
}

template <typename Fn> Fn symbol(void* handle, const std::string& name)
{
    return reinterpret_cast<Fn>(dlsym(handle, name.c_str()));
}

std::optional<FfiSymbols> symbols_in(void* handle, const std::string& ffi_name)
{
    if (handle == nullptr) {
        return std::nullopt;
    }
    FfiSymbols symbols;
    symbols.create = symbol<decltype(symbols.create)>(handle, ffi_name + "_ipc_ffi_create");
    symbols.call = symbol<decltype(symbols.call)>(handle, ffi_name + "_ipc_ffi_call");
    symbols.destroy = symbol<decltype(symbols.destroy)>(handle, ffi_name + "_ipc_ffi_destroy");
    symbols.alloc = symbol<decltype(symbols.alloc)>(handle, ffi_name + "_ipc_ffi_alloc");
    symbols.free = symbol<decltype(symbols.free)>(handle, ffi_name + "_ipc_ffi_free");
    symbols.set_host_call = symbol<decltype(symbols.set_host_call)>(handle, ffi_name + "_ipc_ffi_set_host_call");
    symbols.create_async = symbol<decltype(symbols.create_async)>(handle, ffi_name + "_ipc_ffi_create_async");
    symbols.submit = symbol<decltype(symbols.submit)>(handle, ffi_name + "_ipc_ffi_submit");
    symbols.deliver = symbol<decltype(symbols.deliver)>(handle, ffi_name + "_ipc_ffi_deliver");
    symbols.destroy_async = symbol<decltype(symbols.destroy_async)>(handle, ffi_name + "_ipc_ffi_destroy_async");
    if (symbols.create_async == nullptr || symbols.submit == nullptr || symbols.deliver == nullptr ||
        symbols.destroy_async == nullptr) {
        symbols.create_async = nullptr;
    }
    if (symbols.create == nullptr || symbols.call == nullptr || symbols.destroy == nullptr ||
        symbols.alloc == nullptr || symbols.free == nullptr) {
        return std::nullopt;
    }
    return symbols;
}

/**
 * The library with this FFI name: registered, else `library` (a file name or path) when given, else
 * lib<name>.so/.dylib, else already in the process.
 */
std::shared_ptr<const FfiSymbols> find_library(const std::string& ffi_name, const std::string& library)
{
    std::lock_guard<std::mutex> lock(registry_mutex());
    auto& entry = registry()[ffi_name];
    if (!entry) {
        std::optional<FfiSymbols> found;
        std::vector<std::string> files;
        if (!library.empty()) {
            files.push_back(library);
        }
        files.push_back("lib" + ffi_name + ".so");
        files.push_back("lib" + ffi_name + ".dylib");
        for (const auto& file : files) {
            if ((found = symbols_in(dlopen(file.c_str(), RTLD_NOW | RTLD_LOCAL), ffi_name))) {
                break;
            }
        }
        if (!found) {
            found = symbols_in(RTLD_DEFAULT, ffi_name);
        }
        if (!found) {
            registry().erase(ffi_name);
            throw std::runtime_error("ipc-runtime: no FFI library \"" + ffi_name + "\" is linked into the app (lib" +
                                     ffi_name + " exporting " + ffi_name + "_ipc_ffi_*)");
        }
        if (found->set_host_call != nullptr) {
            found->set_host_call(&host_call);
        }
        entry = std::make_shared<const FfiSymbols>(*found);
    }
    return entry;
}

/** A host function's first argument, or undefined. */
const fj::Value& first_arg(const fj::Value* args, size_t count)
{
    static const fj::Value undefined;
    return count > 0 ? args[0] : undefined;
}

/** The bytes of a Uint8Array (or any ArrayBufferView, or an ArrayBuffer). */
std::vector<uint8_t> bytes_of(fj::Runtime& rt, const fj::Value& value)
{
    if (!value.isObject()) {
        throw fj::JSError(rt, "ipc-runtime: expected a Uint8Array");
    }
    auto object = value.getObject(rt);
    if (object.isArrayBuffer(rt)) {
        auto buffer = object.getArrayBuffer(rt);
        return { buffer.data(rt), buffer.data(rt) + buffer.size(rt) };
    }
    auto buffer_value = object.getProperty(rt, "buffer");
    if (!buffer_value.isObject() || !buffer_value.getObject(rt).isArrayBuffer(rt)) {
        throw fj::JSError(rt, "ipc-runtime: expected a Uint8Array");
    }
    auto buffer = buffer_value.getObject(rt).getArrayBuffer(rt);
    auto offset = static_cast<size_t>(object.getProperty(rt, "byteOffset").asNumber());
    auto length = static_cast<size_t>(object.getProperty(rt, "byteLength").asNumber());
    if (offset + length > buffer.size(rt)) {
        throw fj::JSError(rt, "ipc-runtime: Uint8Array outside its buffer");
    }
    const uint8_t* data = buffer.data(rt) + offset;
    return { data, data + length };
}

class OwnedBuffer final : public fj::MutableBuffer {
  public:
    explicit OwnedBuffer(std::vector<uint8_t> bytes)
        : bytes_(std::move(bytes))
    {}
    size_t size() const override { return bytes_.size(); }
    uint8_t* data() override { return bytes_.data(); }

  private:
    std::vector<uint8_t> bytes_;
};

fj::Value uint8_array(fj::Runtime& rt, std::vector<uint8_t> bytes)
{
    fj::ArrayBuffer buffer(rt, std::make_shared<OwnedBuffer>(std::move(bytes)));
    return rt.global().getPropertyAsFunction(rt, "Uint8Array").callAsConstructor(rt, buffer);
}

/** Runs the library's call on an instance and returns the response payload. */
std::vector<uint8_t> call_library(const FfiSymbols& library, void* instance, const std::vector<uint8_t>& request)
{
    uint8_t* output = nullptr;
    size_t output_len = 0;
    library.call(instance, request.data(), request.size(), &output, &output_len);
    std::vector<uint8_t> response(output, output + output_len);
    library.free(output);
    return response;
}

/** Host calls answered on the JavaScript thread, which is the calling thread, synchronously. */
Router synchronous_router(fj::Runtime& rt, std::shared_ptr<fj::Function> fn)
{
    return [&rt, fn](std::string_view target, std::vector<uint8_t> request) -> Answer {
        try {
            auto result =
                fn->call(rt, fj::String::createFromUtf8(rt, std::string(target)), uint8_array(rt, std::move(request)));
            if (result.isObject() && result.getObject(rt).hasProperty(rt, "then")) {
                static const std::string message = "a synchronous instance needs synchronous host-call answers";
                return { { message.begin(), message.end() }, 1 };
            }
            return { bytes_of(rt, result), 0 };
        } catch (const fj::JSError& e) {
            std::string message = e.getMessage();
            return { { message.begin(), message.end() }, 1 };
        }
    };
}

/** An instance on the JavaScript thread. */
class SyncInstance final : public fj::HostObject {
  public:
    explicit SyncInstance(std::shared_ptr<const FfiSymbols> library)
        : library_(std::move(library))
        , instance_(library_->create())
    {
        if (instance_ == nullptr) {
            throw std::runtime_error("ipc-runtime: the library could not make an instance");
        }
    }
    SyncInstance(const SyncInstance&) = delete;
    SyncInstance& operator=(const SyncInstance&) = delete;
    SyncInstance(SyncInstance&&) = delete;
    SyncInstance& operator=(SyncInstance&&) = delete;
    ~SyncInstance() override { end(); }

    fj::Value get(fj::Runtime& rt, const fj::PropNameID& name) override
    {
        auto property = name.utf8(rt);
        if (property == "callSync") {
            return fj::Function::createFromHostFunction(
                rt, name, 2, [this](fj::Runtime& rt, const fj::Value&, const fj::Value* args, size_t count) {
                    if (instance_ == nullptr) {
                        throw fj::JSError(rt, "ipc-runtime: instance destroyed");
                    }
                    auto request = bytes_of(rt, first_arg(args, count));
                    std::optional<Router> router;
                    if (count > 1 && args[1].isObject() && args[1].getObject(rt).isFunction(rt)) {
                        router = synchronous_router(
                            rt, std::make_shared<fj::Function>(args[1].getObject(rt).getFunction(rt)));
                    }
                    if (in_call_) {
                        throw fj::JSError(rt, "ipc-runtime: a host call cannot call back into its own instance");
                    }
                    in_call_ = true;
                    std::vector<uint8_t> response;
                    {
                        RouterScope scope(router ? &*router : nullptr, library_->alloc);
                        response = call_library(*library_, instance_, request);
                    }
                    in_call_ = false;
                    return uint8_array(rt, std::move(response));
                });
        }
        if (property == "destroy") {
            return fj::Function::createFromHostFunction(
                rt, name, 0, [this](fj::Runtime&, const fj::Value&, const fj::Value*, size_t) {
                    end();
                    return fj::Value::undefined();
                });
        }
        return fj::Value::undefined();
    }

  private:
    void end()
    {
        if (instance_ != nullptr && !in_call_) {
            library_->destroy(instance_);
            instance_ = nullptr;
        }
    }

    std::shared_ptr<const FfiSymbols> library_;
    void* instance_;
    bool in_call_ = false;
};

/**
 * One thread that runs an instance's calls in order. The thread owns the queue with the object, so the object may
 * go away from a task of its own (when that task held the instance's last reference): the thread then finishes
 * the queue and exits on its own.
 */
class ServiceThread {
  public:
    ServiceThread()
        : state_(std::make_shared<State>())
        , thread_([state = state_] { run(*state); })
    {}
    ServiceThread(const ServiceThread&) = delete;
    ServiceThread& operator=(const ServiceThread&) = delete;
    ServiceThread(ServiceThread&&) = delete;
    ServiceThread& operator=(ServiceThread&&) = delete;
    ~ServiceThread()
    {
        {
            std::lock_guard<std::mutex> lock(state_->mutex);
            state_->stopping = true;
        }
        state_->ready.notify_one();
        if (thread_.get_id() == std::this_thread::get_id()) {
            thread_.detach();
        } else {
            thread_.join();
        }
    }

    void post(std::function<void()> task)
    {
        {
            std::lock_guard<std::mutex> lock(state_->mutex);
            state_->tasks.push_back(std::move(task));
        }
        state_->ready.notify_one();
    }

  private:
    struct State {
        std::mutex mutex;
        std::condition_variable ready;
        std::deque<std::function<void()>> tasks;
        bool stopping = false;
    };

    static void run(State& state)
    {
        for (;;) {
            std::function<void()> task;
            {
                std::unique_lock<std::mutex> lock(state.mutex);
                state.ready.wait(lock, [&state] { return state.stopping || !state.tasks.empty(); });
                if (state.tasks.empty()) {
                    return;
                }
                task = std::move(state.tasks.front());
                state.tasks.pop_front();
            }
            task();
        }
    }

    std::shared_ptr<State> state_;
    std::thread thread_;
};

/** A promise of a host call's answer, settled on the JavaScript thread and waited on by the service thread. */
class PendingAnswer {
  public:
    void settle(Answer answer)
    {
        {
            std::lock_guard<std::mutex> lock(mutex_);
            answer_ = std::move(answer);
        }
        ready_.notify_one();
    }
    Answer wait()
    {
        std::unique_lock<std::mutex> lock(mutex_);
        ready_.wait(lock, [this] { return answer_.has_value(); });
        return std::move(*answer_);
    }

  private:
    std::mutex mutex_;
    std::condition_variable ready_;
    std::optional<Answer> answer_;
};

Answer error_answer(const std::string& message)
{
    return { { message.begin(), message.end() }, 1 };
}

std::string message_of(fj::Runtime& rt, const fj::Value& error)
{
    if (error.isObject()) {
        auto message = error.getObject(rt).getProperty(rt, "message");
        if (message.isString()) {
            return message.getString(rt).utf8(rt);
        }
    }
    return error.toString(rt).utf8(rt);
}

/** Settles `pending` with what the JavaScript host-call function answered, now or once its promise settles. */
void answer_from_js(fj::Runtime& rt,
                    fj::Function& fn,
                    std::string target,
                    std::vector<uint8_t> request,
                    const std::shared_ptr<PendingAnswer>& pending)
{
    fj::Value result;
    try {
        result = fn.call(rt, fj::String::createFromUtf8(rt, target), uint8_array(rt, std::move(request)));
    } catch (const fj::JSError& e) {
        pending->settle(error_answer(e.getMessage()));
        return;
    }
    if (!(result.isObject() && result.getObject(rt).hasProperty(rt, "then"))) {
        try {
            pending->settle({ bytes_of(rt, result), 0 });
        } catch (const fj::JSError& e) {
            pending->settle(error_answer(e.getMessage()));
        }
        return;
    }
    auto on_value = fj::Function::createFromHostFunction(
        rt,
        fj::PropNameID::forAscii(rt, "onHostCallAnswer"),
        1,
        [pending](fj::Runtime& rt, const fj::Value&, const fj::Value* args, size_t count) {
            try {
                pending->settle({ bytes_of(rt, first_arg(args, count)), 0 });
            } catch (const fj::JSError& e) {
                pending->settle(error_answer(e.getMessage()));
            }
            return fj::Value::undefined();
        });
    auto on_error = fj::Function::createFromHostFunction(
        rt,
        fj::PropNameID::forAscii(rt, "onHostCallError"),
        1,
        [pending](fj::Runtime& rt, const fj::Value&, const fj::Value* args, size_t count) {
            pending->settle(error_answer(message_of(rt, first_arg(args, count))));
            return fj::Value::undefined();
        });
    result.getObject(rt).getPropertyAsFunction(rt, "then").callWithThis(rt, result.getObject(rt), on_value, on_error);
}

/** An instance on a service thread of its own; its calls return promises. */
class AsyncInstance final : public fj::HostObject, public std::enable_shared_from_this<AsyncInstance> {
  public:
    AsyncInstance(std::shared_ptr<const FfiSymbols> library, RunOnJs run_on_js)
        : library_(std::move(library))
        , run_on_js_(std::move(run_on_js))
        , thread_(std::make_shared<ServiceThread>())
    {}
    AsyncInstance(const AsyncInstance&) = delete;
    AsyncInstance& operator=(const AsyncInstance&) = delete;
    AsyncInstance(AsyncInstance&&) = delete;
    AsyncInstance& operator=(AsyncInstance&&) = delete;
    /** Every posted task holds the instance, so none is left to run by now. */
    ~AsyncInstance() override
    {
        if (instance_ != nullptr) {
            library_->destroy(instance_);
        }
    }

    fj::Value get(fj::Runtime& rt, const fj::PropNameID& name) override
    {
        auto property = name.utf8(rt);
        if (property == "call") {
            return fj::Function::createFromHostFunction(
                rt,
                name,
                2,
                [self = shared_from_this()](fj::Runtime& rt, const fj::Value&, const fj::Value* args, size_t count) {
                    auto request = bytes_of(rt, first_arg(args, count));
                    std::shared_ptr<fj::Function> host_fn;
                    if (count > 1 && args[1].isObject() && args[1].getObject(rt).isFunction(rt)) {
                        host_fn = std::make_shared<fj::Function>(args[1].getObject(rt).getFunction(rt));
                    }
                    return self->call(rt, std::move(request), std::move(host_fn));
                });
        }
        if (property == "destroy") {
            return fj::Function::createFromHostFunction(
                rt, name, 0, [self = shared_from_this()](fj::Runtime&, const fj::Value&, const fj::Value*, size_t) {
                    self->end();
                    return fj::Value::undefined();
                });
        }
        return fj::Value::undefined();
    }

  private:
    fj::Value call(fj::Runtime& rt, std::vector<uint8_t> request, std::shared_ptr<fj::Function> host_fn)
    {
        auto promise_ctor = rt.global().getPropertyAsFunction(rt, "Promise");
        auto self = shared_from_this();
        auto executor = fj::Function::createFromHostFunction(
            rt,
            fj::PropNameID::forAscii(rt, "executor"),
            2,
            [self, request = std::move(request), host_fn](
                fj::Runtime& rt, const fj::Value&, const fj::Value* args, size_t) mutable {
                auto resolve = std::make_shared<fj::Function>(args[0].getObject(rt).getFunction(rt));
                auto reject = std::make_shared<fj::Function>(args[1].getObject(rt).getFunction(rt));
                self->start(std::move(request), std::move(host_fn), std::move(resolve), std::move(reject));
                return fj::Value::undefined();
            });
        return promise_ctor.callAsConstructor(rt, executor);
    }

    /**
     * The JavaScript values one call holds: the host-call function and the promise's resolvers. Only the
     * JavaScript thread touches them, and it releases them there when the call settles, so the service thread
     * never ends up holding the last reference to one.
     */
    struct CallRefs {
        std::shared_ptr<fj::Function> host_fn;
        std::shared_ptr<fj::Function> resolve;
        std::shared_ptr<fj::Function> reject;
    };

    /** Runs the call on the service thread, and settles its promise on the JavaScript thread. */
    void start(std::vector<uint8_t> request,
               std::shared_ptr<fj::Function> host_fn,
               std::shared_ptr<fj::Function> resolve,
               std::shared_ptr<fj::Function> reject)
    {
        if (ended_) {
            throw std::runtime_error("ipc-runtime: instance destroyed");
        }
        auto refs = std::make_shared<CallRefs>(CallRefs{ std::move(host_fn), std::move(resolve), std::move(reject) });
        const bool has_host_fn = refs->host_fn != nullptr;
        auto self = shared_from_this();
        thread_->post([self, request = std::move(request), refs, has_host_fn]() {
            std::string error;
            std::vector<uint8_t> response;
            try {
                if (self->instance_ == nullptr) {
                    self->instance_ = self->library_->create();
                    if (self->instance_ == nullptr) {
                        throw std::runtime_error("ipc-runtime: the library could not make an instance");
                    }
                }
                Router router = [self, refs, has_host_fn](std::string_view target,
                                                          std::vector<uint8_t> request) -> Answer {
                    if (!has_host_fn) {
                        return error_answer("host_call: nothing is bound for this call's host calls (pass hostCall)");
                    }
                    auto pending = std::make_shared<PendingAnswer>();
                    self->run_on_js_([refs, target = std::string(target), request = std::move(request), pending](
                                         fj::Runtime& rt) mutable {
                        answer_from_js(rt, *refs->host_fn, std::move(target), std::move(request), pending);
                    });
                    return pending->wait();
                };
                RouterScope scope(&router, self->library_->alloc);
                response = call_library(*self->library_, self->instance_, request);
            } catch (const std::exception& e) {
                error = e.what();
                if (error.empty()) {
                    error = "ipc-runtime: the call failed";
                }
            }
            self->run_on_js_([refs, error = std::move(error), response = std::move(response)](fj::Runtime& rt) mutable {
                if (error.empty()) {
                    refs->resolve->call(rt, uint8_array(rt, std::move(response)));
                } else {
                    refs->reject->call(rt, fj::JSError(rt, error).value());
                }
                refs->host_fn.reset();
                refs->resolve.reset();
                refs->reject.reset();
            });
        });
    }

    /** Ends the instance once the calls already posted have run, on its own thread. */
    void end()
    {
        if (ended_) {
            return;
        }
        ended_ = true;
        auto self = shared_from_this();
        thread_->post([self] {
            if (self->instance_ != nullptr) {
                self->library_->destroy(self->instance_);
                self->instance_ = nullptr;
            }
        });
    }

    std::shared_ptr<const FfiSymbols> library_;
    RunOnJs run_on_js_;
    std::shared_ptr<ServiceThread> thread_;
    void* instance_ = nullptr;
    bool ended_ = false;
};

/**
 * An asynchronous instance on a service thread of its own: submit() and deliver() queue to the thread,
 * and the instance's responses and host calls reach JavaScript as events, on its thread. The instance is
 * made by the thread's first task and ended by its last.
 */
class EventInstance final : public fj::HostObject, public std::enable_shared_from_this<EventInstance> {
  public:
    EventInstance(std::shared_ptr<const FfiSymbols> library, RunOnJs run_on_js, std::shared_ptr<fj::Function> on_event)
        : library_(std::move(library))
        , events_(std::make_shared<Events>(std::move(run_on_js), std::move(on_event)))
        , thread_(std::make_shared<ServiceThread>())
    {
        thread_->post([library = library_, events = events_, instance = instance_] {
            *instance = library->create_async(events.get(), &EventInstance::on_respond, &EventInstance::on_call);
        });
    }
    EventInstance(const EventInstance&) = delete;
    EventInstance& operator=(const EventInstance&) = delete;
    EventInstance(EventInstance&&) = delete;
    EventInstance& operator=(EventInstance&&) = delete;
    ~EventInstance() override { end(); }

    fj::Value get(fj::Runtime& rt, const fj::PropNameID& name) override
    {
        auto property = name.utf8(rt);
        if (property == "submit") {
            return fj::Function::createFromHostFunction(
                rt,
                name,
                2,
                [self = shared_from_this()](fj::Runtime& rt, const fj::Value&, const fj::Value* args, size_t count) {
                    if (count < 2 || !args[0].isNumber()) {
                        throw fj::JSError(rt, "submit(requestId, request) expects a number and a Uint8Array");
                    }
                    self->post(static_cast<uint64_t>(args[0].asNumber()), 0, bytes_of(rt, args[1]), false);
                    return fj::Value::undefined();
                });
        }
        if (property == "deliver") {
            return fj::Function::createFromHostFunction(
                rt,
                name,
                3,
                [self = shared_from_this()](fj::Runtime& rt, const fj::Value&, const fj::Value* args, size_t count) {
                    if (count < 3 || !args[0].isNumber() || !args[1].isNumber()) {
                        throw fj::JSError(rt, "deliver(callId, status, response) expects two numbers and a Uint8Array");
                    }
                    self->post(static_cast<uint64_t>(args[0].asNumber()),
                               static_cast<int32_t>(args[1].asNumber()),
                               bytes_of(rt, args[2]),
                               true);
                    return fj::Value::undefined();
                });
        }
        if (property == "destroy") {
            return fj::Function::createFromHostFunction(
                rt, name, 0, [self = shared_from_this()](fj::Runtime&, const fj::Value&, const fj::Value*, size_t) {
                    self->end();
                    return fj::Value::undefined();
                });
        }
        return fj::Value::undefined();
    }

  private:
    /** What the instance's callbacks reach. on_event is only touched, and released, on the JavaScript thread. */
    struct Events : std::enable_shared_from_this<Events> {
        Events(RunOnJs run_on_js, std::shared_ptr<fj::Function> on_event)
            : run_on_js(std::move(run_on_js))
            , on_event(std::move(on_event))
        {}
        RunOnJs run_on_js;
        std::shared_ptr<fj::Function> on_event;
    };

    static void report(void* ctx, int kind, uint64_t id, std::string target, std::vector<uint8_t> bytes)
    {
        auto events = static_cast<Events*>(ctx)->shared_from_this();
        // An event still queued when the instance ends finds on_event gone, and is dropped.
        events->run_on_js(
            [events, kind, id, target = std::move(target), bytes = std::move(bytes)](fj::Runtime& rt) mutable {
                if (!events->on_event) {
                    return;
                }
                events->on_event->call(rt,
                                       fj::Value(kind),
                                       fj::Value(static_cast<double>(id)),
                                       fj::String::createFromUtf8(rt, target),
                                       uint8_array(rt, std::move(bytes)));
            });
    }

    static void on_respond(void* ctx, uint64_t request_id, const uint8_t* response, size_t len)
    {
        report(ctx, 0, request_id, std::string(), std::vector<uint8_t>(response, response + len));
    }

    static void on_call(
        void* ctx, uint64_t call_id, const uint8_t* target, size_t target_len, const uint8_t* request, size_t len)
    {
        report(ctx,
               1,
               call_id,
               std::string(reinterpret_cast<const char*>(target), target_len),
               std::vector<uint8_t>(request, request + len));
    }

    void post(uint64_t id, int32_t status, std::vector<uint8_t> bytes, bool deliver)
    {
        if (ended_) {
            return;
        }
        thread_->post([library = library_, instance = instance_, id, status, bytes = std::move(bytes), deliver] {
            if (*instance == nullptr) {
                return;
            }
            if (deliver) {
                library->deliver(*instance, id, status, bytes.data(), bytes.size());
            } else {
                library->submit(*instance, id, bytes.data(), bytes.size());
            }
        });
    }

    /**
     * Lets go of onEvent now, on the JavaScript thread (destroy() and the destructor both run there, the
     * destructor possibly as the runtime goes away), and ends the instance once the tasks already posted
     * have run.
     */
    void end()
    {
        if (ended_) {
            return;
        }
        ended_ = true;
        events_->on_event.reset();
        thread_->post([library = library_, instance = instance_, events = events_] {
            if (*instance != nullptr) {
                library->destroy_async(*instance);
                *instance = nullptr;
            }
        });
    }

    std::shared_ptr<const FfiSymbols> library_;
    std::shared_ptr<Events> events_;
    /** Set and read only on the service thread. */
    std::shared_ptr<void*> instance_ = std::make_shared<void*>(nullptr);
    std::shared_ptr<ServiceThread> thread_;
    bool ended_ = false;
};

} // namespace

void register_ffi(const std::string& ffi_name, const FfiSymbols& symbols)
{
    if (symbols.set_host_call != nullptr) {
        symbols.set_host_call(&host_call);
    }
    std::lock_guard<std::mutex> lock(registry_mutex());
    registry()[ffi_name] = std::make_shared<const FfiSymbols>(symbols);
}

void install(fj::Runtime& runtime, RunOnJs run_on_js)
{
    auto api = fj::Object(runtime);
    auto shared_run_on_js = std::make_shared<RunOnJs>(std::move(run_on_js));
    api.setProperty(
        runtime,
        "createInstance",
        fj::Function::createFromHostFunction(
            runtime,
            fj::PropNameID::forAscii(runtime, "createInstance"),
            1,
            [shared_run_on_js](fj::Runtime& rt, const fj::Value&, const fj::Value* args, size_t count) {
                if (count < 1 || !args[0].isString()) {
                    throw fj::JSError(rt, "createInstance(ffiName) expects the library's FFI name");
                }
                try {
                    auto library =
                        find_library(args[0].getString(rt).utf8(rt),
                                     count > 1 && args[1].isString() ? args[1].getString(rt).utf8(rt) : std::string());
                    return fj::Value(rt,
                                     fj::Object::createFromHostObject(
                                         rt, std::make_shared<AsyncInstance>(std::move(library), *shared_run_on_js)));
                } catch (const std::runtime_error& e) {
                    throw fj::JSError(rt, e.what());
                }
            }));
    api.setProperty(
        runtime,
        "createInstanceSync",
        fj::Function::createFromHostFunction(
            runtime,
            fj::PropNameID::forAscii(runtime, "createInstanceSync"),
            1,
            [](fj::Runtime& rt, const fj::Value&, const fj::Value* args, size_t count) {
                if (count < 1 || !args[0].isString()) {
                    throw fj::JSError(rt, "createInstanceSync(ffiName) expects the library's FFI name");
                }
                try {
                    auto library =
                        find_library(args[0].getString(rt).utf8(rt),
                                     count > 1 && args[1].isString() ? args[1].getString(rt).utf8(rt) : std::string());
                    return fj::Value(rt, fj::Object::createFromHostObject(rt, std::make_shared<SyncInstance>(library)));
                } catch (const std::runtime_error& e) {
                    throw fj::JSError(rt, e.what());
                }
            }));
    api.setProperty(runtime,
                    "hasAsyncInstances",
                    fj::Function::createFromHostFunction(
                        runtime,
                        fj::PropNameID::forAscii(runtime, "hasAsyncInstances"),
                        1,
                        [](fj::Runtime& rt, const fj::Value&, const fj::Value* args, size_t count) {
                            if (count < 1 || !args[0].isString()) {
                                throw fj::JSError(rt, "hasAsyncInstances(ffiName) expects the library's FFI name");
                            }
                            try {
                                auto library = find_library(
                                    args[0].getString(rt).utf8(rt),
                                    count > 1 && args[1].isString() ? args[1].getString(rt).utf8(rt) : std::string());
                                return fj::Value(library->create_async != nullptr);
                            } catch (const std::runtime_error& e) {
                                throw fj::JSError(rt, e.what());
                            }
                        }));
    api.setProperty(
        runtime,
        "createAsyncInstance",
        fj::Function::createFromHostFunction(
            runtime,
            fj::PropNameID::forAscii(runtime, "createAsyncInstance"),
            3,
            [shared_run_on_js](fj::Runtime& rt, const fj::Value&, const fj::Value* args, size_t count) {
                if (count < 3 || !args[0].isString() || !args[2].isObject() || !args[2].getObject(rt).isFunction(rt)) {
                    throw fj::JSError(rt,
                                      "createAsyncInstance(ffiName, library, onEvent) expects the library's FFI name "
                                      "and an event function");
                }
                try {
                    auto library = find_library(args[0].getString(rt).utf8(rt),
                                                args[1].isString() ? args[1].getString(rt).utf8(rt) : std::string());
                    if (library->create_async == nullptr) {
                        throw std::runtime_error("ipc-runtime: \"" + args[0].getString(rt).utf8(rt) +
                                                 "\" exports no asynchronous instances");
                    }
                    auto on_event = std::make_shared<fj::Function>(args[2].getObject(rt).getFunction(rt));
                    return fj::Value(rt,
                                     fj::Object::createFromHostObject(
                                         rt,
                                         std::make_shared<EventInstance>(
                                             std::move(library), *shared_run_on_js, std::move(on_event))));
                } catch (const std::runtime_error& e) {
                    throw fj::JSError(rt, e.what());
                }
            }));
    runtime.global().setProperty(runtime, "__ipcRuntimeJsi", api);
}

} // namespace ipc::jsi
