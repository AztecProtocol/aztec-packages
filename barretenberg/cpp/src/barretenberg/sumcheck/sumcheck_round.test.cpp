#include "sumcheck_round.hpp"
#include "barretenberg/common/tuple.hpp"
#include "barretenberg/flavor/multilinear_batching_flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"
#include "barretenberg/relations/utils.hpp"

#include <gtest/gtest.h>

using namespace bb;

/**
 * @brief Test SumcheckRound functions for operations on tuples (and tuples of tuples) of Univariates
 *
 */
TEST(SumcheckRound, SumcheckTupleOfTuplesOfUnivariates)
{
    using Flavor = UltraFlavor;
    using FF = typename Flavor::FF;
    using Utils = RelationUtils<Flavor>;
    using SubrelationSeparators = typename Utils::SubrelationSeparators;

    // Define three linear univariates of different sizes
    Univariate<FF, 3> univariate_1({ 1, 2, 3 });
    Univariate<FF, 2> univariate_2({ 2, 4 });
    Univariate<FF, 5> univariate_3({ 3, 4, 5, 6, 7 });
    const size_t MAX_LENGTH = 5;

    // Construct a tuple of tuples of the form { {univariate_1}, {univariate_2, univariate_3} }
    auto tuple_of_tuples = flat_tuple::make_tuple(flat_tuple::make_tuple(univariate_1),
                                                  flat_tuple::make_tuple(univariate_2, univariate_3));

    // Use scale_univariate_accumulators to scale by challenge powers
    SubrelationSeparators challenge{};
    challenge[0] = 5;
    challenge[1] = 25;
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
    Univariate<FF, 3> expected_1({ 0, 0, 0 });
    Univariate<FF, 2> expected_2({ 0, 0 });
    Univariate<FF, 5> expected_3({ 0, 0, 0, 0, 0 });
    EXPECT_EQ(std::get<0>(std::get<0>(tuple_of_tuples)), expected_1);
    EXPECT_EQ(std::get<0>(std::get<1>(tuple_of_tuples)), expected_2);
    EXPECT_EQ(std::get<1>(std::get<1>(tuple_of_tuples)), expected_3);
}

/**
 * @brief Test utility functions for applying operations to tuple of std::arrays of field elements
 *
 */
TEST(SumcheckRound, TuplesOfEvaluationArrays)
{
    using Flavor = UltraFlavor;
    using Utils = RelationUtils<Flavor>;
    using FF = typename Flavor::FF;
    using SubrelationSeparators = typename Utils::SubrelationSeparators;

    // Define two arrays of arbitrary elements
    std::array<FF, 2> evaluations_1 = { 4, 3 };
    std::array<FF, 2> evaluations_2 = { 6, 2 };

    // Construct a tuple
    auto tuple_of_arrays = flat_tuple::make_tuple(evaluations_1, evaluations_2);

    // Use scale_and_batch_elements to scale by challenge powers
    SubrelationSeparators challenge{ 5, 25, 125 };

    FF result = Utils::scale_and_batch_elements(tuple_of_arrays, challenge);

    // Repeat the batching process manually
    auto result_expected = evaluations_1[0] + evaluations_1[1] * challenge[0] + evaluations_2[0] * challenge[1] +
                           evaluations_2[1] * challenge[2];

    // Compare batched result
    EXPECT_EQ(result, result_expected);

    // Reinitialize univariate accumulators to zero
    Utils::zero_elements(tuple_of_arrays);

    EXPECT_EQ(std::get<0>(tuple_of_arrays)[0], 0);
    EXPECT_EQ(std::get<1>(tuple_of_arrays)[0], 0);
    EXPECT_EQ(std::get<1>(tuple_of_arrays)[1], 0);
}

/**
 * @brief Test utility functions for adding two tuples of tuples of Univariates
 *
 */
TEST(SumcheckRound, AddTuplesOfTuplesOfUnivariates)
{
    using Flavor = UltraFlavor;
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
    using Flavor = UltraFlavor; // Non-ZK flavor
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

        // Note: AllEntities ordering is: MaskingEntities (if ZK), PrecomputedEntities, WitnessEntities, ShiftedEntities
        // For UltraFlavor: Precomputed (0-27), Witness (28-35), Shifted (36+)
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
    using Flavor = UltraZKFlavor; // ZK flavor
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
    using Flavor = UltraFlavor;
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
    using Flavor = MultilinearBatchingFlavor;
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
 * @brief Test accumulate_relation_univariates for UltraFlavor
 * @details Tests that:
 * 1. Arithmetic relation contributions are correctly accumulated
 * 2. Scaling factors are properly applied
 * 3. Multiple calls correctly accumulate (add) contributions
 */
TEST(SumcheckRound, AccumulateRelationUnivariatesUltra)
{
    using Flavor = UltraFlavor;
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

        typename SumcheckRound::SumcheckTupleOfTuplesOfUnivariates acc1{}, acc2{};
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
        info("Test 4: LogDerivLookupRelation linearly dependent subrelation is not scaled");

        // Create a circuit with lookup-related polynomials
        std::array<FF, multivariate_n> lookup_read_counts = { FF(1), FF(2), FF(1), FF(0) };
        std::array<FF, multivariate_n> lookup_inverses = { FF(1), FF(1), FF(1), FF(1) };
        std::array<FF, multivariate_n> q_lookup = { FF(1), FF(1), FF(1), FF(0) };

        ProverPolynomials prover_polynomials;
        prover_polynomials.lookup_read_counts = bb::Polynomial<FF>(lookup_read_counts);
        prover_polynomials.lookup_inverses = bb::Polynomial<FF>(lookup_inverses);
        prover_polynomials.q_lookup = bb::Polynomial<FF>(q_lookup);

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

        RelationParameters<FF> relation_parameters{
            .beta = FF::random_element(),
            .gamma = FF::random_element(),
            .public_input_delta = FF::one(),
        };

        // Accumulate with scale=1 and scale=2
        round.accumulate_relation_univariates_public(acc1, extended_edges, relation_parameters, FF(1));
        round.accumulate_relation_univariates_public(acc2, extended_edges, relation_parameters, FF(2));

        // LogDerivLookupRelation is at index 2 in UltraFlavor::Relations
        // It has 3 subrelations: [0] inverse correctness (scaled), [1] lookup sum (NOT scaled), [2] read_tag boolean
        // (scaled)

        // Check subrelation 0 (inverse correctness) - SHOULD be scaled
        auto& logderiv_sub0_acc1 = std::get<0>(std::get<2>(acc1));
        auto& logderiv_sub0_acc2 = std::get<0>(std::get<2>(acc2));
        EXPECT_EQ(logderiv_sub0_acc2.value_at(0), logderiv_sub0_acc1.value_at(0) * FF(2))
            << "LogDerivLookup subrelation 0 (inverse correctness) SHOULD be scaled";

        // Check subrelation 1 (lookup sum) - should NOT be scaled (linearly dependent)
        auto& logderiv_sub1_acc1 = std::get<1>(std::get<2>(acc1));
        auto& logderiv_sub1_acc2 = std::get<1>(std::get<2>(acc2));
        EXPECT_EQ(logderiv_sub1_acc2.value_at(0), logderiv_sub1_acc1.value_at(0))
            << "LogDerivLookup subrelation 1 (linearly dependent lookup sum) should NOT be scaled";
        EXPECT_EQ(logderiv_sub1_acc2.value_at(1), logderiv_sub1_acc1.value_at(1))
            << "LogDerivLookup subrelation 1 (linearly dependent lookup sum) should NOT be scaled";

        // Check subrelation 2 (read_tag boolean) - SHOULD be scaled
        auto& logderiv_sub2_acc1 = std::get<2>(std::get<2>(acc1));
        auto& logderiv_sub2_acc2 = std::get<2>(std::get<2>(acc2));
        EXPECT_EQ(logderiv_sub2_acc2.value_at(0), logderiv_sub2_acc1.value_at(0) * FF(2))
            << "LogDerivLookup subrelation 2 (read_tag boolean) SHOULD be scaled";

        info("LogDerivLookupRelation: verified that linearly dependent subrelation (index 1) is NOT scaled, while "
             "others ARE scaled");
    }
}
