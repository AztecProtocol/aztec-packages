#pragma once
#include <filesystem>
#include <iostream>

namespace bb {

class API {
  public:
    struct Flags {
        bool verbose{ false };
        bool debug{ false };
        bool zk{ false };
        std::filesystem::path crs_path{ "" };
        bool recursive{ false };
        bool init_kzg_accumulator{ false };
        uint32_t honk_recursion{ 0 };
        bool ipa_accumulation{ false };
        std::string scheme;
        std::string input_type;
        std::string oracle_hash_type;
        std::string output_data_type;
        std::string output_content_type;

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
