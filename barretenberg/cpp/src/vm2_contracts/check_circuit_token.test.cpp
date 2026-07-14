#include <gtest/gtest.h>

#include "vm2_contracts/app_tester.hpp"
#include "vm2_contracts/contract_artifact.hpp"
#include "vm2_contracts/token_fixture.hpp"

// Runs the shared token flow (constructor / mint / transfer / burn) in check-circuit proving mode, so
// each state-changing tx is check-circuited.
namespace bb::avm2 {
namespace {

using contracts::AppTester;
using contracts::ContractArtifact;
using contracts::ProvingMode;

TEST(AvmProvenToken, ProvenTokenTransfer)
{
    AppTester tester;
    tester.set_proving_mode(ProvingMode::CheckCircuit);
    const ContractArtifact token = ContractArtifact::load_noir_contract("token_contract-Token.json");
    contracts::token_test(tester, token, [](bool ok) { EXPECT_TRUE(ok); });
}

} // namespace
} // namespace bb::avm2
