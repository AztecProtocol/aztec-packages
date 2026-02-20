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

class BasicLookupTest : public GenericLookupRelationTest<SettingsBasicLookup> {};

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
 * Row 0 (lookup): f1=1, f2=2  → lookup_term0 = 1*beta + 2 + gamma
 * Row 1 (table):  t1=1, t2=2  → table_term1  = 1*beta + 2 + gamma  (matches lookup_term0)
 *
 * Subrelation 2 sums to:
 *   +1/lookup_term0  (from row 0, lookup_pred=1)
 *   -1/table_term1   (from row 1, table_pred=1, read_count=1)
 *   = 0  because lookup_term0 == table_term1
 */
TEST_F(BasicLookupTest, ValidTrace)
{
    const auto params = RelationParameters<FF>::get_random();
    const FF beta = params.beta;
    const FF gamma = params.gamma;

    // Row 0: lookup row  (lookup_pred=1, table_pred=0)
    const FF f1 = FF(1);
    const FF f2 = FF(2);
    // Use arbitrary non-matching table columns — table_pred=0 so table_term is used only in the inverse denominator
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

    // Row 1: table row  (lookup_pred=0, table_pred=1, read_count=1)
    // t1=1, t2=2 → table_term1 = 1*beta + 2 + gamma = lookup_term0
    const FF t1_row1 = FF(1);
    const FF t2_row1 = FF(2);
    // Arbitrary lookup columns — lookup_pred=0 so they only contribute to the inverse denominator
    const FF f1_row1 = FF(9);
    const FF f2_row1 = FF(10);
    const FF lookup_term_row1 = f1_row1 * beta + f2_row1 + gamma;
    const FF table_term1 = t1_row1 * beta + t2_row1 + gamma;

    AllEntities row1{};
    row1[0] = (lookup_term_row1 * table_term1).invert();
    row1[1] = FF(1); // read count
    row1[3] = FF(1); // table predicate
    row1[4] = f1_row1;
    row1[5] = f2_row1;
    row1[6] = t1_row1;
    row1[7] = t2_row1;

    // Accumulate both rows
    Accumulator acc{};

    Relation::accumulate(acc, row0, params, FF(1));
    EXPECT_EQ(acc[0], FF(0)); // subrelation 0 is satisfied by each row independently

    Relation::accumulate(acc, row1, params, FF(1));

    // Subrelation 0 must be zero for both rows (each is independently satisfied)
    // Subrelation 1 must sum to zero across the two rows (log-derivative identity)
    EXPECT_EQ(acc[0], FF(0));
    EXPECT_EQ(acc[1], FF(0));
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
 * @brief A two-row trace with invalid lookup/table terms doesn't satisfy the log-derivative identity.
 *
 */
TEST_F(BasicLookupTest, InvalidLookup)
{
    const auto params = RelationParameters<FF>::get_random();
    const FF beta = params.beta;
    const FF gamma = params.gamma;

    // Row 0: lookup row  (lookup_pred=1, table_pred=0)
    const FF f1 = FF(1);
    const FF f2 = FF(2);
    // Use arbitrary non-matching table columns — table_pred=0 so table_term is used only in the inverse denominator
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

    // Row 1: table row  (lookup_pred=0, table_pred=1, read_count=1)
    // t1=2, t2=4 → table_term1 = 2*beta + 4 + gamma ≠ lookup_term0
    const FF t1_row1 = FF(2);
    const FF t2_row1 = FF(4);
    // Arbitrary lookup columns — lookup_pred=0 so they only contribute to the inverse denominator
    const FF f1_row1 = FF(9);
    const FF f2_row1 = FF(10);
    const FF lookup_term_row1 = f1_row1 * beta + f2_row1 + gamma;
    const FF table_term1 = t1_row1 * beta + t2_row1 + gamma;

    AllEntities row1{};
    row1[0] = (lookup_term_row1 * table_term1).invert();
    row1[1] = FF(1); // read count
    row1[3] = FF(1); // table predicate
    row1[4] = f1_row1;
    row1[5] = f2_row1;
    row1[6] = t1_row1;
    row1[7] = t2_row1;

    // Accumulate both rows
    Accumulator acc{};

    Relation::accumulate(acc, row0, params, FF(1));
    EXPECT_EQ(acc[0], FF(0)); // subrelation 0 is satisfied by each row independently

    Relation::accumulate(acc, row1, params, FF(1));

    // Subrelation 0 must be zero for both rows (each is independently satisfied)
    // Subrelation 1 must not sum to zero across the two rows (log-derivative identity)
    EXPECT_EQ(acc[0], FF(0));
    EXPECT_EQ(acc[1], FF(1) / lookup_term0 - FF(1) / table_term1); // read_count=2 causes the mismatch
}

/**
 * @brief A two-row trace with invalid lookup/table terms doesn't satisfy the log-derivative identity.
 *
 */
TEST_F(BasicLookupTest, InvalidReadCount)
{
    const auto params = RelationParameters<FF>::get_random();
    const FF beta = params.beta;
    const FF gamma = params.gamma;

    // Row 0: lookup row  (lookup_pred=1, table_pred=0)
    const FF f1 = FF(1);
    const FF f2 = FF(2);
    // Use arbitrary non-matching table columns — table_pred=0 so table_term is used only in the inverse denominator
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

    // Row 1: table row  (lookup_pred=0, table_pred=1, read_count=2)
    // t1=1, t2=2 → table_term1 = 1*beta + 2 + gamma ≠ lookup_term0
    const FF t1_row1 = FF(1);
    const FF t2_row1 = FF(2);
    // Arbitrary lookup columns — lookup_pred=0 so they only contribute to the inverse denominator
    const FF f1_row1 = FF(9);
    const FF f2_row1 = FF(10);
    const FF lookup_term_row1 = f1_row1 * beta + f2_row1 + gamma;
    const FF table_term1 = t1_row1 * beta + t2_row1 + gamma;

    AllEntities row1{};
    row1[0] = (lookup_term_row1 * table_term1).invert();
    row1[1] = FF(2); // read count
    row1[3] = FF(1); // table predicate
    row1[4] = f1_row1;
    row1[5] = f2_row1;
    row1[6] = t1_row1;
    row1[7] = t2_row1;

    // Accumulate both rows
    Accumulator acc{};

    Relation::accumulate(acc, row0, params, FF(1));
    EXPECT_EQ(acc[0], FF(0)); // subrelation 0 is satisfied by each row independently

    Relation::accumulate(acc, row1, params, FF(1));

    // Subrelation 0 must be zero for both rows (each is independently satisfied)
    // Subrelation 1 must not sum to zero across the two rows (log-derivative identity)
    EXPECT_EQ(acc[0], FF(0));
    EXPECT_EQ(acc[1], FF(1) / lookup_term0 - FF(2) / table_term1); // read_count=2 causes the mismatch
}

// ============================================================================
// Tests for SettingsCustomizedLookup
// ============================================================================

class CustomizedLookupTest : public GenericLookupRelationTest<SettingsCustomizedLookup> {};

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
 * Row 0 (lookup): f = v  →  lookup_term0 = v^2
 * Row 1 (table):  t = v^2 → table_term1  = v^2  (matches lookup_term0)
 *
 * Subrelation 2 sums to:
 *   +1/lookup_term0  -  read_count/table_term1  =  1/T - 1/T  = 0
 */
TEST_F(CustomizedLookupTest, ValidTrace)
{
    const auto params = RelationParameters<FF>::get_random();

    // Choose v such that v^2 != 0
    const FF v = FF(3);
    const FF v_sq = v * v; // = 9

    // Row 0: lookup row  (lookup_pred=1, table_pred=0)
    // lookup_term = v^2
    // table_term  = t_row0  (arbitrary, since table_pred=0)
    const FF t_row0 = FF(1);
    const FF lookup_term0 = v_sq;
    const FF table_term_row0 = t_row0;

    AllEntities row0{};
    row0[0] = (lookup_term0 * table_term_row0).invert();
    row0[2] = FF(1); // lookup predicate
    row0[4] = v;     // f column → lookup_term = v^2
    row0[5] = t_row0;

    // Row 1: table row  (lookup_pred=0, table_pred=1, read_count=1)
    // t = v^2 → table_term1 = v^2 = lookup_term0
    // f_row1 is arbitrary since lookup_pred=0
    const FF f_row1 = FF(5);
    const FF lookup_term_row1 = f_row1 * f_row1;
    const FF table_term1 = v_sq; // matches lookup_term0

    AllEntities row1{};
    row1[0] = (lookup_term_row1 * table_term1).invert();
    row1[1] = FF(1); // read count
    row1[3] = FF(1); // table predicate
    row1[4] = f_row1;
    row1[5] = v_sq; // t column → table_term = v^2

    Accumulator acc{};
    Relation::accumulate(acc, row0, params, FF(1));
    EXPECT_EQ(acc[0], FF(0)); // subrelation 0 is satisfied by each row independently
    Relation::accumulate(acc, row1, params, FF(1));

    // After two rounds of accumulation both subrelations must be satisfied
    EXPECT_EQ(acc[0], FF(0));
    EXPECT_EQ(acc[1], FF(0));
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
 * @brief Two-row trace with wrong lookup/table terms violates the log-derivative identity.
 *
 */
TEST_F(CustomizedLookupTest, InvalidLookup)
{
    const auto params = RelationParameters<FF>::get_random();

    // Choose v such that v^2 != 0
    const FF v = FF(3);
    const FF v_sq = v * v; // = 9

    // Row 0: lookup row  (lookup_pred=1, table_pred=0)
    // lookup_term = v^2
    // table_term  = t_row0  (arbitrary, since table_pred=0)
    const FF t_row0 = FF(1);
    const FF lookup_term0 = v_sq;
    const FF table_term_row0 = t_row0;

    AllEntities row0{};
    row0[0] = (lookup_term0 * table_term_row0).invert();
    row0[2] = FF(1); // lookup predicate
    row0[4] = v;     // f column → lookup_term = v^2
    row0[5] = t_row0;

    // Row 1: table row  (lookup_pred=0, table_pred=1, read_count=1)
    // t = 8 → table_term1 = 8 != lookup_term0
    // f_row1 is arbitrary since lookup_pred=0
    const FF f_row1 = FF(5);
    const FF lookup_term_row1 = f_row1 * f_row1;
    const FF table_term1 = FF(8); // Different from lookup_term0 = 9

    AllEntities row1{};
    row1[0] = (lookup_term_row1 * table_term1).invert();
    row1[1] = FF(1); // read count
    row1[3] = FF(1); // table predicate
    row1[4] = f_row1;
    row1[5] = table_term1; // t column → table_term != v^2

    Accumulator acc{};
    Relation::accumulate(acc, row0, params, FF(1));
    EXPECT_EQ(acc[0], FF(0)); // subrelation 0 is satisfied by each row independently
    Relation::accumulate(acc, row1, params, FF(1));

    // After two rounds of accumulation both subrelations must be satisfied
    EXPECT_EQ(acc[0], FF(0));
    EXPECT_EQ(acc[1], FF(1) / lookup_term0 - FF(1) / FF(8)); // read_count=1 causes the mismatch
}

/**
 * @brief Two-row trace with wrong read count violates the log-derivative identity.
 *
 */
TEST_F(CustomizedLookupTest, InvalidReadCount)
{
    const auto params = RelationParameters<FF>::get_random();

    // Choose v such that v^2 != 0
    const FF v = FF(3);
    const FF v_sq = v * v; // = 9

    // Row 0: lookup row  (lookup_pred=1, table_pred=0)
    // lookup_term = v^2
    // table_term  = t_row0  (arbitrary, since table_pred=0)
    const FF t_row0 = FF(1);
    const FF lookup_term0 = v_sq;
    const FF table_term_row0 = t_row0;

    AllEntities row0{};
    row0[0] = (lookup_term0 * table_term_row0).invert();
    row0[2] = FF(1); // lookup predicate
    row0[4] = v;     // f column → lookup_term = v^2
    row0[5] = t_row0;

    // Row 1: table row  (lookup_pred=0, table_pred=1, read_count=2)
    // t = v^2 → table_term1 = v^2 = lookup_term0
    // f_row1 is arbitrary since lookup_pred=0
    const FF f_row1 = FF(5);
    const FF lookup_term_row1 = f_row1 * f_row1;
    const FF table_term1 = v_sq; // matches lookup_term0

    AllEntities row1{};
    row1[0] = (lookup_term_row1 * table_term1).invert();
    row1[1] = FF(2); // read count
    row1[3] = FF(1); // table predicate
    row1[4] = f_row1;
    row1[5] = v_sq; // t column → table_term = v^2

    Accumulator acc{};
    Relation::accumulate(acc, row0, params, FF(1));
    EXPECT_EQ(acc[0], FF(0)); // subrelation 0 is satisfied by each row independently
    Relation::accumulate(acc, row1, params, FF(1));

    // After two rounds of accumulation both subrelations must be satisfied
    EXPECT_EQ(acc[0], FF(0));
    EXPECT_EQ(acc[1], FF(1) / lookup_term0 - FF(2) / v_sq); // read_count=2 causes the mismatch
}
