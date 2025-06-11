#pragma once
#include "barretenberg/api/acir_format_getters.hpp"
#include "barretenberg/api/api.hpp"
#include <filesystem>
#include <stdexcept>
#include <string>
#include <vector>

namespace bb {

class ClientIVCAPI : public API {

  public:
    void prove(const Flags& flags, const std::filesystem::path& input_path, const std::filesystem::path& output_dir);

    bool verify(const Flags& flags,
                const std::filesystem::path& public_inputs_path,
                const std::filesystem::path& proof_path,
                const std::filesystem::path& vk_path) override;

    bool prove_and_verify(const std::filesystem::path& input_path);

    void gates(const Flags& flags, const std::filesystem::path& bytecode_path) override;

    void write_solidity_verifier(const Flags& flags,
                                 const std::filesystem::path& output_path,
                                 const std::filesystem::path& vk_path) override;

    // Two modes:
    // - write a vk for a standalone circuit
    // - write the vk of the hiding circuit which requires the last circuit input (e.g. a private-tail in Aztec) to be
    // passed. This is used just to parameterize the hiding circuit with the last circuit public inputs amount.
    void write_vk(const Flags& flags,
                  const std::filesystem::path& bytecode_path,
                  const std::filesystem::path& output_path) override;

    bool check_precomputed_vks(const std::filesystem::path& input_path);
    bool check(const Flags& flags,
               const std::filesystem::path& bytecode_path,
               const std::filesystem::path& witness_path) override;
};

void gate_count_for_ivc(const std::string& bytecode_path, bool include_gates_per_opcode);

void write_arbitrary_valid_client_ivc_proof_and_vk_to_file(const std::filesystem::path& output_dir);

acir_format::WitnessVector witness_map_to_witness_vector(std::map<std::string, std::string> const& witness_map);

std::vector<uint8_t> decompress(const void* bytes, size_t size);

} // namespace bb
