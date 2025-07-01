#pragma once
#include <filesystem>
#include <iostream>

namespace bb {

class API {
  public:
    // see the setting of these flags in bb/main.cpp for more information
    struct Flags {
        bool verbose{ false };    // more logging
        bool debug{ false };      // even more logging
        bool disable_zk{ false }; // disable the zero knowledge property. this is off by default as we aim to use the
                                  // zero knowledge variant of the protocol by default
        std::filesystem::path crs_path{ "" }; // the location of reference strings for commitment schemes
        bool recursive{ false };              // deprecated flag indicating that a circuit is to be recursively verified
        bool init_kzg_accumulator{ false };   // stripped down version fo `recursive` in the UltraHonk; also deprecated?
        uint32_t honk_recursion{ 0 };         // flag that differentiates between different recursion modes; deprecated?
        bool ipa_accumulation{ false };       // indicate whether the command is doing IPA proof aggregation
        std::string scheme;                   // the proving system or IVC scheme
        std::string oracle_hash_type;         // which hash function does the prover use as a random oracle?
        std::string output_format;            // output bytes, fields, both, or a msgpack buffer of fields
        std::string verifier_type; // is a verification key for use a single circuit verifier (e.g. a SNARK or folding
                                   // recursive verifier) or is it for an ivc verifier?
        bool write_vk{ false };    // should we addditionally write the verification key when writing the proof
        bool include_gates_per_opcode{ false }; // should we include gates_per_opcode in the gates command output

        friend std::ostream& operator<<(std::ostream& os, const Flags& flags)
        {
            os << "flags: [\n"
               << "  verbose: " << flags.verbose << "\n"
               << "  debug: " << flags.debug << "\n"
               << "  disable_zk: " << flags.disable_zk << "\n"
               << "  crs_path: " << flags.crs_path << "\n"
               << "  recursive: " << flags.recursive << "\n"
               << "  init_kzg_accumulator: " << flags.init_kzg_accumulator << "\n"
               << "  honk_recursion: " << flags.honk_recursion << "\n"
               << "  ipa_accumulation: " << flags.ipa_accumulation << "\n"
               << "  scheme: " << flags.scheme << "\n"
               << "  oracle_hash_type: " << flags.oracle_hash_type << "\n"
               << "  output_format: " << flags.output_format << "\n"
               << "  verifier_type: " << flags.verifier_type << "\n"
               << "  write_vk " << flags.write_vk << "\n"
               << "  include_gates_per_opcode " << flags.include_gates_per_opcode << "\n"
               << "]" << std::endl;
            return os;
        }
    };

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1256): Implement
    virtual bool check(const Flags& flags,
                       const std::filesystem::path& bytecode_path,
                       const std::filesystem::path& witness_path) = 0;

    virtual bool verify(const Flags& flags,
                        const std::filesystem::path& public_inputs_path,
                        const std::filesystem::path& proof_path,
                        const std::filesystem::path& vk_path) = 0;

    virtual void write_vk(const Flags& flags,
                          const std::filesystem::path& bytecode_path,
                          const std::filesystem::path& output_path) = 0;

    virtual void gates(const Flags& flags, const std::filesystem::path& bytecode_path) = 0;

    virtual void write_solidity_verifier(const Flags& flags,
                                         const std::filesystem::path& output_path,
                                         const std::filesystem::path& vk_path) = 0;
};
} // namespace bb
