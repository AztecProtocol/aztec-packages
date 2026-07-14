#pragma once

#include <cstdint>
#include <functional>
#include <vector>

#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/field.hpp"

// Shared helpers for the application-scenario fixtures (token_fixture / amm_fixture / bulk_fixture).
// Each fixture drives an AppTester through a realistic multi-call flow and is used both by the
// correctness tests (asserting via the passed-in `expect`) and by the benchmark (timing/mana, reusing
// the same flow).
namespace bb::avm2::contracts {

// Assertion sink threaded through the fixtures: the tests pass a gtest-backed checker; the benchmark
// passes a throw-on-false checker.
using ExpectFn = std::function<void(bool)>;

// True iff the tx completed without reverting.
inline bool is_ok(const TxSimulationResult& result)
{
    return result.revert_code == RevertCode::OK;
}

// [FF(start), FF(start+1), ...]; used for array arguments whose exact values are immaterial.
std::vector<FF> consecutive_fields(size_t count, uint64_t start = 1);

// Pinned grumpkin-Poseidon2 Schnorr signature inputs (mirrors bulk_test.ts), passed as calldata so
// the MSM + Poseidon2 in bulk_testing are not folded by the Noir compiler.
std::vector<FF> schnorr_inputs();

} // namespace bb::avm2::contracts
