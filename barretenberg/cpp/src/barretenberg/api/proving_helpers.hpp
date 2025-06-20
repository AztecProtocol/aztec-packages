#pragma once

#include "barretenberg/api/bbrpc_commands.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/dsl/acir_format/acir_to_constraint_buf.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/honk/types/aggregation_object_type.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

#ifdef STARKNET_GARAGA_FLAVORS
#include "barretenberg/flavor/ultra_starknet_flavor.hpp"
#include "barretenberg/flavor/ultra_starknet_zk_flavor.hpp"
#endif

namespace bb {

/**
 * @brief Result structure for proving operations
 */
template <typename T> struct ProveResult {
    T value;
    std::string error_message;

    ProveResult(T&& val)
        : value(std::move(val))
    {}
    ProveResult(const char* error)
        : error_message(error)
    {}
    ProveResult(std::string&& error)
        : error_message(std::move(error))
    {}

    bool is_error() const { return !error_message.empty(); }
};

/**
 * @brief Create a circuit from in-memory bytecode and witness data
 *
 * @tparam Flavor The proving system flavor
 * @tparam Circuit The circuit builder type (defaults to Flavor::CircuitBuilder)
 * @param program The ACIR program containing circuit constraints
 * @param honk_recursion Recursion level (1 for UltraHonk, 2 for UltraRollupHonk)
 * @return The constructed circuit
 */
template <typename Flavor, typename Circuit = typename Flavor::CircuitBuilder>
Circuit compute_circuit_from_program(acir_format::AcirProgram&& program, uint32_t honk_recursion)
{
    const acir_format::ProgramMetadata metadata{
        .honk_recursion = honk_recursion,
    };

    return acir_format::create_circuit<Circuit>(program, metadata);
}

/**
 * @brief Determine the honk_recursion value based on flavor
 */
template <typename Flavor> constexpr uint32_t get_honk_recursion()
{
    if constexpr (IsAnyOf<Flavor, UltraFlavor, UltraZKFlavor, UltraKeccakFlavor, UltraKeccakZKFlavor>) {
        return 1;
    } else if constexpr (IsAnyOf<Flavor, UltraRollupFlavor>) {
        return 2;
    }
#ifdef STARKNET_GARAGA_FLAVORS
    else if constexpr (IsAnyOf<Flavor, UltraStarknetFlavor, UltraStarknetZKFlavor>) {
        return 1;
    }
#endif
    else {
        return 1; // default
    }
}

/**
 * @brief Create a circuit from bytecode and witness buffers
 */
template <typename Flavor>
ProveResult<typename Flavor::CircuitBuilder> create_circuit_from_buffers(const std::vector<uint8_t>& bytecode,
                                                                         const std::vector<uint8_t>& witness = {})
{
    using Builder = typename Flavor::CircuitBuilder;

    // Parse bytecode
    acir_format::AcirProgram program;
    program.constraints = acir_format::circuit_buf_to_acir_format(bytecode);

    // Parse witness if provided
    if (!witness.empty()) {
        program.witness = acir_format::witness_buf_to_witness_data(witness);
    }

    // Create circuit
    uint32_t honk_recursion = get_honk_recursion<Flavor>();
    Builder circuit = compute_circuit_from_program<Flavor>(std::move(program), honk_recursion);

    return { std::move(circuit) };
}

/**
 * @brief Create a proving key from in-memory circuit data
 */
template <typename Flavor>
ProveResult<std::shared_ptr<DeciderProvingKey_<Flavor>>> compute_proving_key_from_bytecode(
    const std::vector<uint8_t>& bytecode, const std::vector<uint8_t>& witness)
{
    auto circuit_result = create_circuit_from_buffers<Flavor>(bytecode, witness);
    if (circuit_result.is_error()) {
        return { circuit_result.error_message.c_str() };
    }

    // Create proving key
    return { std::make_shared<DeciderProvingKey_<Flavor>>(circuit_result.value) };
}

/**
 * @brief Generate proof from proving key and verification key
 *
 * This extracts the common proof generation logic that's duplicated in multiple places
 */
template <typename Flavor>
PublicInputsAndProof generate_proof_from_keys(std::shared_ptr<DeciderProvingKey_<Flavor>> proving_key,
                                              std::shared_ptr<typename Flavor::VerificationKey> vk)
{
    UltraProver_<Flavor> prover{ proving_key, vk };

    HonkProof concat_pi_and_proof = prover.construct_proof();
    size_t num_inner_public_inputs = prover.proving_key->proving_key.num_public_inputs;

    // Account for pairing point accumulator
    BB_ASSERT_GTE(prover.proving_key->proving_key.num_public_inputs,
                  PAIRING_POINTS_SIZE,
                  "Public inputs should contain a pairing point accumulator.");
    num_inner_public_inputs -= PAIRING_POINTS_SIZE;

    // Account for IPA claim if using rollup flavor
    if constexpr (HasIPAAccumulator<Flavor>) {
        BB_ASSERT_GTE(num_inner_public_inputs, IPA_CLAIM_SIZE, "Public inputs should contain an IPA claim.");
        num_inner_public_inputs -= IPA_CLAIM_SIZE;
    }

    // Split public inputs from proof
    PublicInputsAndProof public_inputs_and_proof{
        PublicInputsVector(concat_pi_and_proof.begin(),
                           concat_pi_and_proof.begin() + static_cast<std::ptrdiff_t>(num_inner_public_inputs)),
        HonkProof(concat_pi_and_proof.begin() + static_cast<std::ptrdiff_t>(num_inner_public_inputs),
                  concat_pi_and_proof.end())
    };

    return public_inputs_and_proof;
}

/**
 * @brief Prove a circuit from in-memory data
 *
 * @param bytecode The circuit bytecode
 * @param witness The witness data
 * @param vk_data Optional pre-computed verification key data
 * @return Result containing the proof and public inputs, or error
 */
template <typename Flavor>
ProveResult<PublicInputsAndProof> prove_from_bytecode(const std::vector<uint8_t>& bytecode,
                                                      const std::vector<uint8_t>& witness,
                                                      const std::vector<uint8_t>& vk_data = {})
{
    // Create proving key
    auto pk_result = compute_proving_key_from_bytecode<Flavor>(bytecode, witness);
    if (pk_result.is_error()) {
        return { pk_result.error_message.c_str() };
    }

    // Create or deserialize verification key
    std::shared_ptr<typename Flavor::VerificationKey> vk;
    if (vk_data.empty()) {
        vk = std::make_shared<typename Flavor::VerificationKey>(pk_result.value->proving_key);
    } else {
        using VerificationKey = typename Flavor::VerificationKey;
        vk = std::make_shared<VerificationKey>(from_buffer<typename VerificationKey::BareData>(vk_data));
    }

    // Generate proof
    return { generate_proof_from_keys<Flavor>(pk_result.value, vk) };
}

/**
 * @brief Extract public inputs from a proof buffer
 */
struct ProofWithPublicInputs {
    PublicInputsVector public_inputs;
    HonkProof proof;
};

template <typename Flavor>
ProveResult<ProofWithPublicInputs> extract_public_inputs_from_proof(const std::vector<uint8_t>& proof_buffer,
                                                                    size_t num_public_inputs)
{
    // Convert entire buffer to field elements
    HonkProof complete_proof = many_from_buffer<fr>(proof_buffer);

    // Ensure we have enough elements
    if (complete_proof.size() < num_public_inputs) {
        return { "Proof buffer too small for expected public inputs" };
    }

    // Split into public inputs and proof
    PublicInputsVector public_inputs(complete_proof.begin(), complete_proof.begin() + num_public_inputs);
    HonkProof proof(complete_proof.begin() + num_public_inputs, complete_proof.end());

    return { ProofWithPublicInputs{ std::move(public_inputs), std::move(proof) } };
}

/**
 * @brief Verify a proof with given verification key and public inputs
 *
 * @tparam Flavor The proving system flavor
 * @param vk Verification key
 * @param public_inputs Public inputs for the proof
 * @param proof The proof to verify
 * @param ipa_accumulation Whether to use IPA accumulation
 * @return Result containing verification success or error
 */
template <typename Flavor>
ProveResult<bool> verify_proof(const std::shared_ptr<typename Flavor::VerificationKey>& vk,
                               const PublicInputsVector& public_inputs,
                               const HonkProof& proof,
                               bool ipa_accumulation = false)
{
    using Verifier = UltraVerifier_<Flavor>;

    // Concatenate public inputs and proof
    std::vector<fr> complete_proof = public_inputs;
    complete_proof.insert(complete_proof.end(), proof.begin(), proof.end());

    VerifierCommitmentKey<curve::Grumpkin> ipa_verification_key;
    if (ipa_accumulation) {
        ipa_verification_key = VerifierCommitmentKey<curve::Grumpkin>(1 << CONST_ECCVM_LOG_N);
    }

    Verifier verifier{ vk, ipa_verification_key };

    bool verified = false;
    if (ipa_accumulation) {
        const size_t HONK_PROOF_LENGTH = Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS - IPA_PROOF_LENGTH;
        const size_t num_public_inputs = static_cast<size_t>(vk->num_public_inputs);
        const std::ptrdiff_t honk_proof_with_pub_inputs_length =
            static_cast<std::ptrdiff_t>(HONK_PROOF_LENGTH + num_public_inputs);
        auto ipa_proof = HonkProof(complete_proof.begin() + honk_proof_with_pub_inputs_length, complete_proof.end());
        verified = verifier.verify_proof(complete_proof, ipa_proof);
    } else {
        verified = verifier.verify_proof(complete_proof);
    }

    return { verified };
}

/**
 * @brief Verify a proof from buffer with given verification key buffer
 */
template <typename Flavor>
ProveResult<bool> verify_proof_from_buffers(const std::vector<uint8_t>& vk_buffer,
                                            const std::vector<uint8_t>& proof_buffer,
                                            bool extract_public_inputs = true)
{
    using VerificationKey = typename Flavor::VerificationKey;
    auto vk = std::make_shared<VerificationKey>(from_buffer<typename VerificationKey::BareData>(vk_buffer));

    if (extract_public_inputs) {
        // Calculate the actual number of public inputs (accounting for special elements)
        size_t num_public_inputs = vk->num_public_inputs;

        // Account for pairing point accumulator
        if (num_public_inputs >= PAIRING_POINTS_SIZE) {
            num_public_inputs -= PAIRING_POINTS_SIZE;
        }

        // Account for IPA claim if using rollup flavor
        if constexpr (HasIPAAccumulator<Flavor>) {
            if (num_public_inputs >= IPA_CLAIM_SIZE) {
                num_public_inputs -= IPA_CLAIM_SIZE;
            }
        }

        auto proof_data = extract_public_inputs_from_proof<Flavor>(proof_buffer, num_public_inputs);
        if (proof_data.is_error()) {
            return { proof_data.error_message.c_str() };
        }

        bool ipa_accumulation = vk->has_ipa_accumulation();
        return verify_proof<Flavor>(vk, proof_data.value.public_inputs, proof_data.value.proof, ipa_accumulation);
    } else {
        // Convert entire buffer to field elements
        HonkProof proof = many_from_buffer<fr>(proof_buffer);

        using Verifier = UltraVerifier_<Flavor>;
        Verifier verifier{ vk };
        bool verified = verifier.verify_proof(proof);
        return { verified };
    }
}

/**
 * @brief Compute verification key from bytecode
 *
 * @tparam Flavor The proving system flavor
 * @param bytecode The circuit bytecode
 * @return Result containing the verification key or error
 */
template <typename Flavor>
ProveResult<std::shared_ptr<typename Flavor::VerificationKey>> compute_vk_from_bytecode(
    const std::vector<uint8_t>& bytecode)
{
    auto pk_result = compute_proving_key_from_bytecode<Flavor>(bytecode, {});
    if (pk_result.is_error()) {
        return { pk_result.error_message.c_str() };
    }

    return { std::make_shared<typename Flavor::VerificationKey>(pk_result.value->proving_key) };
}

/**
 * @brief Check if a circuit is satisfied
 */
template <typename Flavor>
ProveResult<bool> check_circuit(const std::vector<uint8_t>& bytecode, const std::vector<uint8_t>& witness)
{
    auto circuit_result = create_circuit_from_buffers<Flavor>(bytecode, witness);
    if (circuit_result.is_error()) {
        return { circuit_result.error_message.c_str() };
    }

    return { circuit_result.value.check_circuit() };
}

/**
 * @brief Get circuit gate count
 */
template <typename Flavor> ProveResult<uint32_t> get_gate_count(const std::vector<uint8_t>& bytecode)
{
    auto circuit_result = create_circuit_from_buffers<Flavor>(bytecode);
    if (circuit_result.is_error()) {
        return { circuit_result.error_message.c_str() };
    }

    return { circuit_result.value.get_num_gates() };
}

/**
 * @brief Get circuit constraint system info
 */
struct CircuitConstraintsInfo {
    uint32_t num_gates;
    size_t num_public_inputs;
    bool recursive;
    bool contains_ipa_claim;
    size_t num_ipa_claims;
};

template <typename Flavor> ProveResult<CircuitConstraintsInfo> get_circuit_info(const std::vector<uint8_t>& bytecode)
{
    auto circuit_result = create_circuit_from_buffers<Flavor>(bytecode);
    if (circuit_result.is_error()) {
        return { circuit_result.error_message.c_str() };
    }

    auto& circuit = circuit_result.value;
    CircuitConstraintsInfo info{ .num_gates = circuit.get_num_gates(),
                                 .num_public_inputs = circuit.get_num_public_inputs(),
                                 .recursive = circuit.is_recursive_circuit,
                                 .contains_ipa_claim = circuit.ipa_proof_public_input_indices.size() > 0,
                                 .num_ipa_claims = circuit.ipa_proof_public_input_indices.size() };

    return { std::move(info) };
}

} // namespace bb
