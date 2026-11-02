#pragma once
#include <barretenberg/ecc/curves/bn254/g1.hpp>
#include <barretenberg/ecc/curves/bn254/g2.hpp>
#include <filesystem>
#include <fstream>
#include <ios>
#include <memory>
#include <span>

namespace bb {
std::vector<g1::affine_element> get_bn254_g1_data(const std::filesystem::path& path,
                                                  size_t num_points,
                                                  bool allow_download = true);

// Overload with custom URLs for testing fallback behavior
std::vector<g1::affine_element> get_bn254_g1_data(const std::filesystem::path& path,
                                                  size_t num_points,
                                                  bool allow_download,
                                                  const std::string& primary_url,
                                                  const std::string& fallback_url);

g2::affine_element get_bn254_g2_data(const std::filesystem::path& path);

/**
 * @brief BN254 G1 CRS points together with the storage that keeps them alive: a heap vector, or a read-only shared
 * mapping of the native-layout cache file.
 */
struct Bn254G1Points {
    std::shared_ptr<const void> storage;
    std::span<const g1::affine_element> points;
};

/**
 * @brief Load at least num_points BN254 G1 points, preferring a read-only shared mapping of the native-layout cache
 * (`bn254_g1.native.dat`) so the points are clean file-backed pages rather than heap memory.
 *
 * @details On a cache miss the points are decoded by get_bn254_g1_data, the cache is written from them, and the
 * decoded vector is dropped in favour of the new mapping. The cache is bypassed with `BB_VERIFY_CRS` set (it carries
 * no pinned hashes) and on WASM, Windows and big-endian targets; failing to write it falls back to the vector.
 */
Bn254G1Points load_bn254_g1_points(const std::filesystem::path& path, size_t num_points, bool allow_download = true);
} // namespace bb
