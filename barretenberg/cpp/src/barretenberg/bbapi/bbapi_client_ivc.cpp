#include "barretenberg/bbapi/bbapi_client_ivc.hpp"
#include "barretenberg/client_ivc/mock_circuit_producer.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/ivc_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/honk/execution_trace/execution_trace_usage_tracker.hpp"
#include "barretenberg/serialize/msgpack_check_eq.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

namespace bb::bbapi {

ClientIvcStart::Response ClientIvcStart::execute(BBApiRequest& request) &&
{
    request.ivc_in_progress = std::make_shared<ClientIVC>(num_circuits, request.trace_settings);
    request.ivc_stack_depth = 0;
    return Response{};
}

ClientIvcLoad::Response ClientIvcLoad::execute(BBApiRequest& request) &&
{
    if (!request.ivc_in_progress) {
        throw_or_abort("ClientIVC not started. Call ClientIvcStart first.");
    }

    request.loaded_circuit_name = circuit.name;
    request.loaded_circuit_constraints = acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode));
    request.loaded_circuit_vk = circuit.verification_key;

    info("ClientIvcLoad - loaded circuit '", request.loaded_circuit_name, "'");

    return Response{};
}

ClientIvcAccumulate::Response ClientIvcAccumulate::execute(BBApiRequest& request) &&
{
    if (!request.ivc_in_progress) {
        throw_or_abort("ClientIVC not started. Call ClientIvcStart first.");
    }

    if (!request.loaded_circuit_constraints.has_value()) {
        throw_or_abort("No circuit loaded. Call ClientIvcLoad first.");
    }

    acir_format::WitnessVector witness_data = acir_format::witness_buf_to_witness_data(std::move(witness));
    acir_format::AcirProgram program{ std::move(request.loaded_circuit_constraints.value()), std::move(witness_data) };

    const acir_format::ProgramMetadata metadata{ request.ivc_in_progress };
    auto circuit = acir_format::create_circuit<ClientIVC::ClientCircuit>(program, metadata);

    std::shared_ptr<ClientIVC::MegaVerificationKey> precomputed_vk;
    if (!request.loaded_circuit_vk.empty()) {
        precomputed_vk = from_buffer<std::shared_ptr<ClientIVC::MegaVerificationKey>>(request.loaded_circuit_vk);
    }

    info("ClientIvcAccumulate - accumulating circuit '", request.loaded_circuit_name, "'");
    request.ivc_in_progress->accumulate(circuit, precomputed_vk);
    request.ivc_stack_depth++;

    request.loaded_circuit_constraints.reset();
    request.loaded_circuit_vk.clear();

    return Response{};
}

ClientIvcProve::Response ClientIvcProve::execute(BBApiRequest& request) &&
{
    if (!request.ivc_in_progress) {
        throw_or_abort("ClientIVC not started. Call ClientIvcStart first.");
    }

    if (request.ivc_stack_depth == 0) {
        throw_or_abort("No circuits accumulated. Call ClientIvcAccumulate first.");
    }

    info("ClientIvcProve - generating proof for ", request.ivc_stack_depth, " accumulated circuits");

    ClientIVC::Proof proof = request.ivc_in_progress->prove();

    // We verify this proof. Another bb call to verify has some overhead of loading VK/proof/SRS,
    // and it is mysterious if this transaction fails later in the lifecycle.
    if (!request.ivc_in_progress->verify(proof)) {
        throw_or_abort("Failed to verify the generated proof!");
    }

    request.ivc_in_progress.reset();
    request.ivc_stack_depth = 0;

    Response response;
    response.proof = std::move(proof);
    return response;
}

ClientIvcVerify::Response ClientIvcVerify::execute(const BBApiRequest& /*request*/) &&
{
    // Deserialize the verification key from the byte buffer
    const auto verification_key = from_buffer<ClientIVC::VerificationKey>(vk);

    // Verify the proof using ClientIVC's static verify method
    const bool verified = ClientIVC::verify(proof, verification_key);

    return { .valid = verified };
}

static std::shared_ptr<ClientIVC::DeciderProvingKey> get_acir_program_decider_proving_key(
    const BBApiRequest& request, acir_format::AcirProgram& program)
{
    ClientIVC::ClientCircuit builder = acir_format::create_circuit<ClientIVC::ClientCircuit>(program);

    // Construct the verification key via the prover-constructed proving key with the proper trace settings
    return std::make_shared<ClientIVC::DeciderProvingKey>(builder, request.trace_settings);
}

ClientIVC::VerificationKey compute_civc_vk(const BBApiRequest& request, size_t num_public_inputs_in_final_circuit)
{
    ClientIVC ivc{ /* num_circuits */ 2, request.trace_settings };
    PrivateFunctionExecutionMockCircuitProducer circuit_producer;

    // Initialize the IVC with an arbitrary circuit
    // We segfault if we only call accumulate once
    static constexpr size_t SMALL_ARBITRARY_LOG_CIRCUIT_SIZE{ 5 };
    auto [circuit_0, vk_0] =
        circuit_producer.create_next_circuit_and_vk(ivc, { .log2_num_gates = SMALL_ARBITRARY_LOG_CIRCUIT_SIZE });
    ivc.accumulate(circuit_0, vk_0);

    // Create another circuit and accumulate
    auto [circuit_1, vk_1] =
        circuit_producer.create_next_circuit_and_vk(ivc,
                                                    {
                                                        .num_public_inputs = num_public_inputs_in_final_circuit,
                                                        .log2_num_gates = SMALL_ARBITRARY_LOG_CIRCUIT_SIZE,
                                                    });
    ivc.accumulate(circuit_1, vk_1);

    // Construct the hiding circuit and its VK (stored internally in the IVC)
    ivc.construct_hiding_circuit_key();

    return ivc.get_vk();
}

ClientIvcComputeStandaloneVk::Response ClientIvcComputeStandaloneVk::execute(BB_UNUSED const BBApiRequest& request) &&
{
    info("ClientIvcComputeStandaloneVk - deriving VK for circuit '", circuit.name, "'");

    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode));

    acir_format::AcirProgram program{ constraint_system, /*witness=*/{} };
    std::shared_ptr<ClientIVC::DeciderProvingKey> proving_key = get_acir_program_decider_proving_key(request, program);
    auto verification_key = std::make_shared<ClientIVC::MegaVerificationKey>(proving_key->get_precomputed());

    Response response;
    response.bytes = to_buffer(*verification_key);
    response.fields = verification_key->to_field_elements();

    info("ClientIvcComputeStandaloneVk - VK derived, size: ", response.bytes.size(), " bytes");

    return response;
}

ClientIvcComputeIvcVk::Response ClientIvcComputeIvcVk::execute(const BBApiRequest& request) &&
{
    info("ClientIvcComputeIvcVk - deriving IVC VK for circuit '", circuit.name, "'");

    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode));

    auto vk = compute_civc_vk(request, constraint_system.public_inputs.size());

    Response response;
    response.bytes = to_buffer(vk);

    info("ClientIvcComputeIvcVk - IVC VK derived, size: ", response.bytes.size(), " bytes");

    return response;
}

ClientIvcCheckPrecomputedVk::Response ClientIvcCheckPrecomputedVk::execute(const BBApiRequest& request) &&
{
    acir_format::AcirProgram program{ acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode)),
                                      /*witness=*/{} };

    std::shared_ptr<ClientIVC::DeciderProvingKey> proving_key = get_acir_program_decider_proving_key(request, program);
    auto computed_vk = std::make_shared<ClientIVC::MegaVerificationKey>(proving_key->get_precomputed());

    if (circuit.verification_key.empty()) {
        info("FAIL: Expected precomputed vk for function ", circuit.name);
        throw_or_abort("Missing precomputed VK");
    }

    auto precomputed_vk = from_buffer<std::shared_ptr<ClientIVC::MegaVerificationKey>>(circuit.verification_key);

    Response response;
    response.valid = true;
    std::string error_message = "Precomputed vk does not match computed vk for function " + circuit.name;
    if (!msgpack::msgpack_check_eq(*computed_vk, *precomputed_vk, error_message)) {
        response.valid = false;
        response.actual_vk = to_buffer(computed_vk);
    }
    return response;
}

ClientIvcGates::Response ClientIvcGates::execute(BBApiRequest& request) &&
{
    Response response;

    const auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode));
    acir_format::AcirProgram program{ constraint_system };

    // Get IVC constraints if any
    const auto& ivc_constraints = constraint_system.ivc_recursion_constraints;

    // Create metadata with appropriate IVC context
    acir_format::ProgramMetadata metadata{
        .ivc = ivc_constraints.empty() ? nullptr
                                       : create_mock_ivc_from_constraints(ivc_constraints, request.trace_settings),
        .collect_gates_per_opcode = include_gates_per_opcode
    };

    // Create and finalize circuit
    auto builder = acir_format::create_circuit<MegaCircuitBuilder>(program, metadata);
    builder.finalize_circuit(/*ensure_nonzero=*/true);

    // Set response values
    response.acir_opcodes = static_cast<uint32_t>(program.constraints.num_acir_opcodes);
    response.circuit_size = static_cast<uint32_t>(builder.num_gates);

    // Optionally include gates per opcode
    if (include_gates_per_opcode) {
        response.gates_per_opcode = std::vector<uint32_t>(program.constraints.gates_per_opcode.begin(),
                                                          program.constraints.gates_per_opcode.end());
    }

    // Log circuit details
    info("ClientIvcGates - circuit: ",
         circuit.name,
         ", acir_opcodes: ",
         response.acir_opcodes,
         ", circuit_size: ",
         response.circuit_size);

    // Print structured execution trace details
    builder.blocks.set_fixed_block_sizes(request.trace_settings);
    builder.blocks.summarize();

    return response;
}

} // namespace bb::bbapi
