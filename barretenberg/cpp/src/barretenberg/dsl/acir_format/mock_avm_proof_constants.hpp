#pragma once

#include <cstddef>

namespace acir_format::mock_avm_proof {

inline constexpr std::size_t PROOF_LOG_N = 21;
inline constexpr std::size_t NUM_WITNESS_ENTITIES = 2955;
inline constexpr std::size_t NUM_ALL_ENTITIES = 3438;
inline constexpr std::size_t BATCHED_RELATION_PARTIAL_LENGTH = 8;
inline constexpr std::size_t NUM_FRS_COMMITMENT = 4;
inline constexpr std::size_t NUM_FRS_SCALAR = 1;

inline constexpr std::size_t COMPUTED_PROOF_LENGTH_IN_FIELDS =
    NUM_WITNESS_ENTITIES * NUM_FRS_COMMITMENT + NUM_ALL_ENTITIES * NUM_FRS_SCALAR +
    PROOF_LOG_N * NUM_FRS_SCALAR * BATCHED_RELATION_PARTIAL_LENGTH + (PROOF_LOG_N - 1) * NUM_FRS_COMMITMENT +
    PROOF_LOG_N * NUM_FRS_SCALAR + 2 * NUM_FRS_COMMITMENT;

} // namespace acir_format::mock_avm_proof
