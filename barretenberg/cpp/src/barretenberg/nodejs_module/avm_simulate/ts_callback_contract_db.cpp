#include "ts_callback_contract_db.hpp"
#include "ts_callback_utils.hpp"

#include <stdexcept>
#include <string>

#include "barretenberg/common/log.hpp"

namespace bb::nodejs {

TsCallbackContractDB::TsCallbackContractDB(Napi::ThreadSafeFunction instanceCallback,
                                           Napi::ThreadSafeFunction classCallback,
                                           Napi::ThreadSafeFunction addContractsCallback,
                                           Napi::ThreadSafeFunction bytecodeCommitmentCallback,
                                           Napi::ThreadSafeFunction debugNameCallback,
                                           Napi::ThreadSafeFunction createCheckpointCallback,
                                           Napi::ThreadSafeFunction commitCheckpointCallback,
                                           Napi::ThreadSafeFunction revertCheckpointCallback)
    : contract_instance_callback_(std::move(instanceCallback))
    , contract_class_callback_(std::move(classCallback))
    , add_contracts_callback_(std::move(addContractsCallback))
    , bytecode_commitment_callback_(std::move(bytecodeCommitmentCallback))
    , debug_name_callback_(std::move(debugNameCallback))
    , create_checkpoint_callback_(std::move(createCheckpointCallback))
    , commit_checkpoint_callback_(std::move(commitCheckpointCallback))
    , revert_checkpoint_callback_(std::move(revertCheckpointCallback))
{}

std::optional<bb::avm2::ContractInstance> TsCallbackContractDB::get_contract_instance(
    const bb::avm2::AztecAddress& address) const
{
    if (released_) {
        throw std::runtime_error("Cannot call get_contract_instance after releasing callbacks");
    }

    debug("TsCallbackContractDB: Fetching contract instance for address ", address);

    try {
        auto result_data =
            invoke_single_string_callback(contract_instance_callback_, format(address), "contract instance");

        if (!result_data.has_value()) {
            vinfo("Contract instance not found: ", address);
            return std::nullopt;
        }

        auto instance = deserialize_from_msgpack<bb::avm2::ContractInstance>(*result_data, "contract instance");
        return std::make_optional(std::move(instance));
    } catch (const std::exception& e) {
        throw std::runtime_error(std::string("Failed to get contract instance for address ") + format(address) + ": " +
                                 e.what());
    }
}

std::optional<bb::avm2::ContractClass> TsCallbackContractDB::get_contract_class(
    const bb::avm2::ContractClassId& class_id) const
{
    if (released_) {
        throw std::runtime_error("Cannot call get_contract_class after releasing callbacks");
    }

    debug("TsCallbackContractDB: Fetching contract class for class_id ", class_id);

    try {
        auto result_data = invoke_single_string_callback(contract_class_callback_, format(class_id), "contract class");

        if (!result_data.has_value()) {
            vinfo("Contract class not found: ", class_id);
            return std::nullopt;
        }

        auto contract_class = deserialize_from_msgpack<bb::avm2::ContractClass>(*result_data, "contract class");
        return std::make_optional(std::move(contract_class));
    } catch (const std::exception& e) {
        throw std::runtime_error(std::string("Failed to get contract class for class_id ") + format(class_id) + ": " +
                                 e.what());
    }
}

void TsCallbackContractDB::add_contracts(const bb::avm2::ContractDeploymentData& contract_deployment_data)
{
    if (released_) {
        throw std::runtime_error("Cannot call add_contracts after releasing callbacks");
    }

    debug("TsCallbackContractDB: Adding contracts");

    try {
        auto serialized_data = serialize_to_msgpack(contract_deployment_data);
        invoke_buffer_void_callback(add_contracts_callback_, std::move(serialized_data), "add_contracts");
    } catch (const std::exception& e) {
        throw std::runtime_error(std::string("Failed to add contracts: ") + e.what());
    }
}

std::optional<bb::avm2::FF> TsCallbackContractDB::get_bytecode_commitment(
    const bb::avm2::ContractClassId& class_id) const
{
    if (released_) {
        throw std::runtime_error("Cannot call get_bytecode_commitment after releasing callbacks");
    }

    debug("TsCallbackContractDB: Fetching bytecode commitment for class_id ", class_id);

    try {
        auto result_data =
            invoke_single_string_callback(bytecode_commitment_callback_, format(class_id), "bytecode commitment");

        if (!result_data.has_value()) {
            vinfo("Bytecode commitment not found: ", class_id);
            return std::nullopt;
        }

        auto commitment = deserialize_from_msgpack<bb::avm2::FF>(*result_data, "bytecode commitment");
        return commitment;
    } catch (const std::exception& e) {
        throw std::runtime_error(std::string("Failed to get bytecode commitment for class_id ") + format(class_id) +
                                 ": " + e.what());
    }
}

std::optional<std::string> TsCallbackContractDB::get_debug_function_name(const bb::avm2::AztecAddress& address,
                                                                         const bb::avm2::FF& selector) const
{
    if (released_) {
        throw std::runtime_error("Cannot call get_debug_function_name after releasing callbacks");
    }

    debug("TsCallbackContractDB: Fetching debug function name for address ", address, " selector ", selector);

    try {
        auto result_data = invoke_double_string_callback(
            debug_name_callback_, format(address), format(selector), "debug function name");

        if (!result_data.has_value()) {
            debug("Debug function name not found for address ", address, " selector ", selector);
            return std::nullopt;
        }

        // Convert the vector of bytes back to a string
        std::string name(result_data->begin(), result_data->end());
        return name;
    } catch (const std::exception& e) {
        throw std::runtime_error(std::string("Failed to get debug function name for address ") + format(address) +
                                 " selector " + format(selector) + ": " + e.what());
    }
}

void TsCallbackContractDB::create_checkpoint()
{
    if (released_) {
        throw std::runtime_error("Cannot call create_checkpoint after releasing callbacks");
    }

    debug("TsCallbackContractDB: Creating checkpoint");

    try {
        // Call the TypeScript callback with no arguments
        auto result =
            invoke_ts_callback_with_promise(create_checkpoint_callback_,
                                            "create_checkpoint",
                                            [](Napi::Env env, Napi::Function js_callback, CallbackResults* data) {
                                                auto js_result = js_callback.Call({});

                                                if (!js_result.IsPromise()) {
                                                    data->error_message =
                                                        "TypeScript callback did not return a Promise";
                                                    data->result_promise.set_value(std::nullopt);
                                                    return;
                                                }

                                                auto promise = js_result.As<Napi::Promise>();
                                                auto resolve_handler = create_void_resolve_handler(env, data);
                                                auto reject_handler = create_reject_handler(env, data);
                                                attach_promise_handlers(promise, resolve_handler, reject_handler, data);
                                            });
    } catch (const std::exception& e) {
        throw std::runtime_error(std::string("Failed to create checkpoint: ") + e.what());
    }
}

void TsCallbackContractDB::commit_checkpoint()
{
    if (released_) {
        throw std::runtime_error("Cannot call commit_checkpoint after releasing callbacks");
    }

    debug("TsCallbackContractDB: Committing checkpoint");

    try {
        // Call the TypeScript callback with no arguments
        auto result =
            invoke_ts_callback_with_promise(commit_checkpoint_callback_,
                                            "commit_checkpoint",
                                            [](Napi::Env env, Napi::Function js_callback, CallbackResults* data) {
                                                auto js_result = js_callback.Call({});

                                                if (!js_result.IsPromise()) {
                                                    data->error_message =
                                                        "TypeScript callback did not return a Promise";
                                                    data->result_promise.set_value(std::nullopt);
                                                    return;
                                                }

                                                auto promise = js_result.As<Napi::Promise>();
                                                auto resolve_handler = create_void_resolve_handler(env, data);
                                                auto reject_handler = create_reject_handler(env, data);
                                                attach_promise_handlers(promise, resolve_handler, reject_handler, data);
                                            });
    } catch (const std::exception& e) {
        throw std::runtime_error(std::string("Failed to commit checkpoint: ") + e.what());
    }
}

void TsCallbackContractDB::revert_checkpoint()
{
    if (released_) {
        throw std::runtime_error("Cannot call revert_checkpoint after releasing callbacks");
    }

    debug("TsCallbackContractDB: Reverting checkpoint");

    try {
        // Call the TypeScript callback with no arguments
        auto result =
            invoke_ts_callback_with_promise(revert_checkpoint_callback_,
                                            "revert_checkpoint",
                                            [](Napi::Env env, Napi::Function js_callback, CallbackResults* data) {
                                                auto js_result = js_callback.Call({});

                                                if (!js_result.IsPromise()) {
                                                    data->error_message =
                                                        "TypeScript callback did not return a Promise";
                                                    data->result_promise.set_value(std::nullopt);
                                                    return;
                                                }

                                                auto promise = js_result.As<Napi::Promise>();
                                                auto resolve_handler = create_void_resolve_handler(env, data);
                                                auto reject_handler = create_reject_handler(env, data);
                                                attach_promise_handlers(promise, resolve_handler, reject_handler, data);
                                            });
    } catch (const std::exception& e) {
        throw std::runtime_error(std::string("Failed to revert checkpoint: ") + e.what());
    }
}

void TsCallbackContractDB::release()
{
    if (!released_) {
        contract_instance_callback_.Release();
        contract_class_callback_.Release();
        add_contracts_callback_.Release();
        bytecode_commitment_callback_.Release();
        debug_name_callback_.Release();
        create_checkpoint_callback_.Release();
        commit_checkpoint_callback_.Release();
        revert_checkpoint_callback_.Release();
        released_ = true;
    }
}

} // namespace bb::nodejs
