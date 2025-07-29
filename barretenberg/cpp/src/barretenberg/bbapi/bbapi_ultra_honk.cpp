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
#ifdef STARKNET_GARAGA_FLAVORS
#include "barretenberg/flavor/ultra_starknet_flavor.hpp"
#include "barretenberg/flavor/ultra_starknet_zk_flavor.hpp"
#endif
#include <iomanip>
#include <sstream>

namespace bb::bbapi {

template <typename Flavor, typename Circuit = typename Flavor::CircuitBuilder>
Circuit _compute_circuit(const std::vector<uint8_t>& bytecode, const std::vector<uint8_t>& witness)
{
    uint32_t honk_recursion = 0;

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1326): Get rid of honk_recursion and just use
    // ipa_accumulation.
    // bool ipa_accumulation = false;
    if constexpr (IsAnyOf<Flavor, UltraFlavor, UltraZKFlavor, UltraKeccakFlavor, UltraKeccakZKFlavor>) {
        honk_recursion = 1;
    } else if constexpr (IsAnyOf<Flavor, UltraRollupFlavor>) {
        honk_recursion = 2;
        // ipa_accumulation = true;
    }
#ifdef STARKNET_GARAGA_FLAVORS
    if constexpr (IsAnyOf<Flavor, UltraStarknetFlavor, UltraStarknetZKFlavor>) {
        honk_recursion = 1;
    }
#endif

    const acir_format::ProgramMetadata metadata{
        .honk_recursion = honk_recursion,
    };
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
CircuitProve::Response _prove(const std::vector<uint8_t>& bytecode,
                              const std::vector<uint8_t>& witness,
                              const std::vector<uint8_t>& vk_bytes)
{
    auto proving_key = _compute_proving_key<Flavor>(bytecode, witness);
    std::shared_ptr<typename Flavor::VerificationKey> vk;
    if (vk_bytes.empty()) {
        info("WARNING: computing verification key while proving. Pass in a precomputed vk for better performance.");
        vk = std::make_shared<typename Flavor::VerificationKey>(proving_key->get_precomputed());
    } else {
        vk =
            std::make_shared<typename Flavor::VerificationKey>(from_buffer<typename Flavor::VerificationKey>(vk_bytes));
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
        return _prove<UltraRollupFlavor>(circuit.bytecode, witness, circuit.verification_key);
    }
    if (settings.oracle_hash_type == "poseidon2" && !settings.disable_zk) {
        // if we are not disabling ZK and the oracle hash type is poseidon2, we are using the UltraZKFlavor
        return _prove<UltraZKFlavor>(circuit.bytecode, witness, circuit.verification_key);
    }
    if (settings.oracle_hash_type == "poseidon2" && settings.disable_zk) {
        // if we are disabling ZK and the oracle hash type is poseidon2, we are using the UltraFlavor
        return _prove<UltraFlavor>(circuit.bytecode, witness, circuit.verification_key);
    }
    if (settings.oracle_hash_type == "keccak" && !settings.disable_zk) {
        // if we are not disabling ZK and the oracle hash type is keccak, we are using the UltraKeccakZKFlavor
        return _prove<UltraKeccakZKFlavor>(circuit.bytecode, witness, circuit.verification_key);
    }
    if (settings.oracle_hash_type == "keccak" && settings.disable_zk) {
        return _prove<UltraKeccakFlavor>(circuit.bytecode, witness, circuit.verification_key);
#ifdef STARKNET_GARAGA_FLAVORS
    }
    if (settings.oracle_hash_type == "starknet" && settings.disable_zk) {
        return _prove<UltraStarknetFlavor>(circuit.bytecode, witness, circuit.verification_key);
    }
    if (settings.oracle_hash_type == "starknet" && !settings.disable_zk) {
        return _prove<UltraStarknetZKFlavor>(circuit.bytecode, witness, circuit.verification_key);
#endif
    }
    throw_or_abort("Invalid proving options specified in CircuitProve!");
}

CircuitComputeVk::Response CircuitComputeVk::execute(BB_UNUSED const BBApiRequest& request) &&
{
    std::vector<uint8_t> vk_bytes;
    std::vector<fr> vk_fields;
    std::vector<uint8_t> vk_hash_bytes;

    // Helper lambda to compute VK, fields, and hash for a given flavor
    auto compute_vk_and_fields = [&]<typename Flavor>() {
        auto proving_key = _compute_proving_key<Flavor>(circuit.bytecode, {});
        auto vk = std::make_shared<typename Flavor::VerificationKey>(proving_key->get_precomputed());
        vk_bytes = to_buffer(*vk);
        vk_fields = vk->to_field_elements();
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

    return { .bytes = vk_bytes, .fields = vk_fields, .vk_hash = vk_hash_bytes };
}

CircuitInfo::Response CircuitInfo::execute(BB_UNUSED const BBApiRequest& request) &&
{
    // Parse the circuit to get gate count information
    auto constraint_system = acir_format::circuit_buf_to_acir_format(std::vector<uint8_t>(circuit.bytecode));

    const acir_format::ProgramMetadata metadata{ .recursive = settings.recursive,
                                                 .honk_recursion = settings.honk_recursion,
                                                 .collect_gates_per_opcode = include_gates_per_opcode };

    acir_format::AcirProgram program{ constraint_system };
    auto builder = acir_format::create_circuit<UltraCircuitBuilder>(program, metadata);
    builder.finalize_circuit(/*ensure_nonzero=*/true);

    CircuitInfo::Response response;
    response.total_gates = static_cast<uint32_t>(builder.get_finalized_total_circuit_size());
    response.subgroup_size = static_cast<uint32_t>(builder.get_circuit_subgroup_size(response.total_gates));

    if (include_gates_per_opcode) {
        // Convert gates_per_opcode vector to map
        for (size_t i = 0; i < program.constraints.gates_per_opcode.size(); i++) {
            if (program.constraints.gates_per_opcode[i] > 0) {
                response.gates_per_opcode["opcode_" + std::to_string(i)] =
                    static_cast<uint32_t>(program.constraints.gates_per_opcode[i]);
            }
        }
    }

    return response;
}

CircuitCheck::Response CircuitCheck::execute(BB_UNUSED const BBApiRequest& request) &&
{
    throw_or_abort("not implemented yet!");
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

ProofAsFields::Response ProofAsFields::execute(BB_UNUSED const BBApiRequest& request) &&
{
    // Proof is already a vector of field elements
    return { proof };
}

VkAsFields::Response VkAsFields::execute(BB_UNUSED const BBApiRequest& request) &&
{
    std::vector<bb::fr> fields;

    // Standard UltraHonk flavors
    auto vk = from_buffer<UltraFlavor::VerificationKey>(verification_key);
    fields = vk.to_field_elements();

    return { fields };
}

CircuitWriteSolidityVerifier::Response CircuitWriteSolidityVerifier::execute(BB_UNUSED const BBApiRequest& request) &&
{
    using VK = UltraKeccakFlavor::VerificationKey;
    auto vk = std::make_shared<VK>(from_buffer<VK>(verification_key));
    std::string contract = settings.disable_zk ? get_honk_solidity_verifier(vk) : get_honk_zk_solidity_verifier(vk);

    return { contract };
}

} // namespace bb::bbapi
