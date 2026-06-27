#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/testing/public_tx_simulation_tester.hpp"
#include "vm2_contracts/app_tester.hpp"
#include "vm2_contracts/contract_artifact.hpp"
#include "vm2_contracts/fixture_common.hpp"

namespace bb::avm2::contracts {

// Deploys a Token and runs its constructor(admin, "Token", "TOK", 18). Returns the deployed contract.
testing::DeployedContract set_up_token(AppTester& tester,
                                       const ContractArtifact& token,
                                       const AztecAddress& admin,
                                       const ExpectFn& expect,
                                       uint64_t seed = 0);

// Token flow: constructor / mint / transfer / burn with interleaved balance checks. When
// `skip_return_value_assertions` is set the balance reads are still executed but their returned value
// is not asserted (used by the benchmark, which disables call-metadata collection for speed).
void token_test(AppTester& tester,
                const ContractArtifact& token,
                const ExpectFn& expect,
                bool skip_return_value_assertions = false);

} // namespace bb::avm2::contracts
