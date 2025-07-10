#include "barretenberg/api/bbapi_ultra_honk.hpp"
#include "barretenberg/api/bbapi_shared.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/honk/types/aggregation_object_type.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include <iomanip>
#include <sstream>

namespace bb::bbapi {

CircuitProve::Response CircuitProve::execute(const BBApiRequest& request) &&
{
    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode));
    auto witness = acir_format::witness_buf_to_witness_data(std::move(this->witness));

    acir_format::AcirProgram program{ constraint_system, witness };

    // Determine honk recursion level based on settings
    uint32_t honk_recursion = settings.honk_recursion;
    if (honk_recursion == 0 && settings.recursive) {
        honk_recursion = 1; // Default to UltraHonk recursion
    }

    const acir_format::ProgramMetadata metadata{
        .honk_recursion = honk_recursion,
    };

    Response response;

    // Choose flavor based on settings
    if (settings.ipa_accumulation || honk_recursion == 2) {
        // UltraRollupFlavor for rollup circuits
        using Flavor = UltraRollupFlavor;
        auto builder = acir_format::create_circuit<Flavor::CircuitBuilder>(program, metadata);
        auto proving_key = std::make_shared<DeciderProvingKey_<Flavor>>(builder, request.trace_settings);

        // Load or compute VK
        std::shared_ptr<Flavor::VerificationKey> vk;
        if (!circuit.verification_key.empty()) {
            vk = from_buffer<std::shared_ptr<Flavor::VerificationKey>>(circuit.verification_key);
        } else {
            vk = std::make_shared<Flavor::VerificationKey>(proving_key->get_precomputed());
        }

        UltraProver_<Flavor> prover{ proving_key, vk };
        auto proof = prover.construct_proof();

        response.proof = proof;
        response.public_inputs = builder.get_public_inputs();
    } else {
        // Regular UltraFlavor
        using Flavor = UltraFlavor;
        auto builder = acir_format::create_circuit<Flavor::CircuitBuilder>(program, metadata);
        auto proving_key = std::make_shared<DeciderProvingKey_<Flavor>>(builder, request.trace_settings);

        // Load or compute VK
        std::shared_ptr<Flavor::VerificationKey> vk;
        if (!circuit.verification_key.empty()) {
            vk = from_buffer<std::shared_ptr<Flavor::VerificationKey>>(circuit.verification_key);
        } else {
            vk = std::make_shared<Flavor::VerificationKey>(proving_key->get_precomputed());
        }

        UltraProver_<Flavor> prover{ proving_key, vk };
        auto proof = prover.construct_proof();

        response.proof = proof;
        response.public_inputs = builder.get_public_inputs();
    }

    return response;
}

CircuitComputeVk::Response CircuitComputeVk::execute(const BBApiRequest& request) &&
{
    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode));
    acir_format::AcirProgram program{ constraint_system, /*witness=*/{} };

    // Determine honk recursion level based on settings
    uint32_t honk_recursion = settings.honk_recursion;
    if (honk_recursion == 0 && settings.recursive) {
        honk_recursion = 1; // Default to UltraHonk recursion
    }

    const acir_format::ProgramMetadata metadata{
        .honk_recursion = honk_recursion,
    };

    Response response;

    // Choose flavor based on settings
    if (settings.ipa_accumulation || honk_recursion == 2) {
        // UltraRollupFlavor for rollup circuits
        using Flavor = UltraRollupFlavor;
        auto builder = acir_format::create_circuit<Flavor::CircuitBuilder>(program, metadata);
        auto proving_key = std::make_shared<DeciderProvingKey_<Flavor>>(builder, request.trace_settings);
        auto verification_key = std::make_shared<Flavor::VerificationKey>(proving_key->get_precomputed());

        response.bytes = to_buffer(*verification_key);
    } else {
        // Regular UltraFlavor
        using Flavor = UltraFlavor;
        auto builder = acir_format::create_circuit<Flavor::CircuitBuilder>(program, metadata);
        auto proving_key = std::make_shared<DeciderProvingKey_<Flavor>>(builder, request.trace_settings);
        auto verification_key = std::make_shared<Flavor::VerificationKey>(proving_key->get_precomputed());

        response.bytes = to_buffer(*verification_key);
    }

    return response;
}

CircuitInfo::Response CircuitInfo::execute(BB_UNUSED const BBApiRequest& request) &&
{
    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode));
    acir_format::AcirProgram program{ constraint_system, /*witness=*/{} };

    const acir_format::ProgramMetadata metadata{
        .honk_recursion = settings.honk_recursion,
    };

    auto builder = acir_format::create_circuit<UltraCircuitBuilder>(program, metadata);

    Response response;
    response.total_gates = static_cast<uint32_t>(builder.get_num_finalized_gates());
    response.subgroup_size = static_cast<uint32_t>(builder.get_circuit_subgroup_size(response.total_gates));

    if (include_gates_per_opcode) {
        // TODO: Implement gate counting per opcode
        response.gates_per_opcode = {};
    }

    return response;
}

CircuitCheck::Response CircuitCheck::execute(BB_UNUSED const BBApiRequest& request) &&
{
    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode));
    auto witness = acir_format::witness_buf_to_witness_data(std::move(this->witness));

    acir_format::AcirProgram program{ constraint_system, witness };

    const acir_format::ProgramMetadata metadata{
        .honk_recursion = settings.honk_recursion,
    };

    auto builder = acir_format::create_circuit<UltraCircuitBuilder>(program, metadata);

    Response response;
    response.satisfied = CircuitChecker::check(builder);

    return response;
}

CircuitVerify::Response CircuitVerify::execute(BB_UNUSED const BBApiRequest& request) &&
{
    Response response;

    // Try UltraFlavor first
    try {
        auto vk = from_buffer<std::shared_ptr<UltraFlavor::VerificationKey>>(verification_key);
        UltraVerifier_<UltraFlavor> verifier(vk);
        response.verified = verifier.verify_proof(proof);
        return response;
    } catch (...) {
        // If that fails, try UltraRollupFlavor
        try {
            auto vk = from_buffer<std::shared_ptr<UltraRollupFlavor::VerificationKey>>(verification_key);
            UltraVerifier_<UltraRollupFlavor> verifier(vk);
            response.verified = verifier.verify_proof(proof);
            return response;
        } catch (...) {
            throw_or_abort("Failed to deserialize verification key");
        }
    }
}

ProofAsFields::Response ProofAsFields::execute(BB_UNUSED const BBApiRequest& request) &&
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

VkAsFields::Response VkAsFields::execute(BB_UNUSED const BBApiRequest& request) &&
{
    Response response;

    if (is_mega_honk) {
        auto vk = from_buffer<std::shared_ptr<MegaFlavor::VerificationKey>>(verification_key);
        response.fields = vk->to_field_elements();
    } else {
        // Try UltraFlavor first
        try {
            auto vk = from_buffer<std::shared_ptr<UltraFlavor::VerificationKey>>(verification_key);
            response.fields = vk->to_field_elements();
        } catch (...) {
            // If that fails, try UltraRollupFlavor
            auto vk = from_buffer<std::shared_ptr<UltraRollupFlavor::VerificationKey>>(verification_key);
            response.fields = vk->to_field_elements();
        }
    }

    return response;
}

CircuitWriteSolidityVerifier::Response CircuitWriteSolidityVerifier::execute(BB_UNUSED const BBApiRequest& request) &&
{
    throw_or_abort("CircuitWriteSolidityVerifier not implemented yet");
}

CircuitProveAndVerify::Response CircuitProveAndVerify::execute(const BBApiRequest& request) &&
{
    // First prove
    auto prove_result = CircuitProve{ circuit, witness, settings }.execute(request);

    // Then compute VK
    auto vk_result = CircuitComputeVk{ CircuitInputNoVK{ circuit.name, circuit.bytecode }, settings }.execute(request);

    // Then verify
    auto verify_result =
        CircuitVerify{ vk_result.bytes, prove_result.public_inputs, prove_result.proof, settings }.execute(request);

    return { .verified = verify_result.verified,
             .proof = prove_result.proof,
             .public_inputs = prove_result.public_inputs };
}

CircuitValidate::Response CircuitValidate::execute(BB_UNUSED const BBApiRequest& request) &&
{
    Response response;
    response.is_valid = true;
    response.validation_errors.clear();

    try {
        auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(circuit.bytecode));
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

CircuitBenchmark::Response CircuitBenchmark::execute(BB_UNUSED const BBApiRequest& request) &&
{
    throw_or_abort("CircuitBenchmark not implemented yet");
}

} // namespace bb::bbapi
