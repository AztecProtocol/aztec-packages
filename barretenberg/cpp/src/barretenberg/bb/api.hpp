#pragma once
#include "api_flag_types.hpp"
#include <filesystem>
#include <iostream>

namespace bb {

class API {
  public:
    struct Flags {
        bool zk;
        bool initialize_pairing_point_accumulator;
        bool ipa_accumulation;
        OracleHashType oracle_hash_type;
        OutputDataType output_data_type;
        InputType input_type;
        OutputContentType output_content_type;

        friend std::ostream& operator<<(std::ostream& os, const Flags& flags)
        {
            os << "flags: [\n"
               << "  zk: " << flags.zk << "\n"
               << "  initialize_pairing_point_accumulator: " << flags.initialize_pairing_point_accumulator << "\n"
               << "  ipa_accumulation: " << flags.ipa_accumulation << "\n"
               << "  oracle_hash_type: " << to_string(flags.oracle_hash_type) << "\n"
               << "  output_type: " << to_string(flags.output_data_type) << "\n"
               << "  input_type: " << to_string(flags.input_type) << "\n"
               << "  output_content_type: " << to_string(flags.output_content_type) << "\n]";
            return os;
        }
    };

    // // WORKTODO: add checking interface?
    // virtual bool prove(const Flags& flags,
    //                    const std::filesystem::path& bytecode_path,
    //                    const std::filesystem::path& witness_path) = 0;

    virtual void prove(const Flags& flags,
                       const std::filesystem::path& bytecode_path,
                       const std::filesystem::path& witness_path,
                       const std::filesystem::path& output_dir) = 0;

    virtual bool verify(const Flags& flags,
                        const std::filesystem::path& proof_path,
                        const std::filesystem::path& vk_path) = 0;

    virtual bool prove_and_verify(const Flags& flags,
                                  const std::filesystem::path& bytecode_path,
                                  const std::filesystem::path& witness_path) = 0;

    virtual void write_vk(const Flags& flags,
                          const std::filesystem::path& bytecode_path,
                          const std::filesystem::path& output_path) = 0;

    virtual void gates(const Flags& flags,
                       const std::filesystem::path& bytecode_path,
                       const std::filesystem::path& witness_path) = 0;

    virtual void contract(const Flags& flags,
                          const std::filesystem::path& output_path,
                          const std::filesystem::path& vk_path) = 0;

    virtual void write_arbitrary_valid_proof_and_vk_to_file(const API::Flags& flags,
                                                            const std::filesystem::path& output_dir) = 0;

    virtual void write_recursion_inputs(const API::Flags& flags,
                                        const std::string& bytecode_path,
                                        const std::string& witness_path,
                                        const std::string& output_path) = 0;
};
} // namespace bb
