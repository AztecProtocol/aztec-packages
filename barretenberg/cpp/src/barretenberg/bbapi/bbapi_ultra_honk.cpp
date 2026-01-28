#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/dsl/acir_proofs/honk_contract.hpp"
#include "barretenberg/dsl/acir_proofs/honk_optimized_contract.hpp"
#include "barretenberg/dsl/acir_proofs/honk_zk_contract.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#ifdef STARKNET_GARAGA_FLAVORS
#include "barretenberg/flavor/ultra_starknet_flavor.hpp"
#include "barretenberg/flavor/ultra_starknet_zk_flavor.hpp"
#endif

namespace bb::bbapi {

template <typename IO> acir_format::ProgramMetadata _create_program_metadata()
{
    return acir_format::ProgramMetadata{ .has_ipa_claim = IO::HasIPA };
}

template <typename Flavor, typename IO, typename Circuit = typename Flavor::CircuitBuilder>
Circuit _compute_circuit(std::vector<uint8_t>&& bytecode, std::vector<uint8_t>&& witness)
{
    const acir_format::ProgramMetadata metadata = _create_program_metadata<IO>();
    acir_format::AcirProgram program{ acir_format::circuit_buf_to_acir_format(std::move(bytecode)) };

    if (!witness.empty()) {
        program.witness = acir_format::witness_buf_to_witness_vector(std::move(witness));
    }
    return acir_format::create_circuit<Circuit>(program, metadata);
}

template <typename Flavor, typename IO>
std::shared_ptr<ProverInstance_<Flavor>> _compute_prover_instance(std::vector<uint8_t>&& bytecode,
                                                                  std::vector<uint8_t>&& witness)
{
    // Measure function time and debug print
    auto initial_time = std::chrono::high_resolution_clock::now();
    typename Flavor::CircuitBuilder builder = _compute_circuit<Flavor, IO>(std::move(bytecode), std::move(witness));
    auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(builder);
    auto final_time = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(final_time - initial_time);
    info("CircuitProve: Proving key computed in ", duration.count(), " ms");
    return prover_instance;
}
template <typename Flavor, typename IO>
CircuitProve::Response _prove(std::vector<uint8_t>&& bytecode,
                              std::vector<uint8_t>&& witness,
                              std::vector<uint8_t>&& vk_bytes)
{
    using Proof = typename Flavor::Transcript::Proof;
    using VerificationKey = typename Flavor::VerificationKey;

    auto prover_instance = _compute_prover_instance<Flavor, IO>(std::move(bytecode), std::move(witness));

    // Create or deserialize VK
    std::shared_ptr<VerificationKey> vk;
    if (vk_bytes.empty()) {
        info("WARNING: computing verification key while proving. Pass in a precomputed vk for better performance.");
        vk = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
    } else {
        vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vk_bytes));
    }

    // Construct proof
    UltraProver_<Flavor> prover{ prover_instance, vk };
    Proof full_proof = prover.construct_proof();

    // Compute where to split (inner public inputs vs everything else)
    size_t num_public_inputs = prover.prover_instance->num_public_inputs();
    BB_ASSERT_GTE(num_public_inputs, IO::PUBLIC_INPUTS_SIZE, "Public inputs should contain the expected IO structure.");
    size_t num_inner_public_inputs = num_public_inputs - IO::PUBLIC_INPUTS_SIZE;

    // Optimization: if vk not provided, include it in response
    CircuitComputeVk::Response vk_response;
    if (vk_bytes.empty()) {
        vk_response = { .bytes = to_buffer(*vk), .fields = vk_to_uint256_fields(*vk), .hash = to_buffer(vk->hash()) };
    }

    // Split proof: inner public inputs at front, rest is the "proof"
    return { .public_inputs =
                 std::vector<uint256_t>{ full_proof.begin(),
                                         full_proof.begin() + static_cast<std::ptrdiff_t>(num_inner_public_inputs) },
             .proof = std::vector<uint256_t>{ full_proof.begin() + static_cast<std::ptrdiff_t>(num_inner_public_inputs),
                                              full_proof.end() },
             .vk = std::move(vk_response) };
}

template <typename Flavor, typename IO>
bool _verify(const std::vector<uint8_t>& vk_bytes,
             const std::vector<uint256_t>& public_inputs,
             const std::vector<uint256_t>& proof)
{
    using VerificationKey = typename Flavor::VerificationKey;
    using VKAndHash = typename Flavor::VKAndHash;
    using Verifier = UltraVerifier_<Flavor, IO>;

    // Validate VK size upfront before deserialization
    const size_t expected_vk_size = VerificationKey::calc_num_data_types() * sizeof(bb::fr);
    if (vk_bytes.size() != expected_vk_size) {
        info(
            "Proof verification failed: invalid VK size. Expected ", expected_vk_size, " bytes, got ", vk_bytes.size());
        return false;
    }

    std::shared_ptr<VerificationKey> vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vk_bytes));
    auto vk_and_hash = std::make_shared<VKAndHash>(vk);

    // Concatenate public inputs and proof
    auto complete_proof = concatenate_proof<Flavor>(public_inputs, proof);

    Verifier verifier{ vk_and_hash };
    bool verified = verifier.verify_proof(complete_proof).result;

    if (verified) {
        info("Proof verified successfully");
    } else {
        info("Proof verification failed");
    }

    return verified;
}

CircuitProve::Response CircuitProve::execute(BB_UNUSED const BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    return dispatch_by_settings(settings, [&]<typename Flavor, typename IO>() {
        return _prove<Flavor, IO>(std::move(circuit.bytecode), std::move(witness), std::move(circuit.verification_key));
    });
}

CircuitComputeVk::Response CircuitComputeVk::execute(BB_UNUSED const BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    return dispatch_by_settings(settings, [&]<typename Flavor, typename IO>() {
        auto prover_instance = _compute_prover_instance<Flavor, IO>(std::move(circuit.bytecode), {});
        auto vk = std::make_shared<typename Flavor::VerificationKey>(prover_instance->get_precomputed());
        return CircuitComputeVk::Response{ .bytes = to_buffer(*vk),
                                           .fields = vk_to_uint256_fields(*vk),
                                           .hash = to_buffer(vk->hash()) };
    });
}

template <typename Flavor, typename IO>
CircuitStats::Response _stats(std::vector<uint8_t>&& bytecode, bool include_gates_per_opcode)
{
    using Circuit = typename Flavor::CircuitBuilder;
    // Parse the circuit to get gate count information
    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(bytecode));

    acir_format::ProgramMetadata metadata = _create_program_metadata<IO>();
    metadata.collect_gates_per_opcode = include_gates_per_opcode;
    CircuitStats::Response response;
    response.num_acir_opcodes = static_cast<uint32_t>(constraint_system.num_acir_opcodes);

    acir_format::AcirProgram program{ std::move(constraint_system) };
    auto builder = acir_format::create_circuit<Circuit>(program, metadata);
    builder.finalize_circuit(/*ensure_nonzero=*/true);

    response.num_gates = static_cast<uint32_t>(builder.get_finalized_total_circuit_size());
    response.num_gates_dyadic = static_cast<uint32_t>(builder.get_circuit_subgroup_size(response.num_gates));
    // note: will be empty if collect_gates_per_opcode is false
    response.gates_per_opcode = std::move(program.constraints.gates_per_opcode);

    return response;
}

CircuitStats::Response CircuitStats::execute(BB_UNUSED const BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    return dispatch_by_settings(settings, [&]<typename Flavor, typename IO>() {
        return _stats<Flavor, IO>(std::move(circuit.bytecode), include_gates_per_opcode);
    });
}

CircuitVerify::Response CircuitVerify::execute(BB_UNUSED const BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    bool verified = dispatch_by_settings(settings, [&]<typename Flavor, typename IO>() {
        return _verify<Flavor, IO>(verification_key, public_inputs, proof);
    });
    return { verified };
}

VkAsFields::Response VkAsFields::execute(BB_UNUSED const BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);

    using VK = UltraFlavor::VerificationKey;
    validate_vk_size<VK>(verification_key);

    // Standard UltraHonk flavors
    auto vk = from_buffer<VK>(verification_key);
    std::vector<bb::fr> fields;
    fields = vk.to_field_elements();

    return { std::move(fields) };
}

MegaVkAsFields::Response MegaVkAsFields::execute(BB_UNUSED const BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);

    using VK = MegaFlavor::VerificationKey;
    validate_vk_size<VK>(verification_key);

    // MegaFlavor for private function verification keys
    auto vk = from_buffer<VK>(verification_key);
    std::vector<bb::fr> fields;
    fields = vk.to_field_elements();

    return { std::move(fields) };
}

CircuitWriteSolidityVerifier::Response CircuitWriteSolidityVerifier::execute(BB_UNUSED const BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    using VK = UltraKeccakFlavor::VerificationKey;
    validate_vk_size<VK>(verification_key);

    auto vk = std::make_shared<VK>(from_buffer<VK>(verification_key));

    std::string contract = settings.disable_zk ? get_honk_solidity_verifier(vk) : get_honk_zk_solidity_verifier(vk);

// If in wasm, we dont include the optimized solidity verifier - due to its large bundle size
// This will run generate twice, but this should only be run before deployment and not frequently
#ifndef __wasm__
    if (settings.disable_zk && settings.optimized_solidity_verifier) {
        contract = get_optimized_honk_solidity_verifier(vk);
    }
#endif

    return { std::move(contract) };
}

} // namespace bb::bbapi
