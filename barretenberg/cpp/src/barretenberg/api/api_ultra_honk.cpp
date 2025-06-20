#include "api_ultra_honk.hpp"

#include "barretenberg/api/acir_format_getters.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/api/gate_count.hpp"
#include "barretenberg/api/proving_helpers.hpp"
#include "barretenberg/api/write_prover_output.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/proof_surgeon.hpp"
#include "barretenberg/dsl/acir_proofs/honk_contract.hpp"
#include "barretenberg/dsl/acir_proofs/honk_zk_contract.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/honk/types/aggregation_object_type.hpp"
#include "barretenberg/srs/global_crs.hpp"

namespace bb {

template <typename Flavor, typename Circuit = typename Flavor::CircuitBuilder>
Circuit _compute_circuit(const std::string& bytecode_path, const std::string& witness_path)
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
    acir_format::AcirProgram program{ get_constraint_system(bytecode_path) };

    if (!witness_path.empty()) {
        program.witness = get_witness(witness_path);
    }
    return acir_format::create_circuit<Circuit>(program, metadata);
}

template <typename Flavor>
std::shared_ptr<DeciderProvingKey_<Flavor>> _compute_proving_key(const std::string& bytecode_path,
                                                                 const std::string& witness_path)
{
    auto bytecode = read_file(bytecode_path);
    auto witness = witness_path.empty() ? std::vector<uint8_t>{} : read_file(witness_path);

    auto pk_result = compute_proving_key_from_bytecode<Flavor>(std::move(bytecode), std::move(witness));
    if (pk_result.is_error()) {
        throw_or_abort(pk_result.error_message);
    }

    return pk_result.value;
}

template <typename Flavor>
PubInputsProofAndKey<typename Flavor::VerificationKey> _compute_vk(
    const std::filesystem::path& bytecode_path, [[maybe_unused]] const std::filesystem::path& witness_path)
{
    auto bytecode = read_file(bytecode_path);

    auto vk_result = compute_vk_from_bytecode<Flavor>(std::move(bytecode));
    if (vk_result.is_error()) {
        throw_or_abort(vk_result.error_message);
    }

    return { PublicInputsVector{}, HonkProof{}, vk_result.value };
}

template <typename Flavor>
PubInputsProofAndKey<typename Flavor::VerificationKey> _prove(const bool compute_vk,
                                                              const std::filesystem::path& bytecode_path,
                                                              const std::filesystem::path& witness_path,
                                                              const std::filesystem::path& vk_path)
{
    auto bytecode = read_file(bytecode_path);
    auto witness = read_file(witness_path);
    auto vk_data = compute_vk ? std::vector<uint8_t>{} : read_file(vk_path);

    if (compute_vk) {
        info("WARNING: computing verification key while proving. Pass in a precomputed vk for better performance.");
    }

    auto proof_result = prove_from_bytecode<Flavor>(std::move(bytecode), std::move(witness), std::move(vk_data));
    if (proof_result.is_error()) {
        throw_or_abort(proof_result.error_message);
    }

    // Get the verification key for the response
    std::shared_ptr<typename Flavor::VerificationKey> vk;
    if (compute_vk) {
        auto bytecode_copy = read_file(bytecode_path);
        auto vk_result = compute_vk_from_bytecode<Flavor>(std::move(bytecode_copy));
        if (vk_result.is_error()) {
            throw_or_abort(vk_result.error_message);
        }
        vk = vk_result.value;
    } else {
        using VerificationKey = typename Flavor::VerificationKey;
        vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vk_data));
    }

    return { proof_result.value.public_inputs, proof_result.value.proof, vk };
}

template <typename Flavor>
bool _verify(const bool ipa_accumulation,
             const std::filesystem::path& public_inputs_path,
             const std::filesystem::path& proof_path,
             const std::filesystem::path& vk_path)
{
    // Read files
    auto vk_buffer = read_file(vk_path);
    auto public_inputs = many_from_buffer<bb::fr>(read_file(public_inputs_path));
    auto proof = many_from_buffer<bb::fr>(read_file(proof_path));

    // Deserialize VK
    using VerificationKey = typename Flavor::VerificationKey;
    auto vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(vk_buffer));

    // Use verify_proof from proving_helpers.hpp
    auto result = verify_proof<Flavor>(vk, public_inputs, proof, ipa_accumulation);
    if (result.is_error()) {
        throw_or_abort(result.error_message);
    }

    bool verified = result.value;
    if (verified) {
        info("Proof verified successfully");
    } else {
        info("Proof verification failed");
    }

    return verified;
}

bool UltraHonkAPI::check([[maybe_unused]] const Flags& flags,
                         [[maybe_unused]] const std::filesystem::path& bytecode_path,
                         [[maybe_unused]] const std::filesystem::path& witness_path)
{
    throw_or_abort("API function check_witness not implemented");
    return false;
}

void UltraHonkAPI::prove(const Flags& flags,
                         const std::filesystem::path& bytecode_path,
                         const std::filesystem::path& witness_path,
                         const std::filesystem::path& vk_path,
                         const std::filesystem::path& output_dir)
{
    const auto _write = [&](auto&& _prove_output) {
        write(_prove_output, flags.output_format, flags.write_vk ? "proof_and_vk" : "proof", output_dir);
    };
    // if the ipa accumulation flag is set we are using the UltraRollupFlavor
    if (flags.ipa_accumulation) {
        _write(_prove<UltraRollupFlavor>(flags.write_vk, bytecode_path, witness_path, vk_path));
    } else if (flags.oracle_hash_type == "poseidon2" && !flags.disable_zk) {
        // if we are not disabling ZK and the oracle hash type is poseidon2, we are using the UltraZKFlavor
        _write(_prove<UltraZKFlavor>(flags.write_vk, bytecode_path, witness_path, vk_path));
    } else if (flags.oracle_hash_type == "poseidon2" && flags.disable_zk) {
        // if we are disabling ZK and the oracle hash type is poseidon2, we are using the UltraFlavor
        _write(_prove<UltraFlavor>(flags.write_vk, bytecode_path, witness_path, vk_path));
    } else if (flags.oracle_hash_type == "keccak" && !flags.disable_zk) {
        // if we are not disabling ZK and the oracle hash type is keccak, we are using the UltraKeccakZKFlavor
        _write(_prove<UltraKeccakZKFlavor>(flags.write_vk, bytecode_path, witness_path, vk_path));
    } else if (flags.oracle_hash_type == "keccak" && flags.disable_zk) {
        _write(_prove<UltraKeccakFlavor>(flags.write_vk, bytecode_path, witness_path, vk_path));
#ifdef STARKNET_GARAGA_FLAVORS
    } else if (flags.oracle_hash_type == "starknet" && flags.disable_zk) {
        _write(_prove<UltraStarknetFlavor>(flags.write_vk, bytecode_path, witness_path, vk_path));
    } else if (flags.oracle_hash_type == "starknet" && !flags.disable_zk) {
        _write(_prove<UltraStarknetZKFlavor>(flags.write_vk, bytecode_path, witness_path, vk_path));
#endif
    } else {
        throw_or_abort("Invalid proving options specified in _prove");
    }
}

bool UltraHonkAPI::verify(const Flags& flags,
                          const std::filesystem::path& public_inputs_path,
                          const std::filesystem::path& proof_path,
                          const std::filesystem::path& vk_path)
{
    const bool ipa_accumulation = flags.ipa_accumulation;
    // if the ipa accumulation flag is set we are using the UltraRollupFlavor
    if (ipa_accumulation) {
        return _verify<UltraRollupFlavor>(ipa_accumulation, public_inputs_path, proof_path, vk_path);
    } else if (flags.oracle_hash_type == "poseidon2" && !flags.disable_zk) {
        return _verify<UltraZKFlavor>(ipa_accumulation, public_inputs_path, proof_path, vk_path);
    } else if (flags.oracle_hash_type == "poseidon2" && flags.disable_zk) {
        return _verify<UltraFlavor>(ipa_accumulation, public_inputs_path, proof_path, vk_path);
    } else if (flags.oracle_hash_type == "keccak" && !flags.disable_zk) {
        return _verify<UltraKeccakZKFlavor>(ipa_accumulation, public_inputs_path, proof_path, vk_path);
    } else if (flags.oracle_hash_type == "keccak" && flags.disable_zk) {
        return _verify<UltraKeccakFlavor>(ipa_accumulation, public_inputs_path, proof_path, vk_path);
#ifdef STARKNET_GARAGA_FLAVORS
    } else if (flags.oracle_hash_type == "starknet" && !flags.disable_zk) {
        return _verify<UltraStarknetZKFlavor>(ipa_accumulation, public_inputs_path, proof_path, vk_path);
    } else if (flags.oracle_hash_type == "starknet" && flags.disable_zk) {
        return _verify<UltraStarknetFlavor>(ipa_accumulation, public_inputs_path, proof_path, vk_path);
#endif
    } else {
        throw_or_abort("invalid proof type in _verify");
    }
}

bool UltraHonkAPI::prove_and_verify([[maybe_unused]] const Flags& flags,
                                    [[maybe_unused]] const std::filesystem::path& bytecode_path,
                                    [[maybe_unused]] const std::filesystem::path& witness_path)
{
    throw_or_abort("API function prove_and_verify not implemented");
    return false;
}

void UltraHonkAPI::write_vk(const Flags& flags,
                            const std::filesystem::path& bytecode_path,
                            const std::filesystem::path& output_path)
{
    const auto _write = [&](auto&& _prove_output) { write(_prove_output, flags.output_format, "vk", output_path); };

    if (flags.ipa_accumulation) {
        _write(_compute_vk<UltraRollupFlavor>(bytecode_path, ""));
    } else if (flags.oracle_hash_type == "poseidon2" && !flags.disable_zk) {
        _write(_compute_vk<UltraZKFlavor>(bytecode_path, ""));
    } else if (flags.oracle_hash_type == "poseidon2" && flags.disable_zk) {
        _write(_compute_vk<UltraFlavor>(bytecode_path, ""));
    } else if (flags.oracle_hash_type == "keccak" && !flags.disable_zk) {
        _write(_compute_vk<UltraKeccakZKFlavor>(bytecode_path, ""));
    } else if (flags.oracle_hash_type == "keccak" && flags.disable_zk) {
        _write(_compute_vk<UltraKeccakFlavor>(bytecode_path, ""));
#ifdef STARKNET_GARAGA_FLAVORS
    } else if (flags.oracle_hash_type == "starknet" && !flags.disable_zk) {
        _write(_compute_vk<UltraStarknetZKFlavor>(bytecode_path, ""));
    } else if (flags.oracle_hash_type == "starknet" && flags.disable_zk) {
        _write(_compute_vk<UltraStarknetFlavor>(bytecode_path, ""));
#endif
    } else {
        throw_or_abort("invalid proof type in _write_vk");
    }
}

void UltraHonkAPI::gates([[maybe_unused]] const Flags& flags,
                         [[maybe_unused]] const std::filesystem::path& bytecode_path)
{
    gate_count(bytecode_path, /*useless=*/false, flags.honk_recursion, flags.include_gates_per_opcode);
}

void UltraHonkAPI::write_solidity_verifier(const Flags& flags,
                                           const std::filesystem::path& output_path,
                                           const std::filesystem::path& vk_path)
{
    using VK = UltraKeccakFlavor::VerificationKey;
    auto vk = std::make_shared<VK>(from_buffer<VK>(read_file(vk_path)));
    std::string contract = flags.disable_zk ? get_honk_solidity_verifier(vk) : get_honk_zk_solidity_verifier(vk);

    if (output_path == "-") {
        std::cout << contract;
    } else {
        write_file(output_path, { contract.begin(), contract.end() });
        if (flags.disable_zk) {
            info("ZK Honk solidity verifier saved to ", output_path);
        } else {
            info("Honk solidity verifier saved to ", output_path);
        }
    }
}

template <typename Flavor>
void write_recursion_inputs_ultra_honk(const std::string& bytecode_path,
                                       const std::string& witness_path,
                                       const std::string& output_path)
{
    using FF = typename Flavor::FF;

    // Use proving_helpers to generate the proof
    auto bytecode = read_file(bytecode_path);
    auto witness = read_file(witness_path);

    auto proof_result = prove_from_bytecode<Flavor>(std::move(bytecode), std::move(witness));
    if (proof_result.is_error()) {
        throw_or_abort(proof_result.error_message);
    }

    // Get the verification key
    auto bytecode_copy = read_file(bytecode_path);
    auto vk_result = compute_vk_from_bytecode<Flavor>(std::move(bytecode_copy));
    if (vk_result.is_error()) {
        throw_or_abort(vk_result.error_message);
    }

    // Combine public inputs and proof back together for ProofSurgeon
    std::vector<FF> complete_proof = proof_result.value.public_inputs;
    complete_proof.insert(complete_proof.end(), proof_result.value.proof.begin(), proof_result.value.proof.end());

    bool ipa_accumulation = false;
    if constexpr (IsAnyOf<Flavor, UltraRollupFlavor>) {
        ipa_accumulation = true;
    }
    const std::string toml_content = acir_format::ProofSurgeon::construct_recursion_inputs_toml_data(
        complete_proof, vk_result.value, ipa_accumulation);

    const std::string toml_path = output_path + "/Prover.toml";
    write_file(toml_path, { toml_content.begin(), toml_content.end() });
}

template void write_recursion_inputs_ultra_honk<UltraFlavor>(const std::string& bytecode_path,
                                                             const std::string& witness_path,
                                                             const std::string& output_path);

template void write_recursion_inputs_ultra_honk<UltraRollupFlavor>(const std::string& bytecode_path,
                                                                   const std::string& witness_path,
                                                                   const std::string& output_path);
} // namespace bb
