#pragma once

#include "barretenberg/api/bbrpc_commands.hpp"
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

namespace bb::bbrpc {

struct BBRpcRequest {
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

inline CircuitProve::Response execute(BB_UNUSED BBRpcRequest& request, CircuitProve&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

inline CircuitComputeVk::Response execute(BB_UNUSED BBRpcRequest& request, CircuitComputeVk&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

inline CircuitVerify::Response execute(BB_UNUSED BBRpcRequest& request, CircuitVerify&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

inline CircuitInfo::Response execute(BB_UNUSED BBRpcRequest& request, CircuitInfo&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

inline CircuitCheck::Response execute(BB_UNUSED BBRpcRequest& request, CircuitCheck&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

inline ProofAsFields::Response execute(BB_UNUSED BBRpcRequest& request, ProofAsFields&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

inline VkAsFields::Response execute(BB_UNUSED BBRpcRequest& request, VkAsFields&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

inline ClientIvcStart::Response execute(BBRpcRequest& request, BB_UNUSED ClientIvcStart&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

inline ClientIvcLoad::Response execute(BBRpcRequest& request, ClientIvcLoad&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

inline ClientIvcAccumulate::Response execute(BBRpcRequest& request, ClientIvcAccumulate&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

inline ClientIvcProve::Response execute(BBRpcRequest& request, ClientIvcProve&& command)
{
    (void)request;
    (void)command;
    throw_or_abort("code in progress! should not be called");
}

inline std::shared_ptr<ClientIVC::DeciderProvingKey> get_acir_program_decider_proving_key(
    const BBRpcRequest& request, acir_format::AcirProgram& program)
{
    ClientIVC::ClientCircuit builder = acir_format::create_circuit<ClientIVC::ClientCircuit>(program);

    // Construct the verification key via the prover-constructed proving key with the proper trace settings
    return std::make_shared<ClientIVC::DeciderProvingKey>(builder, request.trace_settings);
}

inline ClientIVC::VerificationKey compute_vk_for_ivc(const BBRpcRequest& request,
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

inline ClientIvcComputeVk::Response execute(BBRpcRequest& request, ClientIvcComputeVk&& command)
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
        auto verification_key =
            std::make_shared<ClientIVC::MegaVerificationKey>(proving_key->polynomials, proving_key->metadata);
        vk_data = to_buffer(*verification_key);
        info("ClientIvcComputeVk - standalone VK derived, size: ", vk_data.size(), " bytes");
    } else {
        vk_data = to_buffer(compute_vk_for_ivc(request, constraint_system.public_inputs.size()));
        info("ClientIvcComputeVk - full IVC VK derived, size: ", vk_data.size(), " bytes");
    }

    return ClientIvcComputeVk::Response{ .verification_key = vk_data, .error_message = "" };
}

inline ClientIvcCheckPrecomputedVk::Response execute(BBRpcRequest& request, ClientIvcCheckPrecomputedVk&& command)
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
inline CommandResponse execute(BBRpcRequest& request, Command&& command)
{
    return std::move(command).visit(
        [&request](auto&& cmd) -> CommandResponse { return execute(request, std::forward<decltype(cmd)>(cmd)); });
}

template <typename T> typename T::Response execute_or_throw(BBRpcRequest& request, T&& command)
{
    auto response = execute(request, std::forward<T>(command));
    if (!response.error_message.empty()) {
        throw_or_abort(response.error_message);
    }
    return response;
}

// Can only be called from the execution thread (the same as the main thread, except in threaded WASM).
inline std::vector<CommandResponse> execute_request(BBRpcRequest&& request, std::vector<Command>&& commands)
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

} // namespace bb::bbrpc
