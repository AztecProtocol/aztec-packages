#include "generic_permutation_relation.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include <array>
#include <gtest/gtest.h>

using namespace bb;
using FF = bb::fr;

// ============================================================================
// Generic Permutation Relation
//
// We define a simple permutation relation with lookup/table terms composed of the batching of two columns each. Then,
// we test that:
//  - Correctly set up lookup and table rows satisfy the first subrelation (inverse check)
//  - A two row trace is satisfied if the lookup/table values are correct.
//  - A two row trace is not satisfied if the lookup/table terms do not match.
struct SettingsBasicPermutation {
    static constexpr size_t COLUMNS_PER_SET = 2;
    static constexpr size_t INVERSE_EXISTS_POLYNOMIAL_DEGREE = 2;

    static constexpr size_t NUM_POLYS = 1 +               // Inverse
                                        1 +               // Lookup predicates
                                        1 +               // Table predicates
                                        COLUMNS_PER_SET + // Lookup columns
                                        COLUMNS_PER_SET;  // Table columns

    using AllEntities = std::array<FF, NUM_POLYS>;

    /**
     * @brief Returns true if either predicate is active, meaning inverse must be computed at this row.
     */
    static bool inverse_polynomial_is_computed_at_row(const AllEntities& in)
    {
        return in[1] == FF(1) || in[2] == FF(1);
    }

    /**
     * @brief OR(lookup_pred, table_pred) via the inclusion-exclusion formula A + B - A*B.
     *
     * This is a degree-2 polynomial in the predicates, matching INVERSE_EXISTS_POLYNOMIAL_DEGREE=2.
     */
    template <typename Accumulator> static Accumulator compute_inverse_exists(const AllEntities& in)
    {
        return Accumulator(in[1]) + Accumulator(in[2]) - Accumulator(in[1]) * Accumulator(in[2]);
    }

    // Both const and nonconst overloads are templated so they accept `const AllEntities&`
    // when called from GenericLookupRelationImpl::get_inverse_polynomial (which uses a deduced
    // AllEntities&& that can be const).
    template <typename AE> static auto get_const_entities(const AE& in)
    {
        return std::forward_as_tuple(in[0], in[1], in[2], in[3], in[4], in[5], in[6]);
    }

    template <typename AE> static auto get_nonconst_entities(AE& in)
    {
        return std::forward_as_tuple(in[0], in[1], in[2], in[3], in[4], in[5], in[6]);
    }
};

// ============================================================================
// Test fixtures
// ============================================================================

template <typename Settings> class GenericPermutationRelationTest : public testing::Test {
  public:
    using Relation = GenericPermutationRelationImpl<Settings, FF>;
    using AllEntities = typename Settings::AllEntities;
    static constexpr size_t NUM_SUBRELATIONS = 2;

    using Accumulator = std::array<FF, NUM_SUBRELATIONS>;

    /**
     * @brief Accumulate a single row into a fresh accumulator.
     */
    static Accumulator eval_row(const AllEntities& row, const RelationParameters<FF>& params, FF scaling_factor = FF(1))
    {
        Accumulator acc{};
        Relation::accumulate(acc, row, params, scaling_factor);
        return acc;
    }

    /**
     * @brief Accumulate multiple rows into one accumulator.
     */
    static Accumulator eval_trace(const std::vector<AllEntities>& rows,
                                  const RelationParameters<FF>& params,
                                  FF scaling_factor = FF(1))
    {
        Accumulator acc{};
        for (const auto& row : rows) {
            Relation::accumulate(acc, row, params, scaling_factor);
        }
        return acc;
    }
};

// ============================================================================
// Tests for SettingsBasicPermutation
// ============================================================================

class BasicPermutationTest : public GenericPermutationRelationTest<SettingsBasicPermutation> {
  public:
    /**
     * @brief Build and evaluate a canonical two-row (lookup + table) trace.
     *
     * Row 0 is always a lookup row with f1=1, f2=2.
     * Row 1 is always a table rows, optionally a lookup row
     * The table columns and the lookup predicates for row 1 are the varying parameters.
     *
     */
    static void check_two_row_sum(const RelationParameters<FF>& params,
                                  FF t1_row1,
                                  FF t2_row1,
                                  FF lookup_predicate_row1)
    {
        const FF beta = params.beta;
        const FF gamma = params.gamma;

        auto construct_term = [&](FF col1, FF col2) { return col1 * beta + col2 + gamma; };

        // Valid lookup terms
        const FF valid_f1 = FF(1);
        const FF valid_f2 = FF(2);
        const FF valid_lookup_term = construct_term(valid_f1, valid_f2);

        // Row 0: lookup row (fixed)
        const FF t1_row0 = FF(3);
        const FF t2_row0 = FF(4);
        const FF table_term_row0 = construct_term(t1_row0, t2_row0);

        AllEntities row0{};
        row0[0] = (valid_lookup_term * table_term_row0).invert();
        row0[1] = FF(1); // lookup predicate
        row0[3] = valid_f1;
        row0[4] = valid_f2;
        row0[5] = t1_row0;
        row0[6] = t2_row0;

        // Row 1: table row (parametrized table columns and read count)
        const FF lookup_term_row1 = construct_term(valid_f1, valid_f2);
        const FF table_term1 = construct_term(t1_row1, t2_row1);

        AllEntities row1{};
        row1[0] = (lookup_term_row1 * table_term1).invert();
        row1[1] = lookup_predicate_row1; // lookup predicate
        row1[2] = FF(1);                 // table predicate
        row1[3] = valid_f1;
        row1[4] = valid_f2;
        row1[5] = t1_row1;
        row1[6] = t2_row1;

        Accumulator acc{};
        Relation::accumulate(acc, row0, params, FF(1));
        EXPECT_EQ(acc[0], FF(0)); // subrelation 0 satisfied independently per row
        Relation::accumulate(acc, row1, params, FF(1));

        EXPECT_EQ(acc[0], FF(0));
        EXPECT_EQ(acc[1], (FF(1) + lookup_predicate_row1) / valid_lookup_term - FF(1) / table_term1);
    }
};

/**
 * @brief An all-zero row must leave both subrelations at zero.
 *
 * When no predicate is active, inverse_exists = 0, lookup_inverse = 0:
 *   subrel_0 = (prod * 0 - 0) * sf = 0
 *   subrel_1 += 0 * ... - 0 * ... = 0
 */
TEST_F(BasicPermutationTest, InactiveRow)
{
    const auto params = RelationParameters<FF>::get_random();
    AllEntities row{}; // all zeros
    auto acc = eval_row(row, params);
    EXPECT_EQ(acc[0], FF(0));
    EXPECT_EQ(acc[1], FF(0));
}

/**
 * @brief A correctly-set-up lookup row satisfies subrelation 0.
 *
 * With lookup_predicate=1, table_predicate=0:
 *   inverse_exists = 1
 *   I = 1 / (lookup_term * table_term)
 *   subrel_0 = I * lookup_term * table_term - 1 = 0
 */
TEST_F(BasicPermutationTest, ValidLookupRow)
{
    const auto params = RelationParameters<FF>::get_random();
    const FF beta = params.beta;
    const FF gamma = params.gamma;

    // Construct lookup and table terms
    const FF f1 = FF(3);
    const FF f2 = FF(5);
    const FF t1 = FF(7);
    const FF t2 = FF(11);
    const FF lookup_term = f1 * beta + f2 + gamma;
    const FF table_term = t1 * beta + t2 + gamma;

    AllEntities row{};
    row[0] = (lookup_term * table_term).invert(); // I
    row[1] = FF(1);                               // lookup predicate
    row[3] = f1;
    row[4] = f2;
    row[5] = t1;
    row[6] = t2;

    auto acc = eval_row(row, params);
    EXPECT_EQ(acc[0], FF(0));
}

/**
 * @brief A correctly-set-up table row satisfies subrelation 0.
 *
 * With lookup_predicate=0, table_predicate=1, read_count=1:
 *   inverse_exists = 1
 *   I = 1 / (lookup_term * table_term)
 *   subrel_0 = I * lookup_term * table_term - 1 = 0
 */
TEST_F(BasicPermutationTest, ValidTableRow)
{
    const auto params = RelationParameters<FF>::get_random();
    const FF beta = params.beta;
    const FF gamma = params.gamma;

    const FF f1 = FF(2);
    const FF f2 = FF(4);
    const FF t1 = FF(6);
    const FF t2 = FF(8);
    const FF lookup_term = f1 * beta + f2 + gamma;
    const FF table_term = t1 * beta + t2 + gamma;

    AllEntities row{};
    row[0] = (lookup_term * table_term).invert(); // I
    row[1] = FF(1);                               // read count
    row[2] = FF(1);                               // lookup predicate
    row[3] = f1;
    row[4] = f2;
    row[5] = t1;
    row[6] = t2;

    auto acc = eval_row(row, params);
    EXPECT_EQ(acc[0], FF(0));
}

/**
 * @brief A two-row trace with matching lookup/table terms satisfies the log-derivative identity.
 *
 * t1=1, t2=2 on row 1 → table_term1 = 1*beta + 2 + gamma = lookup_term0, so acc[1] = 0.
 */
TEST_F(BasicPermutationTest, ValidTrace)
{
    const auto params = RelationParameters<FF>::get_random();
    // t1=1, t2=2 matches the lookup term (f1=1, f2=2) → valid lookup, sum = 0
    check_two_row_sum(params, /*t1_row1=*/FF(1), /*t2_row1=*/FF(2), /*lookup_predicate_row1=*/FF(0));
}

/**
 * @brief An active lookup row with an incorrect inverse violates subrelation 0.
 *
 * We set I to a wrong value (not the product-inverse) and confirm subrelation 0 ≠ 0.
 */
TEST_F(BasicPermutationTest, IncorrectInverse)
{
    const auto params = RelationParameters<FF>::get_random();
    const FF beta = params.beta;
    const FF gamma = params.gamma;

    const FF f1 = FF(3);
    const FF f2 = FF(5);
    const FF t1 = FF(7);
    const FF t2 = FF(11);

    AllEntities row{};
    row[0] = FF(42); // deliberate wrong inverse
    row[1] = FF(1);  // lookup predicate
    row[3] = f1;
    row[4] = f2;
    row[5] = t1;
    row[6] = t2;

    const FF lookup_term = f1 * beta + f2 + gamma;
    const FF table_term = t1 * beta + t2 + gamma;

    auto acc = eval_row(row, params);

    // Subrelation 0 = (lookup_term * table_term * I_wrong - inverse_exists) * sf
    // = (lookup_term * table_term * 42 - 1) which is generically non-zero
    const FF expected = lookup_term * table_term * FF(42) - FF(1);
    EXPECT_EQ(acc[0], expected);
    EXPECT_NE(acc[0], FF(0));
}

/**
 * @brief Table term mismatch: lookup_term0 = 1*beta+2+gamma, table_term1 = 2*beta+4+gamma → acc[1] ≠ 0.
 */
TEST_F(BasicPermutationTest, InvalidLookup)
{
    const auto params = RelationParameters<FF>::get_random();
    // t1=2, t2=4 gives table_term1 ≠ lookup_term0 (f1=1, f2=2)
    check_two_row_sum(params, /*t1_row1=*/FF(2), /*t2_row1=*/FF(4), /*lookup_predicate_row1=*/FF(0));

    // Invalid: more lookups than allowed
    check_two_row_sum(params, /*t1_row1=*/FF(1), /*t2_row1=*/FF(2), /*lookup_predicate_row1=*/FF(1));
}
