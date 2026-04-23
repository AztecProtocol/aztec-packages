// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/relations/offset_boundary_relation.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/relations/permutation_relation.hpp"
#include "barretenberg/relations/ultra_arithmetic_relation.hpp"
#include <gtest/gtest.h>

using namespace bb;

using FF = fr;

namespace {

// Dummy policy for compile-time checks. Entities / NUM_SUBRELATIONS picked arbitrarily;
// not intended for real use — this test only verifies type-level wiring.
struct DummyPolicy {
    using FF = bb::fr;
    static constexpr size_t NUM_SUBRELATIONS = 3;

    template <typename AllEntities> static auto entities(const AllEntities& in)
    {
        return std::tie(in.w_l, in.w_r, in.w_o);
    }
};

using DummyOffsetRelation = OffsetBoundaryRelation<DummyPolicy>;

} // namespace

// Concept: our dummy offset relation is detected as offset-only.
static_assert(IsOffsetOnlyRelation<DummyOffsetRelation>);

// Concept: ordinary relations are NOT offset-only by default.
static_assert(!IsOffsetOnlyRelation<UltraPermutationRelation<FF>>);
static_assert(!IsOffsetOnlyRelation<ArithmeticRelation<FF>>);

// Relation-length bookkeeping: every subrelation of an offset boundary relation is
// a degree-1 "entity = 0" check, so partial length is 2 and RELATION_LENGTH is 2.
static_assert(DummyOffsetRelation::RELATION_LENGTH == 2);

TEST(OffsetBoundaryRelation, SubrelationLengthsAreAllTwo)
{
    for (size_t len : DummyOffsetRelation::SUBRELATION_PARTIAL_LENGTHS) {
        EXPECT_EQ(len, size_t{ 2 });
    }
    EXPECT_EQ(DummyOffsetRelation::SUBRELATION_PARTIAL_LENGTHS.size(), DummyPolicy::NUM_SUBRELATIONS);
}
