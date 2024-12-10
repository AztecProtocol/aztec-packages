#pragma once

#include "barretenberg/bb/acir_format_getters.hpp"
#include "barretenberg/bb/api.hpp"
#include "barretenberg/bb/init_srs.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "libdeflate.h"

namespace bb {

template <typename T> std::shared_ptr<T> read_to_shared_ptr(const std::filesystem::path& path)
{
    return std::make_shared<T>(from_buffer<T>(read_file(path)));
};

// TODO(#7371): this could probably be more idiomatic
template <typename T> T unpack_from_file(const std::filesystem::path& filename)
{
    std::ifstream fin;
    fin.open(filename, std::ios::ate | std::ios::binary);
    if (!fin.is_open()) {
        throw std::invalid_argument("file not found");
    }
    if (fin.tellg() == -1) {
        throw std::invalid_argument("something went wrong");
    }

    uint64_t fsize = static_cast<uint64_t>(fin.tellg());
    fin.seekg(0, std::ios_base::beg);

    T result;
    char* encoded_data = new char[fsize];
    fin.read(encoded_data, static_cast<std::streamsize>(fsize));
    msgpack::unpack(encoded_data, fsize).get().convert(result);
    return result;
}

// TODO(#7371) find a home for this
acir_format::WitnessVector witness_map_to_witness_vector(std::map<std::string, std::string> const& witness_map)
{
    acir_format::WitnessVector wv;
    size_t index = 0;
    for (auto& e : witness_map) {
        uint64_t value = std::stoull(e.first);
        // ACIR uses a sparse format for WitnessMap where unused witness indices may be left unassigned.
        // To ensure that witnesses sit at the correct indices in the `WitnessVector`, we fill any indices
        // which do not exist within the `WitnessMap` with the dummy value of zero.
        while (index < value) {
            wv.push_back(fr(0));
            index++;
        }
        wv.push_back(fr(uint256_t(e.second)));
        index++;
    }
    return wv;
}

std::vector<uint8_t> decompress(uint8_t* bytes, size_t size)
{
    std::vector<uint8_t> content;
    // initial size guess
    content.resize(1024ULL * 128ULL);
    for (;;) {
        auto decompressor = std::unique_ptr<libdeflate_decompressor, void (*)(libdeflate_decompressor*)>{
            libdeflate_alloc_decompressor(), libdeflate_free_decompressor
        };
        size_t actual_size = 0;
        libdeflate_result decompress_result = libdeflate_gzip_decompress(
            decompressor.get(), bytes, size, std::data(content), std::size(content), &actual_size);
        if (decompress_result == LIBDEFLATE_INSUFFICIENT_SPACE) {
            // need a bigger buffer
            content.resize(content.size() * 2);
            continue;
        }
        if (decompress_result == LIBDEFLATE_BAD_DATA) {
            throw std::invalid_argument("bad gzip data in bb main");
        }
        content.resize(actual_size);
        break;
    }
    return content;
}

class ClientIVCAPI : public API {
    static std::vector<acir_format::AcirProgram> _build_folding_stack(const std::string& input_type,
                                                                      const std::filesystem::path& bytecode_path,
                                                                      const std::filesystem::path& witness_path)
    {
        using namespace acir_format;

        std::vector<AcirProgram> folding_stack;

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1162): Efficiently unify ACIR stack parsing
        if (input_type == "compiletime_stack") {
            auto program_stack =
                acir_format::get_acir_program_stack(bytecode_path, witness_path, /*honk_recursion=*/false);
            // Accumulate the entire program stack into the IVC
            while (!program_stack.empty()) {
                auto stack_item = program_stack.back();
                folding_stack.push_back(AcirProgram{ stack_item.constraints, stack_item.witness });
                program_stack.pop_back();
            }
        }

        if (input_type == "runtime_stack") {
            std::vector<std::string> gzipped_bincodes;
            std::vector<std::string> witness_data;
            gzipped_bincodes = unpack_from_file<std::vector<std::string>>(bytecode_path);
            witness_data = unpack_from_file<std::vector<std::string>>(witness_path);
            for (auto [bincode, wit] : zip_view(gzipped_bincodes, witness_data)) {
                // TODO(#7371) there is a lot of copying going on in bincode, we should make sure this writes as a
                // buffer in the future
                std::vector<uint8_t> constraint_buf =
                    decompress(reinterpret_cast<uint8_t*>(bincode.data()), bincode.size()); // NOLINT
                std::vector<uint8_t> witness_buf =
                    decompress(reinterpret_cast<uint8_t*>(wit.data()), wit.size()); // NOLINT

                AcirFormat constraints = circuit_buf_to_acir_format(constraint_buf, /*honk_recursion=*/false);
                WitnessVector witness = witness_buf_to_witness_data(witness_buf);

                folding_stack.push_back(AcirProgram{ constraints, witness });
            }
        }

        return folding_stack;
    };

    static void _accumulate(const std::shared_ptr<ClientIVC>& ivc, std::vector<acir_format::AcirProgram>& folding_stack)
    {
        using Builder = MegaCircuitBuilder;
        using Program = acir_format::AcirProgram;

        using namespace acir_format;

        ProgramMetadata metadata{ ivc };

        // Accumulate the entire program stack into the IVC
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1116): remove manual setting of is_kernel
        bool is_kernel = false;
        for (Program& program : folding_stack) {
            // Construct a bberg circuit from the acir representation then accumulate it into the IVC
            Builder circuit = acir_format::create_circuit<Builder>(program, metadata);

            // Set the internal is_kernel flag based on the local mechanism only if it has not already been set to true
            if (ivc->auto_verify_mode) {
                if (!circuit.databus_propagation_data.is_kernel) {
                    circuit.databus_propagation_data.is_kernel = is_kernel;
                }
                is_kernel = !is_kernel;
            }

            // Do one step of ivc accumulator or, if there is only one circuit in the stack, prove that circuit. In this
            // case, no work is added to the Goblin opqueue, but VM proofs for trivials inputs are produced.
            ivc->accumulate(circuit, /*one_circuit=*/folding_stack.size() == 1);
        }
    };

  public:
    void prove(const API::Flags& flags,
               const std::filesystem::path& bytecode_path,
               const std::filesystem::path& witness_path,
               const std::filesystem::path& output_dir) override
    {
        if (!flags.output_type || *flags.output_type != "fields_msgpack") {
            throw_or_abort("No output_type or output_type not supported");
        }

        if (!flags.input_type || !(*flags.input_type == "compiletime_stack" || *flags.input_type == "runtime_stack")) {
            throw_or_abort("No input_type or input_type not supported");
        }

        std::vector<acir_format::AcirProgram> folding_stack =
            _build_folding_stack(*flags.input_type, bytecode_path, witness_path);

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1163) set these dynamically
        init_bn254_crs(1 << 20);
        init_grumpkin_crs(1 << 15);

        TraceSettings trace_settings{ E2E_FULL_TEST_STRUCTURE };
        bool auto_verify = !flags.no_auto_verify;
        auto ivc = std::make_shared<ClientIVC>(trace_settings, auto_verify);
        vinfo("performing accumulation with auto-verify = ", auto_verify);
        _accumulate(ivc, folding_stack);
        ClientIVC::Proof proof = ivc->prove();

        // Write the proof and verification keys into the working directory in  'binary' format (in practice it seems
        // this directory is passed by bb.js)
        vinfo("writing ClientIVC proof and vk...");
        write_file(output_dir / "client_ivc_proof", to_buffer(proof));

        auto eccvm_vk = std::make_shared<ECCVMFlavor::VerificationKey>(ivc->goblin.get_eccvm_proving_key());
        auto translator_vk =
            std::make_shared<TranslatorFlavor::VerificationKey>(ivc->goblin.get_translator_proving_key());
        write_file(output_dir / "client_ivc_vk",
                   to_buffer(ClientIVC::VerificationKey{ ivc->honk_vk, eccvm_vk, translator_vk }));
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
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1163): Set these dynamically
        init_bn254_crs(1);
        init_grumpkin_crs(1 << 15);

        const auto proof = from_buffer<ClientIVC::Proof>(read_file(proof_path));
        const auto vk = from_buffer<ClientIVC::VerificationKey>(read_file(vk_path));

        vk.mega->pcs_verification_key = std::make_shared<VerifierCommitmentKey<curve::BN254>>();
        vk.eccvm->pcs_verification_key =
            std::make_shared<VerifierCommitmentKey<curve::Grumpkin>>(vk.eccvm->circuit_size + 1);
        vk.translator->pcs_verification_key = std::make_shared<VerifierCommitmentKey<curve::BN254>>();

        const bool verified = ClientIVC::verify(proof, vk);
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
        init_bn254_crs(1 << 20);
        init_grumpkin_crs(1 << 15);

        std::vector<acir_format::AcirProgram> folding_stack =
            _build_folding_stack(*flags.input_type, bytecode_path, witness_path);
        TraceSettings trace_settings{ E2E_FULL_TEST_STRUCTURE };
        bool auto_verify = true;
        auto ivc = std::make_shared<ClientIVC>(trace_settings, auto_verify);
        vinfo("performing accumulation with auto-verify = ", auto_verify);
        _accumulate(ivc, folding_stack);
        const bool verified = ivc->prove_and_verify();
        return verified;
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
