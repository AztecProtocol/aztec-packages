#pragma once

#include "barretenberg/api/acir_format_getters.hpp"
#include "barretenberg/api/api.hpp"
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

class UltraHonkAPI : public API {

    template <typename Flavor, typename Circuit = Flavor::CircuitBuilder>
    static Circuit _compute_circuit(const std::string& bytecode_path,
                                    const std::string& witness_path,
                                    const bool init_kzg_accumulator)
    {
        uint32_t honk_recursion = 0;
        if constexpr (IsAnyOf<Flavor, UltraFlavor, UltraKeccakFlavor, UltraKeccakZKFlavor>) {
            honk_recursion = 1;
        } else if constexpr (IsAnyOf<Flavor, UltraRollupFlavor>) {
            honk_recursion = 2;
        }

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1180): Don't init grumpkin crs when unnecessary.
        init_grumpkin_crs(1 << CONST_ECCVM_LOG_N);

        const acir_format::ProgramMetadata metadata{ .recursive = init_kzg_accumulator,
                                                     .honk_recursion = honk_recursion };
        acir_format::AcirProgram program{ get_constraint_system(bytecode_path, metadata.honk_recursion) };

        if (!witness_path.empty()) {
            program.witness = get_witness(witness_path);
        }
        auto circuit = acir_format::create_circuit<Circuit>(program, metadata);

        return circuit;
    }

    template <typename Flavor>
    static UltraProver_<Flavor> _compute_prover(const std::string& bytecode_path,
                                                const std::string& witness_path,
                                                const bool init_kzg_accumulator)
    {
        // Lambda function to ensure the builder gets freed before generating the vk. Vk generation requires initialing
        // the pippenger runtime state which leads to it being the peak, when its functionality is purely for debugging
        // purposes here.
        auto prover = [](auto&& circuit) {
            return UltraProver_<Flavor>{ circuit };
        }(_compute_circuit<Flavor>(bytecode_path, witness_path, init_kzg_accumulator));

        size_t required_crs_size = prover.proving_key->proving_key.circuit_size;
        if constexpr (Flavor::HasZK) {
            // Ensure there are enough points to commit to the libra polynomials required for zero-knowledge sumcheck
            if (required_crs_size < curve::BN254::SUBGROUP_SIZE * 2) {
                required_crs_size = curve::BN254::SUBGROUP_SIZE * 2;
            }
        }
        init_bn254_crs(required_crs_size);

        return prover;
    }

    template <typename VK> struct ProofAndKey {
        HonkProof proof;
        std::shared_ptr<VK> key;
    };

    template <typename Flavor, typename VK = Flavor::VerificationKey>
    static ProofAndKey<VK> _compute_vk(const bool init_kzg_accumulator,
                                       const std::filesystem::path& bytecode_path,
                                       const std::filesystem::path& witness_path)
    {
        auto prover = _compute_prover<Flavor>(bytecode_path, witness_path, init_kzg_accumulator);
        return { HonkProof{}, std::make_shared<VK>(prover.proving_key->proving_key) };
    }

    template <typename Flavor, typename VK = Flavor::VerificationKey>
    static ProofAndKey<VK> _prove(const bool compute_vk,
                                  const bool init_kzg_accumulator,
                                  const std::filesystem::path& bytecode_path,
                                  const std::filesystem::path& witness_path)
    {
        auto prover = _compute_prover<Flavor>(bytecode_path, witness_path, init_kzg_accumulator);
        return { prover.construct_proof(),
                 compute_vk ? std::make_shared<VK>(prover.proving_key->proving_key) : nullptr };
    }

    template <typename Flavor>
    bool _verify(const bool honk_recursion_2,
                 const std::filesystem::path& proof_path,
                 const std::filesystem::path& vk_path)
    {
        using VerificationKey = Flavor::VerificationKey;
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
        };

        Verifier verifier{ vk, ipa_verification_key };

        bool verified;
        if (honk_recursion_2) {
            // Break up the tube proof into the honk portion and the ipa portion
            const size_t HONK_PROOF_LENGTH = Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS - IPA_PROOF_LENGTH;
            const size_t num_public_inputs = static_cast<size_t>(uint64_t(proof[1])); // WORKTODO: oof
            // The extra calculation is for the IPA proof length.
            info("proof size: ", proof.size());
            info("num public inputs: ", num_public_inputs);
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1182): Move to ProofSurgeon.
            ASSERT(proof.size() == HONK_PROOF_LENGTH + IPA_PROOF_LENGTH + num_public_inputs);
            // split out the ipa proof
            const std::ptrdiff_t honk_proof_with_pub_inputs_length =
                static_cast<std::ptrdiff_t>(HONK_PROOF_LENGTH + num_public_inputs);
            auto ipa_proof = HonkProof(proof.begin() + honk_proof_with_pub_inputs_length, proof.end());
            auto tube_honk_proof = HonkProof(proof.begin(), proof.end() + honk_proof_with_pub_inputs_length);
            verified = verifier.verify_proof(proof, ipa_proof);
        } else {
            verified = verifier.verify_proof(proof);
        }

        info("verified: ", verified);
        return verified;
    }

  public:
    bool check([[maybe_unused]] const Flags& flags,
               [[maybe_unused]] const std::filesystem::path& bytecode_path,
               [[maybe_unused]] const std::filesystem::path& witness_path) override
    {
        throw_or_abort("API function check_witness not implemented");
        return false;
    }

    void prove(const API::Flags& flags,
               const std::filesystem::path& bytecode_path,
               const std::filesystem::path& witness_path,
               const std::filesystem::path& output_dir) override
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
        };
    };

    /**
     * @brief Verifies a client ivc proof and writes the result to stdout
     *
     * Communication:
     * - proc_exit: A boolean value is returned indicating whether the proof is valid.
     *   an exit code of 0 will be returned for success and 1 for failure.
     *
     * @param proof_path Path to the file containing the serialized proof
     * @param vk_path Path to the serialized verification key of the final (MegaHonk) circuit in the stack
     * @param accumualtor_path Path to the file containing the serialized protogalaxy accumulator
     * @return true (resp., false) if the proof is valid (resp., invalid).
     */
    bool verify(const API::Flags& flags,
                const std::filesystem::path& proof_path,
                const std::filesystem::path& vk_path) override
    {
        const bool ipa_accumulation = flags.ipa_accumulation;
        if (ipa_accumulation) {
            info("verifying with ipa accumulation");
            return _verify<UltraRollupFlavor>(ipa_accumulation, proof_path, vk_path);
        }
        if (flags.zk) {
            info("verifying with keccak and zk");
            return _verify<UltraKeccakZKFlavor>(ipa_accumulation, proof_path, vk_path);
        }
        if (flags.oracle_hash_type == "poseidon2") {
            info("verifying with poseidon2");
            return _verify<UltraFlavor>(ipa_accumulation, proof_path, vk_path);
        }
        if (flags.oracle_hash_type == "keccak") {
            info("verifying with keccak");
            return _verify<UltraKeccakFlavor>(ipa_accumulation, proof_path, vk_path);
        }
        return false;
    };

    bool prove_and_verify([[maybe_unused]] const API::Flags& flags,
                          [[maybe_unused]] const std::filesystem::path& bytecode_path,
                          [[maybe_unused]] const std::filesystem::path& witness_path) override
    {
        throw_or_abort("API function prove_and_verify not implemented");
        return false;
    };

    /**
     * @brief Writes a Honk verification key for an ACIR circuit to a file
     *
     * Communication:
     * - stdout: The verification key is written to stdout as a byte array
     * - Filesystem: The verification key is written to the path specified by outputPath
     *
     * @param bytecode_path Path to the file containing the serialized circuit
     * @param outputPath Path to write the verification key to
     */
    void write_vk(const API::Flags& flags,
                  const std::filesystem::path& bytecode_path,
                  const std::filesystem::path& output_path) override
    {
        const auto _write = [&](auto&& _prove_output) {
            write(_prove_output, flags.output_data_type, "vk", output_path);
        };

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
        };
    };

    void gates([[maybe_unused]] const API::Flags& flags,
               [[maybe_unused]] const std::filesystem::path& bytecode_path) override
    {
        ASSERT("API function not implemented");
    };

    void contract([[maybe_unused]] const API::Flags& flags,
                  const std::filesystem::path& output_path,
                  const std::filesystem::path& vk_path) override
    {
        using VK = UltraKeccakFlavor::VerificationKey;

        auto vk = std::make_shared<VK>(from_buffer<VK>(read_file(vk_path)));
        std::string contract = flags.zk ? get_honk_zk_solidity_verifier(vk) : get_honk_solidity_verifier(vk);

        if (output_path == "-") {
            write_string_to_stdout(contract);
            info("contract written to stdout");
        } else {
            write_file(output_path, { contract.begin(), contract.end() });
            info("contract written to: ", output_path);
        }
    };
};
} // namespace bb
