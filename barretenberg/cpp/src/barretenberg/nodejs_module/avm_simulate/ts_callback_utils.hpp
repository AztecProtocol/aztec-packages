#pragma once

#include <chrono>
#include <functional>
#include <future>
#include <napi.h>
#include <optional>
#include <string>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::nodejs {

/**
 * @brief Helper struct to pass data between C++ worker thread and JS main thread
 */
struct CallbackResults {
    std::promise<std::optional<std::vector<uint8_t>>> result_promise;
    std::string error_message;
};

/**
 * @brief Extracts error message from a Napi value (string or Error object)
 */
std::string extract_error_from_napi_value(const Napi::CallbackInfo& cb_info);

/**
 * @brief Creates a resolve handler for promises that return Buffer | undefined
 */
Napi::Function create_buffer_resolve_handler(Napi::Env env, CallbackResults* cb_results);

/**
 * @brief Creates a resolve handler for promises that return string | undefined
 */
Napi::Function create_string_resolve_handler(Napi::Env env, CallbackResults* cb_results);

/**
 * @brief Creates a resolve handler for promises that return void
 */
Napi::Function create_void_resolve_handler(Napi::Env env, CallbackResults* cb_results);

/**
 * @brief Creates a reject handler for promises
 */
Napi::Function create_reject_handler(Napi::Env env, CallbackResults* cb_results);

/**
 * @brief Attaches resolve and reject handlers to a promise
 */
void attach_promise_handlers(Napi::Promise promise,
                             Napi::Function resolve_handler,
                             Napi::Function reject_handler,
                             CallbackResults* data);

/**
 * @brief Serializes data to msgpack format
 */
template <typename T> std::vector<uint8_t> serialize_to_msgpack(const T& data);

/**
 * @brief Deserializes msgpack data to a specific type
 */
template <typename T> T deserialize_from_msgpack(const std::vector<uint8_t>& data, const std::string& type_name);

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
    std::function<void(Napi::Env, Napi::Function, CallbackResults*)> call_js_function,
    std::chrono::seconds timeout = std::chrono::seconds(30));

/**
 * @brief Helper for callbacks that take a single string argument and return Buffer | undefined
 */
std::optional<std::vector<uint8_t>> invoke_single_string_callback(const Napi::ThreadSafeFunction& callback,
                                                                  const std::string& input_str,
                                                                  const std::string& operation_name);

/**
 * @brief Helper for callbacks that take two string arguments and return string | undefined
 */
std::optional<std::vector<uint8_t>> invoke_double_string_callback(const Napi::ThreadSafeFunction& callback,
                                                                  const std::string& input_str1,
                                                                  const std::string& input_str2,
                                                                  const std::string& operation_name);

/**
 * @brief Helper for callbacks that take a buffer and return void
 */
void invoke_buffer_void_callback(const Napi::ThreadSafeFunction& callback,
                                 std::vector<uint8_t> buffer_data,
                                 const std::string& operation_name);

/**
 * @brief Converts an FF (field element) to a hex string
 */
std::string ff_to_string(const bb::avm2::FF& value);

} // namespace bb::nodejs
