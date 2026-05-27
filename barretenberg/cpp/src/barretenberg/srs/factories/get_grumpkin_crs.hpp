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
 * @brief Verify every whole chunk present in `data` against the pinned Grumpkin chunk hashes.
 * @details Verifies `min(data.size() / GRUMPKIN_G1_CHUNK_SIZE_BYTES, GRUMPKIN_G1_NUM_CHUNKS)`
 * chunks and throws on any mismatch. A trailing partial chunk is not verifiable and is ignored,
 * so callers wanting a given prefix anchored must pass data covering whole chunks.
 */
void verify_grumpkin_crs_integrity(std::span<const uint8_t> data);

} // namespace bb
