#pragma once

#include "vm2_contracts/app_tester.hpp"
#include "vm2_contracts/contract_artifact.hpp"
#include "vm2_contracts/fixture_common.hpp"

namespace bb::avm2::contracts {

// AMM flow: deploy 3 tokens + AMM, set minter, add liquidity / swap / remove liquidity.
// BRITTLE: if it breaks, prefer disabling it over fighting it.
void amm_test(AppTester& tester, const ContractArtifact& token, const ContractArtifact& amm, const ExpectFn& expect);

} // namespace bb::avm2::contracts
