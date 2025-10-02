#include "barretenberg/bbapi/bbapi_client_ivc.hpp"
#include "barretenberg/client_ivc/mock_circuit_producer.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/pg_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/honk/execution_trace/execution_trace_usage_tracker.hpp"
#include "barretenberg/serialize/msgpack_check_eq.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

namespace bb::bbapi {

ClientIvcStart::Response ClientIvcStart::execute(BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    request.ivc_in_progress = std::make_shared<ClientIVC>(num_circuits, request.trace_settings);
    request.ivc_stack_depth = 0;
    return Response{};
}

ClientIvcLoad::Response ClientIvcLoad::execute(BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
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
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
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
        // Deserialize directly from buffer
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
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
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
    info("ClientIvcProve - verifying the generated proof as a sanity check");
    ClientIVC::VerificationKey vk = request.ivc_in_progress->get_vk();
    if (!ClientIVC::verify(proof, vk)) {
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
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    // Deserialize the verification key directly from buffer
    ClientIVC::VerificationKey verification_key = from_buffer<ClientIVC::VerificationKey>(vk);

    // Verify the proof using ClientIVC's static verify method
    const bool verified = ClientIVC::verify(proof, verification_key);

    return { .valid = verified };
}

static std::shared_ptr<ClientIVC::ProverInstance> get_acir_program_prover_instance(const BBApiRequest& request,
                                                                                   acir_format::AcirProgram& program)
{
    ClientIVC::ClientCircuit builder = acir_format::create_circuit<ClientIVC::ClientCircuit>(program);

    // Construct the verification key via the prover-constructed proving key with the proper trace settings
    return std::make_shared<ClientIVC::ProverInstance>(builder, request.trace_settings);
}

ClientIvcComputeStandaloneVk::Response ClientIvcComputeStandaloneVk::execute(const BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    info("ClientIvcComputeStandaloneVk - deriving VK for circuit '", circuit.name, "'");

    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode));

    acir_format::AcirProgram program{ constraint_system, /*witness=*/{} };
    std::shared_ptr<ClientIVC::ProverInstance> prover_instance = get_acir_program_prover_instance(request, program);
    auto verification_key = std::make_shared<ClientIVC::MegaVerificationKey>(prover_instance->get_precomputed());

    return { .bytes = to_buffer(*verification_key), .fields = verification_key->to_field_elements() };
}

ClientIvcComputeIvcVk::Response ClientIvcComputeIvcVk::execute(BB_UNUSED const BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    info("ClientIvcComputeIvcVk - deriving IVC VK for circuit '", circuit.name, "'");

    auto standalone_vk_response = bbapi::ClientIvcComputeStandaloneVk{
        .circuit{ .name = "standalone_circuit", .bytecode = std::move(circuit.bytecode) }
    }.execute({ .trace_settings = {} });

    auto mega_vk = from_buffer<ClientIVC::MegaVerificationKey>(standalone_vk_response.bytes);
    auto eccvm_vk = std::make_shared<ClientIVC::ECCVMVerificationKey>();
    auto translator_vk = std::make_shared<ClientIVC::TranslatorVerificationKey>();
    ClientIVC::VerificationKey civc_vk{ .mega = std::make_shared<ClientIVC::MegaVerificationKey>(mega_vk),
                                        .eccvm = std::make_shared<ClientIVC::ECCVMVerificationKey>(),
                                        .translator = std::make_shared<ClientIVC::TranslatorVerificationKey>() };
    Response response;
    response.bytes = to_buffer(civc_vk);

    info("ClientIvcComputeIvcVk - IVC VK derived, size: ", response.bytes.size(), " bytes");

    return response;
}

ClientIvcCheckPrecomputedVk::Response ClientIvcCheckPrecomputedVk::execute(const BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    acir_format::AcirProgram program{ acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode)),
                                      /*witness=*/{} };

    std::shared_ptr<ClientIVC::ProverInstance> prover_instance = get_acir_program_prover_instance(request, program);
    auto computed_vk = std::make_shared<ClientIVC::MegaVerificationKey>(prover_instance->get_precomputed());

    if (circuit.verification_key.empty()) {
        info("FAIL: Expected precomputed vk for function ", circuit.name);
        throw_or_abort("Missing precomputed VK");
    }

    // Deserialize directly from buffer
    auto precomputed_vk = from_buffer<std::shared_ptr<ClientIVC::MegaVerificationKey>>(circuit.verification_key);

    Response response;
    response.valid = true;
    std::string error_message = "Precomputed vk does not match computed vk for function " + circuit.name;
    if (*computed_vk != *precomputed_vk) {
        response.valid = false;
        response.actual_vk = to_buffer(computed_vk);
    }
    return response;
}

ClientIvcStats::Response ClientIvcStats::execute(BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    Response response;

    const auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode));
    acir_format::AcirProgram program{ constraint_system };

    // Get IVC constraints if any
    const auto& ivc_constraints = constraint_system.pg_recursion_constraints;

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
    response.acir_opcodes = program.constraints.num_acir_opcodes;
    response.circuit_size = static_cast<uint32_t>(builder.num_gates);

    // Optionally include gates per opcode
    if (include_gates_per_opcode) {
        response.gates_per_opcode = std::vector<uint32_t>(program.constraints.gates_per_opcode.begin(),
                                                          program.constraints.gates_per_opcode.end());
    }

    // Log circuit details
    info("ClientIvcStats - circuit: ",
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
