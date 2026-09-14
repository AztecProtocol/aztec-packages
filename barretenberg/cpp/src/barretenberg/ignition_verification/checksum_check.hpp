#pragma once
#include <filesystem>

namespace bb::ignition {

/**
 * @brief Verify the BLAKE2B checksum embedded at the end of a transcript file.
 *
 * Each Ignition transcript file ends with a 64-byte BLAKE2B hash of all preceding bytes
 * (manifest + G1 section + G2 section). This function reads the file, computes the hash
 * of everything except the final 64 bytes, and compares against the stored checksum.
 *
 * @param path Path to a transcript file
 * @return true if the checksum matches
 */
bool verify_transcript_checksum(const std::filesystem::path& path);

} // namespace bb::ignition
