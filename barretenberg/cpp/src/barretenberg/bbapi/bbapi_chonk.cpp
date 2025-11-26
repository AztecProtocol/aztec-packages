#include "barretenberg/bbapi/bbapi_chonk.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/hypernova_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/serialize/msgpack_check_eq.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

namespace bb::bbapi {

ChonkStart::Response ChonkStart::execute(BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);

    request.ivc_in_progress = std::make_shared<Chonk>(num_circuits);

    request.ivc_stack_depth = 0;
    return Response{};
}

ChonkLoad::Response ChonkLoad::execute(BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    if (!request.ivc_in_progress) {
        throw_or_abort("Chonk not started. Call ChonkStart first.");
    }

    request.loaded_circuit_name = circuit.name;
    request.loaded_circuit_constraints = acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode));
    request.loaded_circuit_vk = circuit.verification_key;

    info("ChonkLoad - loaded circuit '", request.loaded_circuit_name, "'");

    return Response{};
}

ChonkAccumulate::Response ChonkAccumulate::execute(BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    if (!request.ivc_in_progress) {
        throw_or_abort("Chonk not started. Call ChonkStart first.");
    }

    if (!request.loaded_circuit_constraints.has_value()) {
        throw_or_abort("No circuit loaded. Call ChonkLoad first.");
    }

    acir_format::WitnessVector witness_data = acir_format::witness_buf_to_witness_vector(std::move(witness));
    acir_format::AcirProgram program{ std::move(request.loaded_circuit_constraints.value()), std::move(witness_data) };

    const acir_format::ProgramMetadata metadata{ .ivc = request.ivc_in_progress };
    auto circuit = acir_format::create_circuit<IVCBase::ClientCircuit>(program, metadata);

    std::shared_ptr<Chonk::MegaVerificationKey> precomputed_vk;

    if (request.vk_policy == VkPolicy::RECOMPUTE) {
        precomputed_vk = nullptr;
    } else if (request.vk_policy == VkPolicy::DEFAULT || request.vk_policy == VkPolicy::CHECK) {
        if (!request.loaded_circuit_vk.empty()) {
            precomputed_vk = from_buffer<std::shared_ptr<Chonk::MegaVerificationKey>>(request.loaded_circuit_vk);

            if (request.vk_policy == VkPolicy::CHECK) {
                auto prover_instance = std::make_shared<Chonk::ProverInstance>(circuit);
                auto computed_vk = std::make_shared<Chonk::MegaVerificationKey>(prover_instance->get_precomputed());

                // Dereference to compare VK contents
                if (*precomputed_vk != *computed_vk) {
                    throw_or_abort("VK check failed for circuit '" + request.loaded_circuit_name +
                                   "': provided VK does not match computed VK");
                }
            }
        }
    } else {
        throw_or_abort("Invalid VK policy. Valid options: default, check, recompute");
    }

    info("ChonkAccumulate - accumulating circuit '", request.loaded_circuit_name, "'");
    request.ivc_in_progress->accumulate(circuit, precomputed_vk);
    request.ivc_stack_depth++;

    request.loaded_circuit_constraints.reset();
    request.loaded_circuit_vk.clear();

    return Response{};
}

ChonkProve::Response ChonkProve::execute(BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    if (!request.ivc_in_progress) {
        throw_or_abort("Chonk not started. Call ChonkStart first.");
    }

    if (request.ivc_stack_depth == 0) {
        throw_or_abort("No circuits accumulated. Call ChonkAccumulate first.");
    }

    info("ChonkProve - generating proof for ", request.ivc_stack_depth, " accumulated circuits");

    // Call prove and verify using the appropriate IVC type
    Response response;
    bool verification_passed = false;

    info("ChonkProve - using Chonk");
    auto sumcheck_ivc = std::dynamic_pointer_cast<Chonk>(request.ivc_in_progress);
    auto proof = sumcheck_ivc->prove();
    auto vk = sumcheck_ivc->get_vk();

    // We verify this proof. Another bb call to verify has some overhead of loading VK/proof/SRS,
    // and it is mysterious if this transaction fails later in the lifecycle.
    info("ChonkProve - verifying the generated proof as a sanity check");
    verification_passed = Chonk::verify(proof, vk);

    if (!verification_passed) {
        throw_or_abort("Failed to verify the generated proof!");
    }

    response.proof =
        Chonk::Proof{ .mega_proof = std::move(proof.mega_proof), .goblin_proof = std::move(proof.goblin_proof) };

    request.ivc_in_progress.reset();
    request.ivc_stack_depth = 0;

    return response;
}

ChonkVerify::Response ChonkVerify::execute(const BBApiRequest& /*request*/) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    // Deserialize the verification key directly from buffer
    Chonk::VerificationKey verification_key = from_buffer<Chonk::VerificationKey>(vk);

    // Verify the proof using Chonk's static verify method
    const bool verified = Chonk::verify(proof, verification_key);

    return { .valid = verified };
}

static std::shared_ptr<Chonk::ProverInstance> get_acir_program_prover_instance(acir_format::AcirProgram& program)
{
    Chonk::ClientCircuit builder = acir_format::create_circuit<Chonk::ClientCircuit>(program);

    // Construct the verification key via the prover-constructed proving key with the proper trace settings
    return std::make_shared<Chonk::ProverInstance>(builder);
}

ChonkComputeStandaloneVk::Response ChonkComputeStandaloneVk::execute([[maybe_unused]] const BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    info("ChonkComputeStandaloneVk - deriving VK for circuit '", circuit.name, "'");

    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode));

    acir_format::AcirProgram program{ constraint_system, /*witness=*/{} };
    std::shared_ptr<Chonk::ProverInstance> prover_instance = get_acir_program_prover_instance(program);
    auto verification_key = std::make_shared<Chonk::MegaVerificationKey>(prover_instance->get_precomputed());

    return { .bytes = to_buffer(*verification_key), .fields = verification_key->to_field_elements() };
}

ChonkComputeIvcVk::Response ChonkComputeIvcVk::execute(BB_UNUSED const BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    info("ChonkComputeIvcVk - deriving IVC VK for circuit '", circuit.name, "'");

    auto standalone_vk_response = bbapi::ChonkComputeStandaloneVk{
        .circuit{ .name = "standalone_circuit", .bytecode = std::move(circuit.bytecode) }
    }.execute();

    auto mega_vk = from_buffer<Chonk::MegaVerificationKey>(standalone_vk_response.bytes);
    Chonk::VerificationKey chonk_vk{ .mega = std::make_shared<Chonk::MegaVerificationKey>(mega_vk),
                                     .eccvm = std::make_shared<Chonk::ECCVMVerificationKey>(),
                                     .translator = std::make_shared<Chonk::TranslatorVerificationKey>() };
    Response response;
    response.bytes = to_buffer(chonk_vk);

    info("ChonkComputeIvcVk - IVC VK derived, size: ", response.bytes.size(), " bytes");

    return response;
}

ChonkCheckPrecomputedVk::Response ChonkCheckPrecomputedVk::execute([[maybe_unused]] const BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    acir_format::AcirProgram program{ acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode)),
                                      /*witness=*/{} };

    std::shared_ptr<Chonk::ProverInstance> prover_instance = get_acir_program_prover_instance(program);
    auto computed_vk = std::make_shared<Chonk::MegaVerificationKey>(prover_instance->get_precomputed());

    if (circuit.verification_key.empty()) {
        info("FAIL: Expected precomputed vk for function ", circuit.name);
        throw_or_abort("Missing precomputed VK");
    }

    // Deserialize directly from buffer
    auto precomputed_vk = from_buffer<std::shared_ptr<Chonk::MegaVerificationKey>>(circuit.verification_key);

    Response response;
    response.valid = true;
    if (*computed_vk != *precomputed_vk) {
        response.valid = false;
        response.actual_vk = to_buffer(computed_vk);
    }
    return response;
}

ChonkStats::Response ChonkStats::execute([[maybe_unused]] BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    Response response;

    const auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode));
    acir_format::AcirProgram program{ constraint_system };

    // Get IVC constraints if any
    const auto& ivc_constraints = constraint_system.hn_recursion_constraints;

    // Create metadata with appropriate IVC context
    acir_format::ProgramMetadata metadata{
        .ivc = ivc_constraints.empty() ? nullptr : acir_format::create_mock_chonk_from_constraints(ivc_constraints),
        .collect_gates_per_opcode = include_gates_per_opcode
    };

    // Create and finalize circuit
    auto builder = acir_format::create_circuit<MegaCircuitBuilder>(program, metadata);
    builder.finalize_circuit(/*ensure_nonzero=*/true);

    // Set response values
    response.acir_opcodes = program.constraints.num_acir_opcodes;
    response.circuit_size = static_cast<uint32_t>(builder.num_gates());

    // Optionally include gates per opcode
    if (include_gates_per_opcode) {
        response.gates_per_opcode = std::vector<uint32_t>(program.constraints.gates_per_opcode.begin(),
                                                          program.constraints.gates_per_opcode.end());
    }

    // Log circuit details
    info("ChonkStats - circuit: ",
         circuit.name,
         ", acir_opcodes: ",
         response.acir_opcodes,
         ", circuit_size: ",
         response.circuit_size);

    // Print execution trace details
    builder.blocks.summarize();

    return response;
}

} // namespace bb::bbapi
