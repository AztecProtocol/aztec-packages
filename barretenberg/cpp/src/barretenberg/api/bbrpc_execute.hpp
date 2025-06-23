#pragma once

#include "barretenberg/api/bbrpc_circuit_registry.hpp"
#include "barretenberg/api/bbrpc_commands.hpp"
#include "barretenberg/api/proving_helpers.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/common/compiler_hints.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <queue>

namespace bb::bbrpc {

struct BBRpcRequest {
    RequestId request_id;
    // Current depth of the IVC stack for this request
    uint32_t ivc_stack_depth = 0;
    std::shared_ptr<ClientIVC> ivc_in_progress;
    // Name of the last loaded circuit
    std::string last_circuit_name;
    // Store the parsed constraint system to get ahead of parsing before accumulate
    std::optional<acir_format::AcirFormat> last_circuit_constraints;
    // TODO(AI) parse vk passed with this circuit
    std::vector<Command> commands;
    // For testing only! Create mock kernels such as in mock_circuit_producer.hpp.
    bool testing_only_generate_mock_kernels = false;

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
    info("CircuitProve - generating proof for circuit '", command.circuit.name, "'");

    // Use the proving helpers to generate proof
    auto result = prove_from_bytecode<UltraFlavor>(
        std::move(command.circuit.bytecode), std::move(command.witness), std::move(command.circuit.verification_key));

    if (result.is_error()) {
        info("CircuitProve - proof generation failed: ", result.error_message);
        return CircuitProve::Response{ .public_inputs = {}, .proof = {}, .error_message = result.error_message };
    }

    info("CircuitProve - proof generated successfully, size: ", result.value.proof.size(), " field elements");
    return CircuitProve::Response{ .public_inputs = result.value.public_inputs,
                                   .proof = result.value.proof,
                                   .error_message = "" };
}

inline CircuitDeriveVk::Response execute(BB_UNUSED BBRpcRequest& request, CircuitDeriveVk&& command)
{
    info("CircuitDeriveVk - deriving verification key for circuit '", command.circuit.name, "'");

    // Use the proving helpers to compute verification key
    auto result = compute_vk_from_bytecode<UltraFlavor>(std::move(command.circuit.bytecode));

    if (result.is_error()) {
        info("CircuitDeriveVk - VK derivation failed: ", result.error_message);
        return CircuitDeriveVk::Response{ .verification_key = {}, .error_message = result.error_message };
    }

    // Serialize the verification key
    auto vk_data = to_buffer(*(result.value));

    info("CircuitDeriveVk - VK derived successfully, size: ", vk_data.size(), " bytes");
    return CircuitDeriveVk::Response{ .verification_key = vk_data, .error_message = "" };
}

inline CircuitVerify::Response execute(BB_UNUSED BBRpcRequest& request, CircuitVerify&& command)
{
    info("CircuitVerify - verifying proof with ", command.public_inputs.size(), " public inputs");

    // Deserialize the verification key
    auto vk = std::make_shared<UltraFlavor::VerificationKey>(
        from_buffer<UltraFlavor::VerificationKey>(command.verification_key));

    // Use the proving helpers to verify proof
    auto result =
        verify_proof<UltraFlavor>(vk, command.public_inputs, command.proof, command.settings.ipa_accumulation);

    if (result.is_error()) {
        info("CircuitVerify - verification error: ", result.error_message);
        return CircuitVerify::Response{ .verified = false, .error_message = result.error_message };
    }

    info("CircuitVerify - verification result: ", result.value ? "VALID" : "INVALID");
    return CircuitVerify::Response{ .verified = result.value, .error_message = "" };
}

inline CircuitInfo::Response execute(BB_UNUSED BBRpcRequest& request, CircuitInfo&& command)
{
    info("CircuitInfo - analyzing circuit '", command.circuit.name, "'");

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

    info("CircuitInfo - gates: ", response.total_gates, ", subgroup size: ", response.subgroup_size);
    response.error_message = "";
    return response;
}

inline CircuitCheck::Response execute(BB_UNUSED BBRpcRequest& request, CircuitCheck&& command)
{
    info("CircuitCheck - checking circuit '", command.circuit.name, "' constraints");

    // Parse witness data
    auto witness_stack = Witnesses::WitnessStack::bincodeDeserialize(command.witness);
    if (witness_stack.stack.empty()) {
        info("CircuitCheck - no witness data provided");
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

    info("CircuitCheck - loaded ", witness_vec.size(), " witness values");

    // Parse the circuit
    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(command.circuit.bytecode));

    // Create the circuit builder with witness
    auto builder = acir_format::create_circuit(
        constraint_system, /*recursive=*/command.settings.recursive, /*size_hint=*/0, witness_vec);

    // Use CircuitChecker to validate the constraints
    bool satisfied = CircuitChecker::check(builder);

    if (!satisfied) {
        info("CircuitCheck - circuit constraints NOT satisfied");
        return CircuitCheck::Response{ .satisfied = false, .error_message = "Circuit constraints not satisfied" };
    }

    info("CircuitCheck - circuit constraints satisfied");
    return CircuitCheck::Response{ .satisfied = true, .error_message = "" };
}

inline ProofAsFields::Response execute(BB_UNUSED BBRpcRequest& request, ProofAsFields&& command)
{
    info("ProofAsFields - converting proof to field elements, input size: ", command.proof.size());

    // The proof is already a vector of field elements
    return ProofAsFields::Response{ .fields = command.proof, .error_message = "" };
}

inline VkAsFields::Response execute(BB_UNUSED BBRpcRequest& request, VkAsFields&& command)
{
    info("VkAsFields - converting VK to field elements, is_mega_honk: ", command.is_mega_honk);

    std::vector<bb::fr> fields;
    if (command.is_mega_honk) {
        auto vk = from_buffer<MegaFlavor::VerificationKey>(command.verification_key);
        fields = vk.to_field_elements();
    } else {
        auto vk = from_buffer<UltraFlavor::VerificationKey>(command.verification_key);
        fields = vk.to_field_elements();
    }

    info("VkAsFields - converted to ", fields.size(), " field elements");
    return VkAsFields::Response{ .fields = fields, .error_message = "" };
}

inline ClientIvcStart::Response execute(BBRpcRequest& request, BB_UNUSED ClientIvcStart&& command)
{
    info("ClientIvcStart - initializing new IVC instance");

    if (request.ivc_in_progress) {
        info("ClientIvcStart - IVC already in progress");
        return ClientIvcStart::Response{ .error_message = "IVC already in progress!" };
    }

    // Initialize a new ClientIVC instance
    TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };
    request.ivc_in_progress = std::make_shared<ClientIVC>(trace_settings);
    info("ClientIvcStart - IVC instance created successfully");
    return ClientIvcStart::Response{ .error_message = "" };
}

inline ClientIvcLoad::Response execute(BBRpcRequest& request, ClientIvcLoad&& command)
{
    info("ClientIvcLoad - loading circuit '", command.circuit.name, "'");

    if (!request.ivc_in_progress) {
        info("ClientIvcLoad - no IVC in progress");
        return ClientIvcLoad::Response{ .error_message = "No IVC in progress. Call ClientIvcStart first." };
    }

    // Parse and store the constraint system to avoid re-parsing during accumulate
    request.last_circuit_constraints = acir_format::circuit_buf_to_acir_format(std::move(command.circuit.bytecode));
    request.last_circuit_name = command.circuit.name;

    info("ClientIvcLoad - circuit loaded with ", request.last_circuit_constraints->num_acir_opcodes, " opcodes");
    return ClientIvcLoad::Response{ .error_message = "" };
}

inline ClientIvcAccumulate::Response execute(BBRpcRequest& request, ClientIvcAccumulate&& command)
{
    info("ClientIvcAccumulate - (", request.ivc_stack_depth, "): ", request.last_circuit_name);

    if (!request.ivc_in_progress) {
        info("ClientIvcAccumulate - error: no IVC in progress");
        return ClientIvcAccumulate::Response{ .error_message = "No IVC in progress. Call ClientIvcStart first." };
    }

    if (!request.last_circuit_constraints.has_value()) {
        info("ClientIvcAccumulate - error: o circuit loaded");
        return ClientIvcAccumulate::Response{ .error_message = "No circuit loaded. Call ClientIvcLoad first." };
    }

    // Parse witness data
    acir_format::WitnessVector witness_vec = acir_format::witness_buf_to_witness_data(std::move(command.witness));
    info("ClientIvcAccumulate - loaded ", witness_vec.size(), " witness values");

    // Create AcirProgram with constraints and witness
    acir_format::AcirProgram acir_program{ request.last_circuit_constraints.value(), witness_vec };

    // Use the program-based create_circuit which sets proper metadata
    const acir_format::ProgramMetadata metadata{ request.ivc_in_progress };
    ClientIVC::ClientCircuit circuit = acir_format::create_circuit<ClientIVC::ClientCircuit>(acir_program, metadata);

    if (request.testing_only_generate_mock_kernels && request.ivc_stack_depth % 2 == 1) {
        info("ClientIvcAccumulate - TESTING ONLY! Generating mock kernel circuit.");
        request.ivc_in_progress->complete_kernel_circuit_logic(circuit);
    }

    // Accumulate the circuit
    // TODO(AI) pass precomputed VK here if vk not blank
    request.ivc_in_progress->accumulate(circuit);

    request.ivc_stack_depth += 1;

    info("ClientIvcAccumulate - success");
    return ClientIvcAccumulate::Response{ .error_message = "" };
}

inline ClientIvcProve::Response execute(BBRpcRequest& request, BB_UNUSED ClientIvcProve&& command)
{
    info("ClientIvcProve - generating IVC proof");

    if (!request.ivc_in_progress) {
        info("ClientIvcProve - no IVC in progress");
        return ClientIvcProve::Response{ .proof = ClientIVC::Proof{},
                                         .error_message = "No IVC in progress. Call ClientIvcStart first." };
    }

    // Generate the IVC proof
    ClientIVC::Proof proof = request.ivc_in_progress->prove();

    info("ClientIvcProve - proof generated, mega proof size: ",
         proof.mega_proof.size(),
         " field elements, goblin proof size: ",
         proof.goblin_proof.size(),
         " bytes");

    // Clear the IVC instance after proving
    request.ivc_in_progress.reset();
    request.last_circuit_constraints.reset();
    request.last_circuit_name.clear();

    return ClientIvcProve::Response{ .proof = proof, .error_message = "" };
}

inline ClientIvcDeriveVk::Response execute(BB_UNUSED BBRpcRequest& request, ClientIvcDeriveVk&& command)
{
    info("ClientIvcDeriveVk - deriving VK for circuit '", command.circuit.name, "', standalone: ", command.standalone);

    // Parse the circuit
    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(command.circuit.bytecode));

    // Create verification key based on whether it's standalone or not
    std::vector<uint8_t> vk_data;
    if (command.standalone) {
        // For standalone, we just need the circuit's verification key (not the full IVC VK)
        ClientIVC::ClientCircuit circuit = acir_format::create_circuit<ClientIVC::ClientCircuit>(
            constraint_system, /*recursive=*/false, /*size_hint=*/0);

        auto proving_key = std::make_shared<DeciderProvingKey_<MegaFlavor>>(circuit);
        auto vk = std::make_shared<MegaFlavor::VerificationKey>(proving_key->proving_key);
        vk_data = to_buffer(*vk);

        info("ClientIvcDeriveVk - standalone VK derived, size: ", vk_data.size(), " bytes");
    } else {
        // TODO(AD) base this off of write_vk_for_ivc in api_client_ivc.cpp
        return ClientIvcDeriveVk::Response{
            .verification_key = {},
            .error_message = "Full IVC VK derivation not yet implemented - requires complex mock circuit setup"
        };
    }

    return ClientIvcDeriveVk::Response{ .verification_key = vk_data, .error_message = "" };
}

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
