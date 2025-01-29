#pragma once
#include <filesystem>
#include <iostream>

namespace bb {

class API {
  public:
    struct Flags {
        std::optional<std::string> initialize_pairing_point_accumulator; // fka recursive
        std::optional<std::string> ipa_accumulation;                     // true or false
        std::optional<std::string> oracle_hash;                          // poseidon2, keccak, ... starknet_poseidon??
        std::optional<std::string> output_type;    // bytes, fields, bytes_and_fields, fields_msgpack
        std::optional<std::string> input_type;     // compiletime_stack, runtime_stack
        std::optional<std::string> output_content; // proof, vk, proof_and_vk

        friend std::ostream& operator<<(std::ostream& os, const Flags& flags)
        {
            os << "flags: [\n"
               << "  initialize_pairing_point_accumulator: " << *flags.initialize_pairing_point_accumulator << "\n"
               << "  ipa_accumulation: " << *flags.ipa_accumulation << "\n"
               << "  oracle_hash: " << *flags.oracle_hash << "\n"
               << "  output_type: " << *flags.output_type << "\n"
               << "  input_type: " << *flags.input_type << "\n"
               << "  output_content: " << *flags.output_content << "\n]";
            return os;
        }
    };

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

    virtual void to_fields(const Flags& flags,
                           const std::filesystem::path& proof_path,
                           const std::filesystem::path& vk_path,
                           const std::filesystem::path& output_path) = 0;

    virtual void write_arbitrary_valid_proof_and_vk_to_file(const API::Flags& flags,
                                                            const std::filesystem::path& output_dir) = 0;
};
} // namespace bb
