#include "ts_callback_utils.hpp"

#include <sstream>
#include <stdexcept>

#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl/msgpack_impl.hpp"

namespace bb::nodejs {

std::string extract_error_from_napi_value(const Napi::CallbackInfo& cb_info)
{
    if (cb_info.Length() > 0) {
        if (cb_info[0].IsString()) {
            return cb_info[0].As<Napi::String>().Utf8Value();
        }
        if (cb_info[0].IsObject()) {
            auto err_obj = cb_info[0].As<Napi::Object>();
            auto msg = err_obj.Get("message");
            if (msg.IsString()) {
                return msg.As<Napi::String>().Utf8Value();
            }
        }
    }
    return "Unknown error from TypeScript";
}

Napi::Function create_buffer_resolve_handler(Napi::Env env, CallbackResults* cb_results)
{
    return Napi::Function::New(
        env,
        [cb_results](const Napi::CallbackInfo& cb_info) -> Napi::Value {
            Napi::Env env = cb_info.Env();
            try {
                // Check if first arg is undefined or null
                if (cb_info.Length() > 0 && !cb_info[0].IsUndefined() && !cb_info[0].IsNull()) {
                    // Check if the first argument is a buffer
                    if (cb_info[0].IsBuffer()) {
                        auto buffer = cb_info[0].As<Napi::Buffer<uint8_t>>();
                        std::vector<uint8_t> vec(buffer.Data(), buffer.Data() + buffer.Length());
                        cb_results->result_promise.set_value(std::move(vec));
                    } else {
                        cb_results->error_message = "Callback returned non-Buffer value";
                        cb_results->result_promise.set_value(std::nullopt);
                    }
                } else {
                    // Got undefined/null - not found
                    cb_results->result_promise.set_value(std::nullopt);
                }
            } catch (const std::exception& e) {
                cb_results->error_message = std::string("Exception in resolve handler: ") + e.what();
                cb_results->result_promise.set_value(std::nullopt);
            }
            return env.Undefined();
        },
        "resolveHandler");
}

Napi::Function create_string_resolve_handler(Napi::Env env, CallbackResults* cb_results)
{
    return Napi::Function::New(
        env,
        [cb_results](const Napi::CallbackInfo& cb_info) -> Napi::Value {
            Napi::Env env = cb_info.Env();
            try {
                // Check if first arg is undefined or null
                if (cb_info.Length() > 0 && !cb_info[0].IsUndefined() && !cb_info[0].IsNull()) {
                    // Check if the first argument is a string
                    if (cb_info[0].IsString()) {
                        std::string name = cb_info[0].As<Napi::String>().Utf8Value();
                        std::vector<uint8_t> vec(name.begin(), name.end());
                        cb_results->result_promise.set_value(std::move(vec));
                    } else {
                        cb_results->error_message = "Callback returned non-string value";
                        cb_results->result_promise.set_value(std::nullopt);
                    }
                } else {
                    // Got undefined/null - not found
                    cb_results->result_promise.set_value(std::nullopt);
                }
            } catch (const std::exception& e) {
                cb_results->error_message = std::string("Exception in resolve handler: ") + e.what();
                cb_results->result_promise.set_value(std::nullopt);
            }
            return env.Undefined();
        },
        "resolveHandler");
}

Napi::Function create_void_resolve_handler(Napi::Env env, CallbackResults* cb_results)
{
    return Napi::Function::New(
        env,
        [cb_results](const Napi::CallbackInfo& cb_info) -> Napi::Value {
            cb_results->result_promise.set_value(std::nullopt);
            return cb_info.Env().Undefined();
        },
        "resolveHandler");
}

Napi::Function create_reject_handler(Napi::Env env, CallbackResults* cb_results)
{
    return Napi::Function::New(
        env,
        [cb_results](const Napi::CallbackInfo& cb_info) -> Napi::Value {
            cb_results->error_message = extract_error_from_napi_value(cb_info);
            cb_results->result_promise.set_value(std::nullopt);
            return cb_info.Env().Undefined();
        },
        "rejectHandler");
}

void attach_promise_handlers(Napi::Promise promise,
                             Napi::Function resolve_handler,
                             Napi::Function reject_handler,
                             CallbackResults* cb_results)
{
    auto then_prop = promise.Get("then");
    if (!then_prop.IsFunction()) {
        cb_results->error_message = "Promise does not have .then() method";
        cb_results->result_promise.set_value(std::nullopt);
        return;
    }

    auto then_fn = then_prop.As<Napi::Function>();
    then_fn.Call(promise, { resolve_handler, reject_handler });
}

template <typename T> std::vector<uint8_t> serialize_to_msgpack(const T& data)
{
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, data);
    return std::vector<uint8_t>(buffer.data(), buffer.data() + buffer.size());
}

template <typename T> T deserialize_from_msgpack(const std::vector<uint8_t>& data, const std::string& type_name)
{
    try {
        T result;
        msgpack::object_handle obj_handle = msgpack::unpack(reinterpret_cast<const char*>(data.data()), data.size());
        msgpack::object obj = obj_handle.get();
        obj.convert(result);
        return result;
    } catch (const std::exception& e) {
        throw std::runtime_error(std::string("Failed to deserialize ") + type_name + ": " + e.what());
    }
}

std::optional<std::vector<uint8_t>> invoke_ts_callback_with_promise(
    const Napi::ThreadSafeFunction& callback,
    const std::string& operation_name,
    std::function<void(Napi::Env, Napi::Function, CallbackResults*)> call_js_function,
    std::chrono::seconds timeout)
{
    // Create promise/future pair for synchronization
    auto callback_data = std::make_shared<CallbackResults>();
    auto future = callback_data->result_promise.get_future();

    // Call TypeScript callback on the JS main thread
    auto status = callback.BlockingCall(
        callback_data.get(),
        [call_js_function](Napi::Env env, Napi::Function js_callback, CallbackResults* cb_results) {
            try {
                // Call the TypeScript function with appropriate arguments
                call_js_function(env, js_callback, cb_results);

            } catch (const std::exception& e) {
                cb_results->error_message = std::string("Exception calling TypeScript: ") + e.what();
                cb_results->result_promise.set_value(std::nullopt);
            }
        });

    if (status != napi_ok) {
        throw std::runtime_error("Failed to invoke TypeScript callback for " + operation_name);
    }

    // Wait for the promise to be fulfilled (with timeout)
    auto wait_status = future.wait_for(timeout);
    if (wait_status == std::future_status::timeout) {
        throw std::runtime_error("Timeout waiting for TypeScript callback for " + operation_name);
    }

    // Get the result
    auto result_data = future.get();

    // Check for errors
    if (!callback_data->error_message.empty()) {
        throw std::runtime_error("Error from TypeScript callback: " + callback_data->error_message);
    }

    return result_data;
}

std::optional<std::vector<uint8_t>> invoke_single_string_callback(const Napi::ThreadSafeFunction& callback,
                                                                  const std::string& input_str,
                                                                  const std::string& operation_name)
{
    return invoke_ts_callback_with_promise(
        callback, operation_name, [input_str](Napi::Env env, Napi::Function js_callback, CallbackResults* cb_results) {
            auto js_input = Napi::String::New(env, input_str);
            auto js_result = js_callback.Call({ js_input });

            if (!js_result.IsPromise()) {
                cb_results->error_message = "TypeScript callback did not return a Promise";
                cb_results->result_promise.set_value(std::nullopt);
                return;
            }

            auto promise = js_result.As<Napi::Promise>();
            auto resolve_handler = create_buffer_resolve_handler(env, cb_results);
            auto reject_handler = create_reject_handler(env, cb_results);
            attach_promise_handlers(promise, resolve_handler, reject_handler, cb_results);
        });
}

std::optional<std::vector<uint8_t>> invoke_double_string_callback(const Napi::ThreadSafeFunction& callback,
                                                                  const std::string& input_str1,
                                                                  const std::string& input_str2,
                                                                  const std::string& operation_name)
{
    return invoke_ts_callback_with_promise(
        callback,
        operation_name,
        [input_str1, input_str2](Napi::Env env, Napi::Function js_callback, CallbackResults* cb_results) {
            auto js_input1 = Napi::String::New(env, input_str1);
            auto js_input2 = Napi::String::New(env, input_str2);
            auto js_result = js_callback.Call({ js_input1, js_input2 });

            if (!js_result.IsPromise()) {
                cb_results->error_message = "TypeScript callback did not return a Promise";
                cb_results->result_promise.set_value(std::nullopt);
                return;
            }

            auto promise = js_result.As<Napi::Promise>();
            auto resolve_handler = create_string_resolve_handler(env, cb_results);
            auto reject_handler = create_reject_handler(env, cb_results);
            attach_promise_handlers(promise, resolve_handler, reject_handler, cb_results);
        });
}

void invoke_buffer_void_callback(const Napi::ThreadSafeFunction& callback,
                                 std::vector<uint8_t> buffer_data,
                                 const std::string& operation_name)
{
    auto result = invoke_ts_callback_with_promise(
        callback,
        operation_name,
        [buffer_data = std::move(buffer_data)](Napi::Env env, Napi::Function js_callback, CallbackResults* cb_results) {
            auto js_buffer = Napi::Buffer<uint8_t>::Copy(env, buffer_data.data(), buffer_data.size());
            auto js_result = js_callback.Call({ js_buffer });

            if (!js_result.IsPromise()) {
                cb_results->error_message = "TypeScript callback did not return a Promise";
                cb_results->result_promise.set_value(std::nullopt);
                return;
            }

            auto promise = js_result.As<Napi::Promise>();
            auto resolve_handler = create_void_resolve_handler(env, cb_results);
            auto reject_handler = create_reject_handler(env, cb_results);
            attach_promise_handlers(promise, resolve_handler, reject_handler, cb_results);
        });

    // For void callbacks, we just need to ensure no errors occurred
    // The result itself is ignored (will be nullopt for void)
}

// Explicit template instantiations for types used in this codebase
template std::vector<uint8_t> serialize_to_msgpack(const bb::avm2::ContractDeploymentData& data);
template bb::avm2::ContractInstance deserialize_from_msgpack(const std::vector<uint8_t>& data,
                                                             const std::string& type_name);
template bb::avm2::ContractClass deserialize_from_msgpack(const std::vector<uint8_t>& data,
                                                          const std::string& type_name);
template bb::avm2::FF deserialize_from_msgpack(const std::vector<uint8_t>& data, const std::string& type_name);

} // namespace bb::nodejs
