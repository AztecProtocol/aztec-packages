#include "ts_callback_contract_db.hpp"

#include <condition_variable>
#include <future>
#include <mutex>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

#include "barretenberg/common/log.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl/msgpack_impl.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::nodejs {

TsCallbackContractDB::TsCallbackContractDB(Napi::ThreadSafeFunction instanceCallback,
                                           Napi::ThreadSafeFunction classCallback,
                                           Napi::ThreadSafeFunction bytecodeCommitmentCallback,
                                           Napi::ThreadSafeFunction debugNameCallback,
                                           Napi::ThreadSafeFunction addContractsCallback,
                                           Napi::ThreadSafeFunction createCheckpointCallback,
                                           Napi::ThreadSafeFunction commitCheckpointCallback,
                                           Napi::ThreadSafeFunction revertCheckpointCallback)
    : contract_instance_callback_(std::move(instanceCallback))
    , contract_class_callback_(std::move(classCallback))
    , bytecode_commitment_callback_(std::move(bytecodeCommitmentCallback))
    , debug_name_callback_(std::move(debugNameCallback))
    , add_contracts_callback_(std::move(addContractsCallback))
    , create_checkpoint_callback_(std::move(createCheckpointCallback))
    , commit_checkpoint_callback_(std::move(commitCheckpointCallback))
    , revert_checkpoint_callback_(std::move(revertCheckpointCallback))
{}

namespace {

/**
 * @brief Helper struct to pass data between C++ worker thread and JS main thread
 */
struct CallbackData {
    std::promise<std::optional<std::vector<uint8_t>>> result_promise;
    std::string error_message;
};

/**
 * @brief Extracts error message from a Napi value (string or Error object)
 */
std::string extract_error_from_napi_value(const Napi::CallbackInfo& info)
{
    if (info.Length() > 0) {
        if (info[0].IsString()) {
            return info[0].As<Napi::String>().Utf8Value();
        }
        if (info[0].IsObject()) {
            auto err_obj = info[0].As<Napi::Object>();
            auto msg = err_obj.Get("message");
            if (msg.IsString()) {
                return msg.As<Napi::String>().Utf8Value();
            }
        }
    }
    return "Unknown error from TypeScript";
}

/**
 * @brief Creates a resolve handler for promises that return Buffer | undefined
 */
Napi::Function create_buffer_resolve_handler(Napi::Env env, CallbackData* data)
{
    return Napi::Function::New(
        env,
        [data](const Napi::CallbackInfo& info) -> Napi::Value {
            Napi::Env env = info.Env();
            try {
                if (info.Length() > 0 && !info[0].IsUndefined() && !info[0].IsNull()) {
                    if (info[0].IsBuffer()) {
                        auto buffer = info[0].As<Napi::Buffer<uint8_t>>();
                        std::vector<uint8_t> vec(buffer.Data(), buffer.Data() + buffer.Length());
                        data->result_promise.set_value(std::move(vec));
                    } else {
                        data->error_message = "Callback returned non-Buffer value";
                        data->result_promise.set_value(std::nullopt);
                    }
                } else {
                    // Got undefined/null - not found
                    data->result_promise.set_value(std::nullopt);
                }
            } catch (const std::exception& e) {
                data->error_message = std::string("Exception in resolve handler: ") + e.what();
                data->result_promise.set_value(std::nullopt);
            }
            return env.Undefined();
        },
        "resolveHandler");
}

/**
 * @brief Creates a resolve handler for promises that return string | undefined
 */
Napi::Function create_string_resolve_handler(Napi::Env env, CallbackData* data)
{
    return Napi::Function::New(
        env,
        [data](const Napi::CallbackInfo& info) -> Napi::Value {
            Napi::Env env = info.Env();
            try {
                if (info.Length() > 0 && !info[0].IsUndefined() && !info[0].IsNull()) {
                    if (info[0].IsString()) {
                        std::string name = info[0].As<Napi::String>().Utf8Value();
                        std::vector<uint8_t> vec(name.begin(), name.end());
                        data->result_promise.set_value(std::move(vec));
                    } else {
                        data->error_message = "Callback returned non-string value";
                        data->result_promise.set_value(std::nullopt);
                    }
                } else {
                    // Got undefined/null - not found
                    data->result_promise.set_value(std::nullopt);
                }
            } catch (const std::exception& e) {
                data->error_message = std::string("Exception in resolve handler: ") + e.what();
                data->result_promise.set_value(std::nullopt);
            }
            return env.Undefined();
        },
        "resolveHandler");
}

/**
 * @brief Creates a resolve handler for promises that return void
 */
Napi::Function create_void_resolve_handler(Napi::Env env, CallbackData* data)
{
    return Napi::Function::New(
        env,
        [data](const Napi::CallbackInfo& info) -> Napi::Value {
            data->result_promise.set_value(std::nullopt);
            return info.Env().Undefined();
        },
        "resolveHandler");
}

/**
 * @brief Creates a reject handler for promises
 */
Napi::Function create_reject_handler(Napi::Env env, CallbackData* data)
{
    return Napi::Function::New(
        env,
        [data](const Napi::CallbackInfo& info) -> Napi::Value {
            data->error_message = extract_error_from_napi_value(info);
            if (data->error_message == "Unknown error from TypeScript" && info.Length() == 0) {
                data->error_message = "Promise rejected with no reason";
            }
            data->result_promise.set_value(std::nullopt);
            return info.Env().Undefined();
        },
        "rejectHandler");
}

/**
 * @brief Attaches resolve and reject handlers to a promise
 */
void attach_promise_handlers(Napi::Promise promise,
                             Napi::Function resolve_handler,
                             Napi::Function reject_handler,
                             CallbackData* data)
{
    auto then_prop = promise.Get("then");
    if (!then_prop.IsFunction()) {
        data->error_message = "Promise does not have .then() method";
        data->result_promise.set_value(std::nullopt);
        return;
    }

    auto then_fn = then_prop.As<Napi::Function>();
    then_fn.Call(promise, { resolve_handler, reject_handler });
}

/**
 * @brief Serializes data to msgpack format
 */
template <typename T> std::vector<uint8_t> serialize_to_msgpack(const T& data)
{
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, data);
    return std::vector<uint8_t>(buffer.data(), buffer.data() + buffer.size());
}

/**
 * @brief Deserializes msgpack data to a specific type
 */
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

/**
 * @brief Generic callback invoker that handles the full BlockingCall pattern
 *
 * This template function encapsulates the entire promise-based async callback flow:
 * 1. Creates promise/future synchronization
 * 2. Invokes JS callback via BlockingCall
 * 3. Handles promise resolution/rejection
 * 4. Waits with timeout
 * 5. Returns optional result
 */
std::optional<std::vector<uint8_t>> invoke_ts_callback_with_promise(
    const Napi::ThreadSafeFunction& callback,
    const std::string& operation_name,
    std::function<void(Napi::Env, Napi::Function, CallbackData*)> call_js_function,
    std::chrono::seconds timeout = std::chrono::seconds(30))
{
    // Create promise/future pair for synchronization
    auto callback_data = std::make_shared<CallbackData>();
    auto future = callback_data->result_promise.get_future();

    // Call TypeScript callback on the JS main thread
    auto status = callback.BlockingCall(
        callback_data.get(), [call_js_function](Napi::Env env, Napi::Function js_callback, CallbackData* data) {
            try {
                // Call the TypeScript function with appropriate arguments
                call_js_function(env, js_callback, data);

            } catch (const std::exception& e) {
                data->error_message = std::string("Exception calling TypeScript: ") + e.what();
                data->result_promise.set_value(std::nullopt);
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

/**
 * @brief Helper for callbacks that take a single string argument and return Buffer | undefined
 */
std::optional<std::vector<uint8_t>> invoke_single_string_callback(const Napi::ThreadSafeFunction& callback,
                                                                  const std::string& input_str,
                                                                  const std::string& operation_name)
{
    return invoke_ts_callback_with_promise(
        callback, operation_name, [input_str](Napi::Env env, Napi::Function js_callback, CallbackData* data) {
            auto js_input = Napi::String::New(env, input_str);
            auto js_result = js_callback.Call({ js_input });

            if (!js_result.IsPromise()) {
                data->error_message = "TypeScript callback did not return a Promise";
                data->result_promise.set_value(std::nullopt);
                return;
            }

            auto promise = js_result.As<Napi::Promise>();
            auto resolve_handler = create_buffer_resolve_handler(env, data);
            auto reject_handler = create_reject_handler(env, data);
            attach_promise_handlers(promise, resolve_handler, reject_handler, data);
        });
}

/**
 * @brief Helper for callbacks that take two string arguments and return string | undefined
 */
std::optional<std::vector<uint8_t>> invoke_double_string_callback(const Napi::ThreadSafeFunction& callback,
                                                                  const std::string& input_str1,
                                                                  const std::string& input_str2,
                                                                  const std::string& operation_name)
{
    return invoke_ts_callback_with_promise(
        callback,
        operation_name,
        [input_str1, input_str2](Napi::Env env, Napi::Function js_callback, CallbackData* data) {
            auto js_input1 = Napi::String::New(env, input_str1);
            auto js_input2 = Napi::String::New(env, input_str2);
            auto js_result = js_callback.Call({ js_input1, js_input2 });

            if (!js_result.IsPromise()) {
                data->error_message = "TypeScript callback did not return a Promise";
                data->result_promise.set_value(std::nullopt);
                return;
            }

            auto promise = js_result.As<Napi::Promise>();
            auto resolve_handler = create_string_resolve_handler(env, data);
            auto reject_handler = create_reject_handler(env, data);
            attach_promise_handlers(promise, resolve_handler, reject_handler, data);
        });
}

/**
 * @brief Helper for callbacks that take no arguments and return void
 */
void invoke_void_void_callback(const Napi::ThreadSafeFunction& callback, const std::string& operation_name)
{
    auto result = invoke_ts_callback_with_promise(
        callback, operation_name, [](Napi::Env env, Napi::Function js_callback, CallbackData* data) {
            auto js_result = js_callback.Call({});

            if (!js_result.IsPromise()) {
                data->error_message = "TypeScript callback did not return a Promise";
                data->result_promise.set_value(std::nullopt);
                return;
            }

            auto promise = js_result.As<Napi::Promise>();
            auto resolve_handler = create_void_resolve_handler(env, data);
            auto reject_handler = create_reject_handler(env, data);
            attach_promise_handlers(promise, resolve_handler, reject_handler, data);
        });

    // For void callbacks, we just need to ensure no errors occurred
    // The result itself is ignored (will be nullopt for void)
}

/**
 * @brief Helper for callbacks that take two buffers and return void
 */
void invoke_two_buffers_void_callback(const Napi::ThreadSafeFunction& callback,
                                      std::vector<uint8_t> buffer_data1,
                                      std::vector<uint8_t> buffer_data2,
                                      const std::string& operation_name)
{
    auto result = invoke_ts_callback_with_promise(
        callback,
        operation_name,
        [buffer_data1 = std::move(buffer_data1),
         buffer_data2 = std::move(buffer_data2)](Napi::Env env, Napi::Function js_callback, CallbackData* data) {
            auto js_buffer1 = Napi::Buffer<uint8_t>::Copy(env, buffer_data1.data(), buffer_data1.size());
            auto js_buffer2 = Napi::Buffer<uint8_t>::Copy(env, buffer_data2.data(), buffer_data2.size());
            auto js_result = js_callback.Call({ js_buffer1, js_buffer2 });

            if (!js_result.IsPromise()) {
                data->error_message = "TypeScript callback did not return a Promise";
                data->result_promise.set_value(std::nullopt);
                return;
            }

            auto promise = js_result.As<Napi::Promise>();
            auto resolve_handler = create_void_resolve_handler(env, data);
            auto reject_handler = create_reject_handler(env, data);
            attach_promise_handlers(promise, resolve_handler, reject_handler, data);
        });

    // For void callbacks, we just need to ensure no errors occurred
    // The result itself is ignored (will be nullopt for void)
}

/**
 * @brief Converts an FF (field element) to a hex string
 */
std::string ff_to_string(const bb::avm2::FF& value)
{
    std::ostringstream stream;
    stream << value;
    return stream.str();
}

} // namespace

std::optional<bb::avm2::ContractInstance> TsCallbackContractDB::get_contract_instance(
    const bb::avm2::AztecAddress& address) const
{
    if (released_) {
        throw std::runtime_error("Cannot call get_contract_instance after releasing callbacks");
    }

    vinfo("TsCallbackContractDB: Fetching contract instance for address ", address);

    auto result_data =
        invoke_single_string_callback(contract_instance_callback_, ff_to_string(address), "contract instance");

    if (!result_data.has_value()) {
        vinfo("Contract instance not found: ", address);
        return std::nullopt;
    }

    auto instance = deserialize_from_msgpack<bb::avm2::ContractInstance>(*result_data, "contract instance");
    return std::make_optional(std::move(instance));
}

std::optional<bb::avm2::ContractClass> TsCallbackContractDB::get_contract_class(
    const bb::avm2::ContractClassId& class_id) const
{
    if (released_) {
        throw std::runtime_error("Cannot call get_contract_class after releasing callbacks");
    }

    vinfo("TsCallbackContractDB: Fetching contract class for class_id ", class_id);

    auto result_data =
        invoke_single_string_callback(contract_class_callback_, ff_to_string(class_id), "contract class");

    if (!result_data.has_value()) {
        vinfo("Contract class not found: ", class_id);
        return std::nullopt;
    }

    auto contract_class = deserialize_from_msgpack<bb::avm2::ContractClass>(*result_data, "contract class");
    return std::make_optional(std::move(contract_class));
}

void TsCallbackContractDB::add_contracts(const std::vector<bb::avm2::ContractClass>& contract_classes,
                                         const std::vector<bb::avm2::ContractInstanceWithAddress>& contract_instances)
{
    if (released_) {
        throw std::runtime_error("Cannot call add_contracts after releasing callbacks");
    }

    vinfo("TsCallbackContractDB: Adding ",
          contract_classes.size(),
          " contract classes and ",
          contract_instances.size(),
          " contract instances");

    // Serialize both arrays to msgpack
    auto classes_buffer = serialize_to_msgpack(contract_classes);
    auto instances_buffer = serialize_to_msgpack(contract_instances);

    // Call TypeScript with both buffers
    invoke_two_buffers_void_callback(add_contracts_callback_, classes_buffer, instances_buffer, "addContracts");
}

void TsCallbackContractDB::create_checkpoint()
{
    if (released_) {
        throw std::runtime_error("Cannot call create_checkpoint after releasing callbacks");
    }

    vinfo("TsCallbackContractDB: Calling createCheckpoint");
    invoke_void_void_callback(create_checkpoint_callback_, "createCheckpoint");
}

void TsCallbackContractDB::commit_checkpoint()
{
    if (released_) {
        throw std::runtime_error("Cannot call commit_checkpoint after releasing callbacks");
    }

    vinfo("TsCallbackContractDB: Calling commitCheckpoint");
    invoke_void_void_callback(commit_checkpoint_callback_, "commitCheckpoint");
}

void TsCallbackContractDB::revert_checkpoint()
{
    if (released_) {
        throw std::runtime_error("Cannot call revert_checkpoint after releasing callbacks");
    }

    vinfo("TsCallbackContractDB: Calling revertCheckpoint");
    invoke_void_void_callback(revert_checkpoint_callback_, "revertCheckpoint");
}

std::optional<bb::avm2::FF> TsCallbackContractDB::get_bytecode_commitment(
    const bb::avm2::ContractClassId& class_id) const
{
    if (released_) {
        throw std::runtime_error("Cannot call get_bytecode_commitment after releasing callbacks");
    }

    vinfo("TsCallbackContractDB: Fetching bytecode commitment for class_id ", class_id);

    auto result_data =
        invoke_single_string_callback(bytecode_commitment_callback_, ff_to_string(class_id), "bytecode commitment");

    if (!result_data.has_value()) {
        vinfo("Bytecode commitment not found: ", class_id);
        return std::nullopt;
    }

    auto commitment = deserialize_from_msgpack<bb::avm2::FF>(*result_data, "bytecode commitment");
    return commitment;
}

std::optional<std::string> TsCallbackContractDB::get_debug_function_name(const bb::avm2::AztecAddress& address,
                                                                         const bb::avm2::FF& selector) const
{
    if (released_) {
        throw std::runtime_error("Cannot call get_debug_function_name after releasing callbacks");
    }

    vinfo("TsCallbackContractDB: Fetching debug function name for address ", address, " selector ", selector);

    auto result_data = invoke_double_string_callback(
        debug_name_callback_, ff_to_string(address), ff_to_string(selector), "debug function name");

    if (!result_data.has_value()) {
        vinfo("Debug function name not found for address ", address, " selector ", selector);
        return std::nullopt;
    }

    // Convert the vector of bytes back to a string
    std::string name(result_data->begin(), result_data->end());
    return name;
}

void TsCallbackContractDB::release()
{
    if (!released_) {
        contract_instance_callback_.Release();
        contract_class_callback_.Release();
        bytecode_commitment_callback_.Release();
        debug_name_callback_.Release();
        add_contracts_callback_.Release();
        create_checkpoint_callback_.Release();
        commit_checkpoint_callback_.Release();
        revert_checkpoint_callback_.Release();
        released_ = true;
        vinfo("TsCallbackContractDB: Released thread-safe function handles");
    }
}

} // namespace bb::nodejs
