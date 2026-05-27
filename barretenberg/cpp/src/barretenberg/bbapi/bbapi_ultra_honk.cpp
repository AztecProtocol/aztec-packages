#include "barretenberg/bbapi/bbapi_handlers.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/bbapi_wire_convert.hpp"
#include "barretenberg/bbapi/generated/bb_types.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/dsl/acir_proofs/honk_contract.hpp"
#include "barretenberg/dsl/acir_proofs/honk_optimized_contract.hpp"
#include "barretenberg/dsl/acir_proofs/honk_zk_contract.hpp"
#include "barretenberg/dsl/acir_proofs/honk_zk_optimized_contract.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb::bbapi {

namespace {

template <typename IO> acir_format::ProgramMetadata _create_program_metadata()
{
    return acir_format::ProgramMetadata{ .has_ipa_claim = IO::HasIPA };
}

template <typename Flavor, typename IO, typename Circuit = typename Flavor::CircuitBuilder>
Circuit _compute_circuit(std::vector<uint8_t>&& bytecode, std::vector<uint8_t>&& witness)
{
    const acir_format::ProgramMetadata metadata = _create_program_metadata<IO>();
    acir_format::AcirProgram program{ acir_format::circuit_buf_to_acir_format(std::move(bytecode)), {} };
    if (!witness.empty()) {
        program.witness = acir_format::witness_buf_to_witness_vector(std::move(witness));
    }
    return acir_format::create_circuit<Circuit>(program, metadata);
}

template <typename Flavor, typename IO>
std::shared_ptr<ProverInstance_<Flavor>> _compute_prover_instance(std::vector<uint8_t>&& bytecode,
                                                                  std::vector<uint8_t>&& witness)
{
    auto initial_time = std::chrono::high_resolution_clock::now();
    typename Flavor::CircuitBuilder builder = _compute_circuit<Flavor, IO>(std::move(bytecode), std::move(witness));
    auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(builder);
    auto final_time = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(final_time - initial_time);
    info("CircuitProve: Proving key computed in ", duration.count(), " ms");

    if constexpr (IO::HasIPA) {
        BB_ASSERT(!prover_instance->ipa_proof.empty(),
                  "RollupIO circuit expected IPA proof but none was provided. "
                  "Ensure the circuit includes IPA accumulation data.");
    } else {
        BB_ASSERT(prover_instance->ipa_proof.empty(),
                  "Non-rollup circuit should not have IPA proof. "
                  "Use ipa_accumulation=true in settings for rollup circuits.");
    }
    return prover_instance;
}

template <typename Flavor, typename IO>
wire::CircuitProveResponse _prove(std::vector<uint8_t>&& bytecode,
                                  std::vector<uint8_t>&& witness,
                                  std::vector<uint8_t>&& vk_bytes)
{
    using Proof = typename Flavor::Transcript::Proof;
    using VerificationKey = typename Flavor::VerificationKey;

    auto prover_instance = _compute_prover_instance<Flavor, IO>(std::move(bytecode), std::move(witness));

    std::shared_ptr<VerificationKey> vk;
    if (vk_bytes.empty()) {
        info("WARNING: computing verification key while proving. Pass in a precomputed vk for better performance.");
        vk = std::make_shared<VerificationKey>(prover_instance->get_precomputed());
    } else {
        validate_vk_size<VerificationKey>(vk_bytes);
        vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vk_bytes));
    }

    UltraProver_<Flavor> prover{ prover_instance, vk };
    Proof full_proof = prover.construct_proof();

    size_t num_public_inputs = prover.num_public_inputs();
    BB_ASSERT_GTE(num_public_inputs, IO::PUBLIC_INPUTS_SIZE, "Public inputs should contain the expected IO structure.");
    size_t num_inner_public_inputs = num_public_inputs - IO::PUBLIC_INPUTS_SIZE;

    wire::CircuitComputeVkResponse vk_response;
    if (vk_bytes.empty()) {
        vk_response = { .bytes = to_buffer(*vk),
                        .fields = uint256_vec_to_wire(vk_to_uint256_fields(*vk)),
                        .hash = to_buffer(vk->hash()) };
    }

    std::vector<uint256_t> public_inputs{ full_proof.begin(),
                                          full_proof.begin() + static_cast<std::ptrdiff_t>(num_inner_public_inputs) };
    std::vector<uint256_t> proof{ full_proof.begin() + static_cast<std::ptrdiff_t>(num_inner_public_inputs),
                                  full_proof.end() };
    return { .public_inputs = uint256_vec_to_wire(public_inputs),
             .proof = uint256_vec_to_wire(proof),
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

    const size_t expected_vk_size = VerificationKey::calc_num_data_types() * sizeof(bb::fr);
    if (vk_bytes.size() != expected_vk_size) {
        info(
            "Proof verification failed: invalid VK size. Expected ", expected_vk_size, " bytes, got ", vk_bytes.size());
        return false;
    }

    std::shared_ptr<VerificationKey> vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vk_bytes));
    auto vk_and_hash = std::make_shared<VKAndHash>(vk);
    Verifier verifier{ vk_and_hash };

    const size_t log_n = verifier.compute_log_n();
    const size_t expected_size = ProofLength::Honk<Flavor>::template expected_proof_size<IO>(log_n);
    if (proof.size() != expected_size) {
        info("Proof verification failed: invalid proof size. Expected ", expected_size, ", got ", proof.size());
        return false;
    }

    auto complete_proof = concatenate_proof<Flavor>(public_inputs, proof);
    bool verified = verifier.verify_proof(complete_proof).result;
    if (verified) {
        info("Proof verified successfully");
    } else {
        info("Proof verification failed");
    }
    return verified;
}

template <typename Flavor, typename IO>
wire::CircuitInfoResponse _stats(std::vector<uint8_t>&& bytecode, bool include_gates_per_opcode)
{
    using Circuit = typename Flavor::CircuitBuilder;
    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(bytecode));

    acir_format::ProgramMetadata metadata = _create_program_metadata<IO>();
    metadata.collect_gates_per_opcode = include_gates_per_opcode;

    wire::CircuitInfoResponse response;
    response.num_acir_opcodes = static_cast<uint32_t>(constraint_system.num_acir_opcodes);

    acir_format::AcirProgram program{ std::move(constraint_system), {} };
    auto builder = acir_format::create_circuit<Circuit>(program, metadata);
    builder.finalize_circuit();

    response.num_gates = static_cast<uint32_t>(builder.get_finalized_total_circuit_size());
    response.num_gates_dyadic = static_cast<uint32_t>(builder.get_circuit_subgroup_size(response.num_gates));
    response.gates_per_opcode =
        std::vector<uint32_t>(program.constraints.gates_per_opcode.begin(), program.constraints.gates_per_opcode.end());
    return response;
}

} // namespace

wire::CircuitProveResponse handle_circuit_prove(BBApiRequest& /*ctx*/, wire::CircuitProve&& cmd)
{
    BB_BENCH_NAME("CircuitProve");
    return dispatch_by_settings(cmd.settings, [&]<typename Flavor, typename IO>() {
        return _prove<Flavor, IO>(
            std::move(cmd.circuit.bytecode), std::move(cmd.witness), std::move(cmd.circuit.verification_key));
    });
}

wire::CircuitComputeVkResponse handle_circuit_compute_vk(BBApiRequest& /*ctx*/, wire::CircuitComputeVk&& cmd)
{
    BB_BENCH_NAME("CircuitComputeVk");
    return dispatch_by_settings(cmd.settings, [&]<typename Flavor, typename IO>() {
        auto prover_instance = _compute_prover_instance<Flavor, IO>(std::move(cmd.circuit.bytecode), {});
        auto vk = std::make_shared<typename Flavor::VerificationKey>(prover_instance->get_precomputed());
        return wire::CircuitComputeVkResponse{ .bytes = to_buffer(*vk),
                                               .fields = uint256_vec_to_wire(vk_to_uint256_fields(*vk)),
                                               .hash = to_buffer(vk->hash()) };
    });
}

wire::CircuitInfoResponse handle_circuit_stats(BBApiRequest& /*ctx*/, wire::CircuitStats&& cmd)
{
    BB_BENCH_NAME("CircuitStats");
    return dispatch_by_settings(cmd.settings, [&]<typename Flavor, typename IO>() {
        return _stats<Flavor, IO>(std::move(cmd.circuit.bytecode), cmd.include_gates_per_opcode);
    });
}

wire::CircuitVerifyResponse handle_circuit_verify(BBApiRequest& /*ctx*/, wire::CircuitVerify&& cmd)
{
    BB_BENCH_NAME("CircuitVerify");
    auto pi_domain = uint256_vec_from_wire(cmd.public_inputs);
    auto proof_domain = uint256_vec_from_wire(cmd.proof);
    bool verified = dispatch_by_settings(cmd.settings, [&]<typename Flavor, typename IO>() {
        return _verify<Flavor, IO>(cmd.verification_key, pi_domain, proof_domain);
    });
    return { .verified = verified };
}

wire::VkAsFieldsResponse handle_vk_as_fields(BBApiRequest& /*ctx*/, wire::VkAsFields&& cmd)
{
    BB_BENCH_NAME("VkAsFields");
    using VK = UltraFlavor::VerificationKey;
    validate_vk_size<VK>(cmd.verification_key);
    auto vk = from_buffer<VK>(cmd.verification_key);
    return { .fields = fr_vec_to_wire(vk.to_field_elements()) };
}

wire::MegaVkAsFieldsResponse handle_mega_vk_as_fields(BBApiRequest& /*ctx*/, wire::MegaVkAsFields&& cmd)
{
    BB_BENCH_NAME("MegaVkAsFields");
    using VK = MegaFlavor::VerificationKey;
    validate_vk_size<VK>(cmd.verification_key);
    auto vk = from_buffer<VK>(cmd.verification_key);
    return { .fields = fr_vec_to_wire(vk.to_field_elements()) };
}

wire::CircuitWriteSolidityVerifierResponse handle_circuit_write_solidity_verifier(
    BBApiRequest& /*ctx*/, wire::CircuitWriteSolidityVerifier&& cmd)
{
    BB_BENCH_NAME("CircuitWriteSolidityVerifier");
    using VK = UltraKeccakFlavor::VerificationKey;
    validate_vk_size<VK>(cmd.verification_key);
    auto vk = std::make_shared<VK>(from_buffer<VK>(cmd.verification_key));

    std::string contract = cmd.settings.disable_zk ? get_honk_solidity_verifier(vk) : get_honk_zk_solidity_verifier(vk);
#ifndef __wasm__
    if (cmd.settings.optimized_solidity_verifier) {
        contract = cmd.settings.disable_zk ? get_optimized_honk_solidity_verifier(vk)
                                           : get_optimized_honk_zk_solidity_verifier(vk);
    }
#endif
    return { .solidity_code = std::move(contract) };
}

} // namespace bb::bbapi
