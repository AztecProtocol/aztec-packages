#include <gtest/gtest.h>

#include "vm2_contracts/app_tester.hpp"
#include "vm2_contracts/bulk_fixture.hpp"

// Fully proves and verifies a tx with several bulk_testing calls. This is a measurement-only test
// (disabled in CI); enable it locally to measure proving cost of the heaviest tx.
namespace bb::avm2 {
namespace {

using contracts::AppTester;
using contracts::ProvingMode;

TEST(AvmProvenMegaBulk, DISABLED_ProveAndVerify)
{
    AppTester tester;
    tester.set_proving_mode(ProvingMode::ProveAndVerify);
    contracts::mega_bulk_test(tester, [](bool ok) { EXPECT_TRUE(ok); });
}

} // namespace
} // namespace bb::avm2
