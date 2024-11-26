#pragma once
#pragma GCC diagnostic ignored "-Wunused-parameter"

#include "barretenberg/bb/api.hpp"
#include "barretenberg/bb/ultra_utils.hpp"
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
    static std::vector<acir_format::AcirProgram> _build_folding_stack(const std::string& decode_msgpack,
                                                                      const std::filesystem::path& bytecode_path,
                                                                      const std::filesystem::path& witness_path)
    {
        using namespace acir_format;

        std::vector<AcirProgram> folding_stack;

        if (decode_msgpack == "--decode-msgpack") {
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
        } else if (decode_msgpack == "--do-not-decode-msgpack") {
            AcirFormat constraints = get_constraint_system(bytecode_path, /*honk_recursion=*/false);
            WitnessVector witness = get_witness(witness_path);
            folding_stack.push_back(AcirProgram{ constraints, witness });
        } else {
            throw_or_abort("invalid msgpack decoding flag");
        }

        return folding_stack;
    };

    static ClientIVC _accumulate(std::vector<acir_format::AcirProgram>& folding_stack)
    {
        using Builder = MegaCircuitBuilder;
        using Program = acir_format::AcirProgram;

        using namespace acir_format;

        // WORKTODO: dynamic setting of these
        init_bn254_crs(1 << 20);
        init_grumpkin_crs(1 << 15);

        // TODO(#7371) dedupe this with the rest of the similar code
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1101): remove use of auto_verify_mode
        ClientIVC ivc{ { E2E_FULL_TEST_STRUCTURE }, /*auto_verify_mode=*/true };

        // Accumulate the entire program stack into the IVC
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1116): remove manual setting of is_kernel once
        // databus has been integrated into noir kernel programs
        bool is_kernel = false;
        for (Program& program : folding_stack) {
            // Construct a bberg circuit from the acir representation then accumulate it into the IVC
            auto circuit =
                create_circuit<Builder>(program.constraints, true, 0, program.witness, false, ivc.goblin.op_queue);

            // Set the internal is_kernel flag based on the local mechanism only if it has not already been set to true
            if (!circuit.databus_propagation_data.is_kernel) {
                circuit.databus_propagation_data.is_kernel = is_kernel;
            }
            is_kernel = !is_kernel;
            ivc.accumulate(circuit);
        }

        return ivc;
    };

  public:
    void prove(const std::string& decode_msgpack,
               const std::string& output_type_flag,
               const std::filesystem::path& bytecode_path,
               const std::filesystem::path& witness_path,
               const std::filesystem::path& output_dir) override
    {
        // WORKTODO: move and systematize validation logic
        if (output_type_flag != "--msgpack") {
            throw_or_abort("Output type " + output_type_flag + " not supported");
        }

        std::vector<acir_format::AcirProgram> folding_stack =
            _build_folding_stack(decode_msgpack, bytecode_path, witness_path);
        ClientIVC ivc = _accumulate(folding_stack);
        ClientIVC::Proof proof = ivc.prove();

        // Write the proof and verification keys into the working directory in  'binary' format (in practice it seems
        // this directory is passed by bb.js)
        const std::filesystem::path proof_path = output_dir / "client_ivc_proof";
        const std::filesystem::path mega_vk_path = output_dir / "mega_vk"; // the vk of the last circuit in the stack
        const std::filesystem::path translator_vk_path = output_dir / "translator_vk";
        const std::filesystem::path eccvm_vk_path = output_dir / "ecc_vk";

        auto mega_vk = std::make_shared<ClientIVC::DeciderVerificationKey>(ivc.honk_vk);
        auto eccvm_vk = std::make_shared<ECCVMFlavor::VerificationKey>(ivc.goblin.get_eccvm_proving_key());
        auto translator_vk =
            std::make_shared<TranslatorFlavor::VerificationKey>(ivc.goblin.get_translator_proving_key());

        vinfo("writing ClientIVC proof and vk...");
        write_file(proof_path, to_buffer(proof));
        write_file(mega_vk_path, to_buffer(mega_vk));
        write_file(translator_vk_path, to_buffer(translator_vk));
        write_file(eccvm_vk_path, to_buffer(eccvm_vk));
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
    bool verify(const std::filesystem::path& proof_path,
                const std::filesystem::path& mega_vk,
                const std::filesystem::path& eccvm_vk_path,
                const std::filesystem::path& translator_vk_path) override
    {
        init_bn254_crs(1);
        init_grumpkin_crs(1 << 15);

        const auto proof = from_buffer<ClientIVC::Proof>(read_file(proof_path));

        const auto final_vk = read_to_shared_ptr<ClientIVC::VerificationKey>(mega_vk);
        final_vk->pcs_verification_key = std::make_shared<VerifierCommitmentKey<curve::BN254>>();

        const auto eccvm_vk = read_to_shared_ptr<ECCVMFlavor::VerificationKey>(eccvm_vk_path);
        eccvm_vk->pcs_verification_key =
            std::make_shared<VerifierCommitmentKey<curve::Grumpkin>>(eccvm_vk->circuit_size + 1);

        const auto translator_vk = read_to_shared_ptr<TranslatorFlavor::VerificationKey>(translator_vk_path);
        translator_vk->pcs_verification_key = std::make_shared<VerifierCommitmentKey<curve::BN254>>();

        const bool verified = ClientIVC::verify(proof, final_vk, eccvm_vk, translator_vk);
        vinfo("verified: ", verified);
        return verified;
    };

    bool prove_and_verify(const std::string& decode_msgpack,
                          const std::filesystem::path& bytecode_path,
                          const std::filesystem::path& witness_path) override
    {
        std::vector<acir_format::AcirProgram> folding_stack =
            _build_folding_stack(decode_msgpack, bytecode_path, witness_path);
        ClientIVC ivc = _accumulate(folding_stack);
        const bool verified = ivc.prove_and_verify();
        return verified;
    };

    void gates(const std::filesystem::path& bytecode_path, const std::filesystem::path& witness_path) override{};

    void contract(const std::filesystem::path& output_path, const std::filesystem::path& vk_path) override{};

    void to_fields(const std::filesystem::path& proof_path,
                   const std::filesystem::path& vk_path,
                   const std::filesystem::path& output_path) override{};
};
} // namespace bb
