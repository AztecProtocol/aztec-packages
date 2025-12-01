#include "sumcheck_round.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/tuple.hpp"
#include "barretenberg/flavor/multilinear_batching_flavor.hpp"
#include "barretenberg/flavor/sumcheck_test_flavor.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/relations/utils.hpp"

#include <gtest/gtest.h>

using namespace bb;

/**
 * @brief Test SumcheckRound functions for operations on tuples (and tuples of tuples) of Univariates
 *
 */
TEST(SumcheckRound, SumcheckTupleOfTuplesOfUnivariates)
{
    using Flavor = SumcheckTestFlavor;
    using FF = typename Flavor::FF;
    using Utils = RelationUtils<Flavor>;
    using SubrelationSeparators = typename Utils::SubrelationSeparators;

    // Define three linear univariates of different sizes
    // SumcheckTestFlavor has: ArithmeticRelation (2 subrelations) + DependentTestRelation (1 subrelation)
    Univariate<FF, 3> univariate_1({ 1, 2, 3 });       // ArithmeticRelation subrelation 0
    Univariate<FF, 5> univariate_2({ 3, 4, 5, 6, 7 }); // ArithmeticRelation subrelation 1
    Univariate<FF, 2> univariate_3({ 2, 4 });          // DependentTestRelation subrelation 0
    const size_t MAX_LENGTH = 5;

    // Construct a tuple of tuples matching SumcheckTestFlavor's relation structure:
    // {{subrelation_0, subrelation_1}, {subrelation_0}}
    auto tuple_of_tuples = flat_tuple::make_tuple(flat_tuple::make_tuple(univariate_1, univariate_2),
                                                  flat_tuple::make_tuple(univariate_3));

    // Use scale_univariate_accumulators to scale by challenge powers
    // SumcheckTestFlavor has 3 subrelations total, so we need 2 separators
    SubrelationSeparators challenge{};
    challenge[0] = 5;  // Separator between arithmetic subrelations
    challenge[1] = 25; // Separator before dependent test relation
    Utils::scale_univariates(tuple_of_tuples, challenge);

    // Use extend_and_batch_univariates to extend to MAX_LENGTH then accumulate
    GateSeparatorPolynomial<FF> gate_separators({ 1 });
    auto result = Univariate<FF, MAX_LENGTH>();
    SumcheckProverRound<Flavor>::extend_and_batch_univariates(tuple_of_tuples, result, gate_separators);

    // Repeat the batching process manually
    auto result_expected = univariate_1.template extend_to<MAX_LENGTH>() +
                           univariate_2.template extend_to<MAX_LENGTH>() * challenge[0] +
                           univariate_3.template extend_to<MAX_LENGTH>() * challenge[1];

    // Compare final batched univariates
    EXPECT_EQ(result, result_expected);

    // Reinitialize univariate accumulators to zero
    RelationUtils<Flavor>::zero_univariates(tuple_of_tuples);

    // Check that reinitialization was successful
    Univariate<FF, 3> expected_1({ 0, 0, 0 });                        // Arithmetic subrelation 0
    Univariate<FF, 5> expected_2({ 0, 0, 0, 0, 0 });                  // Arithmetic subrelation 1
    Univariate<FF, 2> expected_3({ 0, 0 });                           // DependentTest subrelation 0
    EXPECT_EQ(std::get<0>(std::get<0>(tuple_of_tuples)), expected_1); // Arithmetic subrelation 0
    EXPECT_EQ(std::get<1>(std::get<0>(tuple_of_tuples)), expected_2); // Arithmetic subrelation 1
    EXPECT_EQ(std::get<0>(std::get<1>(tuple_of_tuples)), expected_3); // DependentTest subrelation 0
}

/**
 * @brief Test utility functions for applying operations to tuple of std::arrays of field elements
 *
 */
TEST(SumcheckRound, TuplesOfEvaluationArrays)
{
    using Flavor = SumcheckTestFlavor;
    using Utils = RelationUtils<Flavor>;
    using FF = typename Flavor::FF;
    using SubrelationSeparators = typename Utils::SubrelationSeparators;

    // SumcheckTestFlavor has 3 subrelations: ArithmeticRelation(2) + DependentTestRelation(1)
    // So we need arrays matching this structure
    std::array<FF, 2> evaluations_arithmetic = { 4, 3 }; // ArithmeticRelation's 2 subrelations
    std::array<FF, 1> evaluations_dependent = { 6 };     // DependentTestRelation's 1 subrelation

    // Construct a tuple matching the relation structure
    auto tuple_of_arrays = flat_tuple::make_tuple(evaluations_arithmetic, evaluations_dependent);

    // Use scale_and_batch_elements to scale by challenge powers
    // SumcheckTestFlavor has 3 subrelations, so SubrelationSeparators has 2 elements
    SubrelationSeparators challenge{ 5, 25 };

    FF result = Utils::scale_and_batch_elements(tuple_of_arrays, challenge);

    // Repeat the batching process manually: first element not scaled, rest scaled by separators
    auto result_expected = evaluations_arithmetic[0] +                // no scaling
                           evaluations_arithmetic[1] * challenge[0] + // separator[0]
                           evaluations_dependent[0] * challenge[1];   // separator[1]

    // Compare batched result
    EXPECT_EQ(result, result_expected);

    // Reinitialize elements to zero
    Utils::zero_elements(tuple_of_arrays);

    // Verify all elements were zeroed
    EXPECT_EQ(std::get<0>(tuple_of_arrays)[0], 0); // ArithmeticRelation subrelation 0
    EXPECT_EQ(std::get<0>(tuple_of_arrays)[1], 0); // ArithmeticRelation subrelation 1
    EXPECT_EQ(std::get<1>(tuple_of_arrays)[0], 0); // DependentTestRelation subrelation 0
}

/**
 * @brief Test utility functions for adding two tuples of tuples of Univariates
 *
 */
TEST(SumcheckRound, AddTuplesOfTuplesOfUnivariates)
{
    using Flavor = SumcheckTestFlavor;
    using FF = typename Flavor::FF;

    // Define some arbitrary univariates
    Univariate<FF, 2> univariate_1({ 1, 2 });
    Univariate<FF, 2> univariate_2({ 2, 4 });
    Univariate<FF, 3> univariate_3({ 3, 4, 5 });

    Univariate<FF, 2> univariate_4({ 3, 6 });
    Univariate<FF, 2> univariate_5({ 8, 1 });
    Univariate<FF, 3> univariate_6({ 3, 7, 1 });

    Univariate<FF, 2> expected_sum_1 = univariate_1 + univariate_4;
    Univariate<FF, 2> expected_sum_2 = univariate_2 + univariate_5;
    Univariate<FF, 3> expected_sum_3 = univariate_3 + univariate_6;

    // Construct two tuples of tuples of univariates
    auto tuple_of_tuples_1 = flat_tuple::make_tuple(flat_tuple::make_tuple(univariate_1),
                                                    flat_tuple::make_tuple(univariate_2, univariate_3));
    auto tuple_of_tuples_2 = flat_tuple::make_tuple(flat_tuple::make_tuple(univariate_4),
                                                    flat_tuple::make_tuple(univariate_5, univariate_6));

    RelationUtils<Flavor>::add_nested_tuples(tuple_of_tuples_1, tuple_of_tuples_2);

    EXPECT_EQ(std::get<0>(std::get<0>(tuple_of_tuples_1)), expected_sum_1);
    EXPECT_EQ(std::get<0>(std::get<1>(tuple_of_tuples_1)), expected_sum_2);
    EXPECT_EQ(std::get<1>(std::get<1>(tuple_of_tuples_1)), expected_sum_3);
}

/**
 * @brief Test compute_effective_round_size optimization for non-ZK flavors
 * @details This function optimizes sumcheck iteration by only processing up to the active witness region,
 * avoiding iteration over trailing zeros when HasZK is false.
 */
TEST(SumcheckRound, ComputeEffectiveRoundSize)
{
    using Flavor = SumcheckTestFlavor; // Non-ZK flavor
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;

    // Test Case 1: All witness polynomials have full size
    {
        const size_t full_size = 32;
        const size_t round_size = full_size;
        SumcheckProverRound<Flavor> round(round_size);

        // Create full-sized polynomials (all entities at full size)
        std::vector<bb::Polynomial<FF>> random_polynomials(Flavor::NUM_ALL_ENTITIES);
        for (auto& poly : random_polynomials) {
            poly = bb::Polynomial<FF>(full_size);
        }

        ProverPolynomials prover_polynomials;
        for (auto [prover_poly, random_poly] : zip_view(prover_polynomials.get_all(), random_polynomials)) {
            prover_poly = random_poly.share();
        }

        size_t effective_size = round.compute_effective_round_size(prover_polynomials);
        EXPECT_EQ(effective_size, round_size);
    }

    // Test Case 2: Witness polynomials have reduced active range
    {
        const size_t full_size = 64;
        const size_t active_size = 20; // Active witness data ends at index 20
        const size_t round_size = full_size;
        SumcheckProverRound<Flavor> round(round_size);

        // Note: AllEntities ordering is: PrecomputedEntities, WitnessEntities, ShiftedEntities
        // For SumcheckTestFlavor: Precomputed (0-7), Witness (8-13), Shifted (14-15)
        std::vector<bb::Polynomial<FF>> random_polynomials(Flavor::NUM_ALL_ENTITIES);
        size_t poly_idx = 0;
        for (auto& poly : random_polynomials) {
            // Witness entities: use shiftable to simulate reduced active range
            if (poly_idx >= Flavor::NUM_PRECOMPUTED_ENTITIES &&
                poly_idx < Flavor::NUM_PRECOMPUTED_ENTITIES + Flavor::NUM_WITNESS_ENTITIES) {
                poly = bb::Polynomial<FF>::shiftable(active_size, full_size);
            } else {
                // Precomputed and shifted entities at full size
                poly = bb::Polynomial<FF>(full_size);
            }
            poly_idx++;
        }

        ProverPolynomials prover_polynomials;
        for (auto [prover_poly, random_poly] : zip_view(prover_polynomials.get_all(), random_polynomials)) {
            prover_poly = random_poly.share();
        }

        size_t effective_size = round.compute_effective_round_size(prover_polynomials);
        // Should be rounded up to next even number: 20 is even, so stays 20
        EXPECT_EQ(effective_size, active_size);
        EXPECT_LE(effective_size, round_size);
    }

    // Test Case 3: Odd active size should be rounded up to even
    {
        const size_t full_size = 64;
        const size_t active_size = 23;             // Odd number
        const size_t expected_effective_size = 24; // Rounded up to even
        const size_t round_size = full_size;
        SumcheckProverRound<Flavor> round(round_size);

        std::vector<bb::Polynomial<FF>> random_polynomials(Flavor::NUM_ALL_ENTITIES);
        size_t poly_idx = 0;
        for (auto& poly : random_polynomials) {
            if (poly_idx >= Flavor::NUM_PRECOMPUTED_ENTITIES &&
                poly_idx < Flavor::NUM_PRECOMPUTED_ENTITIES + Flavor::NUM_WITNESS_ENTITIES) {
                poly = bb::Polynomial<FF>::shiftable(active_size, full_size);
            } else {
                poly = bb::Polynomial<FF>(full_size);
            }
            poly_idx++;
        }

        ProverPolynomials prover_polynomials;
        for (auto [prover_poly, random_poly] : zip_view(prover_polynomials.get_all(), random_polynomials)) {
            prover_poly = random_poly.share();
        }

        size_t effective_size = round.compute_effective_round_size(prover_polynomials);
        EXPECT_EQ(effective_size, expected_effective_size);
    }

    // Test Case 4: Different witness polynomials have different active sizes
    // (should use the maximum)
    {
        const size_t full_size = 64;
        const size_t round_size = full_size;
        SumcheckProverRound<Flavor> round(round_size);

        std::vector<bb::Polynomial<FF>> random_polynomials(Flavor::NUM_ALL_ENTITIES);
        size_t poly_idx = 0;
        size_t witness_idx = 0;
        for (auto& poly : random_polynomials) {
            if (poly_idx >= Flavor::NUM_PRECOMPUTED_ENTITIES &&
                poly_idx < Flavor::NUM_PRECOMPUTED_ENTITIES + Flavor::NUM_WITNESS_ENTITIES) {
                // Set different sizes for different witness polynomials
                if (witness_idx == 0) {
                    poly = bb::Polynomial<FF>::shiftable(10, full_size);
                } else if (witness_idx == 1) {
                    poly = bb::Polynomial<FF>::shiftable(30, full_size); // This is the maximum
                } else if (witness_idx == 2) {
                    poly = bb::Polynomial<FF>::shiftable(15, full_size);
                } else {
                    poly = bb::Polynomial<FF>::shiftable(20, full_size);
                }
                witness_idx++;
            } else {
                poly = bb::Polynomial<FF>(full_size);
            }
            poly_idx++;
        }

        ProverPolynomials prover_polynomials;
        for (auto [prover_poly, random_poly] : zip_view(prover_polynomials.get_all(), random_polynomials)) {
            prover_poly = random_poly.share();
        }

        size_t effective_size = round.compute_effective_round_size(prover_polynomials);
        // Should use maximum witness size (30), which is already even
        EXPECT_EQ(effective_size, 30);
    }

    // Test Case 5: Very small active size
    {
        const size_t full_size = 128;
        const size_t active_size = 2;
        const size_t round_size = full_size;
        SumcheckProverRound<Flavor> round(round_size);

        std::vector<bb::Polynomial<FF>> random_polynomials(Flavor::NUM_ALL_ENTITIES);
        size_t poly_idx = 0;
        for (auto& poly : random_polynomials) {
            if (poly_idx >= Flavor::NUM_PRECOMPUTED_ENTITIES &&
                poly_idx < Flavor::NUM_PRECOMPUTED_ENTITIES + Flavor::NUM_WITNESS_ENTITIES) {
                poly = bb::Polynomial<FF>::shiftable(active_size, full_size);
            } else {
                poly = bb::Polynomial<FF>(full_size);
            }
            poly_idx++;
        }

        ProverPolynomials prover_polynomials;
        for (auto [prover_poly, random_poly] : zip_view(prover_polynomials.get_all(), random_polynomials)) {
            prover_poly = random_poly.share();
        }

        size_t effective_size = round.compute_effective_round_size(prover_polynomials);
        EXPECT_EQ(effective_size, active_size);
        EXPECT_GE(effective_size, 2); // Minimum reasonable size
    }
}

/**
 * @brief Test that compute_effective_round_size returns full size for ZK flavors
 * @details For ZK flavors, we must always iterate over the full round_size including masked rows
 */
TEST(SumcheckRound, ComputeEffectiveRoundSizeZK)
{
    using Flavor = SumcheckTestFlavorZK; // ZK flavor
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;

    const size_t full_size = 64;
    const size_t round_size = full_size;
    SumcheckProverRound<Flavor> round(round_size);

    // Create polynomials - ZK flavor always uses full size
    std::vector<bb::Polynomial<FF>> random_polynomials(Flavor::NUM_ALL_ENTITIES);
    for (auto& poly : random_polynomials) {
        // For ZK flavor, all polynomials (including witnesses) are allocated at full size
        poly = bb::Polynomial<FF>(full_size);
    }

    ProverPolynomials prover_polynomials;
    for (auto [prover_poly, random_poly] : zip_view(prover_polynomials.get_all(), random_polynomials)) {
        prover_poly = random_poly.share();
    }

    size_t effective_size = round.compute_effective_round_size(prover_polynomials);
    // For ZK flavors, should always return full round_size regardless of witness sizes
    EXPECT_EQ(effective_size, round_size);
}

/**
 * @brief Test that extend_edges works correctly in the cases we're using ShortMonomials
 * @details Verifies that the barycentric extension preserves the univariate property:
 * the extended univariate should be a degree-1 polynomial that passes through the two given points.
 */
TEST(SumcheckRound, ExtendEdgesShortMonomial)
{
    using Flavor = SumcheckTestFlavor;
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using SumcheckRound = SumcheckProverRound<Flavor>;
    using ExtendedEdges = typename SumcheckRound::ExtendedEdges;

    const size_t multivariate_d = 3; // 8 rows
    const size_t multivariate_n = 1 << multivariate_d;
    const size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;

    // Create test polynomials where poly[i] = i (simple linear values)
    std::vector<bb::Polynomial<FF>> test_polynomials(NUM_POLYNOMIALS);
    for (auto& poly : test_polynomials) {
        poly = bb::Polynomial<FF>(multivariate_n);
        for (size_t i = 0; i < multivariate_n; ++i) {
            poly.at(i) = FF(i);
        }
    }

    ProverPolynomials prover_polynomials;
    for (auto [prover_poly, test_poly] : zip_view(prover_polynomials.get_all(), test_polynomials)) {
        prover_poly = test_poly.share();
    }

    SumcheckRound round(multivariate_n);

    // Test that edge extension creates a linear univariate
    // For poly[i] = i, edge at index 2 gives us points (2, 3)
    // The univariate U(X) = 2 + X should satisfy U(0) = 2, U(1) = 3
    {
        const size_t edge_idx = 2;
        ExtendedEdges extended_edges;

        round.extend_edges(extended_edges, prover_polynomials, edge_idx);

        // Check the first polynomial (all have the same pattern)
        auto& first_edge = extended_edges.get_all()[0];

        // Verify the linear interpolation: U(X) = 2 + X
        FF val_at_0 = first_edge.value_at(0); // Should be 2
        FF val_at_1 = first_edge.value_at(1); // Should be 3

        EXPECT_EQ(val_at_0, FF(2)) << "Extended univariate should evaluate to 2 at X=0";
        EXPECT_EQ(val_at_1, FF(3)) << "Extended univariate should evaluate to 3 at X=1";

        // UltraFlavor uses USE_SHORT_MONOMIALS=true, so extended edge is just length 2
        EXPECT_EQ(first_edge.evaluations.size(), 2) << "UltraFlavor uses short monomials (length 2)";

        info("Extended edges create correct degree-1 univariates for USE_SHORT_MONOMIALS flavors");
    }
}

/**
 * @brief Test extend_edges with full barycentric extension (non-short-monomial flavor)
 * @details Uses MultilinearBatchingFlavor which has USE_SHORT_MONOMIALS=false to test that
 * the barycentric extension to MAX_PARTIAL_RELATION_LENGTH works correctly.
 */
TEST(SumcheckRound, ExtendEdges)
{
    // Use a flavor without ShortMonomials
    using Flavor = SumcheckTestFlavorFullBary;
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using SumcheckRound = SumcheckProverRound<Flavor>;
    using ExtendedEdges = typename SumcheckRound::ExtendedEdges;

    const size_t multivariate_d = 3; // 8 rows
    const size_t multivariate_n = 1 << multivariate_d;
    const size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;

    // Create test polynomials where poly[i] = i (simple linear values)
    std::vector<bb::Polynomial<FF>> test_polynomials(NUM_POLYNOMIALS);
    for (auto& poly : test_polynomials) {
        poly = bb::Polynomial<FF>(multivariate_n);
        for (size_t i = 0; i < multivariate_n; ++i) {
            poly.at(i) = FF(i);
        }
    }

    ProverPolynomials prover_polynomials;
    for (auto [prover_poly, test_poly] : zip_view(prover_polynomials.get_all(), test_polynomials)) {
        prover_poly = test_poly.share();
    }

    SumcheckRound round(multivariate_n);

    // Test that edge extension creates a full barycentric extension
    // For poly[i] = i, edge at index 2 gives us points (2, 3)
    // The univariate U(X) = 2 + X should extend to MAX_PARTIAL_RELATION_LENGTH
    {
        const size_t edge_idx = 2;
        ExtendedEdges extended_edges;

        round.extend_edges(extended_edges, prover_polynomials, edge_idx);

        // Check the first polynomial (all have the same pattern)
        auto& first_edge = extended_edges.get_all()[0];

        // Verify the linear interpolation at base points: U(X) = 2 + X
        EXPECT_EQ(first_edge.value_at(0), FF(2)) << "U(0) should be 2";
        EXPECT_EQ(first_edge.value_at(1), FF(3)) << "U(1) should be 3";

        // Verify full extension to MAX_PARTIAL_RELATION_LENGTH
        EXPECT_EQ(first_edge.evaluations.size(), Flavor::MAX_PARTIAL_RELATION_LENGTH)
            << "Non-short-monomial flavor should extend to MAX_PARTIAL_RELATION_LENGTH";

        // Verify the barycentric extension preserves the linear form at all extended points
        // The univariate U(X) = 2 + X should give us U(2) = 4, U(3) = 5, U(4) = 6, etc.
        for (size_t x = 2; x < std::min(static_cast<size_t>(7), first_edge.evaluations.size()); ++x) {
            FF expected = FF(2 + x);
            EXPECT_EQ(first_edge.value_at(x), expected)
                << "Extended univariate U(X) = 2 + X should evaluate to " << (2 + x) << " at X=" << x
                << " (barycentric extension should preserve linear form)";
        }

        info("Extended edges correctly perform full barycentric extension to MAX_PARTIAL_RELATION_LENGTH=",
             Flavor::MAX_PARTIAL_RELATION_LENGTH);
    }
}

/**
 * @brief Test accumulate_relation_univariates for SumcheckTestFlavor
 * @details Tests that:
 * 1. Arithmetic relation contributions are correctly accumulated
 * 2. Scaling factors are properly applied
 * 3. Multiple calls correctly accumulate (add) contributions
 */
TEST(SumcheckRound, AccumulateRelationUnivariatesSumcheckTestFlavor)
{
    using Flavor = SumcheckTestFlavor;
    using FF = typename Flavor::FF;
    using ProverPolynomials = typename Flavor::ProverPolynomials;
    using SumcheckRound = SumcheckProverRound<Flavor>;

    const size_t multivariate_d = 2; // log2(circuit_size) = 2 → 4 rows
    const size_t multivariate_n = 1 << multivariate_d;

    // Test 1: Arithmetic relation with simple values
    // Simple circuit: w_l + w_r = w_o (using q_l=1, q_r=1, q_o=-1)
    {
        info("Test 1: Arithmetic relation accumulation");

        // Create polynomial arrays
        std::array<FF, multivariate_n> w_l = { FF(1), FF(2), FF(3), FF(4) };
        std::array<FF, multivariate_n> w_r = { FF(5), FF(6), FF(7), FF(8) };
        std::array<FF, multivariate_n> w_o = { FF(6), FF(8), FF(10), FF(12) }; // w_l + w_r
        std::array<FF, multivariate_n> w_4 = { FF(0), FF(0), FF(0), FF(0) };
        std::array<FF, multivariate_n> q_m = { FF(0), FF(0), FF(0), FF(0) };
        std::array<FF, multivariate_n> q_l = { FF(1), FF(1), FF(1), FF(1) };
        std::array<FF, multivariate_n> q_r = { FF(1), FF(1), FF(1), FF(1) };
        std::array<FF, multivariate_n> q_o = { FF(-1), FF(-1), FF(-1), FF(-1) };
        std::array<FF, multivariate_n> q_c = { FF(0), FF(0), FF(0), FF(0) };
        std::array<FF, multivariate_n> q_arith = { FF(1), FF(1), FF(1), FF(1) }; // Enable arithmetic

        // Create ProverPolynomials
        ProverPolynomials prover_polynomials;
        prover_polynomials.q_m = bb::Polynomial<FF>(q_m);
        prover_polynomials.q_c = bb::Polynomial<FF>(q_c);
        prover_polynomials.q_l = bb::Polynomial<FF>(q_l);
        prover_polynomials.q_r = bb::Polynomial<FF>(q_r);
        prover_polynomials.q_o = bb::Polynomial<FF>(q_o);
        prover_polynomials.q_arith = bb::Polynomial<FF>(q_arith);
        prover_polynomials.w_l = bb::Polynomial<FF>(w_l);
        prover_polynomials.w_r = bb::Polynomial<FF>(w_r);
        prover_polynomials.w_o = bb::Polynomial<FF>(w_o);
        prover_polynomials.w_4 = bb::Polynomial<FF>(w_4);

        // Initialize other required polynomials to zero
        for (auto& poly : prover_polynomials.get_all()) {
            if (poly.size() == 0) {
                poly = bb::Polynomial<FF>(multivariate_n);
            }
        }

        // Extend edges from the first edge (index 0)
        SumcheckRound round(multivariate_n);
        typename SumcheckRound::ExtendedEdges extended_edges;
        round.extend_edges(extended_edges, prover_polynomials, 0);

        // Accumulate relation
        typename SumcheckRound::SumcheckTupleOfTuplesOfUnivariates accumulator{};
        RelationUtils<Flavor>::zero_univariates(accumulator);
        RelationParameters<FF> relation_parameters{};

        // Scaling factor is set to 1
        round.accumulate_relation_univariates_public(accumulator, extended_edges, relation_parameters, FF(1));

        // Get arithmetic relation univariate
        auto& arith_univariate = std::get<0>(std::get<0>(accumulator));

        // For edge 0->1: relation should be q_arith * (q_l * w_l + q_r * w_r + q_o * w_o + q_c)
        // At edge 0: 1 * (1*1 + 1*5 + (-1)*6 + 0) = 1 + 5 - 6 = 0 (satisfied)
        // At edge 1: 1 * (1*2 + 1*6 + (-1)*8 + 0) = 2 + 6 - 8 = 0 (satisfied)
        EXPECT_EQ(arith_univariate.value_at(0), FF(0)) << "Relation should be satisfied at edge 0";
        EXPECT_EQ(arith_univariate.value_at(1), FF(0)) << "Relation should be satisfied at edge 1";

        info("Arithmetic relation: verified relation is satisfied for valid circuit");
    }

    // Test 2: Scaling factor
    {
        info("Test 2: Scaling factor application");

        // Create a simple non-zero contribution circuit
        std::array<FF, multivariate_n> w_l = { FF(2), FF(2), FF(2), FF(2) };
        std::array<FF, multivariate_n> q_l = { FF(3), FF(3), FF(3), FF(3) };
        std::array<FF, multivariate_n> q_arith = { FF(1), FF(1), FF(1), FF(1) };

        ProverPolynomials prover_polynomials;
        prover_polynomials.w_l = bb::Polynomial<FF>(w_l);
        prover_polynomials.q_l = bb::Polynomial<FF>(q_l);
        prover_polynomials.q_arith = bb::Polynomial<FF>(q_arith);

        for (auto& poly : prover_polynomials.get_all()) {
            if (poly.size() == 0) {
                poly = bb::Polynomial<FF>(multivariate_n);
            }
        }

        SumcheckRound round(multivariate_n);
        typename SumcheckRound::ExtendedEdges extended_edges;
        round.extend_edges(extended_edges, prover_polynomials, 0);

        typename SumcheckRound::SumcheckTupleOfTuplesOfUnivariates acc1{};
        typename SumcheckRound::SumcheckTupleOfTuplesOfUnivariates acc2{};
        RelationUtils<Flavor>::zero_univariates(acc1);
        RelationUtils<Flavor>::zero_univariates(acc2);
        RelationParameters<FF> relation_parameters{};

        round.accumulate_relation_univariates_public(acc1, extended_edges, relation_parameters, FF(1));
        round.accumulate_relation_univariates_public(acc2, extended_edges, relation_parameters, FF(2));

        auto& arith1 = std::get<0>(std::get<0>(acc1));
        auto& arith2 = std::get<0>(std::get<0>(acc2));

        // With scale=2, result should be exactly double
        EXPECT_EQ(arith2.value_at(0), arith1.value_at(0) * FF(2)) << "Scaling should multiply contribution";
        EXPECT_EQ(arith2.value_at(1), arith1.value_at(1) * FF(2)) << "Scaling should multiply contribution";

        info("Scaling factor: verified 2x scaling produces 2x contribution");
    }

    // Test 3: Multiple accumulations
    {
        info("Test 3: Multiple accumulation calls");

        std::array<FF, multivariate_n> w_l = { FF(1), FF(1), FF(1), FF(1) };
        std::array<FF, multivariate_n> q_l = { FF(5), FF(5), FF(5), FF(5) };
        std::array<FF, multivariate_n> q_arith = { FF(1), FF(1), FF(1), FF(1) };

        ProverPolynomials prover_polynomials;
        prover_polynomials.w_l = bb::Polynomial<FF>(w_l);
        prover_polynomials.q_l = bb::Polynomial<FF>(q_l);
        prover_polynomials.q_arith = bb::Polynomial<FF>(q_arith);

        for (auto& poly : prover_polynomials.get_all()) {
            if (poly.size() == 0) {
                poly = bb::Polynomial<FF>(multivariate_n);
            }
        }

        SumcheckRound round(multivariate_n);
        typename SumcheckRound::ExtendedEdges extended_edges;
        round.extend_edges(extended_edges, prover_polynomials, 0);

        typename SumcheckRound::SumcheckTupleOfTuplesOfUnivariates accumulator{};
        RelationUtils<Flavor>::zero_univariates(accumulator);
        RelationParameters<FF> relation_parameters{};

        // First accumulation
        round.accumulate_relation_univariates_public(accumulator, extended_edges, relation_parameters, FF(1));
        auto& arith = std::get<0>(std::get<0>(accumulator));
        FF value_after_first = arith.value_at(0);

        // Second accumulation (should add to first)
        round.accumulate_relation_univariates_public(accumulator, extended_edges, relation_parameters, FF(1));
        FF value_after_second = arith.value_at(0);

        // Second value should be double the first (since we accumulated the same contribution twice)
        EXPECT_EQ(value_after_second, value_after_first * FF(2)) << "Second accumulation should add to first";

        info("Multiple accumulations: verified contributions are summed");
    }
    // Test 4: Linearly dependent subrelation should NOT be scaled
    {
        info("Test 4: DependentTestRelation (linearly dependent) is not scaled");

        // Create a circuit with test relation polynomials
        std::array<FF, multivariate_n> w_test_1 = { FF(1), FF(2), FF(3), FF(4) };
        std::array<FF, multivariate_n> q_test = { FF(1), FF(1), FF(1), FF(1) };

        ProverPolynomials prover_polynomials;
        prover_polynomials.w_test_1 = bb::Polynomial<FF>(w_test_1);
        prover_polynomials.q_test = bb::Polynomial<FF>(q_test);

        for (auto& poly : prover_polynomials.get_all()) {
            if (poly.size() == 0) {
                poly = bb::Polynomial<FF>(multivariate_n);
            }
        }

        SumcheckRound round(multivariate_n);
        typename SumcheckRound::ExtendedEdges extended_edges;
        round.extend_edges(extended_edges, prover_polynomials, 0);

        typename SumcheckRound::SumcheckTupleOfTuplesOfUnivariates acc1{}, acc2{};
        RelationUtils<Flavor>::zero_univariates(acc1);
        RelationUtils<Flavor>::zero_univariates(acc2);

        RelationParameters<FF> relation_parameters{};

        // Accumulate with scale=1 and scale=2
        round.accumulate_relation_univariates_public(acc1, extended_edges, relation_parameters, FF(1));
        round.accumulate_relation_univariates_public(acc2, extended_edges, relation_parameters, FF(2));

        // SumcheckTestFlavor::Relations = tuple<ArithmeticRelation, DependentTestRelation>
        // ArithmeticRelation is at index 0 (has 2 subrelations, both linearly independent)
        // DependentTestRelation is at index 1 (has 1 subrelation, linearly dependent)

        // Check DependentTestRelation (index 1) - should NOT be scaled (linearly dependent)
        auto& dependent_test_acc1 = std::get<0>(std::get<1>(acc1));
        auto& dependent_test_acc2 = std::get<0>(std::get<1>(acc2));
        EXPECT_EQ(dependent_test_acc2.value_at(0), dependent_test_acc1.value_at(0))
            << "DependentTestRelation (linearly dependent) should NOT be scaled";
        EXPECT_EQ(dependent_test_acc2.value_at(1), dependent_test_acc1.value_at(1))
            << "DependentTestRelation (linearly dependent) should NOT be scaled";

        info("DependentTestRelation: verified that linearly dependent relation is NOT scaled");
    }
}

/**
 * @brief Test check_sum with field arithmetic edge cases
 * @details Verifies that check_sum works correctly with large field elements near the modulus
 */
TEST(SumcheckRound, CheckSumFieldArithmetic)
{
    using Flavor = SumcheckTestFlavor;
    using FF = typename Flavor::FF;
    using SumcheckVerifierRound = bb::SumcheckVerifierRound<Flavor>;
    constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = Flavor::BATCHED_RELATION_PARTIAL_LENGTH;

    info("Test: Field arithmetic edge cases for check_sum");

    // Test 1: Large field elements near modulus
    {
        // Create large values near the field modulus
        FF large_val_1 = FF(-1);               // p - 1 (maximum field element)
        FF large_val_2 = FF(-2);               // p - 2
        FF target = large_val_1 + large_val_2; // Should wrap around: (p-1) + (p-2) = 2p - 3 ≡ -3 (mod p)

        bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH> univariate;
        univariate.value_at(0) = large_val_1;
        univariate.value_at(1) = large_val_2;

        SumcheckVerifierRound verifier_round(target);
        verifier_round.check_sum(univariate, FF(1));

        EXPECT_TRUE(!verifier_round.round_failed)
            << "check_sum should handle large field elements correctly with wraparound";
        info("Large field elements: check_sum correctly handles values near modulus");
    }

    // Test 2: Zero elements (edge case)
    {
        FF zero = FF(0);
        bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH> univariate;
        univariate.value_at(0) = zero;
        univariate.value_at(1) = zero;

        SumcheckVerifierRound verifier_round(zero);
        verifier_round.check_sum(univariate, FF(1));
        bool result = !verifier_round.round_failed;

        EXPECT_TRUE(result) << "check_sum should handle zero case correctly";
        info("Zero case: check_sum correctly handles all-zero values");
    }

    // Test 3: Mixed signs (positive and negative)
    {
        FF positive = FF(12345);
        FF negative = FF(-12345);
        FF target = positive + negative; // Should be 0

        bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH> univariate;
        univariate.value_at(0) = positive;
        univariate.value_at(1) = negative;

        SumcheckVerifierRound verifier_round(target);
        verifier_round.check_sum(univariate, FF(1));
        bool result = !verifier_round.round_failed;

        EXPECT_TRUE(result) << "check_sum should handle mixed signs correctly";
        EXPECT_EQ(target, FF(0)) << "Positive + negative should equal zero";
        info("Mixed signs: check_sum correctly handles positive + negative = 0");
    }
}

/**
 * @brief Test check_sum with padding indicator
 * @details Verifies that padding rounds (indicator=0) bypass the check, while non-padding rounds (indicator=1) perform
 * the check
 */
TEST(SumcheckRound, CheckSumPaddingIndicator)
{
    using Flavor = SumcheckTestFlavorZK;
    using FF = typename Flavor::FF;
    using SumcheckVerifierRound = bb::SumcheckVerifierRound<Flavor>;
    constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = Flavor::BATCHED_RELATION_PARTIAL_LENGTH;

    info("Test: Padding indicator behavior in check_sum");

    // Create a univariate with mismatched sum (should fail in normal round)
    FF val_0 = FF(10);
    FF val_1 = FF(20);
    FF correct_sum = val_0 + val_1; // 30
    FF wrong_target = FF(100);      // Intentionally wrong

    bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH> univariate;
    univariate.value_at(0) = val_0;
    univariate.value_at(1) = val_1;

    // Test 1: Non-padding round (indicator = 1) - should enforce the check
    {
        info("Test 1: Non-padding round (indicator=1) with wrong target - should FAIL");

        SumcheckVerifierRound verifier_round(wrong_target);
        verifier_round.check_sum(univariate, FF(1)); // indicator = 1
        bool result = !verifier_round.round_failed;

        EXPECT_FALSE(result) << "With indicator=1, check_sum should fail when target is wrong";
        EXPECT_TRUE(verifier_round.round_failed) << "round_failed flag should be set";
        info("Non-padding round: check_sum correctly enforces check and fails with wrong target");
    }

    // Test 2: Padding round (indicator = 0) - should bypass check even with wrong target
    {
        info("Test 3: Padding round (indicator=0) with wrong target - should PASS (bypassed)");

        SumcheckVerifierRound verifier_round(wrong_target);
        verifier_round.check_sum(univariate, FF(0)); // indicator = 0
        bool result = !verifier_round.round_failed;

        EXPECT_TRUE(result) << "With indicator=0, check_sum should pass even when target is wrong (padding round)";
        EXPECT_FALSE(verifier_round.round_failed) << "round_failed flag should not be set in padding round";
        info("Padding round: check_sum correctly bypasses verification");
    }

    // Test 5: Transition from padding to non-padding
    {
        info("Test 4: Multiple rounds with mixed padding/non-padding");

        SumcheckVerifierRound verifier_round(wrong_target);

        // First round: padding (indicator = 0) - should pass
        verifier_round.check_sum(univariate, FF(0));
        bool result1 = !verifier_round.round_failed;
        EXPECT_TRUE(result1) << "First padding round should pass";
        EXPECT_FALSE(verifier_round.round_failed) << "round_failed should still be false after padding round";

        // Update target to correct value for next check
        verifier_round.target_total_sum = correct_sum;

        // Second round: non-padding (indicator = 1) with correct target - should pass
        verifier_round.check_sum(univariate, FF(1));
        bool result2 = !verifier_round.round_failed;
        EXPECT_TRUE(result2) << "Non-padding round with correct target should pass";
        EXPECT_FALSE(verifier_round.round_failed) << "round_failed should remain false";

        info("Mixed rounds: check_sum correctly handles transition from padding to non-padding");
    }
}

/**
 * @brief Test round_failed flag persistence in check_sum
 * @details Verifies that once a check fails, the round_failed flag persists across subsequent checks
 */
TEST(SumcheckRound, CheckSumRoundFailurePersistence)
{
    using Flavor = SumcheckTestFlavor;
    using FF = typename Flavor::FF;
    using SumcheckVerifierRound = bb::SumcheckVerifierRound<Flavor>;
    constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = Flavor::BATCHED_RELATION_PARTIAL_LENGTH;

    info("Test: round_failed flag persistence across multiple checks");

    // Test 1: Single failed check sets flag
    {
        info("Test 1: Single failed check sets round_failed flag");

        FF wrong_target = FF(999);
        SumcheckVerifierRound verifier_round(wrong_target);

        bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH> univariate;
        univariate.value_at(0) = FF(10);
        univariate.value_at(1) = FF(20);

        EXPECT_FALSE(verifier_round.round_failed) << "round_failed should initially be false";

        verifier_round.check_sum(univariate, FF(1));
        bool result = !verifier_round.round_failed;

        EXPECT_FALSE(result) << "check_sum should return false for wrong target";
        EXPECT_TRUE(verifier_round.round_failed) << "round_failed flag should be set after failed check";

        info("Single failure: round_failed flag correctly set");
    }

    // Test 2: Multiple passing checks keep flag false
    {
        info("Test 2: Multiple passing checks keep round_failed false");

        SumcheckVerifierRound verifier_round(FF(30)); // Start with correct target

        bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH> univariate1;
        univariate1.value_at(0) = FF(10);
        univariate1.value_at(1) = FF(20);

        bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH> univariate2;
        univariate2.value_at(0) = FF(5);
        univariate2.value_at(1) = FF(15);

        verifier_round.check_sum(univariate1, FF(1));
        bool result1 = !verifier_round.round_failed;
        EXPECT_TRUE(result1) << "First check should pass";
        EXPECT_FALSE(verifier_round.round_failed) << "round_failed should be false after first pass";

        verifier_round.target_total_sum = FF(20); // Update target for second check
        verifier_round.check_sum(univariate2, FF(1));
        bool result2 = !verifier_round.round_failed;
        EXPECT_TRUE(result2) << "Second check should pass";
        EXPECT_FALSE(verifier_round.round_failed) << "round_failed should remain false after second pass";

        info("Multiple passes: round_failed correctly remains false");
    }
}

/**
 * @brief Test check_sum in a recursive circuit with unsatisfiable witness
 * @details Creates a recursive circuit where check_sum is called with witnesses that don't satisfy the constraint,
 * verifying that the circuit correctly detects the failure.
 */
TEST(SumcheckRound, CheckSumRecursiveUnsatisfiableWitness)
{
    using InnerBuilder = bb::UltraCircuitBuilder;
    using RecursiveFlavor = bb::UltraRecursiveFlavor_<InnerBuilder>;
    using FF = typename RecursiveFlavor::FF; // This is field_t<InnerBuilder> (stdlib field)
    using SumcheckVerifierRound = bb::SumcheckVerifierRound<RecursiveFlavor>;
    constexpr size_t BATCHED_RELATION_PARTIAL_LENGTH = RecursiveFlavor::BATCHED_RELATION_PARTIAL_LENGTH;

    info("Test: Recursive check_sum with unsatisfiable witness");

    // Test 1: Unsatisfiable witness - sum doesn't match target
    {
        info("Test 1: Unsatisfiable witness where target != S(0) + S(1)");

        InnerBuilder builder;

        // Create witness values that intentionally don't satisfy the check
        auto native_val_0 = bb::fr(10);
        auto native_val_1 = bb::fr(20);
        auto native_wrong_target = bb::fr(100); // Intentionally wrong (correct would be 30)

        // Create stdlib field elements (circuit variables)
        FF val_0 = FF::from_witness(&builder, native_val_0);
        FF val_1 = FF::from_witness(&builder, native_val_1);
        FF wrong_target = FF::from_witness(&builder, native_wrong_target);

        // Create univariate with these values
        bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH> univariate;
        univariate.value_at(0) = val_0;
        univariate.value_at(1) = val_1;

        // Create verifier round with wrong target
        SumcheckVerifierRound verifier_round(wrong_target);

        // Call check_sum - this adds constraints to the circuit
        // In recursive flavor, assert_equal is called which adds a constraint
        FF indicator = FF(1); // Non-padding round
        verifier_round.check_sum(univariate, indicator);
        bool check_result = !verifier_round.round_failed;

        // The check_sum itself should return false (based on witness values)
        EXPECT_FALSE(check_result) << "check_sum should return false for mismatched values";

        // The circuit should have failed (constraint violation detected)
        EXPECT_TRUE(builder.failed()) << "Builder should detect constraint violation (unsatisfiable witness)";

        info("Unsatisfiable witness: Builder correctly detects constraint violation");
    }

    // Test 2: Satisfiable witness - sum matches target
    {
        info("Test 2: Satisfiable witness where target == S(0) + S(1)");

        InnerBuilder builder;

        // Create witness values that DO satisfy the check
        auto native_val_0 = bb::fr(10);
        auto native_val_1 = bb::fr(20);
        auto native_correct_target = native_val_0 + native_val_1; // 30 (correct)

        // Create stdlib field elements
        FF val_0 = FF::from_witness(&builder, native_val_0);
        FF val_1 = FF::from_witness(&builder, native_val_1);
        FF correct_target = FF::from_witness(&builder, native_correct_target);

        // Create univariate
        bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH> univariate;
        univariate.value_at(0) = val_0;
        univariate.value_at(1) = val_1;

        // Create verifier round with correct target
        SumcheckVerifierRound verifier_round(correct_target);

        // Call check_sum
        FF indicator = FF(1);
        verifier_round.check_sum(univariate, indicator);
        bool check_result = !verifier_round.round_failed;

        // Check should pass
        EXPECT_TRUE(check_result) << "check_sum should return true for matching values";

        // The circuit should NOT have failed
        EXPECT_FALSE(builder.failed()) << "Builder should not fail for satisfiable witness";

        // Verify the circuit is correct
        EXPECT_TRUE(CircuitChecker::check(builder)) << "Circuit with satisfiable witness should pass CircuitChecker";

        info("Satisfiable witness: Builder correctly validates constraint satisfaction");
    }

    // Test 3: Padding round with wrong values - should still pass (bypassed)
    {
        info("Test 3: Padding round (indicator=0) with wrong values - should not fail");

        InnerBuilder builder;

        // Create mismatched values
        auto native_val_0 = bb::fr(10);
        auto native_val_1 = bb::fr(20);
        auto native_wrong_target = bb::fr(999); // Wrong

        FF val_0 = FF::from_witness(&builder, native_val_0);
        FF val_1 = FF::from_witness(&builder, native_val_1);
        FF wrong_target = FF::from_witness(&builder, native_wrong_target);

        bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH> univariate;
        univariate.value_at(0) = val_0;
        univariate.value_at(1) = val_1;

        SumcheckVerifierRound verifier_round(wrong_target);

        // Padding round - indicator = 0
        FF indicator = FF(0);
        verifier_round.check_sum(univariate, indicator);
        bool check_result = !verifier_round.round_failed;

        // Should pass because check is bypassed
        EXPECT_TRUE(check_result) << "check_sum should return true for padding round";

        // Builder should NOT fail (no constraint violation in padding round)
        EXPECT_FALSE(builder.failed()) << "Builder should not fail for padding round (check bypassed)";

        // Circuit should be valid
        EXPECT_TRUE(CircuitChecker::check(builder)) << "Padding round circuit should pass CircuitChecker";

        info("Padding round: Builder correctly bypasses check (no constraint added)");
    }

    // Test 4: Multiple rounds with one failure
    {
        info("Test 4: Multiple rounds where one has unsatisfiable witness");

        InnerBuilder builder;

        // First round: correct
        auto val_0_round1 = FF::from_witness(&builder, bb::fr(10));
        auto val_1_round1 = FF::from_witness(&builder, bb::fr(20));
        auto target_round1 = FF::from_witness(&builder, bb::fr(30));

        bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH> univariate_1;
        univariate_1.value_at(0) = val_0_round1;
        univariate_1.value_at(1) = val_1_round1;

        SumcheckVerifierRound verifier_round(target_round1);
        FF indicator = FF(1);

        verifier_round.check_sum(univariate_1, indicator);
        bool result_1 = !verifier_round.round_failed;
        EXPECT_TRUE(result_1);
        EXPECT_FALSE(builder.failed()) << "First round should not fail";

        // Second round: WRONG
        verifier_round.target_total_sum = FF::from_witness(&builder, bb::fr(999)); // Wrong target
        auto val_0_round2 = FF::from_witness(&builder, bb::fr(5));
        auto val_1_round2 = FF::from_witness(&builder, bb::fr(15));

        bb::Univariate<FF, BATCHED_RELATION_PARTIAL_LENGTH> univariate_2;
        univariate_2.value_at(0) = val_0_round2;
        univariate_2.value_at(1) = val_1_round2;

        verifier_round.check_sum(univariate_2, indicator);
        bool result_2 = !verifier_round.round_failed;
        EXPECT_FALSE(result_2) << "Second round should fail";

        // Builder should now have failed
        EXPECT_TRUE(builder.failed()) << "Builder should detect failure in second round";

        info("Multiple rounds: Builder correctly detects failure in one of multiple rounds");
    }
}
