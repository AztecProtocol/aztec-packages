#include "generic_lookup_relation.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include <array>
#include <gtest/gtest.h>

using namespace bb;
using FF = bb::fr;

// ============================================================================
// SettingsBasicLookup
//
// Uses BASIC_LOOKUP / BASIC_TABLE so the relation auto-batches polynomial
// columns via: term = col[0]*beta + col[1] + gamma  (LOOKUP_TUPLE_SIZE=2)
//
// Polynomial index map (NUM_POLYS = 8):
//   [0] Inverse polynomial   (I)
//   [1] Read count           (table term 0)
//   [2] Lookup predicate
//   [3] Table predicate
//   [4] Lookup column f1
//   [5] Lookup column f2     →  lookup_term = f1*beta + f2 + gamma
//   [6] Table column t1
//   [7] Table column t2      →  table_term  = t1*beta + t2 + gamma
// ============================================================================
struct SettingsBasicLookup {
    static constexpr size_t NUM_LOOKUP_TERMS = 1;
    static constexpr size_t NUM_TABLE_TERMS = 1;
    static constexpr size_t LOOKUP_TUPLE_SIZE = 2;
    static constexpr size_t INVERSE_EXISTS_POLYNOMIAL_DEGREE = 2;

    static constexpr std::array<uint8_t, NUM_LOOKUP_TERMS> LOOKUP_TYPES = { BASIC_LOOKUP };
    static constexpr std::array<uint8_t, NUM_TABLE_TERMS> TABLE_TYPES = { BASIC_TABLE };
    // Degrees are only used for CUSTOMIZED types; for BASIC the relation uses degree=1 internally.
    static constexpr std::array<size_t, NUM_LOOKUP_TERMS> LOOKUP_TERM_DEGREES = { 1 };
    static constexpr std::array<size_t, NUM_TABLE_TERMS> TABLE_TERM_DEGREES = { 1 };

    static constexpr size_t NUM_POLYS = 1 +                                      // Inverse
                                        NUM_TABLE_TERMS +                        // Read counts
                                        NUM_LOOKUP_TERMS +                       // Lookup predicates
                                        NUM_TABLE_TERMS +                        // Table predicates
                                        (LOOKUP_TUPLE_SIZE * NUM_LOOKUP_TERMS) + // Lookup columns
                                        (LOOKUP_TUPLE_SIZE * NUM_TABLE_TERMS);   // Table columns

    using AllEntities = std::array<FF, NUM_POLYS>;

    /**
     * @brief Returns true if either predicate is active, meaning inverse must be computed at this row.
     */
    static bool inverse_polynomial_is_computed_at_row(const AllEntities& in)
    {
        return in[2] == FF(1) || in[3] == FF(1);
    }

    /**
     * @brief OR(lookup_pred, table_pred) via the inclusion-exclusion formula A + B - A*B.
     *
     * This is a degree-2 polynomial in the predicates, matching INVERSE_EXISTS_POLYNOMIAL_DEGREE=2.
     */
    template <typename Accumulator> static Accumulator compute_inverse_exists(const AllEntities& in)
    {
        return Accumulator(in[2]) + Accumulator(in[3]) - Accumulator(in[2]) * Accumulator(in[3]);
    }

    // Both const and nonconst overloads are templated so they accept `const AllEntities&`
    // when called from GenericLookupRelationImpl::get_inverse_polynomial (which uses a deduced
    // AllEntities&& that can be const).
    template <typename AE> static auto get_const_entities(const AE& in)
    {
        return std::forward_as_tuple(in[0], in[1], in[2], in[3], in[4], in[5], in[6], in[7]);
    }

    template <typename AE> static auto get_nonconst_entities(AE& in)
    {
        return std::forward_as_tuple(in[0], in[1], in[2], in[3], in[4], in[5], in[6], in[7]);
    }
};

// ============================================================================
// SettingsCustomizedLookup
//
// Uses CUSTOMIZED_LOOKUP / CUSTOMIZED_TABLE so no polynomial columns are
// auto-added for batching. Two extra columns are added manually:
//   [4] f column   →  lookup_term = f^2 + gamma   (degree 2)
//   [5] t column   →  table_term  = t   + gamma   (degree 1)
//
// Polynomial index map (NUM_POLYS = 6):
//   [0] Inverse polynomial   (I)
//   [1] Read count
//   [2] Lookup predicate
//   [3] Table predicate
//   [4] Custom f column
//   [5] Custom t column
// ============================================================================
struct SettingsCustomizedLookup {
    static constexpr size_t NUM_LOOKUP_TERMS = 1;
    static constexpr size_t NUM_TABLE_TERMS = 1;
    // LOOKUP_TUPLE_SIZE is required by the concept but is unused for CUSTOMIZED types.
    static constexpr size_t LOOKUP_TUPLE_SIZE = 1;
    static constexpr size_t INVERSE_EXISTS_POLYNOMIAL_DEGREE = 2;

    static constexpr std::array<uint8_t, NUM_LOOKUP_TERMS> LOOKUP_TYPES = { CUSTOMIZED_LOOKUP };
    static constexpr std::array<uint8_t, NUM_TABLE_TERMS> TABLE_TYPES = { CUSTOMIZED_TABLE };
    static constexpr std::array<size_t, NUM_LOOKUP_TERMS> LOOKUP_TERM_DEGREES = { 2 }; // f^2 is degree 2
    static constexpr std::array<size_t, NUM_TABLE_TERMS> TABLE_TERM_DEGREES = { 1 };   // t is degree 1

    // 1 (inv) + 1 (count) + 1 (lookup pred) + 1 (table pred) + 1 (f col) + 1 (t col)
    static constexpr size_t NUM_POLYS = 6;

    using AllEntities = std::array<FF, NUM_POLYS>;

    static bool inverse_polynomial_is_computed_at_row(const AllEntities& in)
    {
        return in[2] == FF(1) || in[3] == FF(1);
    }

    template <typename Accumulator> static Accumulator compute_inverse_exists(const AllEntities& in)
    {
        return Accumulator(in[2]) + Accumulator(in[3]) - Accumulator(in[2]) * Accumulator(in[3]);
    }

    /**
     * @brief Custom lookup term: f^2  (degree 2)
     */
    template <typename Accumulator, size_t /*lookup_index*/, typename Parameters>
    static Accumulator compute_lookup_term(const AllEntities& in, [[maybe_unused]] const Parameters& params)
    {
        using View = typename Accumulator::View;
        auto f = Accumulator(View(in[4]));
        return f * f;
    }

    /**
     * @brief Custom table term: t + gamma  (degree 1)
     */
    template <typename Accumulator, size_t /*table_index*/, typename Parameters>
    static Accumulator compute_table_term(const AllEntities& in, [[maybe_unused]] const Parameters& params)
    {
        using View = typename Accumulator::View;
        auto t = Accumulator(View(in[5]));
        return t;
    }

    template <typename AE> static auto get_const_entities(const AE& in)
    {
        return std::forward_as_tuple(in[0], in[1], in[2], in[3], in[4], in[5]);
    }

    template <typename AE> static auto get_nonconst_entities(AE& in)
    {
        return std::forward_as_tuple(in[0], in[1], in[2], in[3], in[4], in[5]);
    }
};

// ============================================================================
// Test fixtures
// ============================================================================

template <typename Settings> class GenericLookupRelationTest : public testing::Test {
  public:
    using Relation = GenericLookupRelationImpl<Settings, FF>;
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
// Tests for SettingsBasicLookup
// ============================================================================

class BasicLookupTest : public GenericLookupRelationTest<SettingsBasicLookup> {
  public:
    /**
     * @brief Build and evaluate a canonical two-row (lookup + table) trace.
     *
     * Row 0 is always a lookup row with f1=1, f2=2.
     * Row 1 is always a table row with f1=9, f2=10 (dummies, lookup_pred=0).
     * The table columns for row 1 and the read count are the varying parameters.
     *
     * The expected subrelation-2 sum is derived directly from the inputs:
     *   acc[1] = 1/lookup_term0 - read_count/table_term1
     * so passing table columns that match row 0 (t1=1, t2=2) with read_count=1 gives 0.
     */
    static void check_two_row_sum(const RelationParameters<FF>& params, FF t1_row1, FF t2_row1, FF read_count)
    {
        const FF beta = params.beta;
        const FF gamma = params.gamma;

        // Row 0: lookup row (fixed)
        const FF f1 = FF(1);
        const FF f2 = FF(2);
        const FF t1_row0 = FF(3);
        const FF t2_row0 = FF(4);
        const FF lookup_term0 = f1 * beta + f2 + gamma;
        const FF table_term_row0 = t1_row0 * beta + t2_row0 + gamma;

        AllEntities row0{};
        row0[0] = (lookup_term0 * table_term_row0).invert();
        row0[2] = FF(1); // lookup predicate
        row0[4] = f1;
        row0[5] = f2;
        row0[6] = t1_row0;
        row0[7] = t2_row0;

        // Row 1: table row (parametrized table columns and read count)
        const FF f1_row1 = FF(9);
        const FF f2_row1 = FF(10);
        const FF lookup_term_row1 = f1_row1 * beta + f2_row1 + gamma;
        const FF table_term1 = t1_row1 * beta + t2_row1 + gamma;

        AllEntities row1{};
        row1[0] = (lookup_term_row1 * table_term1).invert();
        row1[1] = read_count; // read count
        row1[3] = FF(1);      // table predicate
        row1[4] = f1_row1;
        row1[5] = f2_row1;
        row1[6] = t1_row1;
        row1[7] = t2_row1;

        Accumulator acc{};
        Relation::accumulate(acc, row0, params, FF(1));
        EXPECT_EQ(acc[0], FF(0)); // subrelation 0 satisfied independently per row
        Relation::accumulate(acc, row1, params, FF(1));

        EXPECT_EQ(acc[0], FF(0));
        EXPECT_EQ(acc[1], FF(1) / lookup_term0 - read_count / table_term1);
    }
};

/**
 * @brief An all-zero row must leave both subrelations at zero.
 *
 * When no predicate is active, inverse_exists = 0, lookup_inverse = 0:
 *   subrel_0 = (prod * 0 - 0) * sf = 0
 *   subrel_1 += 0 * ... - 0 * ... = 0
 */
TEST_F(BasicLookupTest, InactiveRow)
{
    const auto params = RelationParameters<FF>::get_random();
    AllEntities row{}; // all zeros
    auto acc = eval_row(row, params);
    EXPECT_EQ(acc[0], FF(0));
    EXPECT_EQ(acc[1], FF(0));
}

/**
 * @brief A correctly-set-up lookup row satisfies subrelation 1.
 *
 * With lookup_predicate=1, table_predicate=0:
 *   inverse_exists = 1
 *   I = 1 / (lookup_term * table_term)
 *   subrel_0 = I * lookup_term * table_term - 1 = 0
 */
TEST_F(BasicLookupTest, ValidLookupRow)
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
    // row[1] = 0 (read count, unused on lookup row)
    row[2] = FF(1); // lookup predicate
    // row[3] = 0  (table predicate)
    row[4] = f1;
    row[5] = f2;
    row[6] = t1;
    row[7] = t2;

    auto acc = eval_row(row, params);
    EXPECT_EQ(acc[0], FF(0));
}

/**
 * @brief A correctly-set-up table row satisfies subrelation 1.
 *
 * With lookup_predicate=0, table_predicate=1, read_count=1:
 *   inverse_exists = 1
 *   I = 1 / (lookup_term * table_term)
 *   subrel_0 = I * lookup_term * table_term - 1 = 0
 */
TEST_F(BasicLookupTest, ValidTableRow)
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
    // row[2] = 0 (lookup predicate)
    row[3] = FF(1); // table predicate
    row[4] = f1;
    row[5] = f2;
    row[6] = t1;
    row[7] = t2;

    auto acc = eval_row(row, params);
    EXPECT_EQ(acc[0], FF(0));
}

/**
 * @brief A two-row trace with matching lookup/table terms satisfies the log-derivative identity.
 *
 * t1=1, t2=2 on row 1 → table_term1 = 1*beta + 2 + gamma = lookup_term0, so acc[1] = 0.
 */
TEST_F(BasicLookupTest, ValidTrace)
{
    const auto params = RelationParameters<FF>::get_random();
    // t1=1, t2=2 matches the lookup term (f1=1, f2=2) → valid lookup, sum = 0
    check_two_row_sum(params, /*t1_row1=*/FF(1), /*t2_row1=*/FF(2), /*read_count=*/FF(1));
}

/**
 * @brief An active lookup row with an incorrect inverse violates subrelation 1.
 *
 * We set I to a wrong value (not the product-inverse) and confirm subrelation 1 ≠ 0.
 */
TEST_F(BasicLookupTest, IncorrectInverse)
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
    row[2] = FF(1);  // lookup predicate
    row[4] = f1;
    row[5] = f2;
    row[6] = t1;
    row[7] = t2;

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
TEST_F(BasicLookupTest, InvalidLookup)
{
    const auto params = RelationParameters<FF>::get_random();
    // t1=2, t2=4 gives table_term1 ≠ lookup_term0 (f1=1, f2=2)
    check_two_row_sum(params, /*t1_row1=*/FF(2), /*t2_row1=*/FF(4), /*read_count=*/FF(1));
}

/**
 * @brief Read count mismatch: table_term1 = lookup_term0 but read_count=2 → acc[1] = -1/lookup_term0 ≠ 0.
 */
TEST_F(BasicLookupTest, InvalidReadCount)
{
    const auto params = RelationParameters<FF>::get_random();
    // t1=1, t2=2 matches (table_term1 == lookup_term0) but read_count=2 makes the sum non-zero
    check_two_row_sum(params, /*t1_row1=*/FF(1), /*t2_row1=*/FF(2), /*read_count=*/FF(2));
}

// ============================================================================
// Tests for SettingsCustomizedLookup
// ============================================================================

class CustomizedLookupTest : public GenericLookupRelationTest<SettingsCustomizedLookup> {
  public:
    /**
     * @brief Build and evaluate a canonical two-row (lookup + table) trace.
     *
     * Row 0 is always a lookup row with f=3 (lookup_term = 9).
     * Row 1 is always a table row with f=5 (dummy, lookup_pred=0).
     * The t column for row 1 and the read count are the varying parameters.
     *
     * The expected subrelation-2 sum is 1/lookup_term0 - read_count/table_term1,
     * so passing table_t_value=9 (== v^2) with read_count=1 gives 0.
     */
    static void check_two_row_sum(const RelationParameters<FF>& params, FF table_t_value, FF read_count)
    {
        const FF v = FF(3);
        const FF v_sq = v * v; // lookup_term0 = 9

        // Row 0: lookup row (fixed)
        const FF t_row0 = FF(1); // arbitrary table column for row 0 inverse denominator
        AllEntities row0{};
        row0[0] = (v_sq * t_row0).invert();
        row0[2] = FF(1); // lookup predicate
        row0[4] = v;     // f column → lookup_term = v^2
        row0[5] = t_row0;

        // Row 1: table row (parametrized t column and read count)
        const FF f_row1 = FF(5);
        const FF lookup_term_row1 = f_row1 * f_row1; // 25
        AllEntities row1{};
        row1[0] = (lookup_term_row1 * table_t_value).invert();
        row1[1] = read_count; // read count
        row1[3] = FF(1);      // table predicate
        row1[4] = f_row1;
        row1[5] = table_t_value; // t column → table_term = table_t_value

        Accumulator acc{};
        Relation::accumulate(acc, row0, params, FF(1));
        EXPECT_EQ(acc[0], FF(0)); // subrelation 0 satisfied independently per row
        Relation::accumulate(acc, row1, params, FF(1));

        EXPECT_EQ(acc[0], FF(0));
        EXPECT_EQ(acc[1], FF(1) / v_sq - read_count / table_t_value);
    }
};

/**
 * @brief All-zero row → both subrelations are zero.
 */
TEST_F(CustomizedLookupTest, InactiveRow)
{
    const auto params = RelationParameters<FF>::get_random();
    AllEntities row{};
    auto acc = eval_row(row, params);
    EXPECT_EQ(acc[0], FF(0));
    EXPECT_EQ(acc[1], FF(0));
}

/**
 * @brief Correctly-set-up lookup row satisfies subrelation 1.
 *
 * lookup_term = f^2,  f = in[4]
 * table_term  = t  ,  t = in[5]  (arbitrary, since table_pred=0)
 */
TEST_F(CustomizedLookupTest, ValidLookupRow)
{
    const auto params = RelationParameters<FF>::get_random();

    const FF f = FF(3);
    const FF t_val = FF(7);       // arbitrary table column value
    const FF lookup_term = f * f; // f^2
    const FF table_term = t_val;  // t

    AllEntities row{};
    row[0] = (lookup_term * table_term).invert(); // I
    row[2] = FF(1);                               // lookup predicate
    row[4] = f;
    row[5] = t_val;

    auto acc = eval_row(row, params);
    EXPECT_EQ(acc[0], FF(0));
}

/**
 * @brief Correctly-set-up table row satisfies subrelation 1.
 *
 * lookup_term = f^2,  f = in[4]  (arbitrary)
 * table_term  = t  ,  t = in[5]
 */
TEST_F(CustomizedLookupTest, ValidTableRow)
{
    const auto params = RelationParameters<FF>::get_random();

    const FF f = FF(5); // arbitrary lookup column
    const FF t_val = FF(9);
    const FF lookup_term = f * f;
    const FF table_term = t_val;

    AllEntities row{};
    row[0] = (lookup_term * table_term).invert();
    row[1] = FF(1); // read count
    row[3] = FF(1); // table predicate
    row[4] = f;
    row[5] = t_val;

    auto acc = eval_row(row, params);
    EXPECT_EQ(acc[0], FF(0));
}

/**
 * @brief Two-row trace with matching lookup/table terms satisfies the log-derivative identity.
 *
 * table_t_value=9 (=v^2) matches lookup_term0=9, so acc[1] = 1/9 - 1/9 = 0.
 */
TEST_F(CustomizedLookupTest, ValidTrace)
{
    const auto params = RelationParameters<FF>::get_random();
    check_two_row_sum(params, /*table_t_value=*/FF(9), /*read_count=*/FF(1));
}

/**
 * @brief Wrong inverse on a customized active row violates subrelation 1.
 */
TEST_F(CustomizedLookupTest, IncorrectInverse)
{
    const auto params = RelationParameters<FF>::get_random();

    const FF f = FF(3);
    const FF t_val = FF(7);
    const FF lookup_term = f * f;
    const FF table_term = t_val;

    AllEntities row{};
    row[0] = FF(13); // deliberate wrong inverse
    row[2] = FF(1);  // lookup predicate
    row[4] = f;
    row[5] = t_val;

    auto acc = eval_row(row, params);

    const FF expected = lookup_term * table_term * FF(13) - FF(1);
    EXPECT_EQ(acc[0], expected);
    EXPECT_NE(acc[0], FF(0));
}

/**
 * @brief Table term mismatch: lookup_term0=9, table_t_value=8 → acc[1] = 1/9 - 1/8 ≠ 0.
 */
TEST_F(CustomizedLookupTest, InvalidLookup)
{
    const auto params = RelationParameters<FF>::get_random();
    check_two_row_sum(params, /*table_t_value=*/FF(8), /*read_count=*/FF(1));
}

/**
 * @brief Read count mismatch: table_t_value=9 matches but read_count=2 → acc[1] = 1/9 - 2/9 ≠ 0.
 */
TEST_F(CustomizedLookupTest, InvalidReadCount)
{
    const auto params = RelationParameters<FF>::get_random();
    check_two_row_sum(params, /*table_t_value=*/FF(9), /*read_count=*/FF(2));
}
