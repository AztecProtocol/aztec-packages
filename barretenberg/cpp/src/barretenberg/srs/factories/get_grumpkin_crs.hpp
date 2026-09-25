#pragma once
#include <barretenberg/ecc/curves/bn254/g1.hpp>
#include <barretenberg/ecc/curves/grumpkin/grumpkin.hpp>
#include <filesystem>
#include <fstream>
#include <ios>
#include <span>

namespace bb {

std::vector<curve::Grumpkin::AffineElement> get_grumpkin_g1_data(const std::filesystem::path& path,
                                                                 size_t num_points,
                                                                 bool allow_download = true);

/**
 * @brief Verify every byte against the pinned Grumpkin chunk hashes.
 * @details Input must contain one to GRUMPKIN_G1_NUM_CHUNKS complete chunks; empty, partial and oversized
 * buffers are rejected. Callers loading a smaller prefix must supply the complete chunks covering it.
 */
void verify_grumpkin_crs_integrity(std::span<const uint8_t> data);

} // namespace bb
