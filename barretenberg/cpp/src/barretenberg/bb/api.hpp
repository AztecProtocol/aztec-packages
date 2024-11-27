#pragma once
#include <filesystem>

namespace bb {
class API {
  public:
    virtual void prove(const std::string& decode_msgpack, // WORKTODO
                       const std::string& output_type_flag,
                       const std::filesystem::path& bytecode_path,
                       const std::filesystem::path& witness_path,
                       const std::filesystem::path& output_dir) = 0;

    virtual bool verify(const std::filesystem::path& proof_path, const std::filesystem::path& vk_path) = 0;

    virtual bool prove_and_verify(const std::string& decode_msgpack, // WORKTODO
                                  const std::filesystem::path& bytecode_path,
                                  const std::filesystem::path& witness_path) = 0;

    virtual void gates(const std::filesystem::path& bytecode_path, const std::filesystem::path& witness_path) = 0;

    virtual void contract(const std::filesystem::path& output_path, const std::filesystem::path& vk_path) = 0;

    virtual void to_fields(const std::filesystem::path& proof_path,
                           const std::filesystem::path& vk_path,
                           const std::filesystem::path& output_path) = 0;
};
} // namespace bb
