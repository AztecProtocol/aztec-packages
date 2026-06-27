#include <gtest/gtest.h>

#include "vm2_contracts/app_tester.hpp"
#include "vm2_contracts/bulk_fixture.hpp"

// Fully proves and verifies the AvmTest bulk_testing tx (the heaviest single-tx proving scenario).
namespace bb::avm2 {
namespace {

using contracts::AppTester;
using contracts::ProvingMode;

TEST(AvmProvenBulk, ProveAndVerify)
{
    AppTester tester;
    tester.set_proving_mode(ProvingMode::ProveAndVerify);
    contracts::bulk_test(tester, [](bool ok) { EXPECT_TRUE(ok); });
}

} // namespace
} // namespace bb::avm2
