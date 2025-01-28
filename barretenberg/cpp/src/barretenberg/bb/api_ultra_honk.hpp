#pragma once

#include "barretenberg/bb/acir_format_getters.hpp"
#include "barretenberg/bb/api.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_proofs/honk_contract.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/ultra_vanilla_client_ivc/ultra_vanilla_client_ivc.hpp"
#include "libdeflate.h"

namespace bb {

/**
 * @brief Create a Honk a prover from program bytecode and an optional witness
 *
 * @tparam Flavor
 * @param bytecodePath
 * @param witnessPath
 * @return UltraProver_<Flavor>
 */
template <typename Flavor>
UltraProver_<Flavor> compute_valid_prover(const std::string& bytecodePath,
                                          const std::string& witnessPath,
                                          const bool recursive)
{
    using Builder = Flavor::CircuitBuilder;
    using Prover = UltraProver_<Flavor>;
    uint32_t honk_recursion = 0;
    if constexpr (IsAnyOf<Flavor, UltraFlavor, UltraKeccakFlavor>) {
        honk_recursion = 1;
    } else if constexpr (IsAnyOf<Flavor, UltraRollupFlavor>) {
        honk_recursion = 2;
    }
    const acir_format::ProgramMetadata metadata{ .recursive = recursive, .honk_recursion = honk_recursion };

    acir_format::AcirProgram program{ get_constraint_system(bytecodePath, metadata.honk_recursion) };
    if (!witnessPath.empty()) {
        program.witness = get_witness(witnessPath);
    }
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1180): Don't init grumpkin crs when unnecessary.
    init_grumpkin_crs(1 << CONST_ECCVM_LOG_N);

    auto builder = acir_format::create_circuit<Builder>(program, metadata);
    auto prover = Prover{ builder };
    init_bn254_crs(prover.proving_key->proving_key.circuit_size);

    return std::move(prover);
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
    static std::vector<acir_format::AcirProgram> _build_stack(const std::string& input_type,
                                                              const std::filesystem::path& bytecode_path,
                                                              const std::filesystem::path& witness_path)
    {
        using namespace acir_format;

        std::vector<AcirProgram> stack;

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1162): Efficiently unify ACIR stack parsing
        if (input_type == "compiletime_stack") {
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
        info("entered prove function");
        if (!flags.output_type || *flags.output_type != "fields_msgpack") {
            throw_or_abort("No output_type or output_type not supported");
        }

        if (!flags.input_type || !(*flags.input_type == "compiletime_stack" || *flags.input_type == "runtime_stack")) {
            throw_or_abort("No input_type or input_type not supported");
        }

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1163) set these dynamically
        static constexpr size_t PROVER_SRS_LOG_SIZE = 21;
        init_bn254_crs(1 << PROVER_SRS_LOG_SIZE); // WORKTODO...
        UltraVanillaClientIVC ivc{ 1 << PROVER_SRS_LOG_SIZE };
        info("instantiated ivc class");

        std::vector<acir_format::AcirProgram> stack = _build_stack(*flags.input_type, bytecode_path, witness_path);
        info("built stack");
        VectorCircuitSource circuit_source{ stack };
        info("created circuit source");

        info("*flags.initialize_pairing_point_accumulator is: ", *flags.initialize_pairing_point_accumulator);
        ASSERT((*flags.initialize_pairing_point_accumulator == "true") ||
               (*flags.initialize_pairing_point_accumulator) == "false");
        const bool initialize_pairing_point_accumulator = (*flags.initialize_pairing_point_accumulator == "true");
        info("initialize_pairing_point_accumulator is: ", initialize_pairing_point_accumulator);

        HonkProof proof = ivc.prove(circuit_source, /* cache_vks */ false, initialize_pairing_point_accumulator);
        return { proof, *ivc.previous_vk };
    }

    ProofAndKey<UltraKeccakFlavor::VerificationKey> _prove_keccak(const API::Flags& flags,
                                                                  const std::filesystem::path& bytecode_path,
                                                                  const std::filesystem::path& witness_path)
    {
        info("*flags.initialize_pairing_point_accumulator is: ", *flags.initialize_pairing_point_accumulator);
        ASSERT((*flags.initialize_pairing_point_accumulator == "true") ||
               (*flags.initialize_pairing_point_accumulator) == "false");
        const bool initialize_pairing_point_accumulator = (*flags.initialize_pairing_point_accumulator == "true");
        info("initialize_pairing_point_accumulator is: ", initialize_pairing_point_accumulator);

        UltraKeccakProver prover =
            compute_valid_prover<UltraKeccakFlavor>(bytecode_path, witness_path, initialize_pairing_point_accumulator);
        return { prover.construct_proof(), UltraKeccakFlavor::VerificationKey(prover.proving_key->proving_key) };
    }

    ProofAndKey<UltraRollupFlavor::VerificationKey> _prove_rollup(const std::filesystem::path& bytecode_path,
                                                                  const std::filesystem::path& witness_path)
    {
        UltraProver_<UltraRollupFlavor> prover = compute_valid_prover<UltraRollupFlavor>(
            bytecode_path, witness_path, /*initialize_pairing_point_accumulator*/ false);
        return { prover.construct_proof(), UltraRollupFlavor::VerificationKey(prover.proving_key->proving_key) };
    }

    template <typename Flavor>
    bool _verify(const bool ipa_accumulation,
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
        if (ipa_accumulation) {
            init_grumpkin_crs(1 << CONST_ECCVM_LOG_N);
            ipa_verification_key = std::make_shared<VerifierCommitmentKey<curve::Grumpkin>>(1 << CONST_ECCVM_LOG_N);
        };

        Verifier verifier{ vk, ipa_verification_key };

        bool verified;
        if (ipa_accumulation) {
            // Break up the tube proof into the honk portion and the ipa portion
            const size_t HONK_PROOF_LENGTH = Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS - IPA_PROOF_LENGTH;
            const size_t num_public_inputs = static_cast<size_t>(uint64_t(proof[1])); // WORKTODO: oof
            // The extra calculation is for the IPA proof length.
            vinfo("proof size: ", proof.size());
            vinfo("num public inputs: ", num_public_inputs);
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

        vinfo("verified: ", verified);
        return verified;
    }

  public:
    void prove(const API::Flags& flags,
               const std::filesystem::path& bytecode_path,
               const std::filesystem::path& witness_path,
               const std::filesystem::path& output_dir) override
    {
        const auto write_data = [&output_dir](const auto& prover_output) {
            info("writing proof...");
            vinfo("output dir is ", output_dir);
            if (output_dir == "-") {
                write_bytes_to_stdout(to_buffer</*include_size*/ true>(prover_output.proof));
            } else {
                info("writing proof to ", output_dir / "proof");
                write_file(output_dir / "proof", to_buffer</*include_size*/ true>(prover_output.proof));
                // WORKTODO: remove
                info("writing vk to ", output_dir / "vk");
                write_file(output_dir / "vk", to_buffer(prover_output.key));
            }
        };

        if (*flags.ipa_accumulation == "true") {
            vinfo("proving with ipa_accumulation");
            write_data(_prove_rollup(bytecode_path, witness_path));
        } else if (*flags.oracle_hash == "poseidon2") {
            vinfo("proving with poseidon2");
            write_data(_prove_poseidon2(flags, bytecode_path, witness_path));
        } else if (*flags.oracle_hash == "keccak") {
            vinfo("proving with keccak");
            write_data(_prove_keccak(flags, bytecode_path, witness_path));
        } else {
            vinfo(flags);
            throw_or_abort("Invalid proving options specified");
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
        const bool ipa_accumulation = *flags.ipa_accumulation == "true";
        if (ipa_accumulation) {
            vinfo("verifying with ipa accumulation");
            return _verify<UltraRollupFlavor>(ipa_accumulation, proof_path, vk_path);
        }
        if (*flags.oracle_hash == "poseidon2") {
            vinfo("verifying with poseidon2");
            return _verify<UltraFlavor>(ipa_accumulation, proof_path, vk_path);
        }
        if (*flags.oracle_hash == "keccak") {
            vinfo("verifying with keccak");
            return _verify<UltraKeccakFlavor>(ipa_accumulation, proof_path, vk_path);
        }
        return false;
    };

    bool prove_and_verify(const API::Flags& flags,
                          const std::filesystem::path& bytecode_path,
                          const std::filesystem::path& witness_path) override
    {
        if (!flags.input_type || !(*flags.input_type == "compiletime_stack" || *flags.input_type == "runtime_stack")) {
            throw_or_abort("No input_type or input_type not supported");
        }

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1163) set these dynamically
        static constexpr size_t PROVER_SRS_LOG_SIZE = 20;
        init_bn254_crs(1 << PROVER_SRS_LOG_SIZE);
        UltraVanillaClientIVC ivc{ 1 << PROVER_SRS_LOG_SIZE };

        std::vector<acir_format::AcirProgram> stack = _build_stack(*flags.input_type, bytecode_path, witness_path);
        VectorCircuitSource circuit_source{ stack };

        info("*flags.initialize_pairing_point_accumulator is: ", *flags.initialize_pairing_point_accumulator);
        ASSERT((*flags.initialize_pairing_point_accumulator == "true") ||
               (*flags.initialize_pairing_point_accumulator) == "false");
        const bool initialize_pairing_point_accumulator = (*flags.initialize_pairing_point_accumulator == "true");
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
     * @param bytecodePath Path to the file containing the serialized circuit
     * @param outputPath Path to write the verification key to
     */
    void write_vk(const API::Flags& flags,
                  const std::filesystem::path& bytecode_path,
                  const std::filesystem::path& output_path) override
    {
        if (!flags.output_type || *flags.output_type != "fields_msgpack") {
            throw_or_abort("No output_type or output_type not supported");
        }

        if (!flags.input_type || !(*flags.input_type == "compiletime_stack" || *flags.input_type == "runtime_stack")) {
            throw_or_abort("No input_type or input_type not supported");
        }

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1163) set these dynamically
        static constexpr size_t PROVER_SRS_LOG_SIZE = 21;
        init_bn254_crs(1 << PROVER_SRS_LOG_SIZE); // WORKTODO...
        UltraVanillaClientIVC ivc{ 1 << PROVER_SRS_LOG_SIZE };
        info("instantiated ivc class");

        std::vector<acir_format::AcirProgram> stack = _build_stack(*flags.input_type, bytecode_path, "");
        info("built stack");
        VectorCircuitSource circuit_source{ stack };
        info("created circuit source");

        // WORKTODO: this should move in to source? repeated three times.
        // ProgramMetadata should be a std::vector<ProgramMetadatum> + global size info?
        info("*flags.initialize_pairing_point_accumulator is: ", *flags.initialize_pairing_point_accumulator);
        ASSERT((*flags.initialize_pairing_point_accumulator == "true") ||
               (*flags.initialize_pairing_point_accumulator) == "false");
        const bool initialize_pairing_point_accumulator = (*flags.initialize_pairing_point_accumulator == "true");
        info("in write_vk initialize_pairing_point_accumulator is: ", initialize_pairing_point_accumulator);

        // We could also cache all vks and extract the but there's no real difference in efficiency here since we
        // always (sometimes inefficiently) compute the final vk
        ivc.prove(circuit_source, /* cache_vks */ false, initialize_pairing_point_accumulator);
        auto serialized_vk = to_buffer(ivc.previous_vk);
        vinfo("serialized vk");

        if (output_path == "-") {
            vinfo("writing vk to stdout");
            write_bytes_to_stdout(serialized_vk);
            vinfo("vk written to stdout");
        } else {
            write_file(output_path, serialized_vk);
            vinfo("vk written to: ", output_path);
        }
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
        throw_or_abort("API function not implemented");
    };

    void gates([[maybe_unused]] const API::Flags& flags,
               [[maybe_unused]] const std::filesystem::path& bytecode_path,
               [[maybe_unused]] const std::filesystem::path& witness_path) override
    {
        throw_or_abort("API function not implemented");
    };

    void contract([[maybe_unused]] const API::Flags& flags,
                  const std::filesystem::path& output_path,
                  const std::filesystem::path& vk_path) override
    {
        // ASSERT(flags.oracle_hash == "keccak");

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
        std::string contract = get_honk_solidity_verifier(std::move(vk));

        if (output_path == "-") {
            write_string_to_stdout(contract);
            info("contract written to stdout");
        } else {
            write_file(output_path, { contract.begin(), contract.end() });
            info("contract written to: ", output_path);
        }
    };

    void to_fields([[maybe_unused]] const API::Flags& flags,
                   [[maybe_unused]] const std::filesystem::path& proof_path,
                   [[maybe_unused]] const std::filesystem::path& vk_path,
                   [[maybe_unused]] const std::filesystem::path& output_path) override
    {
        throw_or_abort("API function not implemented");
    };
};
} // namespace bb
