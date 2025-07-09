#include "barretenberg/api/bbapi_client_ivc.hpp"
#include "barretenberg/client_ivc/mock_circuit_producer.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/serialize/msgpack_check_eq.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

namespace bb::bbapi {

ClientIvcStart::Response ClientIvcStart::execute(BBApiRequest& request) &&
{
    request.ivc_in_progress = std::make_shared<ClientIVC>(request.trace_settings);
    request.ivc_stack_depth = 0;
    return Response{};
}

ClientIvcLoad::Response ClientIvcLoad::execute(BBApiRequest& request) &&
{
    if (!request.ivc_in_progress) {
        throw_or_abort("ClientIVC not started. Call ClientIvcStart first.");
    }

    request.last_circuit_name = circuit.name;
    request.last_circuit_constraints = acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode));
    request.last_circuit_vk = circuit.verification_key;

    info("ClientIvcLoad - loaded circuit '", request.last_circuit_name, "'");

    return Response{};
}

ClientIvcAccumulate::Response ClientIvcAccumulate::execute(BBApiRequest& request) &&
{
    if (!request.ivc_in_progress) {
        throw_or_abort("ClientIVC not started. Call ClientIvcStart first.");
    }

    if (!request.last_circuit_constraints.has_value()) {
        throw_or_abort("No circuit loaded. Call ClientIvcLoad first.");
    }

    acir_format::WitnessVector witness_data = acir_format::witness_buf_to_witness_data(std::move(witness));
    acir_format::AcirProgram program{ std::move(request.last_circuit_constraints.value()), std::move(witness_data) };

    const acir_format::ProgramMetadata metadata{ request.ivc_in_progress };
    auto circuit = acir_format::create_circuit<ClientIVC::ClientCircuit>(program, metadata);

    std::shared_ptr<ClientIVC::MegaVerificationKey> precomputed_vk;
    if (!request.last_circuit_vk.empty()) {
        precomputed_vk = from_buffer<std::shared_ptr<ClientIVC::MegaVerificationKey>>(request.last_circuit_vk);
    }

    info("ClientIvcAccumulate - accumulating circuit '", request.last_circuit_name, "'");
    request.ivc_in_progress->accumulate(circuit, precomputed_vk);
    request.ivc_stack_depth++;

    request.last_circuit_constraints.reset();
    request.last_circuit_vk.clear();

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

static std::shared_ptr<ClientIVC::DeciderProvingKey> get_acir_program_decider_proving_key(
    const BBApiRequest& request, acir_format::AcirProgram& program)
{
    ClientIVC::ClientCircuit builder = acir_format::create_circuit<ClientIVC::ClientCircuit>(program);

    // Construct the verification key via the prover-constructed proving key with the proper trace settings
    return std::make_shared<ClientIVC::DeciderProvingKey>(builder, request.trace_settings);
}

ClientIVC::VerificationKey compute_vk_for_ivc(const BBApiRequest& request, size_t num_public_inputs_in_final_circuit)
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

ClientIvcComputeStandaloneVk::Response ClientIvcComputeStandaloneVk::execute(const BBApiRequest& request) &&
{
    info("ClientIvcComputeStandaloneVk - deriving VK for circuit '", circuit.name, "'");

    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode));

    acir_format::AcirProgram program{ constraint_system, /*witness=*/{} };
    std::shared_ptr<ClientIVC::DeciderProvingKey> proving_key = get_acir_program_decider_proving_key(request, program);
    auto verification_key = std::make_shared<ClientIVC::MegaVerificationKey>(proving_key->proving_key);

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

    auto vk = compute_vk_for_ivc(request, constraint_system.public_inputs.size());

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
    auto computed_vk = std::make_shared<ClientIVC::MegaVerificationKey>(proving_key->proving_key);

    if (circuit.verification_key.empty()) {
        info("FAIL: Expected precomputed vk for function ", function_name);
        throw_or_abort("Missing precomputed VK");
    }

    auto precomputed_vk = from_buffer<std::shared_ptr<ClientIVC::MegaVerificationKey>>(circuit.verification_key);

    Response response;
    response.valid = true;
    std::string error_message = "Precomputed vk does not match computed vk for function " + function_name;
    if (!msgpack::msgpack_check_eq(*computed_vk, *precomputed_vk, error_message)) {
        response.valid = false;
    }
    return response;
}

} // namespace bb::bbapi
