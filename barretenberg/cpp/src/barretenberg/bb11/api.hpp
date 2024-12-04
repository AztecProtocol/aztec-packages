#pragma once
#include <filesystem>

namespace bb {

class API {
  public:
    struct Flags {
        bool verbose{ false };
        std::optional<std::string> scheme;
        std::optional<std::string> input_type;  // single_circuit, runtime_stack, compiletime_stack
        std::optional<std::string> output_type; // bytes, fields, bytes_and_fields, fields_msgpack
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

    virtual void gates(const Flags& flags,
                       const std::filesystem::path& bytecode_path,
                       const std::filesystem::path& witness_path) = 0;

    virtual void contract(const Flags& flags,
                          const std::filesystem::path& output_path,
                          const std::filesystem::path& vk_path) = 0;

    // WORKTODO: should move out?
    virtual void to_fields(const Flags& flags,
                           const std::filesystem::path& proof_path,
                           const std::filesystem::path& vk_path,
                           const std::filesystem::path& output_path) = 0;
};
} // namespace bb
