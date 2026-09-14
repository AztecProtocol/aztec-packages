#pragma once
#include "chain_check.hpp"
#include <array>
#include <barretenberg/crypto/sha256/sha256.hpp>

namespace bb::ignition {

/**
 * @brief Hardcoded SHA-256 commitment to the full chain data (all 177 entries).
 *
 * Computed as SHA-256 over the concatenation of, for each of the 177 entries
 * (176 participants + sealed), in order:
 *   - first_g1 serialized as 64 bytes (x-first big-endian)
 *   - cumulative_g2 serialized as 128 bytes (x-first big-endian)
 *   - individual_g2 serialized as 128 bytes (x-first big-endian)
 *
 * Total input: 177 * (64 + 128 + 128) = 177 * 320 = 56,640 bytes.
 *
 * This value must be computed once from trusted data and hardcoded here.
 * To compute it, run: ignition_verifier compute-chain-commitment
 */
// clang-format off
static constexpr std::array<uint8_t, 32> EXPECTED_CHAIN_COMMITMENT = {
    0xd0, 0x08, 0xa2, 0x9d, 0xe3, 0x87, 0x50, 0x3b,
    0x0d, 0xf0, 0xd7, 0xd3, 0xed, 0xe1, 0x75, 0xbe,
    0x50, 0x2f, 0x9b, 0xf1, 0x95, 0xcf, 0xc3, 0x72,
    0xdf, 0xb5, 0x75, 0x44, 0x36, 0xf2, 0x74, 0x2a,
};
// clang-format on

/**
 * @brief Compute the SHA-256 commitment over full chain data.
 *
 * Serializes all 177 entries (G1 + both G2 per entry) into a flat buffer
 * and hashes it. This covers every byte the chain check relies on.
 */
crypto::Sha256Hash compute_chain_commitment(const std::vector<ParticipantData>& chain_data);

/**
 * @brief Verify that downloaded chain data matches the hardcoded commitment.
 *
 * @return true if the computed hash matches EXPECTED_CHAIN_COMMITMENT
 */
bool verify_chain_commitment(const std::vector<ParticipantData>& chain_data);

} // namespace bb::ignition
