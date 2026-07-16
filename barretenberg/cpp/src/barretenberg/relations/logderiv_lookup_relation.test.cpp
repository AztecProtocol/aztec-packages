/**
 * @file logderiv_lookup_relation.test.cpp
 * @brief Tests LogDerivLookupRelation arithmetic against a direct reference implementation.
 *
 * The relation has three subrelations:
 *
 *   1   Inverse correctness:    (I·L·T − inverse_exists) · sf = 0       per-row, deg 4
 *   2   Lookup identity:        Σ_rows (q_lookup·T − read_count·L) · I  per-row deg 4, summed (no scaling)
 *   3   read_tag boolean check: (read_tag² − read_tag) · sf = 0         per-row, deg 2
 *
 * Where
 *
 *   L = (w_l + γ + q_r·w_l_shift) + β·(w_r + q_m·w_r_shift) + β²·(w_o + q_c·w_o_shift) + β³·q_o
 *   T = table_1 + γ + β·table_2 + β²·table_3 + β³·table_4
 *   inverse_exists = q_lookup + read_tag − q_lookup·read_tag  (i.e. OR when both are boolean)
 */
#include "barretenberg/relations/logderiv_lookup_relation.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/flavor/generated/ultra_flavor_generated.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include <array>
#include <gtest/gtest.h>

using namespace bb;

using FF = fr;
using Inputs = UltraFlavor_Generated::AllEntities<FF>;
using EntityId = Inputs::EntityId;
using LookupRelation = LogDerivLookupRelationImpl<FF>;

static constexpr size_t NUM_SUBRELATIONS = 3;
using SubrelationAccumulator = std::array<FF, NUM_SUBRELATIONS>;

/** Build the lookup term L on a row. */
static FF compute_L(const Inputs& in, const RelationParameters<FF>& params)
{
    const auto& beta = params.beta;
    const auto& beta_sqr = params.beta_sqr;
    const auto& beta_cube = params.beta_cube;
    const auto& gamma = params.gamma;
    const auto derived_1 = in[EntityId::w_l] + gamma + in[EntityId::q_r] * in[EntityId::w_l_shift];
    const auto derived_2 = in[EntityId::w_r] + in[EntityId::q_m] * in[EntityId::w_r_shift];
    const auto derived_3 = in[EntityId::w_o] + in[EntityId::q_c] * in[EntityId::w_o_shift];
    return derived_1 + derived_2 * beta + derived_3 * beta_sqr + in[EntityId::q_o] * beta_cube;
}

/** Build the table term T on a row. */
static FF compute_T(const Inputs& in, const RelationParameters<FF>& params)
{
    const auto& beta = params.beta;
    const auto& beta_sqr = params.beta_sqr;
    const auto& beta_cube = params.beta_cube;
    const auto& gamma = params.gamma;
    return in[EntityId::table_1] + gamma + in[EntityId::table_2] * beta + in[EntityId::table_3] * beta_sqr +
           in[EntityId::table_4] * beta_cube;
}

/** inverse_exists = q_lookup + read_tag − q_lookup·read_tag (degree 2; equals OR when both boolean). */
static FF compute_inverse_exists(const Inputs& in)
{
    const FF q_lookup = in[EntityId::q_lookup];
    const FF read_tag = in[EntityId::lookup_read_tags];
    return q_lookup + read_tag - q_lookup * read_tag;
}

/** Reference implementation: compute the three subrelation contributions at a row. */
static SubrelationAccumulator compute_expected_values(const Inputs& in,
                                                      const RelationParameters<FF>& params,
                                                      const FF& scaling_factor)
{
    const FF L = compute_L(in, params);
    const FF T = compute_T(in, params);
    const FF I = in[EntityId::lookup_inverses];
    const FF q_lookup = in[EntityId::q_lookup];
    const FF read_counts = in[EntityId::lookup_read_counts];
    const FF read_tag = in[EntityId::lookup_read_tags];
    const FF inverse_exists = compute_inverse_exists(in);
    return {
        (L * T * I - inverse_exists) * scaling_factor,    // (1) inverse correctness
        (q_lookup * T - read_counts * L) * I,             // (2) lookup identity (no scaling)
        (read_tag * read_tag - read_tag) * scaling_factor // (3) read_tag boolean check
    };
}

/** Accumulate one row into a fresh accumulator. */
static SubrelationAccumulator eval_row(const Inputs& in,
                                       const RelationParameters<FF>& params,
                                       const FF& scaling_factor = FF(1))
{
    SubrelationAccumulator acc{};
    LookupRelation::accumulate(acc, in, params, scaling_factor);
    return acc;
}

/**
 * @brief Build a valid lookup-gate row: q_lookup=1, w-values match a table entry; inverse computed
 * from the resulting L and T. read_tag is set to 1 so inverse_exists = 1 (the inverse-correctness
 * subrelation becomes I·L·T − 1 = 0).
 */
static Inputs make_valid_lookup_row(const RelationParameters<FF>& params,
                                    FF entry_1 = FF(1),
                                    FF entry_2 = FF(2),
                                    FF entry_3 = FF(3),
                                    FF table_idx = FF(1))
{
    Inputs in{};
    in[EntityId::q_lookup] = FF(1);
    // Trivial step sizes so derived_table_entry_i == w_i.
    in[EntityId::q_r] = FF(0);
    in[EntityId::q_m] = FF(0);
    in[EntityId::q_c] = FF(0);
    in[EntityId::w_l] = entry_1;
    in[EntityId::w_r] = entry_2;
    in[EntityId::w_o] = entry_3;
    in[EntityId::q_o] = table_idx;
    // Matching table side.
    in[EntityId::table_1] = entry_1;
    in[EntityId::table_2] = entry_2;
    in[EntityId::table_3] = entry_3;
    in[EntityId::table_4] = table_idx;
    in[EntityId::lookup_read_counts] = FF(1);
    in[EntityId::lookup_read_tags] = FF(1); // table-side: this row has been read
    const FF L = compute_L(in, params);
    const FF T = compute_T(in, params);
    in[EntityId::lookup_inverses] = (L * T).invert();
    return in;
}

/** Random row with every relation input populated. */
static Inputs make_random_row()
{
    Inputs in{};
    for (auto id : { EntityId::w_l,
                     EntityId::w_r,
                     EntityId::w_o,
                     EntityId::w_l_shift,
                     EntityId::w_r_shift,
                     EntityId::w_o_shift,
                     EntityId::q_lookup,
                     EntityId::q_o,
                     EntityId::q_r,
                     EntityId::q_m,
                     EntityId::q_c,
                     EntityId::table_1,
                     EntityId::table_2,
                     EntityId::table_3,
                     EntityId::table_4,
                     EntityId::lookup_inverses,
                     EntityId::lookup_read_counts,
                     EntityId::lookup_read_tags }) {
        in[id] = FF::random_element();
    }
    return in;
}

class LogDerivLookupRelationConsistency : public testing::Test {};

/** Reference matches `accumulate` on both random and structured inputs, with two scaling factors. */
TEST_F(LogDerivLookupRelationConsistency, RandomInputsMatchReference)
{
    const auto params = RelationParameters<FF>::get_random();
    for (FF scaling_factor : { FF(1), FF::random_element() }) {
        for (auto in : { make_random_row(), make_valid_lookup_row(params) }) {
            SubrelationAccumulator actual{};
            LookupRelation::accumulate(actual, in, params, scaling_factor);
            EXPECT_EQ(actual, compute_expected_values(in, params, scaling_factor));
        }
    }
}

/** All-zero row: every subrelation vanishes (inverse_exists = 0, I = 0, read_tag = 0). */
TEST_F(LogDerivLookupRelationConsistency, InactiveRow)
{
    const auto params = RelationParameters<FF>::get_random();
    Inputs in{};
    const auto acc = eval_row(in, params);
    for (size_t i = 0; i < NUM_SUBRELATIONS; ++i) {
        EXPECT_EQ(acc[i], FF(0)) << "Subrelation " << i << " should be zero on inactive row";
    }
}

/** Valid lookup-gate row (q_lookup=1, read_tag=1, correct I). All three subrelations vanish. */
TEST_F(LogDerivLookupRelationConsistency, ValidLookupRow)
{
    const auto params = RelationParameters<FF>::get_random();
    auto in = make_valid_lookup_row(params, /*entry_1=*/FF(7), /*entry_2=*/FF(11), /*entry_3=*/FF(13));
    const auto acc = eval_row(in, params);
    EXPECT_EQ(acc[0], FF(0)); // inverse correctness: I·L·T − 1 = 0
    EXPECT_EQ(acc[1], FF(0)); // lookup identity: (T − L)·I = 0 since L == T at this row
    EXPECT_EQ(acc[2], FF(0)); // boolean check: read_tag = 1 satisfies 1² − 1 = 0
}

/** Pure write row (q_lookup=0, read_tag=1, read_count != 0, correct I).
 *  Inverse correctness still fires via read_tag → inverse_exists = 1; lookup identity is non-zero
 *  per-row (cancels at the trace level against a matching read). */
TEST_F(LogDerivLookupRelationConsistency, ValidWriteRow)
{
    const auto params = RelationParameters<FF>::get_random();
    Inputs in{};
    in[EntityId::table_1] = FF(7);
    in[EntityId::table_2] = FF(11);
    in[EntityId::table_3] = FF(13);
    in[EntityId::table_4] = FF(1);
    in[EntityId::lookup_read_counts] = FF(3);
    in[EntityId::lookup_read_tags] = FF(1);
    const FF L = compute_L(in, params);
    const FF T = compute_T(in, params);
    in[EntityId::lookup_inverses] = (L * T).invert();
    const auto acc = eval_row(in, params);
    EXPECT_EQ(acc[0], FF(0)); // inverse correctness: I·L·T − 1 = 0 (inverse_exists = read_tag = 1)
    EXPECT_EQ(acc[1], (FF(0) * T - FF(3) * L) * in[EntityId::lookup_inverses]);
    EXPECT_NE(acc[1], FF(0));
    EXPECT_EQ(acc[2], FF(0)); // boolean check
}

/** Two-row trace: read row + matching write row with read_count=1 → lookup identity sum vanishes. */
TEST_F(LogDerivLookupRelationConsistency, ValidTraceSumsToZero)
{
    const auto params = RelationParameters<FF>::get_random();

    // Row A: lookup gate reading (7, 11, 13) from table index 1. No table data lives here.
    auto row_a = make_valid_lookup_row(params, FF(7), FF(11), FF(13), FF(1));
    row_a[EntityId::table_1] = FF(0);
    row_a[EntityId::table_2] = FF(0);
    row_a[EntityId::table_3] = FF(0);
    row_a[EntityId::table_4] = FF(0);
    row_a[EntityId::lookup_read_counts] = FF(0);
    row_a[EntityId::lookup_read_tags] = FF(0); // read row, not a table row — inverse_exists = q_lookup = 1
    {
        const FF L = compute_L(row_a, params);
        const FF T = compute_T(row_a, params);
        row_a[EntityId::lookup_inverses] = (L * T).invert();
    }

    // Row B: the table entry, with read_count = 1, no lookup gate.
    Inputs row_b{};
    row_b[EntityId::table_1] = FF(7);
    row_b[EntityId::table_2] = FF(11);
    row_b[EntityId::table_3] = FF(13);
    row_b[EntityId::table_4] = FF(1);
    row_b[EntityId::lookup_read_counts] = FF(1);
    row_b[EntityId::lookup_read_tags] = FF(1);
    const FF L_b = compute_L(row_b, params);
    const FF T_b = compute_T(row_b, params);
    row_b[EntityId::lookup_inverses] = (L_b * T_b).invert();

    SubrelationAccumulator acc{};
    LookupRelation::accumulate(acc, row_a, params, FF(1));
    LookupRelation::accumulate(acc, row_b, params, FF(1));
    EXPECT_EQ(acc[0], FF(0)); // inverse correctness on both rows
    EXPECT_EQ(acc[1], FF(0)); // (1/L_a) − (1/T_b), and L_a == T_b → cancels
    EXPECT_EQ(acc[2], FF(0));
}

/** A wrong inverse on an active row fires subrelation (1). */
TEST_F(LogDerivLookupRelationConsistency, WrongInverseFires)
{
    const auto params = RelationParameters<FF>::get_random();
    auto in = make_valid_lookup_row(params);
    in[EntityId::lookup_inverses] = FF(42); // deliberately wrong

    const FF L = compute_L(in, params);
    const FF T = compute_T(in, params);
    const FF inverse_exists = compute_inverse_exists(in); // = 1 since q_lookup = read_tag = 1
    const auto acc = eval_row(in, params);
    EXPECT_EQ(acc[0], (L * T * FF(42) - inverse_exists) * FF(1));
    EXPECT_NE(acc[0], FF(0));
}

/** On inactive rows (q_lookup = read_tag = 0) the inverse subrelation reduces to L·T·I (since
 *  inverse_exists = 0). This forces the prover to set I = 0 on those rows — otherwise the inverse
 *  subrelation fires.
 */
TEST_F(LogDerivLookupRelationConsistency, InverseMustBeZeroOnInactiveRows)
{
    const auto params = RelationParameters<FF>::get_random();
    Inputs in{};
    in[EntityId::w_l] = FF(7);
    in[EntityId::w_r] = FF(11);
    in[EntityId::w_o] = FF(13);
    in[EntityId::table_1] = FF(17);
    in[EntityId::table_2] = FF(19);
    in[EntityId::table_3] = FF(23);
    in[EntityId::table_4] = FF(29);
    // q_lookup = read_tag = read_counts = 0 by default → inverse_exists = 0.

    // With I = 0 the inactive row satisfies all three subrelations.
    in[EntityId::lookup_inverses] = FF(0);
    {
        const auto acc = eval_row(in, params);
        for (size_t i = 0; i < NUM_SUBRELATIONS; ++i) {
            EXPECT_EQ(acc[i], FF(0)) << "Subrelation " << i << " should vanish on inactive row when I = 0";
        }
    }

    // With I ≠ 0 the inverse subrelation fires: L·T·I − 0 = L·T·I ≠ 0.
    in[EntityId::lookup_inverses] = FF(123);
    {
        const FF L = compute_L(in, params);
        const FF T = compute_T(in, params);
        const auto acc = eval_row(in, params);
        EXPECT_EQ(acc[0], L * T * FF(123));
        EXPECT_NE(acc[0], FF(0));
    }
}

/** Read-count mismatch (extra read claimed on a table row) leaves per-row inverse correctness
 *  satisfied but breaks the trace-level lookup identity. */
TEST_F(LogDerivLookupRelationConsistency, WrongReadCount)
{
    const auto params = RelationParameters<FF>::get_random();

    // Read row: one lookup of (7, 11, 13).
    auto row_a = make_valid_lookup_row(params, FF(7), FF(11), FF(13), FF(1));
    row_a[EntityId::table_1] = FF(0);
    row_a[EntityId::table_2] = FF(0);
    row_a[EntityId::table_3] = FF(0);
    row_a[EntityId::table_4] = FF(0);
    row_a[EntityId::lookup_read_counts] = FF(0);
    row_a[EntityId::lookup_read_tags] = FF(0);
    {
        const FF L = compute_L(row_a, params);
        const FF T = compute_T(row_a, params);
        row_a[EntityId::lookup_inverses] = (L * T).invert();
    }

    // Write row: table entry; lie about read_count.
    Inputs row_b{};
    row_b[EntityId::table_1] = FF(7);
    row_b[EntityId::table_2] = FF(11);
    row_b[EntityId::table_3] = FF(13);
    row_b[EntityId::table_4] = FF(1);
    row_b[EntityId::lookup_read_counts] = FF(2); // truth would be 1
    row_b[EntityId::lookup_read_tags] = FF(1);
    const FF L_b = compute_L(row_b, params);
    const FF T_b = compute_T(row_b, params);
    row_b[EntityId::lookup_inverses] = (L_b * T_b).invert();

    SubrelationAccumulator acc{};
    LookupRelation::accumulate(acc, row_a, params, FF(1));
    LookupRelation::accumulate(acc, row_b, params, FF(1));
    EXPECT_EQ(acc[0], FF(0));
    EXPECT_NE(acc[1], FF(0)); // 1/L_a − 2/T_b ≠ 0
    EXPECT_EQ(acc[2], FF(0));
}

/** Non-boolean read_tag fires subrelation (3). */
TEST_F(LogDerivLookupRelationConsistency, NonBooleanReadTagFiresBooleanCheck)
{
    const auto params = RelationParameters<FF>::get_random();
    Inputs in{};
    in[EntityId::lookup_read_tags] = FF(5); // not in {0, 1}
    const auto acc = eval_row(in, params);
    EXPECT_EQ(acc[2], FF(5) * FF(5) - FF(5));
    EXPECT_NE(acc[2], FF(0));
}

/** skip() returns true iff the row is neither a read gate nor has a non-zero read count. */
TEST_F(LogDerivLookupRelationConsistency, SkipBehavior)
{
    Inputs in{};
    EXPECT_TRUE(LookupRelation::skip(in));

    in[EntityId::q_lookup] = FF(1);
    EXPECT_FALSE(LookupRelation::skip(in));

    in[EntityId::q_lookup] = FF(0);
    in[EntityId::lookup_read_counts] = FF(3);
    EXPECT_FALSE(LookupRelation::skip(in));
}

/** Regression test for exploit that used a lookup term with no dependence on beta. If such a term existed, then a
 * malicious prover could plant a forged row balancing the lookup with table entries not in the table. Check that lookup
 * row with table index != 0 picks up a beta^3 term. This makes it impossible to exploit a lookup term that has no
 * dependence on beta because table_index > 0 in the codebase. */
TEST_F(LogDerivLookupRelationConsistency, ZeroTableIndex)
{
    const auto params = RelationParameters<FF>::get_random();

    // Construct a pure lookup row
    auto lookup_row = make_valid_lookup_row(params, FF(0), FF(0), FF(0), FF(1));
    lookup_row[EntityId::lookup_read_counts] = FF(0);
    lookup_row[EntityId::lookup_read_tags] = FF(0);
    const FF L = compute_L(lookup_row, params);
    const FF T = compute_T(lookup_row, params);
    lookup_row[EntityId::lookup_inverses] = (L * T).invert();

    const auto acc = eval_row(lookup_row, params);
    EXPECT_EQ(acc[0], 0);
    EXPECT_EQ(acc[1], (params.gamma + params.beta_cube).invert()); // since L = gamma + beta^3 and T = gamma + beta^3
    EXPECT_EQ(acc[2], 0);
}
