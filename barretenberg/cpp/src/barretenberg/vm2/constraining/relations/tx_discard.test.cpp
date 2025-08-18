#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/tx_discard.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using tx_discard_relation = bb::avm2::tx_discard<FF>;

TEST(TxDiscardConstrainingTest, EmptyRow)
{
    check_relation<tx_discard_relation>(testing::empty_trace());
}

TEST(TxDiscardConstrainingTest, CanOnlyDiscardInRevertiblePhases)
{
    // Test that discard=1 => is_revertible=1
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Valid: discard=0, is_revertible=0
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 0 }, { C::tx_reverted, 0 } },
        // Valid: discard=0, is_revertible=1
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        // Valid: discard=1, is_revertible=1
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 1 } },
        { { C::tx_sel, 0 } },
    });

    // Check subrelation 1 (discard requires revertible)
    check_relation<tx_discard_relation>(trace, tx_discard_relation::SR_CAN_ONLY_DISCARD_IN_REVERTIBLE_PHASES);

    // Negative test: discard=1 but is_revertible=0
    trace.set(C::tx_discard, 1, 1);
    trace.set(C::tx_is_revertible, 1, 0);
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<tx_discard_relation>(trace, tx_discard_relation::SR_CAN_ONLY_DISCARD_IN_REVERTIBLE_PHASES),
        "CAN_ONLY_DISCARD_IN_REVERTIBLE_PHASES");
}

TEST(TxDiscardConstrainingTest, FailureMustDiscard)
{
    // Test that reverted=1 => discard=1
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Valid: reverted=0, discard=0
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        // Valid: reverted=1, discard=1
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 1 } },
        // Valid: reverted=0, discard=1 (discard doesn't imply failure)
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 0 } },
    });

    // Check FAILURE_MUST_DISCARD subrelation
    check_relation<tx_discard_relation>(trace, tx_discard_relation::SR_FAILURE_MUST_DISCARD);

    // Negative test: reverted=1 but discard=0
    trace.set(C::tx_reverted, 1, 1);
    trace.set(C::tx_discard, 1, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_discard_relation>(trace, tx_discard_relation::SR_FAILURE_MUST_DISCARD),
                              "FAILURE_MUST_DISCARD");
}

TEST(TxDiscardConstrainingTest, LastRowOfSetupCalculation)
{
    // Test LAST_ROW_OF_SETUP = (1 - is_revertible) * is_revertible'
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Row 1: Not revertible (setup phase)
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 0 }, { C::tx_reverted, 0 } },
        // Row 2: Still not revertible
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 0 }, { C::tx_reverted, 0 } },
        // Row 3: Last row of setup (not revertible -> revertible transition)
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 0 }, { C::tx_reverted, 0 } },
        // Row 4: First revertible row
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        // Row 5: Still revertible
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 0 } },
    });

    // This should pass - the transition from non-revertible to revertible lifts propagation
    check_relation<tx_discard_relation>(trace, tx_discard_relation::SR_DISCARD_PROPAGATION);
}

TEST(TxDiscardConstrainingTest, DiscardPropagationNormal)
{
    // Test normal propagation of discard value
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Row 1: discard=1, should propagate
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        // Row 2: discard=1 (propagated)
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        // Row 3: discard=1, reverted=1 (propagated, but failure now encountered)
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 1 } },
        // Row 4: discard=0 (reset to 0 because propagation lifted at failure)
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 0 } },
    });

    check_relation<tx_discard_relation>(trace, tx_discard_relation::SR_DISCARD_PROPAGATION);

    // Negative test: discard doesn't propagate when it should
    trace.set(C::tx_discard, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_discard_relation>(trace, tx_discard_relation::SR_DISCARD_PROPAGATION),
                              "DISCARD_PROPAGATION");
    // reset discard to 1
    trace.set(C::tx_discard, 2, 1);
}

TEST(TxDiscardConstrainingTest, DiscardPropagationLiftedAtSetupEnd)
{
    // Test propagation lifted at the last row of setup
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Row 1: Setup phase (not revertible)
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 0 }, { C::tx_reverted, 0 } },
        // Row 2: Last row of setup
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 0 }, { C::tx_reverted, 0 } },
        // Row 3: First revertible row - discard can change
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 1 } },
        { { C::tx_sel, 0 } },
    });

    // This should pass because transition from non-revertible to revertible lifts propagation
    check_relation<tx_discard_relation>(trace, tx_discard_relation::SR_DISCARD_PROPAGATION);
}

TEST(TxDiscardConstrainingTest, DiscardPropagationLiftedOnFailure)
{
    // Test propagation lifted when reverted=1
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Row 1: discard=1
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        // Row 2: discard=1 (propagated)
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 1 } }, // Failure here
        // Row 3: discard can be 0 (propagation lifted due to failure)
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 0 } },
    });

    check_relation<tx_discard_relation>(trace, tx_discard_relation::SR_DISCARD_PROPAGATION);
}

TEST(TxDiscardConstrainingTest, FailureOnlyInRevertibles)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Non-revertibles and setup phases
        // Discard must be 0 because setup phase is not revertible.
        // Propagate discard=0 through non-revertibles and setup phases.
        // Lift propagation of discard at end of setup.
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 0 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 0 }, { C::tx_reverted, 0 } },
        // Start revertibles
        // Discard=1 because revertibles fail later
        // Propagate discard=1 through revertibles.
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 1 } },
        // Padding for app-logic
        // Lift propagation of discard when revertibles fail. Discard=0 for padding row.
        // Propagate discard=0 through app-logic padding to teardown.
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        // Teardown without failure
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 0 } },
    });

    // Check all subrelations
    check_relation<tx_discard_relation>(trace);
}

TEST(TxDiscardConstrainingTest, FailureOnlyInAppLogic)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Non-revertibles and setup phases
        // Discard must be 0 because setup phase is not revertible.
        // Propagate discard=0 through non-revertibles and setup phases.
        // Lift propagation of discard at end of setup.
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 0 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 0 }, { C::tx_reverted, 0 } },
        // Start revertibles and app logic
        // Discard=1 because app-logic fails later
        // Propagate discard=1 through revertibles and app logic.
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        // Failure in app logic
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 1 } },
        // Teardown without failure
        // Lift propagation of discard when app-logic failure is encountered.
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 0 } },
    });

    // Check all subrelations
    check_relation<tx_discard_relation>(trace);
}

TEST(TxDiscardConstrainingTest, FailureOnlyInTeardown)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Non-revertibles and setup phases
        // Discard must be 0 because setup phase is not revertible.
        // Propagate discard=0 through non-revertibles and setup phases.
        // Lift propagation of discard at end of setup.
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 0 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 0 }, { C::tx_reverted, 0 } },
        // Start revertibles and app logic
        // Discard=1 because later teardown fails
        // Propagate discard=1 through revertibles, app logic, and teardown
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        // Teardown fails, discard=1
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 1 } },
        { { C::tx_sel, 0 } },
    });

    // Check all subrelations
    check_relation<tx_discard_relation>(trace);

    // Negative test: discard=0 somewhere in revertibles, but teardown fails
    trace.set(C::tx_discard, 3, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_discard_relation>(trace, tx_discard_relation::SR_DISCARD_PROPAGATION),
                              "DISCARD_PROPAGATION");
    // reset discard to 1
    trace.set(C::tx_discard, 3, 1);
}

TEST(TxDiscardConstrainingTest, FailureInRevertiblesAndTeardown)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Non-revertibles and setup phases
        // Discard must be 0 because setup phase is not revertible.
        // Propagate discard=0 through non-revertibles and setup phases.
        // Lift propagation of discard at end of setup.
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 0 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 0 }, { C::tx_reverted, 0 } },
        // Start revertibles and app logic
        // Discard=1 because revertibles fail later
        // Propagate discard=1 through revertibles and app logic.
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 1 } },
        // Teardown fails too, discard=1
        // Lift discard propagation, but teardown fails too, so discard remains 1.
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 1 } },
        { { C::tx_sel, 0 } },
    });

    // Check all subrelations
    check_relation<tx_discard_relation>(trace);
}

TEST(TxDiscardConstrainingTest, DiscardButFailureNeverEncountered)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Non-revertibles and setup phases
        // Discard must be 0 because setup phase is not revertible.
        // Propagate discard=0 through non-revertibles and setup phases.
        // Lift propagation of discard at end of setup.
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 0 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 0 }, { C::tx_reverted, 0 } },
        // Start revertibles and app logic
        // Propagate discard=1 through revertibles, app logic, and teardown
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 0 } },
        // Teardown, discard=1, and failure=1 lifts propagation.
        // THIS WILL BE EDITED later so that failure doesn't happen.
        { { C::tx_sel, 1 }, { C::tx_discard, 1 }, { C::tx_is_revertible, 1 }, { C::tx_reverted, 1 } },
        // Tree-padding & cleanup phases
        // These are non-revertible.
        // THESE WILL BE EDITED later so that they get discard=1, which should fail.
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 0 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 1 }, { C::tx_discard, 0 }, { C::tx_is_revertible, 0 }, { C::tx_reverted, 0 } },
        { { C::tx_sel, 0 } },
    });

    // Check all subrelations
    check_relation<tx_discard_relation>(trace);

    // Negative test: no failure encountered in teardown, so propagation is never lifted.
    trace.set(C::tx_reverted, 6, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<tx_discard_relation>(trace, tx_discard_relation::SR_DISCARD_PROPAGATION),
                              "DISCARD_PROPAGATION");
    // now set the tree-padding & cleanup rows to discard so that propagation works,
    // but it should still fail because you cannot discard in non-revertible phases.
    trace.set(C::tx_discard, 7, 1);
    trace.set(C::tx_discard, 8, 1);

    EXPECT_THROW_WITH_MESSAGE(
        check_relation<tx_discard_relation>(trace, tx_discard_relation::SR_CAN_ONLY_DISCARD_IN_REVERTIBLE_PHASES),
        "CAN_ONLY_DISCARD_IN_REVERTIBLE_PHASES");

    // reset all
    trace.set(C::tx_reverted, 6, 0);
    trace.set(C::tx_discard, 7, 0);
    trace.set(C::tx_discard, 8, 0);
}

} // namespace
} // namespace bb::avm2::constraining
