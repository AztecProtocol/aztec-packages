#pragma once

#include <gtest/gtest.h>

#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/testing/public_tx_simulation_tester.hpp"
#include "vm2_contracts/proving.hpp"

// Small gtest-only helpers shared by the standalone proving tests (the C++ port of yarn-project's
// avm_proving_tests): simulate a scenario with proving config, assert the expected revert outcome,
// and assert the circuit checks / proves+verifies.
namespace bb::avm2::contracts {

// Simulates `scenario` with proving config, asserts its revert outcome, and check-circuits it.
inline void check_circuit_scenario(testing::PublicTxSimulationTester& tester,
                                   const testing::TxScenario& scenario,
                                   bool expect_revert)
{
    const TxSimulationResult result = tester.simulate_scenario(scenario, proving_config());
    EXPECT_EQ(result.revert_code != RevertCode::OK, expect_revert);
    EXPECT_TRUE(check_circuit(result));
}

// As above, but fully proves and verifies (rather than just check-circuit).
inline void prove_verify_scenario(testing::PublicTxSimulationTester& tester,
                                  const testing::TxScenario& scenario,
                                  bool expect_revert)
{
    const TxSimulationResult result = tester.simulate_scenario(scenario, proving_config());
    EXPECT_EQ(result.revert_code != RevertCode::OK, expect_revert);
    EXPECT_TRUE(prove_and_verify(result));
}

} // namespace bb::avm2::contracts
