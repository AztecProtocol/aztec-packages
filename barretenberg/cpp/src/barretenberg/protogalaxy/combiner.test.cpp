#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/honk/utils/testing.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover_internal.hpp"
#include "barretenberg/relations/ultra_arithmetic_relation.hpp"
#include "barretenberg/ultra_honk/decider_keys.hpp"
#include <gtest/gtest.h>

using namespace bb;

using Flavor = MegaFlavor;
using Polynomial = typename Flavor::Polynomial;
using FF = typename Flavor::FF;
constexpr size_t NUM_KEYS = 2;

/**
 * @brief Extend the ProtogalaxyProverInternal class to compute the combiner *without* optimistically skipping
 * @details "optimistic skipping" is the act of not computing the flavor's relation monomials at evaluation points where
 * an honest Prover would produce an evaluation result of `0` For example, when folding 1 instance `w0` with 1
 * accumulator `w`, ProtoGalaxy uses a witness polynomial w(X) = w.L0(X) + w0.L1(X), where L0, L1 are Lagrange
 * polynomials. At X=1, w(X) = w0 . The full Protogalaxy relation in this case should evaluate to `0`. so we can skip
 * its computation at X=1. The PGInternalTest class adds methods where we do *not* perform this optimistic skipping, so
 * we can test whether the optimistic skipping algorithm produces the correct result
 *
 */
class PGInternalTest : public ProtogalaxyProverInternal<DeciderProvingKeys_<Flavor, NUM_KEYS>> {
  public:
    using ExtendedUnivariatesNoOptimisticSkipping =
        typename Flavor::template ProverUnivariates<ExtendedUnivariate::LENGTH>;

    using UnivariateRelationParametersNoOptimisticSkipping =
        bb::RelationParameters<Univariate<FF, DeciderPKs::EXTENDED_LENGTH>>;
    using ExtendedUnivariatesTypeNoOptimisticSkipping =
        std::conditional_t<Flavor::USE_SHORT_MONOMIALS, ShortUnivariates, ExtendedUnivariatesNoOptimisticSkipping>;

    /**
     * @brief Compute combiner using univariates that do not avoid zero computation in case of valid incoming indices.
     * @details This is only used for testing the combiner calculation.
     */
    ExtendedUnivariateWithRandomization compute_combiner_no_optimistic_skipping(
        const DeciderPKs& keys,
        const GateSeparatorPolynomial<FF>& gate_separators,
        const UnivariateRelationParametersNoOptimisticSkipping& relation_parameters,
        const UnivariateRelationSeparator& alphas)
    {
        TupleOfTuplesOfUnivariatesNoOptimisticSkipping accumulators;
        return compute_combiner_no_optimistic_skipping(
            keys, gate_separators, relation_parameters, alphas, accumulators);
    }

    /**
     * @brief Compute the combiner polynomial $G$ in the Protogalaxy paper
     * @details We have implemented an optimization that (eg in the case where we fold one instance-witness pair at a
     * time) assumes the value G(1) is 0, which is true in the case where the witness to be folded is valid.
     * @todo (https://github.com/AztecProtocol/barretenberg/issues/968) Make combiner tests better
     *
     * @tparam skip_zero_computations whether to use the optimization that skips computing zero.
     * @param
     * @param gate_separators
     * @return ExtendedUnivariateWithRandomization
     */
    ExtendedUnivariateWithRandomization compute_combiner_no_optimistic_skipping(
        const DeciderPKs& keys,
        const GateSeparatorPolynomial<FF>& gate_separators,
        const UnivariateRelationParametersNoOptimisticSkipping& relation_parameters,
        const UnivariateRelationSeparator& alphas,
        TupleOfTuplesOfUnivariatesNoOptimisticSkipping& univariate_accumulators)
    {
        PROFILE_THIS();

        // Determine the number of threads over which to distribute the work
        // The polynomial size is given by the virtual size since the computation includes
        // the incoming key which could have nontrivial values on the larger domain in case of overflow.
        const size_t common_polynomial_size = keys[0]->polynomials.w_l.virtual_size();
        const size_t num_threads = compute_num_threads(common_polynomial_size);

        // Univariates are optimised for usual PG, but we need the unoptimised version for tests (it's a version that
        // doesn't skip computation), so we need to define types depending on the template instantiation
        using ThreadAccumulators = TupleOfTuplesOfUnivariatesNoOptimisticSkipping;
        // Construct univariate accumulator containers; one per thread
        std::vector<ThreadAccumulators> thread_univariate_accumulators(num_threads);

        // Distribute the execution trace rows across threads so that each handles an equal number of active rows
        trace_usage_tracker.construct_thread_ranges(num_threads, common_polynomial_size);

        // Accumulate the contribution from each sub-relation
        parallel_for(num_threads, [&](size_t thread_idx) {
            // Initialize the thread accumulator to 0
            RelationUtils::zero_univariates(thread_univariate_accumulators[thread_idx]);
            // Construct extended univariates containers; one per thread
            ExtendedUnivariatesTypeNoOptimisticSkipping extended_univariates;

            for (const ExecutionTraceUsageTracker::Range& range : trace_usage_tracker.thread_ranges[thread_idx]) {
                for (size_t idx = range.first; idx < range.second; idx++) {
                    // Instantiate univariates, possibly with skipping toto ignore computation in those indices (they
                    // are still available for skipping relations, but all derived univariate will ignore those
                    // evaluations) No need to initialise extended_univariates to 0, as it's assigned to.
                    constexpr size_t skip_count = 0;
                    extend_univariates<skip_count>(extended_univariates, keys, idx);

                    const FF pow_challenge = gate_separators[idx];

                    // Accumulate the i-th row's univariate contribution. Note that the relation parameters passed to
                    // this function have already been folded. Moreover, linear-dependent relations that act over the
                    // entire execution trace rather than on rows, will not be multiplied by the pow challenge.
                    accumulate_relation_univariates_no_optimistic_skipping(
                        thread_univariate_accumulators[thread_idx],
                        extended_univariates,
                        relation_parameters, // these parameters have already been folded
                        pow_challenge);
                }
            }
        });

        RelationUtils::zero_univariates(univariate_accumulators);
        // Accumulate the per-thread univariate accumulators into a single set of accumulators
        for (auto& accumulators : thread_univariate_accumulators) {
            RelationUtils::add_nested_tuples(univariate_accumulators, accumulators);
        }
        // This does nothing if TupleOfTuples is TupleOfTuplesOfUnivariates
        TupleOfTuplesOfUnivariatesNoOptimisticSkipping deoptimized_univariates =
            deoptimise_univariates(univariate_accumulators);
        //  Batch the univariate contributions from each sub-relation to obtain the round univariate
        return batch_over_relations(deoptimized_univariates, alphas);
    }

    /**
     * @brief Add the value of each relation over univariates to an appropriate accumulator
     *
     * @tparam TupleOfTuplesOfUnivariates_ A tuple of univariate accumulators, where the univariates may be optimized to
     * avoid computation on some indices.
     * @tparam ExtendedUnivariates_ T
     * @tparam Parameters relation parameters type
     * @tparam relation_idx The index of the relation
     * @param univariate_accumulators
     * @param extended_univariates
     * @param relation_parameters
     * @param scaling_factor
     */
    template <size_t relation_idx = 0>
    BB_INLINE static void accumulate_relation_univariates_no_optimistic_skipping(
        TupleOfTuplesOfUnivariatesNoOptimisticSkipping& univariate_accumulators,
        const ExtendedUnivariatesTypeNoOptimisticSkipping& extended_univariates,
        const UnivariateRelationParametersNoOptimisticSkipping& relation_parameters,
        const FF& scaling_factor)
    {
        using Relation = std::tuple_element_t<relation_idx, Relations>;

        //  Check if the relation is skippable to speed up accumulation
        if constexpr (!isSkippable<Relation, decltype(extended_univariates)>) {
            // If not, accumulate normally
            Relation::accumulate(std::get<relation_idx>(univariate_accumulators),
                                 extended_univariates,
                                 relation_parameters,
                                 scaling_factor);
        } else {
            // If so, only compute the contribution if the relation is active
            if (!Relation::skip(extended_univariates)) {
                Relation::accumulate(std::get<relation_idx>(univariate_accumulators),
                                     extended_univariates,
                                     relation_parameters,
                                     scaling_factor);
            }
        }

        // Repeat for the next relation.
        if constexpr (relation_idx + 1 < Flavor::NUM_RELATIONS) {
            accumulate_relation_univariates_no_optimistic_skipping<relation_idx + 1>(
                univariate_accumulators, extended_univariates, relation_parameters, scaling_factor);
        }
    }
};
// TODO(https://github.com/AztecProtocol/barretenberg/issues/780): Improve combiner tests to check more than the
// arithmetic relation so we more than unit test folding relation parameters and alpha as well.
TEST(Protogalaxy, CombinerOn2Keys)
{
    using DeciderProvingKey = DeciderProvingKey_<Flavor>;
    using DeciderProvingKeys = DeciderProvingKeys_<Flavor, NUM_KEYS>;

    const auto restrict_to_standard_arithmetic_relation = [](auto& polys) {
        std::fill(polys.q_arith.coeffs().begin(), polys.q_arith.coeffs().end(), 1);
        std::fill(polys.q_delta_range.coeffs().begin(), polys.q_delta_range.coeffs().end(), 0);
        std::fill(polys.q_elliptic.coeffs().begin(), polys.q_elliptic.coeffs().end(), 0);
        std::fill(polys.q_aux.coeffs().begin(), polys.q_aux.coeffs().end(), 0);
        std::fill(polys.q_lookup.coeffs().begin(), polys.q_lookup.coeffs().end(), 0);
        std::fill(polys.q_4.coeffs().begin(), polys.q_4.coeffs().end(), 0);
        std::fill(polys.q_poseidon2_external.coeffs().begin(), polys.q_poseidon2_external.coeffs().end(), 0);
        std::fill(polys.q_poseidon2_internal.coeffs().begin(), polys.q_poseidon2_internal.coeffs().end(), 0);
        std::fill(polys.w_4.coeffs().begin(), polys.w_4.coeffs().end(), 0);
        std::fill(polys.w_4_shift.coeffs().begin(), polys.w_4_shift.coeffs().end(), 0);
    };

    auto run_test = [&](bool is_random_input) {
        PGInternalTest pg_internal; // instance of the PG internal prover

        // Combiner test on prover polynomials containing random values, restricted to only the standard arithmetic
        // relation.
        if (is_random_input) {
            std::vector<std::shared_ptr<DeciderProvingKey>> keys_data(NUM_KEYS);

            for (size_t idx = 0; idx < NUM_KEYS; idx++) {
                auto key = std::make_shared<DeciderProvingKey>();
                auto prover_polynomials = get_sequential_prover_polynomials<Flavor>(
                    /*log_circuit_size=*/1, idx * 128);
                restrict_to_standard_arithmetic_relation(prover_polynomials);
                key->polynomials = std::move(prover_polynomials);
                key->metadata.dyadic_size = 2;
                keys_data[idx] = key;
            }

            DeciderProvingKeys keys{ keys_data };
            PGInternalTest::UnivariateRelationSeparator alphas;
            alphas.fill(bb::Univariate<FF, 12>(FF(0))); // focus on the arithmetic relation only
            GateSeparatorPolynomial<FF> gate_separators({ 2 }, /*log_num_monomials=*/1);
            PGInternalTest::UnivariateRelationParametersNoOptimisticSkipping univariate_relation_parameters_no_skpping;
            auto result_no_skipping = pg_internal.compute_combiner_no_optimistic_skipping(
                keys, gate_separators, univariate_relation_parameters_no_skpping, alphas);
            // The expected_result values are computed by running the python script combiner_example_gen.py
            auto expected_result = Univariate<FF, 12>(std::array<FF, 12>{ 11480UL,
                                                                          14117208UL,
                                                                          78456280UL,
                                                                          230777432UL,
                                                                          508829400UL,
                                                                          950360920UL,
                                                                          1593120728UL,
                                                                          2474857560UL,
                                                                          3633320152UL,
                                                                          5106257240UL,
                                                                          6931417560UL,
                                                                          9146549848UL });
            EXPECT_EQ(result_no_skipping, expected_result);
        } else {
            std::vector<std::shared_ptr<DeciderProvingKey>> keys_data(NUM_KEYS);

            for (size_t idx = 0; idx < NUM_KEYS; idx++) {
                auto key = std::make_shared<DeciderProvingKey>();
                auto prover_polynomials = get_zero_prover_polynomials<Flavor>(
                    /*log_circuit_size=*/1);
                restrict_to_standard_arithmetic_relation(prover_polynomials);
                key->polynomials = std::move(prover_polynomials);
                key->metadata.dyadic_size = 2;
                keys_data[idx] = key;
            }

            DeciderProvingKeys keys{ keys_data };
            PGInternalTest::UnivariateRelationSeparator alphas;
            alphas.fill(bb::Univariate<FF, 12>(FF(0))); // focus on the arithmetic relation only

            const auto create_add_gate = [](auto& polys, const size_t idx, FF w_l, FF w_r) {
                polys.w_l.at(idx) = w_l;
                polys.w_r.at(idx) = w_r;
                polys.w_o.at(idx) = w_l + w_r;
                polys.q_l.at(idx) = 1;
                polys.q_r.at(idx) = 1;
                polys.q_o.at(idx) = -1;
            };

            const auto create_mul_gate = [](auto& polys, const size_t idx, FF w_l, FF w_r) {
                polys.w_l.at(idx) = w_l;
                polys.w_r.at(idx) = w_r;
                polys.w_o.at(idx) = w_l * w_r;
                polys.q_m.at(idx) = 1;
                polys.q_o.at(idx) = -1;
            };

            create_add_gate(keys[0]->polynomials, 0, 1, 2);
            create_add_gate(keys[0]->polynomials, 1, 0, 4);
            create_add_gate(keys[1]->polynomials, 0, 3, 4);
            create_mul_gate(keys[1]->polynomials, 1, 1, 4);

            restrict_to_standard_arithmetic_relation(keys[0]->polynomials);
            restrict_to_standard_arithmetic_relation(keys[1]->polynomials);

            /* DeciderProvingKey 0                            DeciderProvingKey 1
                w_l w_r w_o q_m q_l q_r q_o q_c               w_l w_r w_o q_m q_l q_r q_o q_c
                1   2   3   0   1   1   -1  0                 3   4   7   0   1   1   -1  0
                0   4   4   0   1   1   -1  0                 1   4   4   1   0   0   -1  0             */

            /* Lagrange-combined values, row index 0         Lagrange-combined values, row index 1
                in    0    1    2    3    4    5    6        in    0    1    2    3    4    5    6
                w_l   1    3    5    7    9   11   13        w_l   0    1    2    3    4    5    6
                w_r   2    4    6    8   10   12   14        w_r   4    4    4    4    4    4    4
                w_o   3    7   11   15   19   23   27        w_o   4    4    4    4    4    4    0
                q_m   0    0    0    0    0    0    0        q_m   0    1    2    3    4    5    6
                q_l   1    1    1    1    1    1    1        q_l   1    0   -1   -2   -3   -4   -5
                q_r   1    1    1    1    1    1    1        q_r   1    0   -1   -2   -3   -4   -5
                q_o  -1   -1   -1   -1   -1   -1   -1        q_o  -1   -1   -1   -1   -1   -1   -1
                q_c   0    0    0    0    0    0    0        q_c   0    0    0    0    0    0    0

            relation value:
                      0    0    0    0    0    0    0              0    0    6   18   36   60   90      */

            GateSeparatorPolynomial<FF> gate_separators({ 2 }, /*log_num_monomials=*/1);
            PGInternalTest::UnivariateRelationParametersNoOptimisticSkipping univariate_relation_parameters_no_skpping;
            PGInternalTest::UnivariateRelationParameters univariate_relation_parameters;
            auto result_no_skipping = pg_internal.compute_combiner_no_optimistic_skipping(
                keys, gate_separators, univariate_relation_parameters_no_skpping, alphas);
            auto result_with_skipping =
                pg_internal.compute_combiner(keys, gate_separators, univariate_relation_parameters, alphas);
            auto expected_result =
                Univariate<FF, 12>(std::array<FF, 12>{ 0, 0, 12, 36, 72, 120, 180, 252, 336, 432, 540, 660 });

            EXPECT_EQ(result_no_skipping, expected_result);
            EXPECT_EQ(result_with_skipping, expected_result);
        }
    };
    run_test(true);
    run_test(false);
};

// Check that the optimized combiner computation yields a result consistent with the unoptimized version
TEST(Protogalaxy, CombinerOptimizationConsistency)
{
    using DeciderProvingKey = DeciderProvingKey_<Flavor>;
    using DeciderProvingKeys = DeciderProvingKeys_<Flavor, NUM_KEYS>;
    using UltraArithmeticRelation = UltraArithmeticRelation<FF>;

    constexpr size_t UNIVARIATE_LENGTH = 12;
    const auto restrict_to_standard_arithmetic_relation = [](auto& polys) {
        std::fill(polys.q_arith.coeffs().begin(), polys.q_arith.coeffs().end(), 1);
        std::fill(polys.q_delta_range.coeffs().begin(), polys.q_delta_range.coeffs().end(), 0);
        std::fill(polys.q_elliptic.coeffs().begin(), polys.q_elliptic.coeffs().end(), 0);
        std::fill(polys.q_aux.coeffs().begin(), polys.q_aux.coeffs().end(), 0);
        std::fill(polys.q_lookup.coeffs().begin(), polys.q_lookup.coeffs().end(), 0);
        std::fill(polys.q_4.coeffs().begin(), polys.q_4.coeffs().end(), 0);
        std::fill(polys.w_4.coeffs().begin(), polys.w_4.coeffs().end(), 0);
        std::fill(polys.w_4_shift.coeffs().begin(), polys.w_4_shift.coeffs().end(), 0);
    };

    auto run_test = [&](bool is_random_input) {
        PGInternalTest pg_internal; // instance of the PG internal prover

        // Combiner test on prover polynomisls containing random values, restricted to only the standard arithmetic
        // relation.
        if (is_random_input) {
            std::vector<std::shared_ptr<DeciderProvingKey>> keys_data(NUM_KEYS);
            ASSERT(NUM_KEYS == 2); // Don't want to handle more here

            for (size_t idx = 0; idx < NUM_KEYS; idx++) {
                auto key = std::make_shared<DeciderProvingKey>();
                auto prover_polynomials = get_sequential_prover_polynomials<Flavor>(
                    /*log_circuit_size=*/1, idx * 128);
                restrict_to_standard_arithmetic_relation(prover_polynomials);
                key->polynomials = std::move(prover_polynomials);
                key->metadata.dyadic_size = 2;
                keys_data[idx] = key;
            }

            DeciderProvingKeys keys{ keys_data };
            PGInternalTest::UnivariateRelationSeparator alphas;
            alphas.fill(bb::Univariate<FF, UNIVARIATE_LENGTH>(FF(0))); // focus on the arithmetic relation only
            GateSeparatorPolynomial<FF> gate_separators({ 2 }, /*log_num_monomials=*/1);

            // Relation parameters are all zeroes
            RelationParameters<FF> relation_parameters;
            // Temporary accumulator to compute the sumcheck on the second key
            typename Flavor::TupleOfArraysOfValues temporary_accumulator;

            // Accumulate arithmetic relation over 2 rows on the second key
            for (size_t i = 0; i < 2; i++) {
                UltraArithmeticRelation::accumulate(std::get<0>(temporary_accumulator),
                                                    keys_data[NUM_KEYS - 1]->polynomials.get_row(i),
                                                    relation_parameters,
                                                    gate_separators[i]);
            }
            // Get the result of the 0th subrelation of the arithmetic relation
            FF key_offset = std::get<0>(temporary_accumulator)[0];
            // Subtract it from q_c[0] (it directly affect the target sum, making it zero and enabling the optimisation)
            keys_data[1]->polynomials.q_c.at(0) -= key_offset;
            std::vector<typename Flavor::ProverPolynomials>
                extended_polynomials; // These hold the extensions of prover polynomials

            // Manually extend all polynomials. Create new ProverPolynomials from extended values
            for (size_t idx = NUM_KEYS; idx < UNIVARIATE_LENGTH; idx++) {

                auto key = std::make_shared<DeciderProvingKey>();
                auto prover_polynomials = get_zero_prover_polynomials<Flavor>(1);
                for (auto [key_0_polynomial, key_1_polynomial, new_polynomial] :
                     zip_view(keys_data[0]->polynomials.get_all(),
                              keys_data[1]->polynomials.get_all(),
                              prover_polynomials.get_all())) {
                    for (size_t i = 0; i < /*circuit_size*/ 2; i++) {
                        new_polynomial.at(i) =
                            key_0_polynomial[i] + ((key_1_polynomial[i] - key_0_polynomial[i]) * idx);
                    }
                }
                extended_polynomials.push_back(std::move(prover_polynomials));
            }
            std::array<FF, UNIVARIATE_LENGTH> precomputed_result{ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
            // Compute the sum for each index separately, treating each extended key independently
            for (size_t idx = 0; idx < UNIVARIATE_LENGTH; idx++) {

                typename Flavor::TupleOfArraysOfValues accumulator;
                if (idx < NUM_KEYS) {
                    for (size_t i = 0; i < 2; i++) {
                        UltraArithmeticRelation::accumulate(std::get<0>(accumulator),
                                                            keys_data[idx]->polynomials.get_row(i),
                                                            relation_parameters,
                                                            gate_separators[i]);
                    }
                } else {
                    for (size_t i = 0; i < 2; i++) {
                        UltraArithmeticRelation::accumulate(std::get<0>(accumulator),
                                                            extended_polynomials[idx - NUM_KEYS].get_row(i),
                                                            relation_parameters,
                                                            gate_separators[i]);
                    }
                }
                precomputed_result[idx] = std::get<0>(accumulator)[0];
            }
            auto expected_result = Univariate<FF, UNIVARIATE_LENGTH>(precomputed_result);
            PGInternalTest::UnivariateRelationParametersNoOptimisticSkipping univariate_relation_parameters_no_skpping;
            PGInternalTest::UnivariateRelationParameters univariate_relation_parameters;
            auto result_no_skipping = pg_internal.compute_combiner_no_optimistic_skipping(
                keys, gate_separators, univariate_relation_parameters_no_skpping, alphas);
            auto result_with_skipping =
                pg_internal.compute_combiner(keys, gate_separators, univariate_relation_parameters, alphas);

            EXPECT_EQ(result_no_skipping, expected_result);
            EXPECT_EQ(result_with_skipping, expected_result);
        } else {
            std::vector<std::shared_ptr<DeciderProvingKey>> keys_data(NUM_KEYS);

            for (size_t idx = 0; idx < NUM_KEYS; idx++) {
                auto key = std::make_shared<DeciderProvingKey>();
                auto prover_polynomials = get_zero_prover_polynomials<Flavor>(
                    /*log_circuit_size=*/1);
                restrict_to_standard_arithmetic_relation(prover_polynomials);
                key->polynomials = std::move(prover_polynomials);
                key->metadata.dyadic_size = 2;
                keys_data[idx] = key;
            }

            DeciderProvingKeys keys{ keys_data };
            PGInternalTest::UnivariateRelationSeparator alphas;
            alphas.fill(bb::Univariate<FF, 12>(FF(0))); // focus on the arithmetic relation only

            const auto create_add_gate = [](auto& polys, const size_t idx, FF w_l, FF w_r) {
                polys.w_l.at(idx) = w_l;
                polys.w_r.at(idx) = w_r;
                polys.w_o.at(idx) = w_l + w_r;
                polys.q_l.at(idx) = 1;
                polys.q_r.at(idx) = 1;
                polys.q_o.at(idx) = -1;
            };

            const auto create_mul_gate = [](auto& polys, const size_t idx, FF w_l, FF w_r) {
                polys.w_l.at(idx) = w_l;
                polys.w_r.at(idx) = w_r;
                polys.w_o.at(idx) = w_l * w_r;
                polys.q_m.at(idx) = 1;
                polys.q_o.at(idx) = -1;
            };

            create_add_gate(keys[0]->polynomials, 0, 1, 2);
            create_add_gate(keys[0]->polynomials, 1, 0, 4);
            create_add_gate(keys[1]->polynomials, 0, 3, 4);
            create_mul_gate(keys[1]->polynomials, 1, 1, 4);

            restrict_to_standard_arithmetic_relation(keys[0]->polynomials);
            restrict_to_standard_arithmetic_relation(keys[1]->polynomials);

            /* DeciderProvingKey 0                            DeciderProvingKey 1
                w_l w_r w_o q_m q_l q_r q_o q_c               w_l w_r w_o q_m q_l q_r q_o q_c
                1   2   3   0   1   1   -1  0                 3   4   7   0   1   1   -1  0
                0   4   4   0   1   1   -1  0                 1   4   4   1   0   0   -1  0             */

            /* Lagrange-combined values, row index 0         Lagrange-combined values, row index 1
                in    0    1    2    3    4    5    6        in    0    1    2    3    4    5    6
                w_l   1    3    5    7    9   11   13        w_l   0    1    2    3    4    5    6
                w_r   2    4    6    8   10   12   14        w_r   4    4    4    4    4    4    4
                w_o   3    7   11   15   19   23   27        w_o   4    4    4    4    4    4    0
                q_m   0    0    0    0    0    0    0        q_m   0    1    2    3    4    5    6
                q_l   1    1    1    1    1    1    1        q_l   1    0   -1   -2   -3   -4   -5
                q_r   1    1    1    1    1    1    1        q_r   1    0   -1   -2   -3   -4   -5
                q_o  -1   -1   -1   -1   -1   -1   -1        q_o  -1   -1   -1   -1   -1   -1   -1
                q_c   0    0    0    0    0    0    0        q_c   0    0    0    0    0    0    0

            relation value:
                      0    0    0    0    0    0    0              0    0    6   18   36   60   90      */

            GateSeparatorPolynomial<FF> gate_separators({ 2 }, /*log_num_monomials=*/1);
            PGInternalTest::UnivariateRelationParametersNoOptimisticSkipping univariate_relation_parameters_no_skpping;
            PGInternalTest::UnivariateRelationParameters univariate_relation_parameters;
            auto result_no_skipping = pg_internal.compute_combiner_no_optimistic_skipping(
                keys, gate_separators, univariate_relation_parameters_no_skpping, alphas);
            auto result_with_skipping =
                pg_internal.compute_combiner(keys, gate_separators, univariate_relation_parameters, alphas);
            auto expected_result =
                Univariate<FF, 12>(std::array<FF, 12>{ 0, 0, 12, 36, 72, 120, 180, 252, 336, 432, 540, 660 });

            EXPECT_EQ(result_no_skipping, expected_result);
            EXPECT_EQ(result_with_skipping, expected_result);
        }
    };
    run_test(true);
    run_test(false);
};
