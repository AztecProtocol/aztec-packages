// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

namespace bb::eccvm {
static constexpr size_t NUM_SCALAR_BITS = 128;   // The length of scalars handled by the ECCVVM
static constexpr size_t NUM_WNAF_DIGIT_BITS = 4; // Scalars are decompose into base 16 in wNAF form
static constexpr size_t NUM_WNAF_DIGITS_PER_SCALAR = NUM_SCALAR_BITS / NUM_WNAF_DIGIT_BITS; // 32
static constexpr uint64_t WNAF_MASK = static_cast<uint64_t>((1ULL << NUM_WNAF_DIGIT_BITS) - 1ULL);
static constexpr size_t POINT_TABLE_SIZE = 1ULL << (NUM_WNAF_DIGIT_BITS);
static constexpr size_t WNAF_DIGITS_PER_ROW = 4;
static constexpr size_t ADDITIONS_PER_ROW = 4;

template <typename CycleGroup> struct ScalarMul {
    uint32_t pc;
    uint256_t scalar;
    typename CycleGroup::affine_element base_point;
    std::array<int, NUM_WNAF_DIGITS_PER_SCALAR> wnaf_digits;
    bool wnaf_skew;
    // size bumped by 1 to record base_point.dbl()
    std::array<typename CycleGroup::affine_element, POINT_TABLE_SIZE + 1> precomputed_table;
};

template <typename CycleGroup> using MSM = std::vector<ScalarMul<CycleGroup>>;

} // namespace bb::eccvm
