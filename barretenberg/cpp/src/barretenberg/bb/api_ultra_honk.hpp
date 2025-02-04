#pragma once

#include "barretenberg/bb/acir_format_getters.hpp"
#include "barretenberg/bb/api.hpp"
#include "barretenberg/bb/init_srs.hpp"
#include "barretenberg/bb/write_prover_output.hpp"
#include "barretenberg/common/map.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/proof_surgeon.hpp"
#include "barretenberg/dsl/acir_proofs/honk_contract.hpp"
#include "barretenberg/dsl/acir_proofs/honk_zk_contract.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/ultra_vanilla_client_ivc/ultra_vanilla_client_ivc.hpp"

namespace bb {

std::string to_json(const std::vector<bb::fr>& data)
{
    return format("[", join(map(data, [](auto fr) { return format("\"", fr, "\""); })), "]");
}

/**
 * @brief Create a Honk a prover from program bytecode and an optional witness
 *
 * @tparam Flavor
 * @param bytecode_path
 * @param witness_path
 * @return UltraProver_<Flavor>
 */
template <typename Flavor>
UltraProver_<Flavor> compute_valid_prover(const std::string& bytecode_path,
                                          const std::string& witness_path,
                                          const bool recursive)
{
    using Builder = Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    uint32_t honk_recursion = 0;
    if constexpr (IsAnyOf<Flavor, UltraFlavor, UltraKeccakFlavor, UltraKeccakZKFlavor>) {
        honk_recursion = 1;
    } else if constexpr (IsAnyOf<Flavor, UltraRollupFlavor>) {
        honk_recursion = 2;
    }

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1180): Don't init grumpkin crs when unnecessary.
    init_grumpkin_crs(1 << CONST_ECCVM_LOG_N);
    const acir_format::ProgramMetadata metadata{ .recursive = recursive, .honk_recursion = honk_recursion };

    acir_format::AcirProgram program{ get_constraint_system(bytecode_path, metadata.honk_recursion) };
    if (!witness_path.empty()) {
        program.witness = get_witness(witness_path);
    }

    auto builder = acir_format::create_circuit<Builder>(program, metadata);
    auto prover = Prover{ builder };
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

class VectorCircuitSource : public CircuitSource<UltraFlavor> {
    using Builder = UltraCircuitBuilder;
    using VK = UltraFlavor::VerificationKey;
    std::vector<acir_format::AcirProgram> stack;
    std::vector<std::shared_ptr<VK>> vks;
    uint32_t step{ 0 };

  public:
    VectorCircuitSource(const std::vector<acir_format::AcirProgram>& _stack,
                        const std::vector<std::shared_ptr<VK>>& _vks = {})
        : stack(std::move(_stack))
        // use precomputed vks if they are provided, otherwise set them all to nullptr
        , vks(_vks.size() > 0 ? _vks : std::vector<std::shared_ptr<VK>>(stack.size(), nullptr))
    {}

    size_t num_circuits() const override { return stack.size(); }

    // build circuit from acir and partial witness
    Output next() override
    {
        // If something more flexible is needed users can construct ivc fully manually, OR we could use a user-provided
        // vector of ProgramMetadata's, but IMO these flags are very confusing and should be hidden in a context like
        // this, where we have a single, local description of how they are set.
        const auto metadata = [this]() {
            if (num_circuits() == 1) {
                info("case 1");
                return acir_format::ProgramMetadata{ .recursive = true, .honk_recursion = 1 };
            } else if (step < num_circuits() - 1) {
                info("case 2");
                return acir_format::ProgramMetadata{ .recursive = true, .honk_recursion = 1 };
            } else { // final step
                info("case 3");
                return acir_format::ProgramMetadata{ .recursive = false, .honk_recursion = 1 };
            }
        }();
        info("about to create circuit with metadata recursive = ",
             metadata.recursive,
             " and honk_recursion = ",
             metadata.honk_recursion);
        const Builder circuit = acir_format::create_circuit<Builder>(stack[step], metadata);
        const auto& vk = vks[step]; // will be nullptr if no precomputed vks are provided
        info("vk is nullptr: ", vk == nullptr);
        ++step;
        return { circuit, vk };
    }
};

template <typename VK> struct ProofAndKey {
    HonkProof proof;
    VK key;
};

class UltraHonkAPI : public API {
    static std::vector<acir_format::AcirProgram> _build_stack(InputType input_type,
                                                              const std::filesystem::path& bytecode_path,
                                                              const std::filesystem::path& witness_path)
    {
        using namespace acir_format;

        std::vector<AcirProgram> stack;

        // WORKTODO: handle single circuit case here

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1162): Efficiently unify ACIR stack parsing
        if (input_type == InputType::COMPILETIME_STACK) {
            auto program_stack = acir_format::get_acir_program_stack(bytecode_path, witness_path, /*honk_recursion=*/1);
            // Accumulate the entire program stack into the IVC
            while (!program_stack.empty()) {
                auto stack_item = program_stack.back();
                stack.push_back(AcirProgram{ stack_item.constraints, stack_item.witness });
                program_stack.pop_back();
            }
        }

        return stack;
    };

    ProofAndKey<UltraFlavor::VerificationKey> _prove_poseidon2(const API::Flags& flags,
                                                               const std::filesystem::path& bytecode_path,
                                                               const std::filesystem::path& witness_path)
    {
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1163) set these dynamically
        static constexpr size_t PROVER_SRS_LOG_SIZE = 23;
        init_bn254_crs(1 << PROVER_SRS_LOG_SIZE); // WORKTODO...
        UltraVanillaClientIVC ivc{ 1 << PROVER_SRS_LOG_SIZE };
        info("instantiated ivc class");

        std::vector<acir_format::AcirProgram> stack = _build_stack(flags.input_type, bytecode_path, witness_path);
        info("built stack");
        VectorCircuitSource circuit_source{ stack };
        info("created circuit source");

        info("initialize_pairing_point_accumulator is: ", flags.initialize_pairing_point_accumulator);
        const bool initialize_pairing_point_accumulator = flags.initialize_pairing_point_accumulator;
        info("initialize_pairing_point_accumulator is: ", initialize_pairing_point_accumulator);

        HonkProof proof = ivc.prove(circuit_source, /* cache_vks */ false, initialize_pairing_point_accumulator);
        return { proof, *ivc.previous_vk };
    }

    ProofAndKey<UltraKeccakZKFlavor::VerificationKey> _prove_keccak_zk(const bool vk_only,
                                                                       const API::Flags& flags,
                                                                       const std::filesystem::path& bytecode_path,
                                                                       const std::filesystem::path& witness_path)
    {
        info("initialize_pairing_point_accumulator is: ", flags.initialize_pairing_point_accumulator);
        const bool initialize_pairing_point_accumulator = flags.initialize_pairing_point_accumulator;
        info("initialize_pairing_point_accumulator is: ", initialize_pairing_point_accumulator);

        UltraKeccakZKProver prover = compute_valid_prover<UltraKeccakZKFlavor>(
            bytecode_path, witness_path, initialize_pairing_point_accumulator);

        return { vk_only ? HonkProof() : prover.construct_proof(),
                 UltraKeccakZKFlavor::VerificationKey(prover.proving_key->proving_key) };
    }

    ProofAndKey<UltraKeccakZKFlavor::VerificationKey> _prove_keccak(const bool vk_only,
                                                                    const API::Flags& flags,
                                                                    const std::filesystem::path& bytecode_path,
                                                                    const std::filesystem::path& witness_path)
    {
        info("initialize_pairing_point_accumulator is: ", flags.initialize_pairing_point_accumulator);
        const bool initialize_pairing_point_accumulator = flags.initialize_pairing_point_accumulator;
        info("initialize_pairing_point_accumulator is: ", initialize_pairing_point_accumulator);

        UltraKeccakProver prover =
            compute_valid_prover<UltraKeccakFlavor>(bytecode_path, witness_path, initialize_pairing_point_accumulator);

        return { vk_only ? HonkProof() : prover.construct_proof(),
                 UltraKeccakFlavor::VerificationKey(prover.proving_key->proving_key) };
    }

    ProofAndKey<UltraRollupFlavor::VerificationKey> _prove_rollup(const bool vk_only,
                                                                  const std::filesystem::path& bytecode_path,
                                                                  const std::filesystem::path& witness_path)
    {
        UltraProver_<UltraRollupFlavor> prover =
            compute_valid_prover<UltraRollupFlavor>(bytecode_path, witness_path, true);
        return { vk_only ? HonkProof() : prover.construct_proof(),
                 UltraRollupFlavor::VerificationKey(prover.proving_key->proving_key) };
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

    void _prove(const bool vk_only,
                const OutputDataType output_data_type,
                const OutputContentType output_content_type,
                const API::Flags& flags,
                const std::filesystem::path& bytecode_path,
                const std::filesystem::path& witness_path,
                const std::filesystem::path& output_dir)
    {
        if (flags.ipa_accumulation) {
            info("proving with ipa_accumulation");
            write(
                _prove_rollup(vk_only, bytecode_path, witness_path), output_data_type, output_content_type, output_dir);
        } else if (flags.oracle_hash_type == OracleHashType::POSEIDON2) {
            info("proving with poseidon2");
            write(_prove_poseidon2(flags, bytecode_path, witness_path),
                  output_data_type,
                  output_content_type,
                  output_dir);
        } else if (flags.oracle_hash_type == OracleHashType::KECCAK) {
            info("proving with keccak");
            if (flags.zk) {
                write(_prove_keccak_zk(vk_only, flags, bytecode_path, witness_path),
                      output_data_type,
                      output_content_type,
                      output_dir);
            } else {
                write(_prove_keccak(vk_only, flags, bytecode_path, witness_path),
                      output_data_type,
                      output_content_type,
                      output_dir);
            }
        } else {
            info(flags);
            ASSERT("Invalid proving options specified");
        };
    };

  public:
    void prove(const API::Flags& flags,
               const std::filesystem::path& bytecode_path,
               const std::filesystem::path& witness_path,
               const std::filesystem::path& output_dir) override
    {
        if (flags.output_data_type == OutputDataType::UNSPECIFIED) {
            ASSERT("No output type provided");
        }
        if (flags.output_content_type == OutputContentType::UNSPECIFIED) {
            ASSERT("No output content provided");
        }

        _prove(
            /*vk_only*/ false,
            flags.output_data_type,
            flags.output_content_type,
            flags,
            bytecode_path,
            witness_path,
            output_dir);
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
        if (flags.oracle_hash_type == OracleHashType::POSEIDON2) {
            info("verifying with poseidon2");
            return _verify<UltraFlavor>(ipa_accumulation, proof_path, vk_path);
        }
        if (flags.oracle_hash_type == OracleHashType::KECCAK) {
            info("verifying with keccak");
            return _verify<UltraKeccakFlavor>(ipa_accumulation, proof_path, vk_path);
        }
        return false;
    };

    bool prove_and_verify(const API::Flags& flags,
                          const std::filesystem::path& bytecode_path,
                          const std::filesystem::path& witness_path) override
    {
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1163) set these dynamically
        static constexpr size_t PROVER_SRS_LOG_SIZE = 20;
        init_bn254_crs(1 << PROVER_SRS_LOG_SIZE);
        UltraVanillaClientIVC ivc{ 1 << PROVER_SRS_LOG_SIZE };

        std::vector<acir_format::AcirProgram> stack = _build_stack(flags.input_type, bytecode_path, witness_path);
        VectorCircuitSource circuit_source{ stack };

        info("initialize_pairing_point_accumulator is: ", flags.initialize_pairing_point_accumulator);
        const bool initialize_pairing_point_accumulator = flags.initialize_pairing_point_accumulator;
        info("initialize_pairing_point_accumulator is: ", initialize_pairing_point_accumulator);
        const bool verified =
            ivc.prove_and_verify(circuit_source, /* cache_vks= */ false, initialize_pairing_point_accumulator);
        return verified;
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
        if (flags.output_data_type == OutputDataType::UNSPECIFIED) {
            ASSERT("No output type provided");
        }
        ASSERT(flags.output_data_type == OutputDataType::BYTES || flags.output_data_type == OutputDataType::FIELDS);
        OutputDataType output_type =
            flags.output_data_type == OutputDataType::BYTES ? OutputDataType::BYTES : OutputDataType::FIELDS;
        _prove(/*vk_only*/ true, output_type, OutputContentType::VK, flags, bytecode_path, "", output_path);
    };

    /**
     * @brief Write an arbitrary but valid ClientIVC proof and VK to files
     * @details used to test the prove_tube flow
     *
     * @param flags
     * @param output_dir
     */
    void write_arbitrary_valid_proof_and_vk_to_file([[maybe_unused]] const API::Flags& flags,
                                                    [[maybe_unused]] const std::filesystem::path& output_dir) override
    {
        ASSERT("API function not implemented");
    };

    void gates([[maybe_unused]] const API::Flags& flags,
               [[maybe_unused]] const std::filesystem::path& bytecode_path,
               [[maybe_unused]] const std::filesystem::path& witness_path) override
    {
        ASSERT("API function not implemented");
    };

    void contract([[maybe_unused]] const API::Flags& flags,
                  const std::filesystem::path& output_path,
                  const std::filesystem::path& vk_path) override
    {
        using VK = UltraKeccakFlavor::VerificationKey;
        // WOKTODO: not used?
        auto g2_data = get_bn254_g2_data(CRS_PATH);
        // WOKTODO: not used?
        srs::init_crs_factory({}, g2_data);
        info("constructing vk");
        auto vk = std::make_shared<VK>(from_buffer<VK>(read_file(vk_path)));
        info("done vk");
        // WOKTODO: not used?
        vk->pcs_verification_key = std::make_shared<VerifierCommitmentKey<curve::BN254>>();
        // WORKTODO: std::move pointless
        std::string contract =
            flags.zk ? get_honk_zk_solidity_verifier(std::move(vk)) : get_honk_solidity_verifier(std::move(vk));

        if (output_path == "-") {
            write_string_to_stdout(contract);
            info("contract written to stdout");
        } else {
            write_file(output_path, { contract.begin(), contract.end() });
            info("contract written to: ", output_path);
        }
    };

    void write_recursion_inputs(const API::Flags& flags,
                                const std::string& bytecode_path,
                                const std::string& witness_path,
                                const std::string& output_path) override
    {
        const bool ipa_accumulation = flags.ipa_accumulation;
        const auto write_toml = [&](auto&& prover_output) {
            // Construct a string with the content of the toml file (vk hash, proof, public inputs, vk)
            std::string toml_content = acir_format::ProofSurgeon::construct_recursion_inputs_toml_data(
                prover_output.proof, prover_output.key, ipa_accumulation);
            // Write all components to the TOML file
            std::string toml_path = output_path + "/Prover.toml";
            write_file(toml_path, { toml_content.begin(), toml_content.end() });
        };
        if (ipa_accumulation) {
            info("proving with ipa_accumulation");
            write_toml(_prove_rollup(/*vk_only*/ false, bytecode_path, witness_path));
        } else if (flags.oracle_hash_type == OracleHashType::POSEIDON2) {
            info("proving with poseidon2");
            write_toml(_prove_poseidon2(flags, bytecode_path, witness_path));
        } else if (flags.oracle_hash_type == OracleHashType::KECCAK) {
            info("proving with keccak");
            write_toml(_prove_keccak(/*vk_only*/ false, flags, bytecode_path, witness_path));
        } else {
            info(flags);
            ASSERT("Invalid proving options specified");
        };
    }
};
} // namespace bb
