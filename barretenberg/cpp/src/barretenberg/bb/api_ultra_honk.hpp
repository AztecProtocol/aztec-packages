#pragma once

#include "barretenberg/bb/acir_format_getters.hpp"
#include "barretenberg/bb/api.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/ultra_vanilla_client_ivc/ultra_vanilla_client_ivc.hpp"
#include "libdeflate.h"

namespace bb {

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
                vinfo("case 1");
                return acir_format::ProgramMetadata{ .recursive = true, .honk_recursion = 1 };
            } else if (step < num_circuits() - 1) {
                vinfo("case 2");
                return acir_format::ProgramMetadata{ .recursive = true, .honk_recursion = 1 };
            } else { // final step
                vinfo("case 3");
                return acir_format::ProgramMetadata{ .recursive = false, .honk_recursion = 1 };
            }
        }();
        vinfo("about to create circuit with metadata recursive = ",
              metadata.recursive,
              " and honk_recursion = ",
              metadata.honk_recursion);
        Builder circuit = acir_format::create_circuit<Builder>(stack[step], metadata);
        const auto& vk = vks[step]; // will be nullptr if no precomputed vks are provided
        vinfo("vk is nullptr: ", vk == nullptr);
        ++step;
        return { circuit, vk };
    }
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

  public:
    void prove(const API::Flags& flags,
               const std::filesystem::path& bytecode_path,
               const std::filesystem::path& witness_path,
               const std::filesystem::path& output_dir) override
    {
        vinfo("entered prove function");
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
        vinfo("instantiated ivc class");

        std::vector<acir_format::AcirProgram> stack = _build_stack(*flags.input_type, bytecode_path, witness_path);
        vinfo("built stack");
        VectorCircuitSource circuit_source{ stack };
        vinfo("created circuit source");

        vinfo("*flags.initialize_pairing_point_accumulator is: ", *flags.initialize_pairing_point_accumulator);
        ASSERT((*flags.initialize_pairing_point_accumulator == "true") ||
               (*flags.initialize_pairing_point_accumulator) == "false");
        const bool initialize_pairing_point_accumulator = (*flags.initialize_pairing_point_accumulator == "true");
        vinfo("initialize_pairing_point_accumulator is: ", initialize_pairing_point_accumulator);

        UltraVanillaClientIVC::Proof proof =
            ivc.prove(circuit_source, /* cache_vks */ false, initialize_pairing_point_accumulator);

        vinfo("writing UltraVanillaClientIVC proof and vk...");
        vinfo("writing proof to ", output_dir / "proof");
        write_file(output_dir / "proof", to_buffer</*include_size=*/true>(proof));
        vinfo("writing vk to ", output_dir / "vk");
        write_file(output_dir / "vk", to_buffer(*ivc.previous_vk));
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
    bool verify([[maybe_unused]] const API::Flags& flags,
                const std::filesystem::path& proof_path,
                const std::filesystem::path& vk_path) override
    {
        auto g2_data = get_bn254_g2_data(CRS_PATH);
        srs::init_crs_factory({}, g2_data);

        vinfo("reading proof from ", proof_path);
        const auto proof = from_buffer<UltraVanillaClientIVC::Proof>(read_file(proof_path));
        vinfo("reading vk from ", vk_path);
        auto vk = from_buffer<UltraVanillaClientIVC::VK>(read_file(vk_path));
        vk.pcs_verification_key = std::make_shared<VerifierCommitmentKey<curve::BN254>>();

        const bool verified = UltraVanillaClientIVC::verify(proof, std::make_shared<UltraVanillaClientIVC::VK>(vk));
        vinfo("verified: ", verified);
        return verified;
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

        vinfo("*flags.initialize_pairing_point_accumulator is: ", *flags.initialize_pairing_point_accumulator);
        ASSERT((*flags.initialize_pairing_point_accumulator == "true") ||
               (*flags.initialize_pairing_point_accumulator) == "false");
        const bool initialize_pairing_point_accumulator = (*flags.initialize_pairing_point_accumulator == "true");
        vinfo("initialize_pairing_point_accumulator is: ", initialize_pairing_point_accumulator);
        const bool verified =
            ivc.prove_and_verify(circuit_source, /* cache_vks= */ false, initialize_pairing_point_accumulator);
        return verified;
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
                  [[maybe_unused]] const std::filesystem::path& output_path,
                  [[maybe_unused]] const std::filesystem::path& vk_path) override
    {
        throw_or_abort("API function not implemented");
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
