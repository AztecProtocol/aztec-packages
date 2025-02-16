#pragma once
#include <filesystem>
#include <iostream>

namespace bb {

class API {
  public:
    // see the setting of these flags in bb/main.cpp for more information
    struct Flags {
        bool verbose{ false };                // more logging
        bool debug{ false };                  // even more logging
        bool zk{ false };                     // use a zk version of the protocol
        std::filesystem::path crs_path{ "" }; // the location of reference strings for commitment schemes
        bool recursive{ false };              // deprecated flag indicating that a circuit is to be recursively verified
        bool init_kzg_accumulator{ false };   // stripped down version fo `recursive` in the UltraHonk; also deprecated?
        uint32_t honk_recursion{ 0 };         // flag that differentiates between different recursion modes; deprecated?
        bool ipa_accumulation{ false };       // indicate whether the command is doing IPA proof aggregation
        std::string scheme;                   // the proving system or IVC scheme
        std::string input_type;               // is the input bytecode a single circuit or a stack of circuits?
        std::string oracle_hash_type;         // which hash function does the prover use as a random oracle?
        std::string output_data_type;         // output bytes, fields, both, or a msgpack buffer of fields
        std::string output_content_type;      // output a proof, a verification key, or both

        friend std::ostream& operator<<(std::ostream& os, const Flags& flags)
        {
            os << "flags: [\n"
               << "  verbose: " << flags.verbose << "\n"
               << "  debug: " << flags.debug << "\n"
               << "  zk: " << flags.zk << "\n"
               << "  crs_path: " << flags.crs_path << "\n"
               << "  recursive: " << flags.recursive << "\n"
               << "  init_kzg_accumulator: " << flags.init_kzg_accumulator << "\n"
               << "  honk_recursion: " << flags.honk_recursion << "\n"
               << "  ipa_accumulation: " << flags.ipa_accumulation << "\n"
               << "  scheme: " << flags.scheme << "\n"
               << "  input_type: " << flags.input_type << "\n"
               << "  oracle_hash_type: " << flags.oracle_hash_type << "\n"
               << "  output_data_type: " << flags.output_data_type << "\n"
               << "  output_content_type: " << flags.output_content_type << "\n"
               << "]" << std::endl;
            return os;
        }
    };

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1256): Implement
    virtual bool check(const Flags& flags,
                       const std::filesystem::path& bytecode_path,
                       const std::filesystem::path& witness_path) = 0;

    virtual void prove(const Flags& flags,
                       const std::filesystem::path& bytecode_path,
                       const std::filesystem::path& witness_path,
                       const std::filesystem::path& output_dir) = 0;

    virtual bool verify(const Flags& flags,
                        const std::filesystem::path& proof_path,
                        const std::filesystem::path& vk_path) = 0;

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1255): deprecate or include as flag to `prove`
    virtual bool prove_and_verify(const Flags& flags,
                                  const std::filesystem::path& bytecode_path,
                                  const std::filesystem::path& witness_path) = 0;

    virtual void write_vk(const Flags& flags,
                          const std::filesystem::path& bytecode_path,
                          const std::filesystem::path& output_path) = 0;

    virtual void gates(const Flags& flags, const std::filesystem::path& bytecode_path) = 0;

    virtual void contract(const Flags& flags,
                          const std::filesystem::path& output_path,
                          const std::filesystem::path& vk_path) = 0;
};
} // namespace bb
