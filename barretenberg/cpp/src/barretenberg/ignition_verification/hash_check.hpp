#pragma once
#include "transcript_loader.hpp"
#include <cstddef>
#include <vector>

namespace bb::ignition {

/**
 * @brief Re-derive SHA-256 chunk hashes from verified S3 points and compare against
 * the hardcoded values in bn254_g1_chunk_hashes.hpp.
 *
 * The CDN g1.dat format prepends the BN254 generator and uses x-first big-endian serialization.
 * The hardcoded hashes cover 33,554,433 points (2^25 + 1) in 257 chunks of 131,072 points (8MB each).
 *
 * @param verified_points The first 33,554,432 G1 points from the verified S3 sealed transcripts
 *                        (these correspond to CDN points at indices 1..33,554,432)
 * @return Number of chunk hash mismatches (0 means all match)
 */
size_t verify_cdn_chunk_hashes(const std::vector<G1>& verified_points);

} // namespace bb::ignition
