#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/dsl/acir_proofs/honk_contract.hpp"
#include "barretenberg/dsl/acir_proofs/honk_optimized_contract.hpp"
#include "barretenberg/dsl/acir_proofs/honk_zk_contract.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include <type_traits>
#ifdef STARKNET_GARAGA_FLAVORS
#include "barretenberg/flavor/ultra_starknet_flavor.hpp"
#include "barretenberg/flavor/ultra_starknet_zk_flavor.hpp"
#endif
#include <iomanip>
#include <sstream>

namespace bb::bbapi {

template <typename Flavor> acir_format::ProgramMetadata _create_program_metadata()
{
    uint32_t honk_recursion = 0;

    if constexpr (IsAnyOf<Flavor, UltraFlavor, UltraZKFlavor, UltraKeccakFlavor, UltraKeccakZKFlavor>) {
        honk_recursion = 1;
    } else if constexpr (IsAnyOf<Flavor, UltraRollupFlavor>) {
        honk_recursion = 2;
    }
#ifdef STARKNET_GARAGA_FLAVORS
    if constexpr (IsAnyOf<Flavor, UltraStarknetFlavor, UltraStarknetZKFlavor>) {
        honk_recursion = 1;
    }
#endif

    return acir_format::ProgramMetadata{ .honk_recursion = honk_recursion };
}

template <typename Flavor, typename Circuit = typename Flavor::CircuitBuilder>
Circuit _compute_circuit(std::vector<uint8_t>&& bytecode, std::vector<uint8_t>&& witness)
{
    const acir_format::ProgramMetadata metadata = _create_program_metadata<Flavor>();
    acir_format::AcirProgram program{ acir_format::circuit_buf_to_acir_format(std::move(bytecode)) };

    if (!witness.empty()) {
        program.witness = acir_format::witness_buf_to_witness_data(std::move(witness));
    }
    return acir_format::create_circuit<Circuit>(program, metadata);
}

template <typename Flavor>
std::shared_ptr<ProverInstance_<Flavor>> _compute_prover_instance(std::vector<uint8_t>&& bytecode,
                                                                  std::vector<uint8_t>&& witness)
{
    // Measure function time and debug print
    auto initial_time = std::chrono::high_resolution_clock::now();
    typename Flavor::CircuitBuilder builder = _compute_circuit<Flavor>(std::move(bytecode), std::move(witness));
    auto prover_instance = std::make_shared<ProverInstance_<Flavor>>(builder);
    auto final_time = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(final_time - initial_time);
    info("CircuitProve: Proving key computed in ", duration.count(), " ms");
    return prover_instance;
}
template <typename Flavor>
CircuitProve::Response _prove(std::vector<uint8_t>&& bytecode,
                              std::vector<uint8_t>&& witness,
                              std::vector<uint8_t>&& vk_bytes)
{
    using Proof = typename Flavor::Transcript::Proof;

    auto prover_instance = _compute_prover_instance<Flavor>(std::move(bytecode), std::move(witness));
    std::shared_ptr<typename Flavor::VerificationKey> vk;
    if (vk_bytes.empty()) {
        info("WARNING: computing verification key while proving. Pass in a precomputed vk for better performance.");
        vk = std::make_shared<typename Flavor::VerificationKey>(prover_instance->get_precomputed());
    } else {
        vk =
            std::make_shared<typename Flavor::VerificationKey>(from_buffer<typename Flavor::VerificationKey>(vk_bytes));
    }

    UltraProver_<Flavor> prover{ prover_instance, vk };

    Proof concat_pi_and_proof = prover.construct_proof();
    // Compute number of inner public inputs. Perform loose checks that the public inputs contain enough data.
    auto num_inner_public_inputs = [&]() {
        size_t num_public_inputs = prover.prover_instance->num_public_inputs();
        if constexpr (HasIPAAccumulator<Flavor>) {
            BB_ASSERT_GTE(num_public_inputs,
                          RollupIO::PUBLIC_INPUTS_SIZE,
                          "Public inputs should contain a pairing point accumulator and an IPA claim.");
            return num_public_inputs - RollupIO::PUBLIC_INPUTS_SIZE;
        } else {
            BB_ASSERT_GTE(num_public_inputs,
                          DefaultIO::PUBLIC_INPUTS_SIZE,
                          "Public inputs should contain a pairing point accumulator.");
            return num_public_inputs - DefaultIO::PUBLIC_INPUTS_SIZE;
        }
    }();
    CircuitComputeVk::Response vk_response;
    // Optimization over calling CircuitComputeVk separately - if vk not provided, we write it.
    if (vk_bytes.empty()) {
        auto vk_fields_direct = vk->to_field_elements();
        std::vector<uint256_t> vk_fields;
        // Handle discrepancy in type of 'to_field_elements'
        if constexpr (std::is_same_v<decltype(vk_fields_direct), std::vector<uint256_t>>) {
            vk_fields = std::move(vk_fields_direct);
        } else {
            vk_fields = std::vector<uint256_t>(vk_fields_direct.begin(), vk_fields_direct.end());
        }
        vk_response = { .bytes = vk_bytes.empty() ? to_buffer(vk) : vk_bytes,
                        .fields = std::move(vk_fields),
                        .hash = to_buffer(vk->hash()) };
    }

    // We split the inner public inputs, which are stored at the front of the proof, from the rest of the proof. Now,
    // the "proof" refers to everything except the inner public inputs.
    return { .public_inputs = std::vector<uint256_t>{ concat_pi_and_proof.begin(),
                                                      concat_pi_and_proof.begin() +
                                                          static_cast<std::ptrdiff_t>(num_inner_public_inputs) },
             .proof = std::vector<uint256_t>{ concat_pi_and_proof.begin() +
                                                  static_cast<std::ptrdiff_t>(num_inner_public_inputs),
                                              concat_pi_and_proof.end() },
             .vk = std::move(vk_response) };
}

template <typename Flavor>
bool _verify(const bool ipa_accumulation,
             const std::vector<uint8_t>& vk_bytes,
             const std::vector<uint256_t>& public_inputs,
             const std::vector<uint256_t>& proof)
{
    using VerificationKey = typename Flavor::VerificationKey;
    using Verifier = UltraVerifier_<Flavor>;
    using Transcript = typename Flavor::Transcript;
    using DataType = typename Transcript::DataType;
    using Proof = typename Transcript::Proof;

    std::shared_ptr<VerificationKey> vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vk_bytes));

    // concatenate public inputs and proof
    std::vector<DataType> complete_proof;
    complete_proof.reserve(public_inputs.size() + proof.size());
    complete_proof.insert(complete_proof.end(), public_inputs.begin(), public_inputs.end());
    complete_proof.insert(complete_proof.end(), proof.begin(), proof.end());

    VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key;
    if constexpr (HasIPAAccumulator<Flavor>) {
        if (ipa_accumulation) {
            ipa_verification_key = VerifierCommitmentKey<curve::Grumpkin>(1 << CONST_ECCVM_LOG_N);
        }
    }

    Verifier verifier{ vk, ipa_verification_key };

    bool verified = false;
    if constexpr (HasIPAAccumulator<Flavor>) {
        const size_t HONK_PROOF_LENGTH = Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS() - IPA_PROOF_LENGTH;
        const size_t num_public_inputs = static_cast<size_t>(vk->num_public_inputs);
        // The extra calculation is for the IPA proof length.
        BB_ASSERT_EQ(complete_proof.size(),
                     HONK_PROOF_LENGTH + IPA_PROOF_LENGTH + num_public_inputs,
                     "Honk proof has incorrect length while verifying.");
        const std::ptrdiff_t honk_proof_with_pub_inputs_length =
            static_cast<std::ptrdiff_t>(HONK_PROOF_LENGTH + num_public_inputs);
        auto ipa_proof = Proof(complete_proof.begin() + honk_proof_with_pub_inputs_length, complete_proof.end());
        auto honk_proof = Proof(complete_proof.begin(), complete_proof.begin() + honk_proof_with_pub_inputs_length);
        verified = verifier.template verify_proof<RollupIO>(complete_proof, ipa_proof).result;
    } else {
        verified = verifier.template verify_proof<DefaultIO>(complete_proof).result;
    }

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
    // if the ipa accumulation flag is set we are using the UltraRollupFlavor
    if (settings.ipa_accumulation) {
        return _prove<UltraRollupFlavor>(
            std::move(circuit.bytecode), std::move(witness), std::move(circuit.verification_key));
    }
    if (settings.oracle_hash_type == "poseidon2" && !settings.disable_zk) {
        // if we are not disabling ZK and the oracle hash type is poseidon2, we are using the UltraZKFlavor
        return _prove<UltraZKFlavor>(
            std::move(circuit.bytecode), std::move(witness), std::move(circuit.verification_key));
    }
    if (settings.oracle_hash_type == "poseidon2" && settings.disable_zk) {
        // if we are disabling ZK and the oracle hash type is poseidon2, we are using the UltraFlavor
        return _prove<UltraFlavor>(
            std::move(circuit.bytecode), std::move(witness), std::move(circuit.verification_key));
    }
    if (settings.oracle_hash_type == "keccak" && !settings.disable_zk) {
        // if we are not disabling ZK and the oracle hash type is keccak, we are using the UltraKeccakZKFlavor
        return _prove<UltraKeccakZKFlavor>(
            std::move(circuit.bytecode), std::move(witness), std::move(circuit.verification_key));
    }
    if (settings.oracle_hash_type == "keccak" && settings.disable_zk) {
        return _prove<UltraKeccakFlavor>(
            std::move(circuit.bytecode), std::move(witness), std::move(circuit.verification_key));
#ifdef STARKNET_GARAGA_FLAVORS
    }
    if (settings.oracle_hash_type == "starknet" && settings.disable_zk) {
        return _prove<UltraStarknetFlavor>(
            std::move(circuit.bytecode), std::move(witness), std::move(circuit.verification_key()));
    }
    if (settings.oracle_hash_type == "starknet" && !settings.disable_zk) {
        return _prove<UltraStarknetZKFlavor>(
            std::move(circuit.bytecode), std::move(witness), std::move(circuit.verification_key()));
#endif
    }
    throw_or_abort("Invalid proving options specified in CircuitProve!");
}

CircuitComputeVk::Response CircuitComputeVk::execute(BB_UNUSED const BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    std::vector<uint8_t> vk_bytes;
    std::vector<uint256_t> vk_fields;
    std::vector<uint8_t> vk_hash_bytes;

    // Helper lambda to compute VK, fields, and hash for a given flavor
    auto compute_vk_and_fields = [&]<typename Flavor>() {
        auto prover_instance = _compute_prover_instance<Flavor>(std::move(circuit.bytecode), {});
        auto vk = std::make_shared<typename Flavor::VerificationKey>(prover_instance->get_precomputed());
        vk_bytes = to_buffer(*vk);
        if constexpr (IsAnyOf<Flavor, UltraKeccakFlavor, UltraKeccakZKFlavor>) {
            vk_fields = vk->to_field_elements();
        } else {
            // For other flavors, we use field elements
            auto uint256_elements = vk->to_field_elements();
            vk_fields.reserve(uint256_elements.size());
            vk_fields.insert(vk_fields.end(), uint256_elements.begin(), uint256_elements.end());
        }
        vk_hash_bytes = to_buffer(vk->hash());
    };

    if (settings.ipa_accumulation) {
        compute_vk_and_fields.template operator()<UltraRollupFlavor>();
    } else if (settings.oracle_hash_type == "poseidon2" && !settings.disable_zk) {
        compute_vk_and_fields.template operator()<UltraZKFlavor>();
    } else if (settings.oracle_hash_type == "poseidon2" && settings.disable_zk) {
        compute_vk_and_fields.template operator()<UltraFlavor>();
    } else if (settings.oracle_hash_type == "keccak" && !settings.disable_zk) {
        compute_vk_and_fields.template operator()<UltraKeccakZKFlavor>();
    } else if (settings.oracle_hash_type == "keccak" && settings.disable_zk) {
        compute_vk_and_fields.template operator()<UltraKeccakFlavor>();
#ifdef STARKNET_GARAGA_FLAVORS
    } else if (settings.oracle_hash_type == "starknet" && !settings.disable_zk) {
        compute_vk_and_fields.template operator()<UltraStarknetZKFlavor>();
    } else if (settings.oracle_hash_type == "starknet" && settings.disable_zk) {
        compute_vk_and_fields.template operator()<UltraStarknetFlavor>();
#endif
    } else {
        throw_or_abort("invalid proof type in _write_vk");
    }

    return { .bytes = std::move(vk_bytes), .fields = std::move(vk_fields), .hash = std::move(vk_hash_bytes) };
}

template <typename Flavor, typename Circuit = typename Flavor::CircuitBuilder>
CircuitStats::Response _stats(std::vector<uint8_t>&& bytecode, bool include_gates_per_opcode)
{
    // Parse the circuit to get gate count information
    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::move(bytecode));

    acir_format::ProgramMetadata metadata = _create_program_metadata<Flavor>();
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
    // if the ipa accumulation flag is set we are using the UltraRollupFlavor
    if (settings.ipa_accumulation) {
        return _stats<UltraRollupFlavor>(std::move(circuit.bytecode), include_gates_per_opcode);
    }
    if (settings.oracle_hash_type == "poseidon2" && !settings.disable_zk) {
        // if we are not disabling ZK and the oracle hash type is poseidon2, we are using the UltraZKFlavor
        return _stats<UltraZKFlavor>(std::move(circuit.bytecode), include_gates_per_opcode);
    }
    if (settings.oracle_hash_type == "poseidon2" && settings.disable_zk) {
        // if we are disabling ZK and the oracle hash type is poseidon2, we are using the UltraFlavor
        return _stats<UltraFlavor>(std::move(circuit.bytecode), include_gates_per_opcode);
    }
    if (settings.oracle_hash_type == "keccak" && !settings.disable_zk) {
        // if we are not disabling ZK and the oracle hash type is keccak, we are using the UltraKeccakZKFlavor
        return _stats<UltraKeccakZKFlavor>(std::move(circuit.bytecode), include_gates_per_opcode);
    }
    if (settings.oracle_hash_type == "keccak" && settings.disable_zk) {
        return _stats<UltraKeccakFlavor>(std::move(circuit.bytecode), include_gates_per_opcode);
#ifdef STARKNET_GARAGA_FLAVORS
    }
    if (settings.oracle_hash_type == "starknet" && settings.disable_zk) {
        return _stats<UltraStarknetFlavor>(std::move(circuit.bytecode), include_gates_per_opcode);
    }
    if (settings.oracle_hash_type == "starknet" && !settings.disable_zk) {
        return _stats<UltraStarknetZKFlavor>(std::move(circuit.bytecode), include_gates_per_opcode);
#endif
    }
    throw_or_abort("Invalid proving options specified in CircuitStats!");
}

CircuitVerify::Response CircuitVerify::execute(BB_UNUSED const BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    const bool ipa_accumulation = settings.ipa_accumulation;
    bool verified = false;

    // if the ipa accumulation flag is set we are using the UltraRollupFlavor
    if (ipa_accumulation) {
        verified = _verify<UltraRollupFlavor>(ipa_accumulation, verification_key, public_inputs, proof);
    } else if (settings.oracle_hash_type == "poseidon2" && !settings.disable_zk) {
        verified = _verify<UltraZKFlavor>(ipa_accumulation, verification_key, public_inputs, proof);
    } else if (settings.oracle_hash_type == "poseidon2" && settings.disable_zk) {
        verified = _verify<UltraFlavor>(ipa_accumulation, verification_key, public_inputs, proof);
    } else if (settings.oracle_hash_type == "keccak" && !settings.disable_zk) {
        verified = _verify<UltraKeccakZKFlavor>(ipa_accumulation, verification_key, public_inputs, proof);
    } else if (settings.oracle_hash_type == "keccak" && settings.disable_zk) {
        verified = _verify<UltraKeccakFlavor>(ipa_accumulation, verification_key, public_inputs, proof);
#ifdef STARKNET_GARAGA_FLAVORS
    } else if (settings.oracle_hash_type == "starknet" && !settings.disable_zk) {
        verified = _verify<UltraStarknetZKFlavor>(ipa_accumulation, verification_key, public_inputs, proof);
    } else if (settings.oracle_hash_type == "starknet" && settings.disable_zk) {
        verified = _verify<UltraStarknetFlavor>(ipa_accumulation, verification_key, public_inputs, proof);
#endif
    } else {
        throw_or_abort("invalid proof type in _verify");
    }

    return { verified };
}

VkAsFields::Response VkAsFields::execute(BB_UNUSED const BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    std::vector<bb::fr> fields;

    // Standard UltraHonk flavors
    auto vk = from_buffer<UltraFlavor::VerificationKey>(verification_key);
    fields = vk.to_field_elements();

    return { std::move(fields) };
}

CircuitWriteSolidityVerifier::Response CircuitWriteSolidityVerifier::execute(BB_UNUSED const BBApiRequest& request) &&
{
    BB_BENCH_NAME(MSGPACK_SCHEMA_NAME);
    using VK = UltraKeccakFlavor::VerificationKey;
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
