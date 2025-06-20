#pragma once

#include "barretenberg/api/bbrpc_circuit_registry.hpp"
#include "barretenberg/api/bbrpc_commands.hpp"
#include "barretenberg/api/proving_helpers.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/compiler_hints.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <queue>

namespace bb::bbrpc {

struct BBRpcRequest {
    RequestId request_id;
    std::unique_ptr<ClientIVC> ivc_in_progress;
    std::vector<uint8_t> last_circuit_bytecode; // Store the last loaded circuit bytecode for IVC accumulation
    std::vector<Command> commands;

    BBRpcRequest(RequestId request_id, std::vector<Command>&& commands)
        : request_id(request_id)
        , commands(std::move(commands))
    {}
};

inline const std::string& get_error_message(const CommandResponse& response)
{
    return std::visit([](const auto& resp) -> const std::string& { return resp.error_message; }, response);
}

inline CircuitProve::Response execute(BB_UNUSED BBRpcRequest& request, CircuitProve&& command)
{
    // Use the proving helpers to generate proof
    auto result = prove_from_bytecode<UltraFlavor>(
        std::move(command.circuit.bytecode), std::move(command.witness), std::move(command.circuit.verification_key));

    if (result.is_error()) {
        return CircuitProve::Response{ .public_inputs = {}, .proof = {}, .error_message = result.error_message };
    }

    return CircuitProve::Response{ .public_inputs = result.value.public_inputs,
                                   .proof = result.value.proof,
                                   .error_message = "" };
}

inline CircuitDeriveVk::Response execute(BB_UNUSED BBRpcRequest& request, CircuitDeriveVk&& command)
{
    // Use the proving helpers to compute verification key
    auto result = compute_vk_from_bytecode<UltraFlavor>(std::move(command.circuit.bytecode));

    if (result.is_error()) {
        return CircuitDeriveVk::Response{ .verification_key = {}, .error_message = result.error_message };
    }

    // Serialize the verification key
    auto vk_data = to_buffer(*(result.value));

    return CircuitDeriveVk::Response{ .verification_key = vk_data, .error_message = "" };
}

inline CircuitVerify::Response execute(BB_UNUSED BBRpcRequest& request, CircuitVerify&& command)
{
    // Deserialize the verification key
    auto vk = std::make_shared<UltraFlavor::VerificationKey>(
        from_buffer<UltraFlavor::VerificationKey>(command.verification_key));

    // Use the proving helpers to verify proof
    auto result =
        verify_proof<UltraFlavor>(vk, command.public_inputs, command.proof, command.settings.ipa_accumulation);

    if (result.is_error()) {
        return CircuitVerify::Response{ .verified = false, .error_message = result.error_message };
    }

    return CircuitVerify::Response{ .verified = result.value, .error_message = "" };
}

inline CircuitInfo::Response execute(BB_UNUSED BBRpcRequest& request, CircuitInfo&& command)
{
    // Parse the circuit to get info
    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(command.circuit.bytecode));

    auto builder =
        acir_format::create_circuit(constraint_system, /*recursive=*/command.settings.recursive, /*size_hint=*/0);

    CircuitInfo::Response response;
    size_t num_gates = builder.get_estimated_num_finalized_gates();
    response.total_gates = static_cast<uint32_t>(num_gates);
    response.subgroup_size = static_cast<uint32_t>(builder.get_circuit_subgroup_size(num_gates));

    if (command.include_gates_per_opcode) {
        // This would require iterating through opcodes and counting gates per type
        // For now, leaving empty as it's optional
    }

    response.error_message = "";
    return response;
}

inline CircuitCheck::Response execute(BB_UNUSED BBRpcRequest& request, CircuitCheck&& command)
{
    // Parse witness data
    auto witness_stack = Witnesses::WitnessStack::bincodeDeserialize(command.witness);
    if (witness_stack.stack.empty()) {
        return CircuitCheck::Response{ .satisfied = false, .error_message = "No witness data provided" };
    }

    // Convert witness map to witness vector
    acir_format::WitnessVector witness_vec;
    const auto& witness_map = witness_stack.stack[0].witness.value;

    // Find the maximum witness index to size the vector properly
    uint32_t max_index = 0;
    for (const auto& [witness, _] : witness_map) {
        max_index = std::max(max_index, witness.value);
    }
    witness_vec.resize(max_index + 1);

    // Fill the witness vector
    for (const auto& [witness, value_str] : witness_map) {
        witness_vec[witness.value] = bb::fr(uint256_t(value_str));
    }

    // Parse the circuit
    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(command.circuit.bytecode));

    // Create the circuit builder with witness
    auto builder = acir_format::create_circuit(
        constraint_system, /*recursive=*/command.settings.recursive, /*size_hint=*/0, witness_vec);

    // Use CircuitChecker to validate the constraints
    bool satisfied = CircuitChecker::check(builder);

    if (!satisfied) {
        return CircuitCheck::Response{ .satisfied = false, .error_message = "Circuit constraints not satisfied" };
    }

    return CircuitCheck::Response{ .satisfied = true, .error_message = "" };
}

inline ProofAsFields::Response execute(BB_UNUSED BBRpcRequest& request, ProofAsFields&& command)
{
    // The proof is already a vector of field elements
    return ProofAsFields::Response{ .fields = command.proof, .error_message = "" };
}

inline VkAsFields::Response execute(BB_UNUSED BBRpcRequest& request, VkAsFields&& command)
{
    if (command.is_mega_honk) {
        auto vk = from_buffer<MegaFlavor::VerificationKey>(command.verification_key);
        std::vector<bb::fr> fields = vk.to_field_elements();
        return VkAsFields::Response{ .fields = fields, .error_message = "" };
    } else {
        auto vk = from_buffer<UltraFlavor::VerificationKey>(command.verification_key);
        std::vector<bb::fr> fields = vk.to_field_elements();
        return VkAsFields::Response{ .fields = fields, .error_message = "" };
    }
}

inline ClientIvcStart::Response execute(BBRpcRequest& request, BB_UNUSED ClientIvcStart&& command)
{
    if (!request.ivc_in_progress) {
        return ClientIvcStart::Response{ .error_message = "IVC already in progress!" };
    }

    // Initialize a new ClientIVC instance
    request.ivc_in_progress = std::make_unique<ClientIVC>();
    return ClientIvcStart::Response{ .error_message = "" };
}

inline ClientIvcLoad::Response execute(BBRpcRequest& request, ClientIvcLoad&& command)
{
    if (!request.ivc_in_progress) {
        return ClientIvcLoad::Response{ .error_message = "No IVC in progress. Call ClientIvcStart first." };
    }

    // Store the bytecode for later use
    request.last_circuit_bytecode = std::move(command.circuit.bytecode);

    return ClientIvcLoad::Response{ .error_message = "" };
}

inline ClientIvcAccumulate::Response execute(BBRpcRequest& request, ClientIvcAccumulate&& command)
{
    if (!request.ivc_in_progress) {
        return ClientIvcAccumulate::Response{ .error_message = "No IVC in progress. Call ClientIvcStart first." };
    }

    // Parse witness data
    auto witness_stack = Witnesses::WitnessStack::bincodeDeserialize(command.witness);
    if (witness_stack.stack.empty()) {
        return ClientIvcAccumulate::Response{ .error_message = "No witness data provided" };
    }

    // Convert witness map to witness vector
    acir_format::WitnessVector witness_vec;
    const auto& witness_map = witness_stack.stack[0].witness.value;

    // Find the maximum witness index to size the vector properly
    uint32_t max_index = 0;
    for (const auto& [witness, _] : witness_map) {
        max_index = std::max(max_index, witness.value);
    }
    witness_vec.resize(max_index + 1);

    // Fill the witness vector
    for (const auto& [witness, value_str] : witness_map) {
        witness_vec[witness.value] = bb::fr(uint256_t(value_str));
    }

    // Create the circuit with witness data
    std::vector<uint8_t> bytecode_copy = request.last_circuit_bytecode;
    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(bytecode_copy));
    ClientIVC::ClientCircuit circuit = acir_format::create_circuit<ClientIVC::ClientCircuit>(
        constraint_system, /*recursive=*/false, /*size_hint=*/0, witness_vec);

    // Accumulate the circuit
    request.ivc_in_progress->accumulate(circuit);

    return ClientIvcAccumulate::Response{ .error_message = "" };
}

inline ClientIvcProve::Response execute(BBRpcRequest& request, BB_UNUSED ClientIvcProve&& command)
{
    if (!request.ivc_in_progress) {
        return ClientIvcProve::Response{ .proof = ClientIVC::Proof{},
                                         .error_message = "No IVC in progress. Call ClientIvcStart first." };
    }

    // Generate the IVC proof
    ClientIVC::Proof proof = request.ivc_in_progress->prove();

    // Clear the IVC instance after proving
    request.ivc_in_progress.reset();

    return ClientIvcProve::Response{ .proof = proof, .error_message = "" };
}

inline ClientIvcDeriveVk::Response execute(BB_UNUSED BBRpcRequest& request, ClientIvcDeriveVk&& command)
{
    // Parse the circuit
    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(command.circuit.bytecode));

    // Create a circuit to get the verification key
    ClientIVC::ClientCircuit circuit =
        acir_format::create_circuit<ClientIVC::ClientCircuit>(constraint_system, /*recursive=*/false, /*size_hint=*/0);

    // Create verification key based on whether it's standalone or not
    std::vector<uint8_t> vk_data;
    if (command.standalone) {
        // For standalone, we need the full IVC verification key
        // This would require creating a mock IVC setup, for now return empty
        return ClientIvcDeriveVk::Response{ .verification_key = {},
                                            .error_message = "Standalone IVC VK derivation not yet implemented" };
    } else {
        // For non-standalone, we can use the circuit's verification key
        auto proving_key = std::make_shared<DeciderProvingKey_<MegaFlavor>>(circuit);
        auto vk = std::make_shared<MegaFlavor::VerificationKey>(proving_key->proving_key);
        vk_data = to_buffer(*vk);
    }

    return ClientIvcDeriveVk::Response{ .verification_key = vk_data, .error_message = "" };
}

// ... etc

/**
 * @brief Executes a command by visiting a variant of all possible commands.
 *
 * @param command The command to execute, consumed by this function.
 * @param request The circuit registry (acting as the request context).
 * @return A variant of all possible command responses.
 */
inline CommandResponse execute(BBRpcRequest& request, Command&& command)
{
    return std::visit(
        [&request](auto&& cmd) -> CommandResponse { return execute(request, std::forward<decltype(cmd)>(cmd)); },
        std::move(command));
}

// Can only be called from the execution thread (the same as the main thread, except in threaded WASM).
inline std::vector<CommandResponse> execute_request(BBRpcRequest&& request)
{
    std::vector<CommandResponse> responses;
    responses.reserve(request.commands.size());
    for (Command& command : request.commands) {
        responses.push_back(execute(request, std::move(command)));
        if (!get_error_message(responses.back()).empty()) {
            // If there was an error, we stop processing further commands.
            break;
        }
    }
    return responses;
}

} // namespace bb::bbrpc
