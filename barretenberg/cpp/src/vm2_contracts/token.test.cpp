#include <gtest/gtest.h>

#include "vm2_contracts/app_tester.hpp"
#include "vm2_contracts/contract_artifact.hpp"
#include "vm2_contracts/token_fixture.hpp"

// Token scenario: deploys a Token, then runs constructor / mint / transfer / burn, checking balances.
// The shared `token_test` fixture (token_fixture.hpp) is also used by the benchmark.
namespace bb::avm2 {
namespace {

using contracts::AppTester;
using contracts::ContractArtifact;

TEST(TokenContract, ConstructorMintTransferBurnCheckBalances)
{
    AppTester tester;
    const ContractArtifact token = ContractArtifact::load_noir_contract("token_contract-Token.json");
    contracts::token_test(tester, token, [](bool ok) { EXPECT_TRUE(ok); });
}

} // namespace
} // namespace bb::avm2
