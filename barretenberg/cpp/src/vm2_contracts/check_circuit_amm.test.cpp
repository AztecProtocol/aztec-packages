#include <gtest/gtest.h>

#include "vm2_contracts/amm_fixture.hpp"
#include "vm2_contracts/app_tester.hpp"
#include "vm2_contracts/contract_artifact.hpp"

// Runs the shared AMM flow (constructors / set_minter / add+swap+remove liquidity) in check-circuit
// proving mode, so each state-changing tx is check-circuited.
namespace bb::avm2 {
namespace {

using contracts::AppTester;
using contracts::ContractArtifact;
using contracts::ProvingMode;

TEST(AvmProvenAmm, ProvenAmmOperations)
{
    AppTester tester;
    tester.set_proving_mode(ProvingMode::CheckCircuit);
    const ContractArtifact token = ContractArtifact::load_noir_contract("token_contract-Token.json");
    const ContractArtifact amm = ContractArtifact::load_noir_contract("amm_contract-AMM.json");
    contracts::amm_test(tester, token, amm, [](bool ok) { EXPECT_TRUE(ok); });
}

} // namespace
} // namespace bb::avm2
