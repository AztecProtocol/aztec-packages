#pragma once
#include "transcript_loader.hpp"
#include <cstddef>
#include <vector>

namespace bb::ignition {

/**
 * @brief Re-derive SHA-256 chunk hashes from verified S3 points and compare against
 * the hardcoded values in bn254_g1_chunk_hashes.hpp.
 *
 * The CDN g1.dat format prepends the BN254 generator at index 0 and uses x-first big-endian
 * serialization. The hardcoded hashes cover 33,554,433 CDN points (generator + 33,554,432 SRS points)
 * in 257 chunks of 131,072 points (8 MB each).
 *
 * @param verified_points At least the first 33,554,432 G1 points from the sealed transcripts.
 *                        These map to CDN indices 1..33,554,432 (index 0 is the generator).
 * @return Number of chunk hash mismatches (0 means all match)
 */
size_t verify_cdn_chunk_hashes(const std::vector<G1>& verified_points);

} // namespace bb::ignition
