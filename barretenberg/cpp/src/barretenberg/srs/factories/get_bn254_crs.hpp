#pragma once
#include <barretenberg/ecc/curves/bn254/g1.hpp>
#include <barretenberg/ecc/curves/bn254/g2.hpp>
#include <filesystem>
#include <fstream>
#include <ios>

namespace bb {
std::vector<g1::affine_element> get_bn254_g1_data(const std::filesystem::path& path,
                                                  size_t num_points,
                                                  bool allow_download = true);
g2::affine_element get_bn254_g2_data(const std::filesystem::path& path, bool allow_download = true);
} // namespace bb
