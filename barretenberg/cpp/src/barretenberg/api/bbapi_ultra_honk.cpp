#include "barretenberg/api/bbapi_ultra_honk.hpp"
#include "barretenberg/api/bbapi_shared.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/honk/proof_system/ultra_prover.hpp"
#include "barretenberg/honk/proof_system/ultra_verifier.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/mega_composer.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"
#include <iomanip>
#include <sstream>

namespace bb::bbapi {

// Helper functions for format conversions
static std::string bytes_to_hex(const std::vector<uint8_t>& bytes)
{
    std::stringstream ss;
    ss << std::hex << std::setfill('0');
    for (uint8_t b : bytes) {
        ss << std::setw(2) << static_cast<int>(b);
    }
    return ss.str();
}

static std::string bytes_to_base64(const std::vector<uint8_t>& bytes)
{
    // TODO: Implement base64 encoding
    throw_or_abort("Base64 encoding not implemented");
}

CircuitProve::Response CircuitProve::execute(const BBApiRequest& request) const
{
    auto constraint_system = acir_format::circuit_buf_to_acir_format(circuit.bytecode);
    auto witness = acir_format::witness_buf_to_witness_data(this->witness);

    acir_format::AcirProgram program{ constraint_system, witness };
    auto builder = acir_format::create_circuit<UltraCircuitBuilder>(program, /*metadata=*/{});

    auto composer = UltraComposer();
    auto prover = composer.create_prover(builder);
    auto proof = prover.construct_proof();

    Response response;
    response.proof = proof;
    response.public_inputs = builder.get_public_inputs();

    return response;
}

CircuitComputeVk::Response CircuitComputeVk::execute(const BBApiRequest& request) const
{
    auto constraint_system = acir_format::circuit_buf_to_acir_format(circuit.bytecode);
    acir_format::AcirProgram program{ constraint_system, /*witness=*/{} };

    auto builder = acir_format::create_circuit<UltraCircuitBuilder>(program, /*metadata=*/{});
    auto composer = UltraComposer();
    auto proving_key = composer.compute_proving_key(builder);
    auto verification_key = composer.compute_verification_key(proving_key);

    Response response;
    response.bytes = to_buffer(*verification_key);

    return response;
}

CircuitComputeIvcVk::Response CircuitComputeIvcVk::execute(const BBApiRequest& request) const
{
    throw_or_abort("CircuitComputeIvcVk not implemented yet");
}

CircuitInfo::Response CircuitInfo::execute(const BBApiRequest& request) const
{
    auto constraint_system = acir_format::circuit_buf_to_acir_format(circuit.bytecode);
    acir_format::AcirProgram program{ constraint_system, /*witness=*/{} };

    auto builder = acir_format::create_circuit<UltraCircuitBuilder>(program, /*metadata=*/{});

    Response response;
    response.total_gates = static_cast<uint32_t>(builder.get_num_gates());
    response.subgroup_size = static_cast<uint32_t>(builder.get_circuit_subgroup_size());

    if (include_gates_per_opcode) {
        // TODO: Implement gate counting per opcode
        response.gates_per_opcode = {};
    }

    return response;
}

CircuitCheck::Response CircuitCheck::execute(const BBApiRequest& request) const
{
    auto constraint_system = acir_format::circuit_buf_to_acir_format(circuit.bytecode);
    auto witness = acir_format::witness_buf_to_witness_data(this->witness);

    acir_format::AcirProgram program{ constraint_system, witness };
    auto builder = acir_format::create_circuit<UltraCircuitBuilder>(program, /*metadata=*/{});

    Response response;
    response.satisfied = builder.check_circuit();

    return response;
}

CircuitVerify::Response CircuitVerify::execute(const BBApiRequest& request) const
{
    auto vk = from_buffer<std::shared_ptr<UltraFlavor::VerificationKey>>(verification_key);

    UltraVerifier verifier(vk);
    bool verified = verifier.verify_proof(proof);

    Response response;
    response.verified = verified;

    return response;
}

ProofAsFields::Response ProofAsFields::execute(const BBApiRequest& request) const
{
    Response response;

    // Convert proof bytes to field elements
    size_t num_fields = proof.size() / sizeof(bb::fr);
    response.fields.reserve(num_fields);

    const auto* data = reinterpret_cast<const bb::fr*>(proof.data());
    for (size_t i = 0; i < num_fields; ++i) {
        response.fields.push_back(data[i]);
    }

    return response;
}

VkAsFields::Response VkAsFields::execute(const BBApiRequest& request) const
{
    Response response;

    if (is_mega_honk) {
        auto vk = from_buffer<std::shared_ptr<MegaFlavor::VerificationKey>>(verification_key);
        response.fields = vk->to_field_elements();
    } else {
        auto vk = from_buffer<std::shared_ptr<UltraFlavor::VerificationKey>>(verification_key);
        response.fields = vk->to_field_elements();
    }

    return response;
}

CircuitWriteSolidityVerifier::Response CircuitWriteSolidityVerifier::execute(const BBApiRequest& request) const
{
    throw_or_abort("CircuitWriteSolidityVerifier not implemented yet");
}

CircuitProveAndVerify::Response CircuitProveAndVerify::execute(const BBApiRequest& request) const
{
    // First prove
    auto prove_result = CircuitProve{ circuit, witness, settings }.execute(request);

    // Then compute VK
    auto vk_result = CircuitComputeVk{ CircuitInputNoVK{ circuit.name, circuit.bytecode }, settings }.execute(request);

    // Then verify
    auto verify_result =
        CircuitVerify{ vk_result.bytes, prove_result.public_inputs, prove_result.proof, settings }.execute(request);

    Response response;
    response.verified = verify_result.verified;
    response.proof = prove_result.proof;
    response.public_inputs = prove_result.public_inputs;

    return response;
}

CircuitWriteBytecode::Response CircuitWriteBytecode::execute(const BBApiRequest& request) const
{
    Response response;
    response.bytecode = circuit.bytecode;

    if (format == "hex") {
        response.formatted_output = bytes_to_hex(circuit.bytecode);
    } else if (format == "base64") {
        response.formatted_output = bytes_to_base64(circuit.bytecode);
    }

    return response;
}

CircuitValidate::Response CircuitValidate::execute(const BBApiRequest& request) const
{
    Response response;
    response.is_valid = true;
    response.validation_errors.clear();

    try {
        auto constraint_system = acir_format::circuit_buf_to_acir_format(circuit.bytecode);
        // Basic validation passed if we can parse it

        if (check_recursive_structure) {
            // TODO: Add recursive structure validation
        }
    } catch (const std::exception& e) {
        response.is_valid = false;
        response.validation_errors.push_back(e.what());
    }

    return response;
}

CircuitBenchmark::Response CircuitBenchmark::execute(const BBApiRequest& request) const
{
    throw_or_abort("CircuitBenchmark not implemented yet");
}

} // namespace bb::bbapi