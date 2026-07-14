#pragma once

#include "barretenberg/vm2/common/avm_io.hpp"
#include "vm2_contracts/app_tester.hpp"
#include "vm2_contracts/fixture_common.hpp"

namespace bb::avm2::contracts {

// Deploys AvmTest, registers the protocol/standard contracts it calls, and runs one tx exercising
// bulk_testing + calldata copy + external calls. Returns the bulk tx result.
TxSimulationResult bulk_test(AppTester& tester, const ExpectFn& expect);

// Deploys AvmTest + fee juice and runs one tx with several bulk_testing calls (strictly-limited side
// effects skipped so the call can be repeated). Returns the tx result.
TxSimulationResult mega_bulk_test(AppTester& tester, const ExpectFn& expect);

} // namespace bb::avm2::contracts
