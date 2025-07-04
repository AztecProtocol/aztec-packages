#pragma once

#include "barretenberg/api/bbapi_commands.hpp"
#include "barretenberg/api/write_prover_output.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/client_ivc/mock_circuit_producer.hpp"
#include "barretenberg/common/compiler_hints.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/honk/execution_trace/mega_execution_trace.hpp"
#include "barretenberg/serialize/msgpack_check_eq.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <queue>
#include <string>

namespace bb::bbapi {

/**
 * @brief Convert a vector of field elements to JSON array format
 */
inline std::string field_elements_to_json(const std::vector<bb::fr>& fields)
{
    if (fields.empty()) {
        return "[]";
    }
    return format("[", join(transform::map(fields, [](auto fr) { return format("\"", fr, "\""); })), "]");
}

struct BBApiRequest {
    TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };
    // Current depth of the IVC stack for this request
    uint32_t ivc_stack_depth = 0;
    std::shared_ptr<ClientIVC> ivc_in_progress;
    // Name of the last loaded circuit
    std::string last_circuit_name;
    // Store the parsed constraint system to get ahead of parsing before accumulate
    std::optional<acir_format::AcirFormat> last_circuit_constraints;
    // Store the verification key passed with the circuit
    std::vector<uint8_t> last_circuit_vk;
};

inline const std::string& get_error_message(const CommandResponse& response)
{
    return response.visit([](const auto& resp) -> const std::string& { return resp.error_message; });
}

inline CircuitProve::Response execute(BB_UNUSED BBApiRequest& request, CircuitProve&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

inline CircuitComputeVk::Response execute(BB_UNUSED BBApiRequest& request, CircuitComputeVk&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

inline CircuitVerify::Response execute(BB_UNUSED BBApiRequest& request, CircuitVerify&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

inline CircuitInfo::Response execute(BB_UNUSED BBApiRequest& request, CircuitInfo&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

inline CircuitCheck::Response execute(BB_UNUSED BBApiRequest& request, CircuitCheck&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

inline ProofAsFields::Response execute(BB_UNUSED BBApiRequest& request, ProofAsFields&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

inline VkAsFields::Response execute(BB_UNUSED BBApiRequest& request, VkAsFields&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

inline ClientIvcStart::Response execute(BBApiRequest& request, BB_UNUSED ClientIvcStart&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

inline ClientIvcLoad::Response execute(BBApiRequest& request, ClientIvcLoad&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

inline ClientIvcAccumulate::Response execute(BBApiRequest& request, ClientIvcAccumulate&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

inline ClientIvcProve::Response execute(BBApiRequest& request, BB_UNUSED ClientIvcProve&& command)
{
    if (!request.ivc_in_progress) {
        return ClientIvcProve::Response{ .proof = {},
                                         .error_message = "ClientIVC not started. Call ClientIvcStart first." };
    }

    if (request.ivc_stack_depth == 0) {
        return ClientIvcProve::Response{ .proof = {},
                                         .error_message = "No circuits accumulated. Call ClientIvcAccumulate first." };
    }

    info("ClientIvcProve - generating proof for ", request.ivc_stack_depth, " accumulated circuits");

    ClientIVC::Proof proof = request.ivc_in_progress->prove();

    // We verify this proof. Another bb call to verify has some overhead of loading VK/proof/SRS,
    // and it is mysterious if this transaction fails later in the lifecycle.
    // The files are still written in case they are needed to investigate this failure.
    if (!request.ivc_in_progress->verify(proof)) {
        return ClientIvcProve::Response{ .proof = {}, .error_message = "Failed to verify the generated proof!" };
    }

    request.ivc_in_progress.reset();
    request.ivc_stack_depth = 0;

    return ClientIvcProve::Response{ .proof = std::move(proof), .error_message = "" };
}

inline std::shared_ptr<ClientIVC::DeciderProvingKey> get_acir_program_decider_proving_key(
    const BBApiRequest& request, acir_format::AcirProgram& program)
{
    ClientIVC::ClientCircuit builder = acir_format::create_circuit<ClientIVC::ClientCircuit>(program);

    // Construct the verification key via the prover-constructed proving key with the proper trace settings
    return std::make_shared<ClientIVC::DeciderProvingKey>(builder, request.trace_settings);
}

inline ClientIVC::VerificationKey compute_vk_for_ivc(const BBApiRequest& request,
                                                     size_t num_public_inputs_in_final_circuit)
{
    ClientIVC ivc{ request.trace_settings };
    ClientIVCMockCircuitProducer circuit_producer;

    // Initialize the IVC with an arbitrary circuit
    // We segfault if we only call accumulate once
    static constexpr size_t SMALL_ARBITRARY_LOG_CIRCUIT_SIZE{ 5 };
    MegaCircuitBuilder circuit_0 = circuit_producer.create_next_circuit(ivc, SMALL_ARBITRARY_LOG_CIRCUIT_SIZE);
    ivc.accumulate(circuit_0);

    // Create another circuit and accumulate
    MegaCircuitBuilder circuit_1 =
        circuit_producer.create_next_circuit(ivc, SMALL_ARBITRARY_LOG_CIRCUIT_SIZE, num_public_inputs_in_final_circuit);
    ivc.accumulate(circuit_1);

    // Construct the hiding circuit and its VK (stored internally in the IVC)
    ivc.construct_hiding_circuit_key();

    return ivc.get_vk();
}

inline ClientIvcComputeStandaloneVk::Response execute(BBApiRequest& request, ClientIvcComputeStandaloneVk&& command)
{
    info("ClientIvcComputeVk - deriving VK for circuit '", command.circuit.name, "', standalone: ", command.standalone);

    // Parse the circuit
    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(command.circuit.bytecode));

    // Create verification key based on whether it's standalone or not
    std::vector<uint8_t> vk_data;
    if (command.standalone) {
        // For standalone, we just need the circuit's verification key (not the full IVC VK)
        acir_format::AcirProgram program{ constraint_system, /*witness=*/{} };
        std::shared_ptr<ClientIVC::DeciderProvingKey> proving_key =
            get_acir_program_decider_proving_key(request, program);
        auto verification_key = std::make_shared<ClientIVC::MegaVerificationKey>(proving_key->get_precomputed());
        vk_data = to_buffer(*verification_key);
        info("ClientIvcComputeVk - standalone VK derived, size: ", vk_data.size(), " bytes");
    } else {
        vk_data = to_buffer(compute_vk_for_ivc(request, constraint_system.public_inputs.size()));
        info("ClientIvcComputeVk - full IVC VK derived, size: ", vk_data.size(), " bytes");
    }

    acir_format::AcirProgram program{ constraint_system, /*witness=*/{} };
    std::shared_ptr<ClientIVC::DeciderProvingKey> proving_key = get_acir_program_decider_proving_key(request, program);
    auto verification_key = std::make_shared<ClientIVC::MegaVerificationKey>(proving_key->proving_key);

    response.vk_bytes = to_buffer(*verification_key);
    response.vk_fields = verification_key->to_field_elements();

    info("ClientIvcComputeStandaloneVk - VK derived, size: ", response.vk_bytes.size(), " bytes");

    response.error_message = "";
    return response;
}

inline ClientIvcComputeIvcVk::Response execute(BBApiRequest& request, ClientIvcComputeIvcVk&& command)
{
    info("ClientIvcComputeIvcVk - deriving IVC VK for circuit '", command.circuit.name, "'");

    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(command.circuit.bytecode));

    ClientIvcComputeIvcVk::Response response;

    auto vk = compute_vk_for_ivc(request, constraint_system.public_inputs.size());
    response.vk_bytes = to_buffer(vk);

    info("ClientIvcComputeIvcVk - IVC VK derived, size: ", response.vk_bytes.size(), " bytes");

    response.error_message = "";
    return response;
}

template <typename T> inline typename T::Response execute(T&& command)
{
    BBApiRequest request;
    return execute_or_throw(request, std::forward<T>(command));
}

inline ClientIvcCheckPrecomputedVk::Response execute(BBApiRequest& request, ClientIvcCheckPrecomputedVk&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

/**
 * @brief Executes a command by visiting a variant of all possible commands.
 *
 * @param command The command to execute, consumed by this function.
 * @param request The circuit registry (acting as the request context).
 * @return A variant of all possible command responses.
 */
inline CommandResponse execute(BBApiRequest& request, Command&& command)
{
    return std::move(command).visit(
        [&request](auto&& cmd) -> CommandResponse { return execute(request, std::forward<decltype(cmd)>(cmd)); });
}

// Can only be called from the execution thread (the same as the main thread, except in threaded WASM).
inline std::vector<CommandResponse> execute_request(BBApiRequest&& request, std::vector<Command>&& commands)
{
    std::vector<CommandResponse> responses;
    responses.reserve(commands.size());
    for (Command& command : commands) {
        responses.push_back(execute(request, std::move(command)));
        if (!get_error_message(responses.back()).empty()) {
            // If there was an error, we stop processing further commands.
            break;
        }
    }
    return responses;
}

} // namespace bb::bbapi

namespace bb {
template <typename T>
inline typename T::Response do_bbapi(T&& command)
    requires(!bbapi::RequiresBBApiRequest<T>)
{
    bbapi::BBApiRequest request;
    typename T::Response result = execute(request, std::forward<T>(command));
    const std::string& error_message = bbapi::get_error_message(result);
    if (error_message.empty()) {
        return result;
    }
    throw std::runtime_error{ error_message };
}

template <bbapi::RequiresBBApiRequest T> inline typename T::Response do_bbapi(bbapi::BBApiRequest& request, T&& command)
{
    typename T::Response result = execute(request, std::forward<T>(command));
    const std::string& error_message = bbapi::get_error_message(result);
    if (error_message.empty()) {
        return result;
    }
    throw std::runtime_error{ error_message };
}
} // namespace bb
