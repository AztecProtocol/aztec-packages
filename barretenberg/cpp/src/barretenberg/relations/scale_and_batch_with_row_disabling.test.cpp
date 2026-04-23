// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/relations/utils.hpp"
#include <gtest/gtest.h>

using namespace bb;

using Flavor = UltraFlavor;
using FF = Flavor::FF;
using Utils = RelationUtils<Flavor>;

namespace {

// Populate every element of a tuple-of-arrays with distinct, reproducible FF values.
template <typename Tuple> void fill_with_sequential_values(Tuple& tuple, uint64_t seed = 1)
{
    uint64_t counter = seed;
    constexpr_for<0, std::tuple_size_v<Tuple>, 1>([&]<size_t OuterIdx>() {
        auto& arr = std::get<OuterIdx>(tuple);
        for (auto& v : arr) {
            v = FF(counter++);
        }
    });
}

} // namespace

// Invariant: for a flavor with no offset-only relations,
//   scale_and_batch_elements_with_row_disabling(tuple, α, one_minus_L, L)
//   == scale_and_batch_elements(tuple, α) * one_minus_L
// (since the L-tagged branch is never taken, every relation multiplies by (1-L)).
TEST(ScaleAndBatchWithRowDisabling, MatchesLegacyPathWhenNoOffsetOnlyRelation)
{
    Utils::RelationEvaluations tuple{};
    // Note: sequential values; we only need them to be non-zero and distinct.
    fill_with_sequential_values(tuple, /*seed=*/1);

    Utils::SubrelationSeparators alphas{};
    for (size_t i = 0; i < alphas.size(); ++i) {
        alphas[i] = FF(100 + i);
    }

    const FF one_minus_L{ 7 };
    const FF L{ FF{ 1 } - one_minus_L };

    auto tuple_copy = tuple;
    const FF expected = Utils::scale_and_batch_elements(tuple_copy, alphas) * one_minus_L;

    auto tuple_copy2 = tuple;
    const FF actual = Utils::scale_and_batch_elements_with_row_disabling(tuple_copy2, alphas, one_minus_L, L);

    EXPECT_EQ(actual, expected);
}

// Edge case: one_minus_L == 1, L == 0 collapses to plain scale_and_batch_elements
// (since all relations are main-domain for UltraFlavor).
TEST(ScaleAndBatchWithRowDisabling, CollapsesToPlainBatchWhenOneMinusLIsOne)
{
    Utils::RelationEvaluations tuple{};
    fill_with_sequential_values(tuple, /*seed=*/42);

    Utils::SubrelationSeparators alphas{};
    for (size_t i = 0; i < alphas.size(); ++i) {
        alphas[i] = FF(2 * i + 3);
    }

    auto tuple_copy = tuple;
    const FF plain = Utils::scale_and_batch_elements(tuple_copy, alphas);

    auto tuple_copy2 = tuple;
    const FF rd = Utils::scale_and_batch_elements_with_row_disabling(tuple_copy2, alphas, FF{ 1 }, FF{ 0 });

    EXPECT_EQ(rd, plain);
}
