#include "api_ultra_honk.hpp"

#include "barretenberg/api/acir_format_getters.hpp"
#include "barretenberg/api/get_bn254_crs.hpp"
#include "barretenberg/api/init_srs.hpp"
#include "barretenberg/api/write_prover_output.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/proof_surgeon.hpp"
#include "barretenberg/dsl/acir_proofs/honk_contract.hpp"
#include "barretenberg/dsl/acir_proofs/honk_zk_contract.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/ultra_vanilla_client_ivc/ultra_vanilla_client_ivc.hpp"

namespace bb {

extern std::string CRS_PATH;

template <typename Flavor, typename Circuit = typename Flavor::CircuitBuilder>
Circuit _compute_circuit(const std::string& bytecode_path,
                         const std::string& witness_path,
                         const bool init_kzg_accumulator)
{
    uint32_t honk_recursion = 0;
    if constexpr (IsAnyOf<Flavor, UltraFlavor, UltraKeccakFlavor, UltraKeccakZKFlavor>) {
        honk_recursion = 1;
    } else if constexpr (IsAnyOf<Flavor, UltraRollupFlavor>) {
        honk_recursion = 2;
    }

    // TODO: Don't init grumpkin crs when unnecessary.
    init_grumpkin_crs(1 << CONST_ECCVM_LOG_N);

    const acir_format::ProgramMetadata metadata{ .recursive = init_kzg_accumulator, .honk_recursion = honk_recursion };
    acir_format::AcirProgram program{ get_constraint_system(bytecode_path, metadata.honk_recursion) };

    if (!witness_path.empty()) {
        program.witness = get_witness(witness_path);
    }
    return acir_format::create_circuit<Circuit>(program, metadata);
}

template <typename Flavor>
UltraProver_<Flavor> _compute_prover(const std::string& bytecode_path,
                                     const std::string& witness_path,
                                     const bool init_kzg_accumulator)
{
    auto prover = UltraProver_<Flavor>{ _compute_circuit<Flavor>(bytecode_path, witness_path, init_kzg_accumulator) };

    size_t required_crs_size = prover.proving_key->proving_key.circuit_size;
    if constexpr (Flavor::HasZK) {
        required_crs_size = std::max(required_crs_size, curve::BN254::SUBGROUP_SIZE * 2);
    }
    init_bn254_crs(required_crs_size);
    return prover;
}

template <typename Flavor, typename VK = typename Flavor::VerificationKey>
ProofAndKey<VK> _compute_vk(const bool init_kzg_accumulator,
                            const std::filesystem::path& bytecode_path,
                            const std::filesystem::path& witness_path)
{
    auto prover = _compute_prover<Flavor>(bytecode_path.string(), witness_path.string(), init_kzg_accumulator);
    return { HonkProof{}, std::make_shared<VK>(prover.proving_key->proving_key) };
}

template <typename Flavor, typename VK = typename Flavor::VerificationKey>
ProofAndKey<VK> _prove(const bool compute_vk,
                       const bool init_kzg_accumulator,
                       const std::filesystem::path& bytecode_path,
                       const std::filesystem::path& witness_path)
{
    auto prover = _compute_prover<Flavor>(bytecode_path.string(), witness_path.string(), init_kzg_accumulator);
    return { prover.construct_proof(), compute_vk ? std::make_shared<VK>(prover.proving_key->proving_key) : nullptr };
}

template <typename Flavor>
bool _verify(const bool honk_recursion_2, const std::filesystem::path& proof_path, const std::filesystem::path& vk_path)
{
    using VerificationKey = typename Flavor::VerificationKey;
    using Verifier = UltraVerifier_<Flavor>;

    auto g2_data = get_bn254_g2_data(CRS_PATH);
    srs::init_crs_factory({}, g2_data);
    auto proof = from_buffer<std::vector<bb::fr>>(read_file(proof_path));
    auto vk = std::make_shared<VerificationKey>(from_buffer<VerificationKey>(read_file(vk_path)));
    vk->pcs_verification_key = std::make_shared<VerifierCommitmentKey<curve::BN254>>();

    std::shared_ptr<VerifierCommitmentKey<curve::Grumpkin>> ipa_verification_key;
    if (honk_recursion_2) {
        init_grumpkin_crs(1 << CONST_ECCVM_LOG_N);
        ipa_verification_key = std::make_shared<VerifierCommitmentKey<curve::Grumpkin>>(1 << CONST_ECCVM_LOG_N);
    }

    Verifier verifier{ vk, ipa_verification_key };

    bool verified;
    if (honk_recursion_2) {
        const size_t HONK_PROOF_LENGTH = Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS - IPA_PROOF_LENGTH;
        const size_t num_public_inputs = static_cast<size_t>(uint64_t(proof[1]));
        // The extra calculation is for the IPA proof length.
        ASSERT(proof.size() == HONK_PROOF_LENGTH + IPA_PROOF_LENGTH + num_public_inputs);
        const std::ptrdiff_t honk_proof_with_pub_inputs_length =
            static_cast<std::ptrdiff_t>(HONK_PROOF_LENGTH + num_public_inputs);
        auto ipa_proof = HonkProof(proof.begin() + honk_proof_with_pub_inputs_length, proof.end());
        auto tube_honk_proof = HonkProof(proof.begin(), proof.begin() + honk_proof_with_pub_inputs_length);
        verified = verifier.verify_proof(proof, ipa_proof);
    } else {
        verified = verifier.verify_proof(proof);
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
                         const std::filesystem::path& output_dir)
{
    const auto _write = [&](auto&& _prove_output) {
        write(_prove_output, flags.output_data_type, flags.output_content_type, output_dir);
    };

    const bool init = flags.init_kzg_accumulator;
    const bool compute_vk = flags.output_content_type == "proof_and_vk";

    if (flags.ipa_accumulation) {
        _write(_prove<UltraRollupFlavor>(compute_vk, init, bytecode_path, witness_path));
    } else if (flags.oracle_hash_type == "poseidon2") {
        _write(_prove<UltraFlavor>(compute_vk, init, bytecode_path, witness_path));
    } else if (flags.oracle_hash_type == "keccak" && !flags.zk) {
        _write(_prove<UltraKeccakFlavor>(compute_vk, init, bytecode_path, witness_path));
    } else if (flags.oracle_hash_type == "keccak" && flags.zk) {
        _write(_prove<UltraKeccakZKFlavor>(compute_vk, init, bytecode_path, witness_path));
    } else {
        throw_or_abort("Invalid proving options specified in _prove");
    }
}

bool UltraHonkAPI::verify(const Flags& flags,
                          const std::filesystem::path& proof_path,
                          const std::filesystem::path& vk_path)
{
    const bool ipa_accumulation = flags.ipa_accumulation;
    if (ipa_accumulation) {
        return _verify<UltraRollupFlavor>(ipa_accumulation, proof_path, vk_path);
    }
    if (flags.zk) {
        return _verify<UltraKeccakZKFlavor>(ipa_accumulation, proof_path, vk_path);
    }
    if (flags.oracle_hash_type == "poseidon2") {
        return _verify<UltraFlavor>(ipa_accumulation, proof_path, vk_path);
    }
    if (flags.oracle_hash_type == "keccak") {
        return _verify<UltraKeccakFlavor>(ipa_accumulation, proof_path, vk_path);
    }
    return false;
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
    const auto _write = [&](auto&& _prove_output) { write(_prove_output, flags.output_data_type, "vk", output_path); };

    const bool init = flags.init_kzg_accumulator;

    if (flags.ipa_accumulation) {
        _write(_compute_vk<UltraRollupFlavor>(init, bytecode_path, ""));
    } else if (flags.oracle_hash_type == "poseidon2") {
        _write(_compute_vk<UltraFlavor>(init, bytecode_path, ""));
    } else if (flags.oracle_hash_type == "keccak" && !flags.zk) {
        _write(_compute_vk<UltraKeccakFlavor>(init, bytecode_path, ""));
    } else if (flags.oracle_hash_type == "keccak" && flags.zk) {
        _write(_compute_vk<UltraKeccakZKFlavor>(init, bytecode_path, ""));
    } else {
        throw_or_abort("Invalid proving options specified in _prove");
    }
}

void UltraHonkAPI::gates([[maybe_unused]] const Flags& flags,
                         [[maybe_unused]] const std::filesystem::path& bytecode_path)
{
    throw_or_abort("API function not implemented");
}

void UltraHonkAPI::write_contract(const Flags& flags,
                                  const std::filesystem::path& output_path,
                                  const std::filesystem::path& vk_path)
{
    using VK = UltraKeccakFlavor::VerificationKey;
    auto vk = std::make_shared<VK>(from_buffer<VK>(read_file(vk_path)));
    std::string contract = flags.zk ? get_honk_zk_solidity_verifier(vk) : get_honk_solidity_verifier(vk);

    if (output_path == "-") {
        std::cout << contract;
    } else {
        write_file(output_path, { contract.begin(), contract.end() });
    }
}

template <typename Flavor>
void write_recursion_inputs_ultra_honk(const std::string& bytecode_path,
                                       const std::string& witness_path,
                                       const std::string& output_path)
{
    using Builder = typename Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    using VerificationKey = typename Flavor::VerificationKey;
    using FF = typename Flavor::FF;

    uint32_t honk_recursion = 0;
    bool ipa_accumulation = false;
    if constexpr (IsAnyOf<Flavor, UltraFlavor>) {
        honk_recursion = 1;
    } else if constexpr (IsAnyOf<Flavor, UltraRollupFlavor>) {
        honk_recursion = 2;
        init_grumpkin_crs(1 << CONST_ECCVM_LOG_N);
        ipa_accumulation = true;
    }
    const acir_format::ProgramMetadata metadata{ .recursive = true, .honk_recursion = honk_recursion };

    acir_format::AcirProgram program;
    program.constraints = get_constraint_system(bytecode_path, metadata.honk_recursion);
    program.witness = get_witness(witness_path);
    auto builder = acir_format::create_circuit<Builder>(program, metadata);

    Prover prover{ builder };
    init_bn254_crs(prover.proving_key->proving_key.circuit_size);
    std::vector<FF> proof = prover.construct_proof();
    VerificationKey verification_key(prover.proving_key->proving_key);

    const std::string toml_content =
        acir_format::ProofSurgeon::construct_recursion_inputs_toml_data(proof, verification_key, ipa_accumulation);

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
