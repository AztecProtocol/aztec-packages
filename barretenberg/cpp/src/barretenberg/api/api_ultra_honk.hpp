#pragma once

#include "barretenberg/api/api.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"
#include <string>

namespace bb {

class UltraHonkAPI : public API {
  public:
    bool check(const Flags& flags, const std::string& bytecode_path, const std::string& witness_path) override;

    void prove(const Flags& flags,
               const std::string& bytecode_path,
               const std::string& witness_path,
               const std::string& vk_path,
               const std::string& output_dir);

    bool verify(const Flags& flags,
                const std::string& public_inputs_path,
                const std::string& proof_path,
                const std::string& vk_path) override;

    bool prove_and_verify(const Flags& flags, const std::string& bytecode_path, const std::string& witness_path);

    void write_vk(const Flags& flags, const std::string& bytecode_path, const std::string& output_path) override;

    void gates(const Flags& flags, const std::string& bytecode_path) override;

    void write_solidity_verifier(const Flags& flags,
                                 const std::string& output_path,
                                 const std::string& vk_path) override;
};

} // namespace bb
