#include "barretenberg/bbapi/bbapi_ultra_honk.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/dsl/acir_format/serde/witness_stack.hpp"
#include "barretenberg/dsl/acir_proofs/honk_contract.hpp"
#include "barretenberg/dsl/acir_proofs/honk_zk_contract.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"
#include "barretenberg/honk/types/aggregation_object_type.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"
#include <cstdint>
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
Circuit _compute_circuit(const std::vector<uint8_t>& bytecode, const std::vector<uint8_t>& witness)
{
    const acir_format::ProgramMetadata metadata = _create_program_metadata<Flavor>();
    acir_format::AcirProgram program{ acir_format::circuit_buf_to_acir_format(std::vector<uint8_t>(bytecode)) };

    if (!witness.empty()) {
        program.witness = acir_format::witness_buf_to_witness_data(std::vector<uint8_t>(witness));
    }
    return acir_format::create_circuit<Circuit>(program, metadata);
}

template <typename Flavor>
std::shared_ptr<DeciderProvingKey_<Flavor>> _compute_proving_key(const std::vector<uint8_t>& bytecode,
                                                                 const std::vector<uint8_t>& witness)
{
    typename Flavor::CircuitBuilder builder = _compute_circuit<Flavor>(bytecode, witness);
    auto decider_proving_key = std::make_shared<DeciderProvingKey_<Flavor>>(builder);
    return decider_proving_key;
}

template <typename Flavor> std::vector<uint8_t> _compute_vk(const std::vector<uint8_t>& bytecode)
{
    auto proving_key = _compute_proving_key<Flavor>(bytecode, {});
    auto vk = std::make_shared<typename Flavor::VerificationKey>(proving_key->get_precomputed());
    return to_buffer(*vk);
}

template <typename Flavor>
CircuitProve::Response _prove(std::vector<uint8_t>&& bytecode,
                              std::vector<uint8_t>&& witness,
                              std::vector<uint8_t>&& vk_bytes)
{
    auto proving_key = _compute_proving_key<Flavor>(bytecode, witness);
    std::shared_ptr<typename Flavor::VerificationKey> vk;
    if (vk_bytes.empty()) {
        info("WARNING: computing verification key while proving. Pass in a precomputed vk for better performance.");
        vk = std::make_shared<typename Flavor::VerificationKey>(proving_key->get_precomputed());
    } else {
        // Deserialize directly from buffer
        vk = from_buffer<std::shared_ptr<typename Flavor::VerificationKey>>(vk_bytes);
    }

    UltraProver_<Flavor> prover{ proving_key, vk };

    HonkProof concat_pi_and_proof = prover.construct_proof();
    size_t num_inner_public_inputs = prover.proving_key->num_public_inputs();
    // Loose check that the public inputs contain a pairing point accumulator, doesn't catch everything.
    BB_ASSERT_GTE(prover.proving_key->num_public_inputs(),
                  PAIRING_POINTS_SIZE,
                  "Public inputs should contain a pairing point accumulator.");
    num_inner_public_inputs -= PAIRING_POINTS_SIZE;
    if constexpr (HasIPAAccumulator<Flavor>) {
        BB_ASSERT_GTE(num_inner_public_inputs, IPA_CLAIM_SIZE, "Public inputs should contain an IPA claim.");
        num_inner_public_inputs -= IPA_CLAIM_SIZE;
    }
    // We split the inner public inputs, which are stored at the front of the proof, from the rest of the proof. Now,
    // the "proof" refers to everything except the inner public inputs.
    return { PublicInputsVector(concat_pi_and_proof.begin(),
                                concat_pi_and_proof.begin() + static_cast<std::ptrdiff_t>(num_inner_public_inputs)),
             HonkProof(concat_pi_and_proof.begin() + static_cast<std::ptrdiff_t>(num_inner_public_inputs),
                       concat_pi_and_proof.end()) };
}

template <typename Flavor>
bool _verify(const bool ipa_accumulation,
             const std::vector<uint8_t>& vk_bytes,
             const PublicInputsVector& public_inputs,
             const HonkProof& proof)
{
    using VerificationKey = typename Flavor::VerificationKey;
    using Verifier = UltraVerifier_<Flavor>;

    // Deserialize directly from buffer
    auto vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vk_bytes));

    // concatenate public inputs and proof
    std::vector<fr> complete_proof = public_inputs;
    complete_proof.insert(complete_proof.end(), proof.begin(), proof.end());

    VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key;
    if (ipa_accumulation) {
        ipa_verification_key = VerifierCommitmentKey<curve::Grumpkin>(1 << CONST_ECCVM_LOG_N);
    }

    Verifier verifier{ vk, ipa_verification_key };

    bool verified;
    if (ipa_accumulation) {
        const size_t HONK_PROOF_LENGTH = Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS - IPA_PROOF_LENGTH;
        const size_t num_public_inputs = static_cast<size_t>(vk->num_public_inputs);
        // The extra calculation is for the IPA proof length.
        BB_ASSERT_EQ(complete_proof.size(),
                     HONK_PROOF_LENGTH + IPA_PROOF_LENGTH + num_public_inputs,
                     "Honk proof has incorrect length while verifying.");
        const std::ptrdiff_t honk_proof_with_pub_inputs_length =
            static_cast<std::ptrdiff_t>(HONK_PROOF_LENGTH + num_public_inputs);
        auto ipa_proof = HonkProof(complete_proof.begin() + honk_proof_with_pub_inputs_length, complete_proof.end());
        auto tube_honk_proof =
            HonkProof(complete_proof.begin(), complete_proof.begin() + honk_proof_with_pub_inputs_length);
        verified = verifier.verify_proof(complete_proof, ipa_proof);
    } else {
        verified = verifier.verify_proof(complete_proof);
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
    std::vector<uint8_t> vk_bytes;
    std::vector<uint8_t> vk_hash_bytes;

    // Helper lambda to compute VK and hash for a given flavor
    auto compute_vk = [&]<typename Flavor>() {
        auto proving_key = _compute_proving_key<Flavor>(circuit.bytecode, {});
        auto vk = std::make_shared<typename Flavor::VerificationKey>(proving_key->get_precomputed());
        vk_bytes = to_buffer(vk);
        vk_hash_bytes = to_buffer(vk->hash());
    };

    if (settings.ipa_accumulation) {
        compute_vk.template operator()<UltraRollupFlavor>();
    } else if (settings.oracle_hash_type == "poseidon2" && !settings.disable_zk) {
        compute_vk.template operator()<UltraZKFlavor>();
    } else if (settings.oracle_hash_type == "poseidon2" && settings.disable_zk) {
        compute_vk.template operator()<UltraFlavor>();
    } else if (settings.oracle_hash_type == "keccak" && !settings.disable_zk) {
        compute_vk.template operator()<UltraKeccakZKFlavor>();
    } else if (settings.oracle_hash_type == "keccak" && settings.disable_zk) {
        compute_vk.template operator()<UltraKeccakFlavor>();
#ifdef STARKNET_GARAGA_FLAVORS
    } else if (settings.oracle_hash_type == "starknet" && !settings.disable_zk) {
        compute_vk.template operator()<UltraStarknetZKFlavor>();
    } else if (settings.oracle_hash_type == "starknet" && settings.disable_zk) {
        compute_vk.template operator()<UltraStarknetFlavor>();
#endif
    } else {
        throw_or_abort("invalid proof type in _write_vk");
    }

    return { .bytes = std::move(vk_bytes), .hash = std::move(vk_hash_bytes) };
}

CircuitGates::Response CircuitGates::execute(BB_UNUSED const BBApiRequest& request) &&
{
    // Parse the circuit to get gate count information
    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::vector<uint8_t>(circuit.bytecode));

    acir_format::ProgramMetadata metadata = _create_program_metadata<UltraCircuitBuilder>();
    metadata.collect_gates_per_opcode = include_gates_per_opcode;
    CircuitGates::Response response;
    response.num_acir_opcodes = static_cast<uint32_t>(constraint_system.num_acir_opcodes);

    acir_format::AcirProgram program{ std::move(constraint_system) };
    auto builder = acir_format::create_circuit<UltraCircuitBuilder>(program, metadata);
    builder.finalize_circuit(/*ensure_nonzero=*/true);

    response.num_gates = static_cast<uint32_t>(builder.get_finalized_total_circuit_size());
    response.num_gates_dyadic = static_cast<uint32_t>(builder.get_circuit_subgroup_size(response.num_gates));
    // note: will be empty if collect_gates_per_opcode is false
    response.gates_per_opcode = std::move(program.constraints.gates_per_opcode);

    return response;
}

CircuitVerify::Response CircuitVerify::execute(BB_UNUSED const BBApiRequest& request) &&
{
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

CircuitWriteSolidityVerifier::Response CircuitWriteSolidityVerifier::execute(BB_UNUSED const BBApiRequest& request) &&
{
    using VK = UltraKeccakFlavor::VerificationKey;
    // Deserialize directly from buffer
    auto vk = std::make_shared<VK>(from_buffer<VK>(verification_key));
    std::string contract = settings.disable_zk ? get_honk_solidity_verifier(vk) : get_honk_zk_solidity_verifier(vk);

    return { std::move(contract) };
}

} // namespace bb::bbapi
