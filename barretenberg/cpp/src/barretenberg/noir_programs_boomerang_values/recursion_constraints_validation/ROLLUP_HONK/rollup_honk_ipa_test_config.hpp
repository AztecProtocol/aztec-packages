#pragma once

#include "barretenberg/constants.hpp"
#include <cstddef>

namespace rollup_honk_test_config {

// Production ROOT Rollup HONK IPA uses CONST_ECCVM_LOG_N (= 15) rounds.
static constexpr size_t PRODUCTION_IPA_LOG_N = bb::CONST_ECCVM_LOG_N;

#ifdef BB_ROLLUP_HONK_TEST_IPA_LOG_N
static constexpr size_t TEST_IPA_LOG_N = BB_ROLLUP_HONK_TEST_IPA_LOG_N;
static constexpr bool FAST_IPA_BUILD = true;
#else
// Default reduced log_n for fast rollup IPA tests in the standard test binary.
static constexpr size_t TEST_IPA_LOG_N = 12;
static constexpr bool FAST_IPA_BUILD = false;
#endif

static constexpr size_t TEST_IPA_POLY_LENGTH = size_t{ 1 } << TEST_IPA_LOG_N;
static constexpr size_t TEST_IPA_PROOF_LENGTH = (4 * TEST_IPA_LOG_N) + 4;

static_assert(TEST_IPA_LOG_N < PRODUCTION_IPA_LOG_N,
              "Fast rollup IPA tests must use fewer rounds than production");
static_assert(TEST_IPA_LOG_N >= 2, "IPA log_n must be at least 2 for meaningful tests");

} // namespace rollup_honk_test_config
