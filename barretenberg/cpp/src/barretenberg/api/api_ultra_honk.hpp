#pragma once

#include "barretenberg/api/api.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include <filesystem>
#include <string>

namespace bb {

class UltraHonkAPI : public API {
  public:
    bool check(const Flags& flags,
               const std::filesystem::path& bytecode_path,
               const std::filesystem::path& witness_path) override;

    void prove(const Flags& flags,
               const std::filesystem::path& bytecode_path,
               const std::filesystem::path& witness_path,
               const std::filesystem::path& vk_path,
               const std::filesystem::path& output_dir);

    bool verify(const Flags& flags,
                const std::filesystem::path& public_inputs_path,
                const std::filesystem::path& proof_path,
                const std::filesystem::path& vk_path) override;

    bool prove_and_verify(const Flags& flags,
                          const std::filesystem::path& bytecode_path,
                          const std::filesystem::path& witness_path);

    void write_vk(const Flags& flags,
                  const std::filesystem::path& bytecode_path,
                  const std::filesystem::path& output_path) override;

    void gates(const Flags& flags, const std::filesystem::path& bytecode_path) override;

    void write_solidity_verifier(const Flags& flags,
                                 const std::filesystem::path& output_path,
                                 const std::filesystem::path& vk_path) override;
};

template <typename Flavor>
void write_recursion_inputs_ultra_honk(const std::string& bytecode_path,
                                       const std::string& witness_path,
                                       const std::string& output_path);

extern template void write_recursion_inputs_ultra_honk<UltraFlavor>(const std::string& bytecode_path,
                                                                    const std::string& witness_path,
                                                                    const std::string& output_path);

extern template void write_recursion_inputs_ultra_honk<UltraRollupFlavor>(const std::string& bytecode_path,
                                                                          const std::string& witness_path,
                                                                          const std::string& output_path);

} // namespace bb
