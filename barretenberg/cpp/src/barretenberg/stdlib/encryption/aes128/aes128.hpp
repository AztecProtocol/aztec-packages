// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include <array>
#include <span>
#include <vector>

#include "../../primitives/field/field.hpp"
#include "../../primitives/witness/witness.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"

namespace bb::stdlib::aes128 {

// Constants
constexpr uint32_t AES128_BASE = 9;
constexpr size_t BLOCK_SIZE = 16;           // AES block size in bytes
constexpr size_t EXTENDED_KEY_LENGTH = 176; // 11 round keys × 16 bytes
constexpr size_t NUM_ROUNDS = 10;           // AES-128 has 10 rounds
constexpr size_t COLUMN_SIZE = 4;           // Bytes per column in AES state (4x4 byte matrix)

/**
 * @brief Main public interface: AES-128 CBC encryption
 */
template <typename Builder>
std::vector<stdlib::field_t<Builder>> encrypt_buffer_cbc(const std::vector<stdlib::field_t<Builder>>& input,
                                                         const stdlib::field_t<Builder>& iv,
                                                         const stdlib::field_t<Builder>& key);

/**
 * @brief Converts a 128-bit block into 16 sparse-form bytes via AES_INPUT plookup table
 */
template <typename Builder>
std::array<stdlib::field_t<Builder>, BLOCK_SIZE> convert_into_sparse_bytes(Builder* ctx,
                                                                           const stdlib::field_t<Builder>& block_data);

/**
 * @brief Converts 16 sparse-form bytes back to a 128-bit field element
 */
template <typename Builder>
stdlib::field_t<Builder> convert_from_sparse_bytes(Builder* ctx,
                                                   std::span<stdlib::field_t<Builder>, BLOCK_SIZE> sparse_bytes);

} // namespace bb::stdlib::aes128
