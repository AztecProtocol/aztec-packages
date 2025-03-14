#pragma once

#include <string>
#include <vector>

// UltraPlonk is deprecated. If it weren't then we would make this all conform to the API interface class.
namespace bb {
void prove_ultra_plonk(const std::string& bytecode_path,
                       const std::string& witness_path,
                       const std::string& output_path,
                       const bool recursive);
void prove_output_all_ultra_plonk(const std::string& bytecode_path,
                                  const std::string& witness_path,
                                  const std::string& output_path,
                                  const bool recursive);
bool verify_ultra_plonk(const std::string& proof_path, const std::string& vk_path);
bool prove_and_verify_ultra_plonk(const std::string& bytecode_path,
                                  const bool recursive,
                                  const std::string& witness_path);
void contract_ultra_plonk(const std::string& output_path, const std::string& vk_path);
void write_vk_ultra_plonk(const std::string& bytecode_path, const std::string& output_path, const bool recursive);
void write_pk_ultra_plonk(const std::string& bytecode_path, const std::string& output_path, const bool recursive);
void proof_as_fields(const std::string& proof_path, std::string const& vk_path, const std::string& output_path);
void vk_as_fields(const std::string& vk_path, const std::string& output_path);
} // namespace bb
