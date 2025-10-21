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
                                           Napi::ThreadSafeFunction addNonRevCallback,
                                           Napi::ThreadSafeFunction addRevCallback,
                                           Napi::ThreadSafeFunction bytecodeCommitmentCallback,
                                           Napi::ThreadSafeFunction debugNameCallback)
    : contract_instance_callback_(std::move(instanceCallback))
    , contract_class_callback_(std::move(classCallback))
    , add_non_rev_callback_(std::move(addNonRevCallback))
    , add_rev_callback_(std::move(addRevCallback))
    , bytecode_commitment_callback_(std::move(bytecodeCommitmentCallback))
    , debug_name_callback_(std::move(debugNameCallback))
{}

namespace {
/**
 * @brief Helper struct to pass data between C++ worker thread and JS main thread
 */
struct CallbackData {
    std::string input;                                                // Input parameter (address or class_id as string)
    std::promise<std::optional<std::vector<uint8_t>>> result_promise; // Promise to fulfill with result
    std::string error_message;                                        // Error message if callback fails
};
} // namespace

std::optional<bb::avm2::ContractInstance> TsCallbackContractDB::get_contract_instance(
    const bb::avm2::AztecAddress& address) const
{
    if (released_) {
        throw std::runtime_error("Cannot call get_contract_instance after releasing callbacks");
    }

    vinfo("TsCallbackContractDB: Fetching contract instance for address ", address);

    // Create a promise/future pair for synchronization
    auto callback_data = std::make_shared<CallbackData>();
    // Convert FF to hex string using ostringstream
    std::ostringstream address_stream;
    address_stream << address;
    callback_data->input = address_stream.str();
    auto future = callback_data->result_promise.get_future();

    // Call TypeScript callback on the JS main thread
    auto status = contract_instance_callback_.BlockingCall(
        callback_data.get(), [](Napi::Env env, Napi::Function js_callback, CallbackData* data) {
            try {
                // Call the TypeScript function with address string
                auto js_address = Napi::String::New(env, data->input);
                auto js_result = js_callback.Call({ js_address });

                // The TypeScript callback should return a Promise<Buffer | undefined>
                if (!js_result.IsPromise()) {
                    data->error_message = "TypeScript callback did not return a Promise";
                    data->result_promise.set_value(std::nullopt);
                    return;
                }

                auto promise = js_result.As<Napi::Promise>();

                // Attach .then() and .catch() handlers to the promise
                auto then_prop = promise.Get("then");
                if (!then_prop.IsFunction()) {
                    data->error_message = "Promise does not have .then() method";
                    data->result_promise.set_value(std::nullopt);
                    return;
                }

                auto then_fn = then_prop.As<Napi::Function>();

                // Create resolve handler
                auto resolve_handler = Napi::Function::New(
                    env,
                    [data](const Napi::CallbackInfo& info) -> Napi::Value {
                        Napi::Env env = info.Env();
                        try {
                            if (info.Length() > 0 && !info[0].IsUndefined() && !info[0].IsNull()) {
                                // Got a value - should be a Buffer
                                if (info[0].IsBuffer()) {
                                    auto buffer = info[0].As<Napi::Buffer<uint8_t>>();
                                    std::vector<uint8_t> vec(buffer.Data(), buffer.Data() + buffer.Length());
                                    data->result_promise.set_value(std::move(vec));
                                } else {
                                    data->error_message = "Callback returned non-Buffer value";
                                    data->result_promise.set_value(std::nullopt);
                                }
                            } else {
                                // Got undefined/null - contract not found
                                data->result_promise.set_value(std::nullopt);
                            }
                        } catch (const std::exception& e) {
                            data->error_message = std::string("Exception in resolve handler: ") + e.what();
                            data->result_promise.set_value(std::nullopt);
                        }
                        return env.Undefined();
                    },
                    "resolveHandler");

                // Create reject handler
                auto reject_handler = Napi::Function::New(
                    env,
                    [data](const Napi::CallbackInfo& info) -> Napi::Value {
                        Napi::Env env = info.Env();
                        if (info.Length() > 0) {
                            if (info[0].IsString()) {
                                data->error_message = info[0].As<Napi::String>().Utf8Value();
                            } else if (info[0].IsObject()) {
                                auto err_obj = info[0].As<Napi::Object>();
                                auto msg = err_obj.Get("message");
                                if (msg.IsString()) {
                                    data->error_message = msg.As<Napi::String>().Utf8Value();
                                } else {
                                    data->error_message = "Unknown error from TypeScript";
                                }
                            } else {
                                data->error_message = "Unknown error from TypeScript";
                            }
                        } else {
                            data->error_message = "Promise rejected with no reason";
                        }
                        data->result_promise.set_value(std::nullopt);
                        return env.Undefined();
                    },
                    "rejectHandler");

                // Attach handlers: promise.then(resolveHandler, rejectHandler)
                then_fn.Call(promise, { resolve_handler, reject_handler });

            } catch (const std::exception& e) {
                data->error_message = std::string("Exception calling TypeScript: ") + e.what();
                data->result_promise.set_value(std::nullopt);
            }
        });

    if (status != napi_ok) {
        throw std::runtime_error("Failed to invoke TypeScript callback for contract instance");
    }

    // Wait for the promise to be fulfilled (with timeout)
    auto wait_status = future.wait_for(std::chrono::seconds(30));
    if (wait_status == std::future_status::timeout) {
        throw std::runtime_error("Timeout waiting for TypeScript callback for contract instance");
    }

    // Get the result
    auto result_data = future.get();

    // Check for errors
    if (!callback_data->error_message.empty()) {
        throw std::runtime_error("Error from TypeScript callback: " + callback_data->error_message);
    }

    // If no data, contract not found
    if (!result_data.has_value()) {
        vinfo("Contract instance not found: ", address);
        return std::nullopt;
    }

    // Deserialize the msgpack data into ContractInstanceFromTs, then convert to ContractInstance
    try {
        bb::avm2::ContractInstanceFromTs instanceFromTs;
        msgpack::object_handle obj_handle =
            msgpack::unpack(reinterpret_cast<const char*>(result_data->data()), result_data->size());
        msgpack::object obj = obj_handle.get();
        obj.convert(instanceFromTs);

        return std::make_optional<bb::avm2::ContractInstance>(instanceFromTs.to_contract_instance());
    } catch (const std::exception& e) {
        throw std::runtime_error(std::string("Failed to deserialize contract instance: ") + e.what());
    }
}

std::optional<bb::avm2::ContractClass> TsCallbackContractDB::get_contract_class(
    const bb::avm2::ContractClassId& class_id) const
{
    if (released_) {
        throw std::runtime_error("Cannot call get_contract_class after releasing callbacks");
    }

    vinfo("TsCallbackContractDB: Fetching contract class for class_id ", class_id);

    // Create a promise/future pair for synchronization
    auto callback_data = std::make_shared<CallbackData>();
    // Convert FF to hex string using ostringstream
    std::ostringstream class_id_stream;
    class_id_stream << class_id;
    callback_data->input = class_id_stream.str();
    auto future = callback_data->result_promise.get_future();

    // Call TypeScript callback on the JS main thread
    auto status = contract_class_callback_.BlockingCall(
        callback_data.get(), [](Napi::Env env, Napi::Function js_callback, CallbackData* data) {
            try {
                // Call the TypeScript function with class ID string
                auto js_class_id = Napi::String::New(env, data->input);
                auto js_result = js_callback.Call({ js_class_id });

                // The TypeScript callback should return a Promise<Buffer | undefined>
                if (!js_result.IsPromise()) {
                    data->error_message = "TypeScript callback did not return a Promise";
                    data->result_promise.set_value(std::nullopt);
                    return;
                }

                auto promise = js_result.As<Napi::Promise>();

                // Attach .then() and .catch() handlers
                auto then_prop = promise.Get("then");
                if (!then_prop.IsFunction()) {
                    data->error_message = "Promise does not have .then() method";
                    data->result_promise.set_value(std::nullopt);
                    return;
                }

                auto then_fn = then_prop.As<Napi::Function>();

                // Create resolve handler
                auto resolve_handler = Napi::Function::New(
                    env,
                    [data](const Napi::CallbackInfo& info) -> Napi::Value {
                        Napi::Env env = info.Env();
                        try {
                            if (info.Length() > 0 && !info[0].IsUndefined() && !info[0].IsNull()) {
                                // Got a value - should be a Buffer
                                if (info[0].IsBuffer()) {
                                    auto buffer = info[0].As<Napi::Buffer<uint8_t>>();
                                    std::vector<uint8_t> vec(buffer.Data(), buffer.Data() + buffer.Length());
                                    data->result_promise.set_value(std::move(vec));
                                } else {
                                    data->error_message = "Callback returned non-Buffer value";
                                    data->result_promise.set_value(std::nullopt);
                                }
                            } else {
                                // Got undefined/null - contract class not found
                                data->result_promise.set_value(std::nullopt);
                            }
                        } catch (const std::exception& e) {
                            data->error_message = std::string("Exception in resolve handler: ") + e.what();
                            data->result_promise.set_value(std::nullopt);
                        }
                        return env.Undefined();
                    },
                    "resolveHandler");

                // Create reject handler
                auto reject_handler = Napi::Function::New(
                    env,
                    [data](const Napi::CallbackInfo& info) -> Napi::Value {
                        Napi::Env env = info.Env();
                        if (info.Length() > 0) {
                            if (info[0].IsString()) {
                                data->error_message = info[0].As<Napi::String>().Utf8Value();
                            } else if (info[0].IsObject()) {
                                auto err_obj = info[0].As<Napi::Object>();
                                auto msg = err_obj.Get("message");
                                if (msg.IsString()) {
                                    data->error_message = msg.As<Napi::String>().Utf8Value();
                                } else {
                                    data->error_message = "Unknown error from TypeScript";
                                }
                            } else {
                                data->error_message = "Unknown error from TypeScript";
                            }
                        } else {
                            data->error_message = "Promise rejected with no reason";
                        }
                        data->result_promise.set_value(std::nullopt);
                        return env.Undefined();
                    },
                    "rejectHandler");

                // Attach handlers: promise.then(resolveHandler, rejectHandler)
                then_fn.Call(promise, { resolve_handler, reject_handler });

            } catch (const std::exception& e) {
                data->error_message = std::string("Exception calling TypeScript: ") + e.what();
                data->result_promise.set_value(std::nullopt);
            }
        });

    if (status != napi_ok) {
        throw std::runtime_error("Failed to invoke TypeScript callback for contract class");
    }

    // Wait for the promise to be fulfilled (with timeout)
    auto wait_status = future.wait_for(std::chrono::seconds(30));
    if (wait_status == std::future_status::timeout) {
        throw std::runtime_error("Timeout waiting for TypeScript callback for contract class");
    }

    // Get the result
    auto result_data = future.get();

    // Check for errors
    if (!callback_data->error_message.empty()) {
        throw std::runtime_error("Error from TypeScript callback: " + callback_data->error_message);
    }

    // If no data, contract class not found
    if (!result_data.has_value()) {
        vinfo("Contract class not found: ", class_id);
        return std::nullopt;
    }

    // Deserialize the msgpack data into ContractClassFromTs, then convert to ContractClass
    try {
        bb::avm2::ContractClassFromTs contractClassFromTs;
        msgpack::object_handle obj_handle =
            msgpack::unpack(reinterpret_cast<const char*>(result_data->data()), result_data->size());
        msgpack::object obj = obj_handle.get();
        obj.convert(contractClassFromTs);

        return std::make_optional<bb::avm2::ContractClass>(contractClassFromTs.to_contract_class());
    } catch (const std::exception& e) {
        throw std::runtime_error(std::string("Failed to deserialize contract class: ") + e.what());
    }
}

void TsCallbackContractDB::add_new_non_revertibles(const bb::avm2::Tx& tx)
{
    if (released_) {
        throw std::runtime_error("Cannot call add_new_non_revertibles after releasing callbacks");
    }

    vinfo("TsCallbackContractDB: Adding non-revertible contracts");

    // Serialize the Tx to msgpack
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, tx);
    std::vector<uint8_t> tx_data(buffer.data(), buffer.data() + buffer.size());

    // Create a promise/future pair for synchronization
    auto callback_data = std::make_shared<CallbackData>();
    auto future = callback_data->result_promise.get_future();

    // Call TypeScript callback on the JS main thread
    auto status = add_non_rev_callback_.BlockingCall(
        callback_data.get(),
        [tx_data = std::move(tx_data)](Napi::Env env, Napi::Function js_callback, CallbackData* data) {
            try {
                // Call the TypeScript function with tx buffer
                auto js_tx_buffer = Napi::Buffer<uint8_t>::Copy(env, tx_data.data(), tx_data.size());
                auto js_result = js_callback.Call({ js_tx_buffer });

                // The TypeScript callback should return a Promise<void>
                if (!js_result.IsPromise()) {
                    data->error_message = "TypeScript callback did not return a Promise";
                    data->result_promise.set_value(std::nullopt);
                    return;
                }

                auto promise = js_result.As<Napi::Promise>();

                // Attach .then() and .catch() handlers
                auto then_prop = promise.Get("then");
                if (!then_prop.IsFunction()) {
                    data->error_message = "Promise does not have .then() method";
                    data->result_promise.set_value(std::nullopt);
                    return;
                }

                auto then_fn = then_prop.As<Napi::Function>();

                // Create resolve handler
                auto resolve_handler = Napi::Function::New(
                    env,
                    [data](const Napi::CallbackInfo& info) -> Napi::Value {
                        data->result_promise.set_value(std::nullopt); // void function
                        return info.Env().Undefined();
                    },
                    "resolveHandler");

                // Create reject handler
                auto reject_handler = Napi::Function::New(
                    env,
                    [data](const Napi::CallbackInfo& info) -> Napi::Value {
                        Napi::Env env = info.Env();
                        if (info.Length() > 0) {
                            if (info[0].IsString()) {
                                data->error_message = info[0].As<Napi::String>().Utf8Value();
                            } else if (info[0].IsObject()) {
                                auto err_obj = info[0].As<Napi::Object>();
                                auto msg = err_obj.Get("message");
                                if (msg.IsString()) {
                                    data->error_message = msg.As<Napi::String>().Utf8Value();
                                } else {
                                    data->error_message = "Unknown error from TypeScript";
                                }
                            } else {
                                data->error_message = "Unknown error from TypeScript";
                            }
                        } else {
                            data->error_message = "Promise rejected with no reason";
                        }
                        data->result_promise.set_value(std::nullopt);
                        return env.Undefined();
                    },
                    "rejectHandler");

                // Attach handlers: promise.then(resolveHandler, rejectHandler)
                then_fn.Call(promise, { resolve_handler, reject_handler });

            } catch (const std::exception& e) {
                data->error_message = std::string("Exception calling TypeScript: ") + e.what();
                data->result_promise.set_value(std::nullopt);
            }
        });

    if (status != napi_ok) {
        throw std::runtime_error("Failed to invoke TypeScript callback for add_new_non_revertibles");
    }

    // Wait for the promise to be fulfilled (with timeout)
    auto wait_status = future.wait_for(std::chrono::seconds(30));
    if (wait_status == std::future_status::timeout) {
        throw std::runtime_error("Timeout waiting for TypeScript callback for add_new_non_revertibles");
    }

    future.get();

    // Check for errors
    if (!callback_data->error_message.empty()) {
        throw std::runtime_error("Error from TypeScript callback: " + callback_data->error_message);
    }

    vinfo("TsCallbackContractDB: Added non-revertible contracts");
}

void TsCallbackContractDB::add_new_revertibles(const bb::avm2::Tx& tx)
{
    if (released_) {
        throw std::runtime_error("Cannot call add_new_revertibles after releasing callbacks");
    }

    vinfo("TsCallbackContractDB: Adding revertible contracts");

    // Serialize the Tx to msgpack
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, tx);
    std::vector<uint8_t> tx_data(buffer.data(), buffer.data() + buffer.size());

    // Create a promise/future pair for synchronization
    auto callback_data = std::make_shared<CallbackData>();
    auto future = callback_data->result_promise.get_future();

    // Call TypeScript callback on the JS main thread
    auto status = add_rev_callback_.BlockingCall(
        callback_data.get(),
        [tx_data = std::move(tx_data)](Napi::Env env, Napi::Function js_callback, CallbackData* data) {
            try {
                // Call the TypeScript function with tx buffer
                auto js_tx_buffer = Napi::Buffer<uint8_t>::Copy(env, tx_data.data(), tx_data.size());
                auto js_result = js_callback.Call({ js_tx_buffer });

                // The TypeScript callback should return a Promise<void>
                if (!js_result.IsPromise()) {
                    data->error_message = "TypeScript callback did not return a Promise";
                    data->result_promise.set_value(std::nullopt);
                    return;
                }

                auto promise = js_result.As<Napi::Promise>();

                // Attach .then() and .catch() handlers
                auto then_prop = promise.Get("then");
                if (!then_prop.IsFunction()) {
                    data->error_message = "Promise does not have .then() method";
                    data->result_promise.set_value(std::nullopt);
                    return;
                }

                auto then_fn = then_prop.As<Napi::Function>();

                // Create resolve handler
                auto resolve_handler = Napi::Function::New(
                    env,
                    [data](const Napi::CallbackInfo& info) -> Napi::Value {
                        data->result_promise.set_value(std::nullopt); // void function
                        return info.Env().Undefined();
                    },
                    "resolveHandler");

                // Create reject handler
                auto reject_handler = Napi::Function::New(
                    env,
                    [data](const Napi::CallbackInfo& info) -> Napi::Value {
                        Napi::Env env = info.Env();
                        if (info.Length() > 0) {
                            if (info[0].IsString()) {
                                data->error_message = info[0].As<Napi::String>().Utf8Value();
                            } else if (info[0].IsObject()) {
                                auto err_obj = info[0].As<Napi::Object>();
                                auto msg = err_obj.Get("message");
                                if (msg.IsString()) {
                                    data->error_message = msg.As<Napi::String>().Utf8Value();
                                } else {
                                    data->error_message = "Unknown error from TypeScript";
                                }
                            } else {
                                data->error_message = "Unknown error from TypeScript";
                            }
                        } else {
                            data->error_message = "Promise rejected with no reason";
                        }
                        data->result_promise.set_value(std::nullopt);
                        return env.Undefined();
                    },
                    "rejectHandler");

                // Attach handlers: promise.then(resolveHandler, rejectHandler)
                then_fn.Call(promise, { resolve_handler, reject_handler });

            } catch (const std::exception& e) {
                data->error_message = std::string("Exception calling TypeScript: ") + e.what();
                data->result_promise.set_value(std::nullopt);
            }
        });

    if (status != napi_ok) {
        throw std::runtime_error("Failed to invoke TypeScript callback for add_new_revertibles");
    }

    // Wait for the promise to be fulfilled (with timeout)
    auto wait_status = future.wait_for(std::chrono::seconds(30));
    if (wait_status == std::future_status::timeout) {
        throw std::runtime_error("Timeout waiting for TypeScript callback for add_new_revertibles");
    }

    future.get();

    // Check for errors
    if (!callback_data->error_message.empty()) {
        throw std::runtime_error("Error from TypeScript callback: " + callback_data->error_message);
    }

    vinfo("TsCallbackContractDB: Added revertible contracts");
}

std::optional<bb::avm2::FF> TsCallbackContractDB::get_bytecode_commitment(
    const bb::avm2::ContractClassId& class_id) const
{
    if (released_) {
        throw std::runtime_error("Cannot call get_bytecode_commitment after releasing callbacks");
    }

    vinfo("TsCallbackContractDB: Fetching bytecode commitment for class_id ", class_id);

    // Create a promise/future pair for synchronization
    auto callback_data = std::make_shared<CallbackData>();
    // Convert FF to hex string using ostringstream
    std::ostringstream class_id_stream;
    class_id_stream << class_id;
    callback_data->input = class_id_stream.str();
    auto future = callback_data->result_promise.get_future();

    // Call TypeScript callback on the JS main thread
    auto status = bytecode_commitment_callback_.BlockingCall(
        callback_data.get(), [](Napi::Env env, Napi::Function js_callback, CallbackData* data) {
            try {
                // Call the TypeScript function with class ID string
                auto js_class_id = Napi::String::New(env, data->input);
                auto js_result = js_callback.Call({ js_class_id });

                // The TypeScript callback should return a Promise<Buffer | undefined>
                if (!js_result.IsPromise()) {
                    data->error_message = "TypeScript callback did not return a Promise";
                    data->result_promise.set_value(std::nullopt);
                    return;
                }

                auto promise = js_result.As<Napi::Promise>();

                // Attach .then() and .catch() handlers
                auto then_prop = promise.Get("then");
                if (!then_prop.IsFunction()) {
                    data->error_message = "Promise does not have .then() method";
                    data->result_promise.set_value(std::nullopt);
                    return;
                }

                auto then_fn = then_prop.As<Napi::Function>();

                // Create resolve handler
                auto resolve_handler = Napi::Function::New(
                    env,
                    [data](const Napi::CallbackInfo& info) -> Napi::Value {
                        Napi::Env env = info.Env();
                        try {
                            if (info.Length() > 0 && !info[0].IsUndefined() && !info[0].IsNull()) {
                                // Got a value - should be a Buffer
                                if (info[0].IsBuffer()) {
                                    auto buffer = info[0].As<Napi::Buffer<uint8_t>>();
                                    std::vector<uint8_t> vec(buffer.Data(), buffer.Data() + buffer.Length());
                                    data->result_promise.set_value(std::move(vec));
                                } else {
                                    data->error_message = "Callback returned non-Buffer value";
                                    data->result_promise.set_value(std::nullopt);
                                }
                            } else {
                                // Got undefined/null - bytecode commitment not found
                                data->result_promise.set_value(std::nullopt);
                            }
                        } catch (const std::exception& e) {
                            data->error_message = std::string("Exception in resolve handler: ") + e.what();
                            data->result_promise.set_value(std::nullopt);
                        }
                        return env.Undefined();
                    },
                    "resolveHandler");

                // Create reject handler
                auto reject_handler = Napi::Function::New(
                    env,
                    [data](const Napi::CallbackInfo& info) -> Napi::Value {
                        Napi::Env env = info.Env();
                        if (info.Length() > 0) {
                            if (info[0].IsString()) {
                                data->error_message = info[0].As<Napi::String>().Utf8Value();
                            } else if (info[0].IsObject()) {
                                auto err_obj = info[0].As<Napi::Object>();
                                auto msg = err_obj.Get("message");
                                if (msg.IsString()) {
                                    data->error_message = msg.As<Napi::String>().Utf8Value();
                                } else {
                                    data->error_message = "Unknown error from TypeScript";
                                }
                            } else {
                                data->error_message = "Unknown error from TypeScript";
                            }
                        } else {
                            data->error_message = "Promise rejected with no reason";
                        }
                        data->result_promise.set_value(std::nullopt);
                        return env.Undefined();
                    },
                    "rejectHandler");

                // Attach handlers: promise.then(resolveHandler, rejectHandler)
                then_fn.Call(promise, { resolve_handler, reject_handler });

            } catch (const std::exception& e) {
                data->error_message = std::string("Exception calling TypeScript: ") + e.what();
                data->result_promise.set_value(std::nullopt);
            }
        });

    if (status != napi_ok) {
        throw std::runtime_error("Failed to invoke TypeScript callback for bytecode commitment");
    }

    // Wait for the promise to be fulfilled (with timeout)
    auto wait_status = future.wait_for(std::chrono::seconds(30));
    if (wait_status == std::future_status::timeout) {
        throw std::runtime_error("Timeout waiting for TypeScript callback for bytecode commitment");
    }

    // Get the result
    auto result_data = future.get();

    // Check for errors
    if (!callback_data->error_message.empty()) {
        throw std::runtime_error("Error from TypeScript callback: " + callback_data->error_message);
    }

    // If no data, bytecode commitment not found
    if (!result_data.has_value()) {
        vinfo("Bytecode commitment not found: ", class_id);
        return std::nullopt;
    }

    // Deserialize the FF from the buffer
    try {
        bb::avm2::FF commitment;
        msgpack::object_handle obj_handle =
            msgpack::unpack(reinterpret_cast<const char*>(result_data->data()), result_data->size());
        msgpack::object obj = obj_handle.get();
        obj.convert(commitment);

        return commitment;
    } catch (const std::exception& e) {
        throw std::runtime_error(std::string("Failed to deserialize bytecode commitment: ") + e.what());
    }
}

std::optional<std::string> TsCallbackContractDB::get_debug_function_name(const bb::avm2::AztecAddress& address,
                                                                         const bb::avm2::FF& selector) const
{
    if (released_) {
        throw std::runtime_error("Cannot call get_debug_function_name after releasing callbacks");
    }

    vinfo("TsCallbackContractDB: Fetching debug function name for address ", address, " selector ", selector);

    // Create a promise/future pair for synchronization
    auto callback_data = std::make_shared<CallbackData>();
    // Convert address and selector to hex strings
    std::ostringstream address_stream;
    address_stream << address;
    std::ostringstream selector_stream;
    selector_stream << selector;
    callback_data->input = address_stream.str() + "," + selector_stream.str();
    auto future = callback_data->result_promise.get_future();

    // Call TypeScript callback on the JS main thread
    auto status = debug_name_callback_.BlockingCall(
        callback_data.get(), [](Napi::Env env, Napi::Function js_callback, CallbackData* data) {
            try {
                // Parse the input string to get address and selector
                size_t comma_pos = data->input.find(',');
                std::string address_str = data->input.substr(0, comma_pos);
                std::string selector_str = data->input.substr(comma_pos + 1);

                // Call the TypeScript function with address and selector strings
                auto js_address = Napi::String::New(env, address_str);
                auto js_selector = Napi::String::New(env, selector_str);
                auto js_result = js_callback.Call({ js_address, js_selector });

                // The TypeScript callback should return a Promise<string | undefined>
                if (!js_result.IsPromise()) {
                    data->error_message = "TypeScript callback did not return a Promise";
                    data->result_promise.set_value(std::nullopt);
                    return;
                }

                auto promise = js_result.As<Napi::Promise>();

                // Attach .then() and .catch() handlers
                auto then_prop = promise.Get("then");
                if (!then_prop.IsFunction()) {
                    data->error_message = "Promise does not have .then() method";
                    data->result_promise.set_value(std::nullopt);
                    return;
                }

                auto then_fn = then_prop.As<Napi::Function>();

                // Create resolve handler
                auto resolve_handler = Napi::Function::New(
                    env,
                    [data](const Napi::CallbackInfo& info) -> Napi::Value {
                        Napi::Env env = info.Env();
                        try {
                            if (info.Length() > 0 && !info[0].IsUndefined() && !info[0].IsNull()) {
                                // Got a value - should be a string
                                if (info[0].IsString()) {
                                    std::string name = info[0].As<Napi::String>().Utf8Value();
                                    // Pack the string as a vector of bytes
                                    std::vector<uint8_t> vec(name.begin(), name.end());
                                    data->result_promise.set_value(std::move(vec));
                                } else {
                                    data->error_message = "Callback returned non-string value";
                                    data->result_promise.set_value(std::nullopt);
                                }
                            } else {
                                // Got undefined/null - debug name not found
                                data->result_promise.set_value(std::nullopt);
                            }
                        } catch (const std::exception& e) {
                            data->error_message = std::string("Exception in resolve handler: ") + e.what();
                            data->result_promise.set_value(std::nullopt);
                        }
                        return env.Undefined();
                    },
                    "resolveHandler");

                // Create reject handler
                auto reject_handler = Napi::Function::New(
                    env,
                    [data](const Napi::CallbackInfo& info) -> Napi::Value {
                        Napi::Env env = info.Env();
                        if (info.Length() > 0) {
                            if (info[0].IsString()) {
                                data->error_message = info[0].As<Napi::String>().Utf8Value();
                            } else if (info[0].IsObject()) {
                                auto err_obj = info[0].As<Napi::Object>();
                                auto msg = err_obj.Get("message");
                                if (msg.IsString()) {
                                    data->error_message = msg.As<Napi::String>().Utf8Value();
                                } else {
                                    data->error_message = "Unknown error from TypeScript";
                                }
                            } else {
                                data->error_message = "Unknown error from TypeScript";
                            }
                        } else {
                            data->error_message = "Promise rejected with no reason";
                        }
                        data->result_promise.set_value(std::nullopt);
                        return env.Undefined();
                    },
                    "rejectHandler");

                // Attach handlers: promise.then(resolveHandler, rejectHandler)
                then_fn.Call(promise, { resolve_handler, reject_handler });

            } catch (const std::exception& e) {
                data->error_message = std::string("Exception calling TypeScript: ") + e.what();
                data->result_promise.set_value(std::nullopt);
            }
        });

    if (status != napi_ok) {
        throw std::runtime_error("Failed to invoke TypeScript callback for debug function name");
    }

    // Wait for the promise to be fulfilled (with timeout)
    auto wait_status = future.wait_for(std::chrono::seconds(30));
    if (wait_status == std::future_status::timeout) {
        throw std::runtime_error("Timeout waiting for TypeScript callback for debug function name");
    }

    // Get the result
    auto result_data = future.get();

    // Check for errors
    if (!callback_data->error_message.empty()) {
        throw std::runtime_error("Error from TypeScript callback: " + callback_data->error_message);
    }

    // If no data, debug name not found
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
        add_non_rev_callback_.Release();
        add_rev_callback_.Release();
        bytecode_commitment_callback_.Release();
        debug_name_callback_.Release();
        released_ = true;
        vinfo("TsCallbackContractDB: Released thread-safe function handles");
    }
}

} // namespace bb::nodejs
