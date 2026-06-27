#include <gtest/gtest.h>

#include "vm2_contracts/amm_fixture.hpp"
#include "vm2_contracts/app_tester.hpp"
#include "vm2_contracts/contract_artifact.hpp"

// AMM scenario: deploys three Tokens + an AMM and runs constructor / set_minter / add_liquidity /
// swap / remove_liquidity. This test is brittle: if it breaks, prefer disabling it over fighting it.
// The shared `amm_test` fixture (amm_fixture.hpp) is also used by the benchmark.
namespace bb::avm2 {
namespace {

using contracts::AppTester;
using contracts::ContractArtifact;

TEST(AmmContract, AmmOperations)
{
    AppTester tester;
    const ContractArtifact token = ContractArtifact::load_noir_contract("token_contract-Token.json");
    const ContractArtifact amm = ContractArtifact::load_noir_contract("amm_contract-AMM.json");
    contracts::amm_test(tester, token, amm, [](bool ok) { EXPECT_TRUE(ok); });
}

} // namespace
} // namespace bb::avm2
