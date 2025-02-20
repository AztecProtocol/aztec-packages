#pragma once
#include "barretenberg/api/acir_format_getters.hpp"
#include "barretenberg/api/api.hpp"
#include <filesystem>
#include <string>
#include <vector>

namespace bb {

class ClientIVCAPI : public API {

  public:
    void prove(const Flags& flags,
               const std::filesystem::path& bytecode_path,
               const std::filesystem::path& witness_path,
               const std::filesystem::path& output_dir) override;

    bool verify(const Flags& flags,
                const std::filesystem::path& proof_path,
                const std::filesystem::path& vk_path) override;

    bool prove_and_verify(const Flags& flags,
                          const std::filesystem::path& bytecode_path,
                          const std::filesystem::path& witness_path) override;

    void gates(const Flags& flags, const std::filesystem::path& bytecode_path) override;

    void write_contract(const Flags& flags,
                        const std::filesystem::path& output_path,
                        const std::filesystem::path& vk_path) override;

    void write_vk(const Flags& flags,
                  const std::filesystem::path& bytecode_path,
                  const std::filesystem::path& output_path) override;

    bool check(const Flags& flags,
               const std::filesystem::path& bytecode_path,
               const std::filesystem::path& witness_path) override;
};

void gate_count_for_ivc(const std::string& bytecode_path);

void write_arbitrary_valid_client_ivc_proof_and_vk_to_file(const std::filesystem::path& output_dir);

acir_format::WitnessVector witness_map_to_witness_vector(std::map<std::string, std::string> const& witness_map);

std::vector<uint8_t> decompress(const void* bytes, size_t size);

void write_vk_for_ivc(const bool output_fields, const std::string& bytecode_path, const std::string& output_path);
} // namespace bb
