#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/discard.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_builder.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using execution_discard = bb::avm2::discard<FF>;

TEST(ExecutionDiscardConstrainingTest, EmptyRow)
{
    check_relation<execution_discard>(testing::empty_trace());
}

TEST(ExecutionDiscardConstrainingTest, DiscardIffDyingContext)
{
    // Test that discard=1 <=> dying_context_id!=0
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // discard=0 => dying_context_id=0
        { { C::execution_sel, 1 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_dying_context_id_inv, 0 } },
        // discard=1 => dying_context_id!=0
        { { C::execution_sel, 1 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 42 },
          { C::execution_dying_context_id_inv, FF(42).invert() } },
        { { C::execution_sel, 1 }, { C::execution_last, 1 } },
        { { C::execution_sel, 0 } },
    });

    // Only check subrelations 3 and 4 (discard/dying_context_id relationship)
    check_relation<execution_discard>(
        trace, execution_discard::SR_DISCARD_IFF_DYING_CONTEXT, execution_discard::SR_DISCARD_IF_FAILURE);

    // Negative test: discard=1 but dying_context_id=0
    trace.set(C::execution_dying_context_id, 2, 0);
    trace.set(C::execution_dying_context_id_inv, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution_discard>(trace, execution_discard::SR_DISCARD_IFF_DYING_CONTEXT),
                              "DISCARD_IFF_DYING_CONTEXT");

    // Reset before next test
    trace.set(C::execution_dying_context_id, 1, 0);
    trace.set(C::execution_dying_context_id_inv, 1, 0);
    trace.set(C::execution_dying_context_id, 2, 42);
    trace.set(C::execution_dying_context_id_inv, 2, FF(42).invert());

    // Negative test: discard=0 but dying_context_id!=0
    trace.set(C::execution_dying_context_id, 1, 42);
    trace.set(C::execution_dying_context_id_inv, 1, FF(42).invert());
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution_discard>(trace, execution_discard::SR_DISCARD_IFF_DYING_CONTEXT),
                              "DISCARD_IFF_DYING_CONTEXT");
}

TEST(ExecutionDiscardConstrainingTest, DiscardFailureMustDiscard)
{
    // Test that sel_failure=1 => discard=1
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Failure with discard
        { { C::execution_sel, 1 },
          { C::execution_sel_failure, 1 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 42 },
          { C::execution_dying_context_id_inv, FF(42).invert() } },
        // No failure, no discard
        { { C::execution_sel, 1 },
          { C::execution_sel_failure, 0 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_dying_context_id_inv, 0 } },
        // Discard doesn't imply failure
        { { C::execution_sel, 1 },
          { C::execution_sel_failure, 0 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 0 } },
        { { C::execution_sel, 1 }, { C::execution_last, 1 } },
        { { C::execution_sel, 0 } },
    });

    // Only check subrelation 5 (failure must discard)
    check_relation<execution_discard>(trace, execution_discard::SR_DISCARD_IF_FAILURE);

    // Negative test: failure but no discard
    trace.set(C::execution_discard, 1, 0);
    trace.set(C::execution_dying_context_id, 1, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution_discard>(trace, execution_discard::SR_DISCARD_IF_FAILURE),
                              "DISCARD_IF_FAILURE");
}

TEST(ExecutionDiscardConstrainingTest, DiscardIsDyingContextCheck)
{
    // Test the is_dying_context calculation
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // context_id=5, dying_context_id=5 => is_dying_context=1
        { { C::execution_sel, 1 },
          { C::execution_context_id, 5 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 5 },
          { C::execution_is_dying_context, 1 },
          { C::execution_dying_context_diff_inv, 0 } },
        // context_id=3, dying_context_id=5 => is_dying_context=0, diff_inv=(3-5)^(-1)=(-2)^(-1)
        { { C::execution_sel, 1 },
          { C::execution_context_id, 3 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 5 },
          { C::execution_dying_context_id_inv, FF(5).invert() },
          { C::execution_is_dying_context, 0 },
          { C::execution_dying_context_diff_inv, FF(3 - 5).invert() } },
        // discard=0 case (is_dying_context should be 0)
        { { C::execution_sel, 1 },
          { C::execution_last, 1 },
          { C::execution_context_id, 7 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_is_dying_context, 0 },
          { C::execution_dying_context_diff_inv, FF(7 - 0).invert() } },
        { { C::execution_sel, 0 } },
    });

    check_relation<execution_discard>(trace, execution_discard::SR_IS_DYING_CONTEXT_CHECK);

    // Negative test: wrong is_dying_context when equal
    trace.set(C::execution_is_dying_context, 1, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution_discard>(trace, execution_discard::SR_IS_DYING_CONTEXT_CHECK),
                              "IS_DYING_CONTEXT_CHECK");

    // Negative test: wrong is_dying_context when not equal
    trace.set(C::execution_is_dying_context, 1, 1); // Reset
    trace.set(C::execution_is_dying_context, 2, 1);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution_discard>(trace, execution_discard::SR_IS_DYING_CONTEXT_CHECK),
                              "IS_DYING_CONTEXT_CHECK");
}

TEST(ExecutionDiscardConstrainingTest, DiscardPropagationOfZeroDiscard)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::execution_sel, 1 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_sel_exit_call, 0 },
          { C::execution_has_parent_ctx, 1 },
          { C::execution_sel_failure, 0 },
          { C::execution_is_dying_context, 0 },
          { C::execution_sel_enter_call, 0 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 1 } },
        // Propagates to next row
        { { C::execution_sel, 1 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_dying_context_id_inv, 0 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 1 } },
        // Last row gets propagated discard values. Propagation doesn't apply to next row because last=1.
        { { C::execution_sel, 1 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_last, 1 } },
        { { C::execution_sel, 0 } },
    });

    check_relation<execution_discard>(
        trace, execution_discard::SR_DISCARD_PROPAGATION, execution_discard::SR_DYING_CONTEXT_PROPAGATION);

    // Negative test: doesn't propagate but it should.
    trace.set(C::execution_discard, 2, 42);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution_discard>(trace, execution_discard::SR_DISCARD_PROPAGATION),
                              "DISCARD_PROPAGATION");
}

TEST(ExecutionDiscardConstrainingTest, DiscardPropagationOfNonzeroDiscard)
{
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Normal propagation case
        { { C::execution_sel, 1 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 42 },
          { C::execution_sel_exit_call, 0 },
          { C::execution_has_parent_ctx, 1 },
          { C::execution_sel_failure, 0 },
          { C::execution_is_dying_context, 0 },
          { C::execution_sel_enter_call, 0 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 1 } },
        // Propagates to next row
        { { C::execution_sel, 1 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 42 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 1 } },
        // Last row gets propagated discard values. Propagation doesn't apply to next row because last=1.
        { { C::execution_sel, 1 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 42 },
          { C::execution_last, 1 } },
        { { C::execution_sel, 0 } },
    });

    check_relation<execution_discard>(
        trace, execution_discard::SR_DISCARD_PROPAGATION, execution_discard::SR_DYING_CONTEXT_PROPAGATION);

    // Negative test: doesn't propagate but it should.
    trace.set(C::execution_discard, 2, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution_discard>(trace, execution_discard::SR_DISCARD_PROPAGATION),
                              "DISCARD_PROPAGATION");
}

TEST(ExecutionDiscardConstrainingTest, DiscardPropagationLiftedEndOfEnqueuedCall)
{
    // Test propagation lifted at end of enqueued call (exit_call && !has_parent)
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Exiting top-level call - propagation lifted
        { { C::execution_sel, 1 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 42 },
          { C::execution_sel_exit_call, 1 },
          { C::execution_has_parent_ctx, 0 },
          { C::execution_enqueued_call_end, 1 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 } },
        // Next row can have different discard values
        { { C::execution_sel, 1 }, { C::execution_discard, 0 }, { C::execution_dying_context_id, 0 } },
        { { C::execution_sel, 1 }, { C::execution_last, 1 } },
        { { C::execution_sel, 0 } },
    });

    check_relation<execution_discard>(
        trace, execution_discard::SR_DISCARD_PROPAGATION, execution_discard::SR_DYING_CONTEXT_PROPAGATION);
}

TEST(ExecutionDiscardConstrainingTest, DiscardPropagationLiftedResolvesDyingContext)
{
    // Test propagation lifted when resolving dying context (sel_failure && is_dying_context)
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Failure in dying context - propagation lifted
        { { C::execution_sel, 1 },
          { C::execution_context_id, 42 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 42 },
          { C::execution_sel_failure, 1 },
          { C::execution_is_dying_context, 1 },
          { C::execution_dying_context_diff_inv, 0 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 1 },
          { C::execution_nested_call_from_undiscarded_context, 0 } },
        // Next row can have different discard values
        { { C::execution_sel, 1 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 1 } },
        { { C::execution_sel, 1 }, { C::execution_last, 1 } },
        { { C::execution_sel, 0 } },
    });

    check_relation<execution_discard>(
        trace, execution_discard::SR_DISCARD_PROPAGATION, execution_discard::SR_DYING_CONTEXT_PROPAGATION);
}

TEST(ExecutionDiscardConstrainingTest, DiscardPropagationLiftedNestedCallFromUndiscarded)
{
    // Test propagation lifted when making nested call from undiscarded context
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Making a call from undiscarded context - propagation lifted
        { { C::execution_sel, 1 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_sel_enter_call, 1 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 1 } },
        // Next row can raise discard (nested context will error)
        { { C::execution_sel, 1 }, { C::execution_discard, 1 }, { C::execution_dying_context_id, 99 } },
        // Last row keeps the values (propagation doesn't apply because last=1)
        { { C::execution_sel, 1 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 99 },
          { C::execution_last, 1 } },
        { { C::execution_sel, 0 } },
    });

    // This should pass because sel_enter_call=1 lifts the propagation constraint
    check_relation<execution_discard>(
        trace, execution_discard::SR_DISCARD_PROPAGATION, execution_discard::SR_DYING_CONTEXT_PROPAGATION);
}

TEST(ExecutionDiscardConstrainingTest, DiscardDyingContextMustError)
{
    // Test that dying context must exit with failure
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Dying context exits with error - OK
        { { C::execution_sel, 1 },
          { C::execution_context_id, 42 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 42 },
          { C::execution_is_dying_context, 1 },
          { C::execution_sel_exit_call, 1 },
          { C::execution_sel_error, 1 },
          { C::execution_sel_execute_revert, 0 },
          { C::execution_sel_failure, 1 },
          { C::execution_dying_context_diff_inv, 0 } },
        { { C::execution_sel, 1 }, { C::execution_last, 1 } },
        { { C::execution_sel, 0 } },
    });

    check_relation<execution_discard>(trace, execution_discard::SR_DYING_CONTEXT_MUST_FAIL);

    // Negative test: dying context exits without error
    trace.set(C::execution_sel_failure, 1, 0);
    trace.set(C::execution_sel_error, 1, 0);
    trace.set(C::execution_sel_execute_revert, 1, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution_discard>(trace, execution_discard::SR_DYING_CONTEXT_MUST_FAIL),
                              "DYING_CONTEXT_MUST_FAIL");
}

TEST(ExecutionDiscardConstrainingTest, DiscardComplexScenario)
{
    // Complex scenario: nested calls with errors
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Row 1: Parent context, no discard
        { { C::execution_sel, 1 },
          { C::execution_context_id, 1 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_dying_context_diff_inv, FF(1 - 0).invert() },
          { C::execution_is_dying_context, 0 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 1 } },
        // Row 2: Call to nested context (that will eventually error)
        { { C::execution_sel, 1 },
          { C::execution_context_id, 1 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_dying_context_id_inv, 0 },
          { C::execution_dying_context_diff_inv, FF(1 - 0).invert() },
          { C::execution_sel_enter_call, 1 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 1 },
          { C::execution_propagate_discard, 0 } },
        // Row 3: Nested context, discard raised because this context will error
        { { C::execution_sel, 1 },
          { C::execution_context_id, 2 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 2 },
          { C::execution_is_dying_context, 1 },
          { C::execution_dying_context_diff_inv, 0 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 1 } },
        // Row 4: Nested context errors
        { { C::execution_sel, 1 },
          { C::execution_context_id, 2 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 2 },
          { C::execution_is_dying_context, 1 },
          { C::execution_sel_exit_call, 1 },
          { C::execution_sel_error, 1 },
          { C::execution_sel_execute_revert, 0 },
          { C::execution_sel_failure, 1 },
          { C::execution_dying_context_diff_inv, 0 },
          { C::execution_has_parent_ctx, 1 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 1 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 0 } },
        // Row 5: Back to parent, discard cleared
        { { C::execution_sel, 1 },
          { C::execution_context_id, 1 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_dying_context_diff_inv, FF(1 - 0).invert() },
          { C::execution_is_dying_context, 0 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 1 } },
        { { C::execution_sel, 0 } },
    });

    // Only check the most important relations for this scenario
    check_relation<execution_discard>(trace,
                                      execution_discard::SR_IS_DYING_CONTEXT_CHECK,
                                      execution_discard::SR_DISCARD_PROPAGATION,
                                      execution_discard::SR_DYING_CONTEXT_PROPAGATION,
                                      execution_discard::SR_DYING_CONTEXT_MUST_FAIL);
}

TEST(ExecutionDiscardConstrainingTest, DiscardWithLastRow)
{
    // Test discard behavior with last row
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::execution_sel, 1 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 42 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 1 } },
        // Last row also has discard values (propagation doesn't apply because last=1)
        { { C::execution_sel, 1 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 42 },
          { C::execution_last, 1 } },
        { { C::execution_sel, 0 } },
    });

    check_relation<execution_discard>(
        trace, execution_discard::SR_DISCARD_PROPAGATION, execution_discard::SR_DYING_CONTEXT_PROPAGATION);
}

// ====== EXPLOIT TESTS - These test vulnerabilities found in early versions ======

TEST(ExecutionDiscardConstrainingTest, ExploitRaiseDiscardWithWrongDyingContext)
{
    // EXPLOIT 1: A calls B calls C. C fails.
    // Attacker raises discard when entering B and sets dying context to C.
    // Then C clears the flag when it fails.
    // Result on attack success: B's operations are discarded even though B didn't fail.
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Row 1: Context A (id=1), no discard initially
        { { C::execution_sel, 1 },
          { C::execution_context_id, 1 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_dying_context_diff_inv, FF(1 - 0).invert() },
          { C::execution_is_dying_context, 0 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 1 } },
        // Row 2: A calls B - ATTACK: raise discard and set dying_context to C (id=3)
        { { C::execution_sel, 1 },
          { C::execution_context_id, 1 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_dying_context_diff_inv, FF(1 - 0).invert() },
          { C::execution_sel_enter_call, 1 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 1 },
          { C::execution_propagate_discard, 0 } },
        // Row 3: Entering B (id=2) - ATTACK: discard raised to 1, dying_context set to 3 (C)
        { { C::execution_sel, 1 },
          { C::execution_context_id, 2 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 3 },
          { C::execution_dying_context_id_inv, FF(3).invert() },
          { C::execution_dying_context_diff_inv, FF(2 - 3).invert() },
          { C::execution_is_dying_context, 0 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 1 } },
        // Row 4: B calls C
        { { C::execution_sel, 1 },
          { C::execution_context_id, 2 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 3 },
          { C::execution_dying_context_id_inv, FF(3).invert() },
          { C::execution_dying_context_diff_inv, FF(2 - 3).invert() },
          { C::execution_is_dying_context, 0 },
          { C::execution_sel_enter_call, 1 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 0 } },
        // Row 5: C (id=3) executes and fails - this is the dying context
        { { C::execution_sel, 1 },
          { C::execution_context_id, 3 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 3 },
          { C::execution_dying_context_id_inv, FF(3).invert() },
          { C::execution_dying_context_diff_inv, 0 },
          { C::execution_is_dying_context, 1 },
          { C::execution_sel_exit_call, 1 },
          { C::execution_sel_error, 1 },
          { C::execution_sel_failure, 1 },
          { C::execution_has_parent_ctx, 1 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 1 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 0 } },
        // Row 6: Back to B - discard cleared because dying context resolved
        { { C::execution_sel, 1 },
          { C::execution_context_id, 2 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_dying_context_diff_inv, FF(2 - 0).invert() },
          { C::execution_is_dying_context, 0 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 1 } },
        // Row 7: B exits successfully (no failure)
        { { C::execution_sel, 1 },
          { C::execution_context_id, 2 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_dying_context_diff_inv, FF(2 - 0).invert() },
          { C::execution_sel_exit_call, 1 },
          { C::execution_sel_error, 0 },
          { C::execution_sel_failure, 0 },
          { C::execution_has_parent_ctx, 1 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 0 } },
        { { C::execution_sel, 1 }, { C::execution_last, 1 } },
        { { C::execution_sel, 0 } },
    });

    // If the exploit works, this check will pass.
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution_discard>(trace), "ENTER_CALL_DISCARD_MUST_BE_DYING_CONTEXT");
}

TEST(ExecutionDiscardConstrainingTest, ExploitAvoidDiscardByDelayingRaise)
{
    // EXPLOIT 2: A calls B calls C. B and C both fail.
    // Attacker doesn't raise discard until it enters C, but sets the dying context to B.
    // Then discard will remain 1 until it is cleared at the end of B.
    // Result on attack success: B's rows before calling C are not discarded despite B's eventual failure.
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Row 1: Context A (id=1), no discard
        { { C::execution_sel, 1 },
          { C::execution_context_id, 1 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_dying_context_diff_inv, FF(1 - 0).invert() },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 1 } },
        // Row 2: A calls B
        { { C::execution_sel, 1 },
          { C::execution_context_id, 1 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_dying_context_diff_inv, FF(1 - 0).invert() },
          { C::execution_sel_enter_call, 1 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 1 },
          { C::execution_propagate_discard, 0 } },
        // Row 3: B (id=2) executes - ATTACK: don't raise discard yet
        { { C::execution_sel, 1 },
          { C::execution_context_id, 2 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_dying_context_diff_inv, FF(2 - 0).invert() },
          { C::execution_is_dying_context, 0 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 1 } },
        // Row 4: B calls C
        { { C::execution_sel, 1 },
          { C::execution_context_id, 2 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_dying_context_diff_inv, FF(2 - 0).invert() },
          { C::execution_sel_enter_call, 1 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 1 },
          { C::execution_propagate_discard, 0 } },
        // Row 5: Entering C (id=3) - ATTACK: NOW raise discard but set dying_context to B (id=2)
        { { C::execution_sel, 1 },
          { C::execution_context_id, 3 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 2 },
          { C::execution_dying_context_id_inv, FF(2).invert() },
          { C::execution_dying_context_diff_inv, FF(3 - 2).invert() },
          { C::execution_is_dying_context, 0 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 1 } },
        // Row 6: C fails, but it's not the dying context so discard propagates
        { { C::execution_sel, 1 },
          { C::execution_context_id, 3 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 2 },
          { C::execution_dying_context_id_inv, FF(2).invert() },
          { C::execution_dying_context_diff_inv, FF(3 - 2).invert() },
          { C::execution_is_dying_context, 0 },
          { C::execution_sel_exit_call, 1 },
          { C::execution_sel_error, 1 },
          { C::execution_sel_failure, 1 },
          { C::execution_has_parent_ctx, 1 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 0 } },
        // Row 7: Back to B, discard still 1
        { { C::execution_sel, 1 },
          { C::execution_context_id, 2 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 2 },
          { C::execution_dying_context_id_inv, FF(2).invert() },
          { C::execution_dying_context_diff_inv, 0 },
          { C::execution_is_dying_context, 1 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 1 } },
        // Row 8: B fails and is the dying context, so discard gets cleared
        { { C::execution_sel, 1 },
          { C::execution_context_id, 2 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 2 },
          { C::execution_dying_context_id_inv, FF(2).invert() },
          { C::execution_dying_context_diff_inv, 0 },
          { C::execution_is_dying_context, 1 },
          { C::execution_sel_exit_call, 1 },
          { C::execution_sel_error, 1 },
          { C::execution_sel_failure, 1 },
          { C::execution_has_parent_ctx, 1 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 1 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 0 } },
        { { C::execution_sel, 1 }, { C::execution_last, 1 } },
        { { C::execution_sel, 0 } },
    });

    // If the exploit works, this check will pass.
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution_discard>(trace), "ENTER_CALL_DISCARD_MUST_BE_DYING_CONTEXT");
}

TEST(ExecutionDiscardConstrainingTest, ExploitChangesDyingContextAfterResolution)
{
    // EXPLOIT 3: A calls B calls C. B and C both fail.
    // Attacker sets dying context to C initially. When C dies, attacker changes dying context to B
    // instead of clearing discard, allowing them to avoid discarding B's early operations.
    // Result on attack success: B's rows before calling C are not discarded despite B's eventual failure.
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Row 1: Context A calls B
        { { C::execution_sel, 1 },
          { C::execution_context_id, 1 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_dying_context_diff_inv, FF(1 - 0).invert() },
          { C::execution_sel_enter_call, 1 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 1 },
          { C::execution_propagate_discard, 0 } },
        // Row 2: B (id=2) executes - not discarded yet
        { { C::execution_sel, 1 },
          { C::execution_context_id, 2 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_dying_context_diff_inv, FF(2 - 0).invert() },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 1 } },
        // Row 3: B calls C
        { { C::execution_sel, 1 },
          { C::execution_context_id, 2 },
          { C::execution_discard, 0 },
          { C::execution_dying_context_id, 0 },
          { C::execution_dying_context_diff_inv, FF(2 - 0).invert() },
          { C::execution_sel_enter_call, 1 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 1 },
          { C::execution_propagate_discard, 0 } },
        // Row 4: Entering C (id=3) - raise discard, set dying_context to C
        { { C::execution_sel, 1 },
          { C::execution_context_id, 3 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 3 },
          { C::execution_dying_context_id_inv, FF(3).invert() },
          { C::execution_dying_context_diff_inv, 0 },
          { C::execution_is_dying_context, 1 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 1 } },
        // Row 5: C fails (dying context resolves, propagation lifted)
        { { C::execution_sel, 1 },
          { C::execution_context_id, 3 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 3 },
          { C::execution_dying_context_id_inv, FF(3).invert() },
          { C::execution_dying_context_diff_inv, 0 },
          { C::execution_is_dying_context, 1 },
          { C::execution_sel_exit_call, 1 },
          { C::execution_sel_error, 1 },
          { C::execution_sel_failure, 1 },
          { C::execution_has_parent_ctx, 1 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 1 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 0 } },
        // Row 6: Back to B - ATTACK: keep discard=1 but change dying context to B
        { { C::execution_sel, 1 },
          { C::execution_context_id, 2 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 2 },
          { C::execution_dying_context_id_inv, FF(2).invert() },
          { C::execution_dying_context_diff_inv, 0 },
          { C::execution_is_dying_context, 1 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 0 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 1 } },
        // Row 7: B fails and resolves as dying context, clearing discard again.
        { { C::execution_sel, 1 },
          { C::execution_context_id, 2 },
          { C::execution_discard, 1 },
          { C::execution_dying_context_id, 2 },
          { C::execution_dying_context_id_inv, FF(2).invert() },
          { C::execution_dying_context_diff_inv, 0 },
          { C::execution_is_dying_context, 1 },
          { C::execution_sel_exit_call, 1 },
          { C::execution_sel_error, 1 },
          { C::execution_sel_failure, 1 },
          { C::execution_has_parent_ctx, 1 },
          { C::execution_enqueued_call_end, 0 },
          { C::execution_resolves_dying_context, 1 },
          { C::execution_nested_call_from_undiscarded_context, 0 },
          { C::execution_propagate_discard, 0 } },
        { { C::execution_sel, 1 }, { C::execution_last, 1 } },
        { { C::execution_sel, 0 } },
    });

    // If the exploit works, this check will pass.
    EXPECT_THROW_WITH_MESSAGE(check_relation<execution_discard>(trace), "DYING_CONTEXT_WITH_PARENT_MUST_CLEAR_DISCARD");
}

} // namespace
} // namespace bb::avm2::constraining
