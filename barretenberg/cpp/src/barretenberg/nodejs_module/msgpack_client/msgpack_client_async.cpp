#include "barretenberg/nodejs_module/msgpack_client/msgpack_client_async.hpp"
#include "barretenberg/ipc/ipc_client.hpp"
#include "napi.h"
#include <cstdint>
#include <vector>

using namespace bb::nodejs::msgpack_client;

MsgpackClientAsync::MsgpackClientAsync(const Napi::CallbackInfo& info)
    : ObjectWrap(info)
{
    Napi::Env env = info.Env();

    // Arg 0: shared memory base name (string)
    if (info.Length() < 1 || !info[0].IsString()) {
        throw Napi::TypeError::New(env, "First argument must be a string (shared memory name)");
    }
    std::string shm_name = info[0].As<Napi::String>();

    // Create shared memory client (SPSC-only, no max_clients needed)
    client_ = bb::ipc::IpcClient::create_shm(shm_name);

    // Connect to bb server
    if (!client_->connect()) {
        throw Napi::Error::New(env, "Failed to connect to shared memory server");
    }
}

Napi::Value MsgpackClientAsync::setResponseCallback(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    // Arg 0: JavaScript callback function
    if (info.Length() < 1 || !info[0].IsFunction()) {
        throw Napi::TypeError::New(env, "First argument must be a function");
    }

    // Store the callback for lazy TSFN creation
    // Don't create TSFN yet - it will be created on first acquire()
    js_callback_ = Napi::Persistent(info[0].As<Napi::Function>());

    // Start background polling thread now that callback is registered
    poll_thread_ = std::thread(&MsgpackClientAsync::poll_responses, this);

    // Detach the thread - it will run until process exits
    // No need for explicit shutdown or join
    poll_thread_.detach();

    return env.Undefined();
}

void MsgpackClientAsync::poll_responses()
{
    constexpr uint64_t TIMEOUT_NS = 1000000000; // 1s

    while (true) { // Run forever until process exits
        // Poll for response (blocks with timeout using futex)
        std::span<const uint8_t> response = client_->receive(TIMEOUT_NS);

        if (response.empty()) {
            // Timeout - just continue polling
            continue;
        }

        // Copy response data before releasing (span is invalidated by release())
        auto* response_data = new std::vector<uint8_t>(response.begin(), response.end());

        // Release the message in ring buffer to free space
        client_->release(response.size());

        // Lock mutex to safely access TSFN
        {
            std::lock_guard<std::mutex> lock(tsfn_mutex_);

            // TSFN is active - invoke JavaScript callback
            // The callback will handle matching this response to the correct promise
            auto status = tsfn_.NonBlockingCall(
                response_data, [](Napi::Env env, Napi::Function js_callback, std::vector<uint8_t>* data) {
                    // This lambda runs on the JavaScript main thread!
                    // Safe to create JS objects and call functions here

                    // Create Buffer with response data
                    auto js_buffer = Napi::Buffer<uint8_t>::Copy(env, data->data(), data->size());

                    // Call the registered JavaScript callback with the response
                    // TypeScript will pop its queue and resolve the appropriate promise
                    js_callback.Call({ js_buffer });

                    // Clean up response data
                    delete data;
                });

            if (status != napi_ok) {
                // Failed to queue callback - likely process is exiting
                // Just clean up and continue (process will exit soon anyway)
                delete response_data;
            }
        }
    }
}

Napi::Value MsgpackClientAsync::call(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    // Arg 0: msgpack buffer to send
    if (info.Length() < 1 || !info[0].IsBuffer()) {
        throw Napi::TypeError::New(env, "First argument must be a Buffer");
    }

    auto input_buffer = info[0].As<Napi::Buffer<uint8_t>>();
    const uint8_t* input_data = input_buffer.Data();
    size_t input_len = input_buffer.Length();

    // Send request (non-blocking write to ring buffer with no timeout)
    // TypeScript will handle promise creation and queueing
    if (!client_->send(input_data, input_len, 0)) {
        throw Napi::Error::New(env, "Failed to send request, ring buffer full. Make it bigger?");
    }

    // Return undefined - TypeScript manages promises
    return env.Undefined();
}

Napi::Value MsgpackClientAsync::acquire(const Napi::CallbackInfo& info)
{
    Napi::Env env = info.Env();

    std::lock_guard<std::mutex> lock(tsfn_mutex_);

    if (ref_count_ == 0) {
        // Lazily create TSFN when first needed (0 → 1)
        tsfn_ = Napi::ThreadSafeFunction::New(env,
                                              js_callback_.Value(),  // The actual JS function to call
                                              "ShmResponseCallback", // Resource name for debugging
                                              0,                     // Unlimited queue size
                                              1                      // Initial thread count (must be >= 1)
        );
    }

    ref_count_++;
    return env.Undefined();
}

Napi::Value MsgpackClientAsync::release(const Napi::CallbackInfo& info)
{
    std::lock_guard<std::mutex> lock(tsfn_mutex_);

    ref_count_--;

    if (ref_count_ == 0) {
        // Destroy TSFN when no longer needed (1 → 0)
        // This releases the initial reference, bringing ref count to 0
        tsfn_.Release();
    }

    return info.Env().Undefined();
}

Napi::Function MsgpackClientAsync::get_class(Napi::Env env)
{
    return DefineClass(
        env,
        "MsgpackClientAsync",
        {
            MsgpackClientAsync::InstanceMethod("setResponseCallback", &MsgpackClientAsync::setResponseCallback),
            MsgpackClientAsync::InstanceMethod("call", &MsgpackClientAsync::call),
            MsgpackClientAsync::InstanceMethod("acquire", &MsgpackClientAsync::acquire),
            MsgpackClientAsync::InstanceMethod("release", &MsgpackClientAsync::release),
        });
}
