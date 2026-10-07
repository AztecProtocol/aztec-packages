#pragma once
#include <barretenberg/ecc/curves/bn254/bn254.hpp>
#include <cstdint>
#include <filesystem>
#include <span>
#include <vector>

namespace bb::ignition {

using Curve = curve::BN254;
using G1 = Curve::AffineElement;
using G2 = Curve::G2AffineElement;

// Ignition transcript constants. The Transcript_spec.md manifest description lists rounded values
// (100,000,000 / 5,000,000) but the actual binary manifests contain these values.
static constexpr size_t TOTAL_G1_POINTS = 100800000;
static constexpr size_t POINTS_PER_TRANSCRIPT = 5040000;
static constexpr size_t NUM_TRANSCRIPTS = 20;
static constexpr size_t MANIFEST_SIZE = 28;
static constexpr size_t BYTES_PER_G1_POINT = 64;
static constexpr size_t BYTES_PER_G2_POINT = 128;
static constexpr size_t G1_SECTION_SIZE = POINTS_PER_TRANSCRIPT * BYTES_PER_G1_POINT; // 322,560,000
static constexpr size_t BLAKE2B_HASH_SIZE = 64;

/**
 * @brief Parsed transcript manifest (28-byte header)
 */
struct TranscriptManifest {
    uint32_t transcript_number;
    uint32_t total_transcripts;
    uint32_t total_g1_points;
    uint32_t total_g2_points;
    uint32_t local_g1_points;
    uint32_t local_g2_points;
    uint32_t start_from;
};

/**
 * @brief Convert a field element from Ignition mixed-endian format to standard big-endian.
 *
 * Ignition format: uint64_t[4], least-significant word first, each word big-endian.
 * Standard big-endian: most-significant byte first across all 32 bytes.
 * Conversion: reverse the order of the four 8-byte words.
 */
void ignition_to_big_endian(const uint8_t* src, uint8_t* dst);

/**
 * @brief Deserialize a G1 point from Ignition transcript format.
 * @param data Pointer to 64 bytes in Ignition format (x then y, each mixed-endian)
 * @return Deserialized affine point
 */
G1 deserialize_ignition_g1(const uint8_t* data);

/**
 * @brief Deserialize a G2 point from Ignition transcript format.
 * @param data Pointer to 128 bytes in Ignition format
 * @return Deserialized G2 affine point
 */
G2 deserialize_ignition_g2(const uint8_t* data);

/**
 * @brief Parse the 28-byte manifest header from a transcript file.
 */
TranscriptManifest parse_manifest(const uint8_t* data);

/**
 * @brief Validate manifest fields against expected values.
 * @throws If any field doesn't match expectations for the given transcript number.
 */
void validate_manifest(const TranscriptManifest& manifest, uint32_t expected_transcript_number);

/**
 * @brief Load all G1 points from a transcript file.
 * @param path Path to transcript file
 * @return Vector of deserialized G1 affine points (5,040,000 per transcript)
 */
std::vector<G1> load_transcript_g1(const std::filesystem::path& path);

/**
 * @brief Load the two G2 points from transcript 0.
 * @param path Path to transcript00.dat
 * @return Pair of (cumulative_g2, individual_g2)
 */
std::pair<G2, G2> load_transcript_g2(const std::filesystem::path& path);

} // namespace bb::ignition
