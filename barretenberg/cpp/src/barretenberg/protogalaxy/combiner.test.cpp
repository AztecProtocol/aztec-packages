// #include "barretenberg/honk/utils/testing.hpp"
// #include "barretenberg/protogalaxy/protogalaxy_prover_internal.hpp"
// #include "barretenberg/relations/ultra_arithmetic_relation.hpp"
// #include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"
// #include "barretenberg/ultra_honk/decider_keys.hpp"
// #include <gtest/gtest.h>

// using namespace bb;

// using Flavor = MegaFlavor;
// using Polynomial = typename Flavor::Polynomial;
// using FF = typename Flavor::FF;

// // TODO(https://github.com/AztecProtocol/barretenberg/issues/780): Improve combiner tests to check more than the
// // arithmetic relation so we more than unit test folding relation parameters and alpha as well.
// TEST(Protogalaxy, CombinerOn2Keys)
// {
//     constexpr size_t NUM_KEYS = 2;
//     using DeciderProvingKey = DeciderProvingKey_<Flavor>;
//     using DeciderProvingKeys = DeciderProvingKeys_<Flavor, NUM_KEYS>;
//     using PGInternal = ProtogalaxyProverInternal<DeciderProvingKeys>;

//     const auto restrict_to_standard_arithmetic_relation = [](auto& polys) {
//         std::fill(polys.q_arith.coeffs().begin(), polys.q_arith.coeffs().end(), 1);
//         std::fill(polys.q_delta_range.coeffs().begin(), polys.q_delta_range.coeffs().end(), 0);
//         std::fill(polys.q_elliptic.coeffs().begin(), polys.q_elliptic.coeffs().end(), 0);
//         std::fill(polys.q_aux.coeffs().begin(), polys.q_aux.coeffs().end(), 0);
//         std::fill(polys.q_lookup.coeffs().begin(), polys.q_lookup.coeffs().end(), 0);
//         std::fill(polys.q_4.coeffs().begin(), polys.q_4.coeffs().end(), 0);
//         std::fill(polys.q_poseidon2_external.coeffs().begin(), polys.q_poseidon2_external.coeffs().end(), 0);
//         std::fill(polys.q_poseidon2_internal.coeffs().begin(), polys.q_poseidon2_internal.coeffs().end(), 0);
//         std::fill(polys.w_4.coeffs().begin(), polys.w_4.coeffs().end(), 0);
//         std::fill(polys.w_4_shift.coeffs().begin(), polys.w_4_shift.coeffs().end(), 0);
//     };

//     auto run_test = [&](bool is_random_input) {
//         PGInternal pg_internal; // instance of the PG internal prover

//         // Combiner test on prover polynomials containing random values, restricted to only the standard arithmetic
//         // relation.
//         if (is_random_input) {
//             std::vector<std::shared_ptr<DeciderProvingKey>> keys_data(NUM_KEYS);

//             for (size_t idx = 0; idx < NUM_KEYS; idx++) {
//                 auto key = std::make_shared<DeciderProvingKey>();
//                 auto prover_polynomials = get_sequential_prover_polynomials<Flavor>(
//                     /*log_circuit_size=*/1, idx * 128);
//                 restrict_to_standard_arithmetic_relation(prover_polynomials);
//                 key->proving_key.polynomials = std::move(prover_polynomials);
//                 key->proving_key.circuit_size = 2;
//                 key->proving_key.log_circuit_size = 1;
//                 keys_data[idx] = key;
//             }

//             DeciderProvingKeys keys{ keys_data };
//             PGInternal::UnivariateRelationSeparator alphas;
//             alphas.fill(bb::Univariate<FF, 12>(FF(0))); // focus on the arithmetic relation only
//             GateSeparatorPolynomial<FF> gate_separators({ 2 }, /*log_num_monomials=*/1);
//             PGInternal::UnivariateRelationParametersNoOptimisticSkipping univariate_relation_parameters_no_skpping;
//             auto result_no_skipping = pg_internal.compute_combiner_no_optimistic_skipping(
//                 keys, gate_separators, univariate_relation_parameters_no_skpping, alphas);
//             // The expected_result values are computed by running the python script combiner_example_gen.py
//             auto expected_result = Univariate<FF, 12>(std::array<FF, 12>{ 11480UL,
//                                                                           14117208UL,
//                                                                           78456280UL,
//                                                                           230777432UL,
//                                                                           508829400UL,
//                                                                           950360920UL,
//                                                                           1593120728UL,
//                                                                           2474857560UL,
//                                                                           3633320152UL,
//                                                                           5106257240UL,
//                                                                           6931417560UL,
//                                                                           9146549848UL });
//             EXPECT_EQ(result_no_skipping, expected_result);
//         } else {
//             std::vector<std::shared_ptr<DeciderProvingKey>> keys_data(NUM_KEYS);

//             for (size_t idx = 0; idx < NUM_KEYS; idx++) {
//                 auto key = std::make_shared<DeciderProvingKey>();
//                 auto prover_polynomials = get_zero_prover_polynomials<Flavor>(
//                     /*log_circuit_size=*/1);
//                 restrict_to_standard_arithmetic_relation(prover_polynomials);
//                 key->proving_key.polynomials = std::move(prover_polynomials);
//                 key->proving_key.circuit_size = 2;
//                 key->proving_key.log_circuit_size = 1;
//                 keys_data[idx] = key;
//             }

//             DeciderProvingKeys keys{ keys_data };
//             PGInternal::UnivariateRelationSeparator alphas;
//             alphas.fill(bb::Univariate<FF, 12>(FF(0))); // focus on the arithmetic relation only

//             const auto create_add_gate = [](auto& polys, const size_t idx, FF w_l, FF w_r) {
//                 polys.w_l.at(idx) = w_l;
//                 polys.w_r.at(idx) = w_r;
//                 polys.w_o.at(idx) = w_l + w_r;
//                 polys.q_l.at(idx) = 1;
//                 polys.q_r.at(idx) = 1;
//                 polys.q_o.at(idx) = -1;
//             };

//             const auto create_mul_gate = [](auto& polys, const size_t idx, FF w_l, FF w_r) {
//                 polys.w_l.at(idx) = w_l;
//                 polys.w_r.at(idx) = w_r;
//                 polys.w_o.at(idx) = w_l * w_r;
//                 polys.q_m.at(idx) = 1;
//                 polys.q_o.at(idx) = -1;
//             };

//             create_add_gate(keys[0]->proving_key.polynomials, 0, 1, 2);
//             create_add_gate(keys[0]->proving_key.polynomials, 1, 0, 4);
//             create_add_gate(keys[1]->proving_key.polynomials, 0, 3, 4);
//             create_mul_gate(keys[1]->proving_key.polynomials, 1, 1, 4);

//             restrict_to_standard_arithmetic_relation(keys[0]->proving_key.polynomials);
//             restrict_to_standard_arithmetic_relation(keys[1]->proving_key.polynomials);

//             /* DeciderProvingKey 0                            DeciderProvingKey 1
//                 w_l w_r w_o q_m q_l q_r q_o q_c               w_l w_r w_o q_m q_l q_r q_o q_c
//                 1   2   3   0   1   1   -1  0                 3   4   7   0   1   1   -1  0
//                 0   4   4   0   1   1   -1  0                 1   4   4   1   0   0   -1  0             */

//             /* Lagrange-combined values, row index 0         Lagrange-combined values, row index 1
//                 in    0    1    2    3    4    5    6        in    0    1    2    3    4    5    6
//                 w_l   1    3    5    7    9   11   13        w_l   0    1    2    3    4    5    6
//                 w_r   2    4    6    8   10   12   14        w_r   4    4    4    4    4    4    4
//                 w_o   3    7   11   15   19   23   27        w_o   4    4    4    4    4    4    0
//                 q_m   0    0    0    0    0    0    0        q_m   0    1    2    3    4    5    6
//                 q_l   1    1    1    1    1    1    1        q_l   1    0   -1   -2   -3   -4   -5
//                 q_r   1    1    1    1    1    1    1        q_r   1    0   -1   -2   -3   -4   -5
//                 q_o  -1   -1   -1   -1   -1   -1   -1        q_o  -1   -1   -1   -1   -1   -1   -1
//                 q_c   0    0    0    0    0    0    0        q_c   0    0    0    0    0    0    0

//             relation value:
//                       0    0    0    0    0    0    0              0    0    6   18   36   60   90      */

//             GateSeparatorPolynomial<FF> gate_separators({ 2 }, /*log_num_monomials=*/1);
//             PGInternal::UnivariateRelationParametersNoOptimisticSkipping univariate_relation_parameters_no_skpping;
//             PGInternal::UnivariateRelationParameters univariate_relation_parameters;
//             auto result_no_skipping = pg_internal.compute_combiner_no_optimistic_skipping(
//                 keys, gate_separators, univariate_relation_parameters_no_skpping, alphas);
//             auto result_with_skipping =
//                 pg_internal.compute_combiner(keys, gate_separators, univariate_relation_parameters, alphas);
//             auto expected_result =
//                 Univariate<FF, 12>(std::array<FF, 12>{ 0, 0, 12, 36, 72, 120, 180, 252, 336, 432, 540, 660 });

//             EXPECT_EQ(result_no_skipping, expected_result);
//             EXPECT_EQ(result_with_skipping, expected_result);
//         }
//     };
//     run_test(true);
//     run_test(false);
// };

// // Check that the optimized combiner computation yields a result consistent with the unoptimized version
// TEST(Protogalaxy, CombinerOptimizationConsistency)
// {
//     constexpr size_t NUM_KEYS = 2;
//     using DeciderProvingKey = DeciderProvingKey_<Flavor>;
//     using DeciderProvingKeys = DeciderProvingKeys_<Flavor, NUM_KEYS>;
//     using PGInternal = ProtogalaxyProverInternal<DeciderProvingKeys>;
//     using UltraArithmeticRelation = UltraArithmeticRelation<FF>;

//     constexpr size_t UNIVARIATE_LENGTH = 12;
//     const auto restrict_to_standard_arithmetic_relation = [](auto& polys) {
//         std::fill(polys.q_arith.coeffs().begin(), polys.q_arith.coeffs().end(), 1);
//         std::fill(polys.q_delta_range.coeffs().begin(), polys.q_delta_range.coeffs().end(), 0);
//         std::fill(polys.q_elliptic.coeffs().begin(), polys.q_elliptic.coeffs().end(), 0);
//         std::fill(polys.q_aux.coeffs().begin(), polys.q_aux.coeffs().end(), 0);
//         std::fill(polys.q_lookup.coeffs().begin(), polys.q_lookup.coeffs().end(), 0);
//         std::fill(polys.q_4.coeffs().begin(), polys.q_4.coeffs().end(), 0);
//         std::fill(polys.w_4.coeffs().begin(), polys.w_4.coeffs().end(), 0);
//         std::fill(polys.w_4_shift.coeffs().begin(), polys.w_4_shift.coeffs().end(), 0);
//     };

//     auto run_test = [&](bool is_random_input) {
//         PGInternal pg_internal; // instance of the PG internal prover

//         // Combiner test on prover polynomisls containing random values, restricted to only the standard arithmetic
//         // relation.
//         if (is_random_input) {
//             std::vector<std::shared_ptr<DeciderProvingKey>> keys_data(NUM_KEYS);
//             ASSERT(NUM_KEYS == 2); // Don't want to handle more here

//             for (size_t idx = 0; idx < NUM_KEYS; idx++) {
//                 auto key = std::make_shared<DeciderProvingKey>();
//                 auto prover_polynomials = get_sequential_prover_polynomials<Flavor>(
//                     /*log_circuit_size=*/1, idx * 128);
//                 restrict_to_standard_arithmetic_relation(prover_polynomials);
//                 key->proving_key.polynomials = std::move(prover_polynomials);
//                 key->proving_key.circuit_size = 2;
//                 key->proving_key.log_circuit_size = 1;
//                 keys_data[idx] = key;
//             }

//             DeciderProvingKeys keys{ keys_data };
//             PGInternal::UnivariateRelationSeparator alphas;
//             alphas.fill(bb::Univariate<FF, UNIVARIATE_LENGTH>(FF(0))); // focus on the arithmetic relation only
//             GateSeparatorPolynomial<FF> gate_separators({ 2 }, /*log_num_monomials=*/1);

//             // Relation parameters are all zeroes
//             RelationParameters<FF> relation_parameters;
//             // Temporary accumulator to compute the sumcheck on the second key
//             typename Flavor::TupleOfArraysOfValues temporary_accumulator;

//             // Accumulate arithmetic relation over 2 rows on the second key
//             for (size_t i = 0; i < 2; i++) {
//                 UltraArithmeticRelation::accumulate(std::get<0>(temporary_accumulator),
//                                                     keys_data[NUM_KEYS - 1]->proving_key.polynomials.get_row(i),
//                                                     relation_parameters,
//                                                     gate_separators[i]);
//             }
//             // Get the result of the 0th subrelation of the arithmetic relation
//             FF key_offset = std::get<0>(temporary_accumulator)[0];
//             // Subtract it from q_c[0] (it directly affect the target sum, making it zero and enabling the
//             optimisation) keys_data[1]->proving_key.polynomials.q_c.at(0) -= key_offset; std::vector<typename
//             Flavor::ProverPolynomials>
//                 extended_polynomials; // These hold the extensions of prover polynomials

//             // Manually extend all polynomials. Create new ProverPolynomials from extended values
//             for (size_t idx = NUM_KEYS; idx < UNIVARIATE_LENGTH; idx++) {

//                 auto key = std::make_shared<DeciderProvingKey>();
//                 auto prover_polynomials = get_zero_prover_polynomials<Flavor>(1);
//                 for (auto [key_0_polynomial, key_1_polynomial, new_polynomial] :
//                      zip_view(keys_data[0]->proving_key.polynomials.get_all(),
//                               keys_data[1]->proving_key.polynomials.get_all(),
//                               prover_polynomials.get_all())) {
//                     for (size_t i = 0; i < /*circuit_size*/ 2; i++) {
//                         new_polynomial.at(i) =
//                             key_0_polynomial[i] + ((key_1_polynomial[i] - key_0_polynomial[i]) * idx);
//                     }
//                 }
//                 extended_polynomials.push_back(std::move(prover_polynomials));
//             }
//             std::array<FF, UNIVARIATE_LENGTH> precomputed_result{ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
//             // Compute the sum for each index separately, treating each extended key independently
//             for (size_t idx = 0; idx < UNIVARIATE_LENGTH; idx++) {

//                 typename Flavor::TupleOfArraysOfValues accumulator;
//                 if (idx < NUM_KEYS) {
//                     for (size_t i = 0; i < 2; i++) {
//                         UltraArithmeticRelation::accumulate(std::get<0>(accumulator),
//                                                             keys_data[idx]->proving_key.polynomials.get_row(i),
//                                                             relation_parameters,
//                                                             gate_separators[i]);
//                     }
//                 } else {
//                     for (size_t i = 0; i < 2; i++) {
//                         UltraArithmeticRelation::accumulate(std::get<0>(accumulator),
//                                                             extended_polynomials[idx - NUM_KEYS].get_row(i),
//                                                             relation_parameters,
//                                                             gate_separators[i]);
//                     }
//                 }
//                 precomputed_result[idx] = std::get<0>(accumulator)[0];
//             }
//             auto expected_result = Univariate<FF, UNIVARIATE_LENGTH>(precomputed_result);
//             PGInternal::UnivariateRelationParametersNoOptimisticSkipping univariate_relation_parameters_no_skpping;
//             PGInternal::UnivariateRelationParameters univariate_relation_parameters;
//             auto result_no_skipping = pg_internal.compute_combiner_no_optimistic_skipping(
//                 keys, gate_separators, univariate_relation_parameters_no_skpping, alphas);
//             auto result_with_skipping =
//                 pg_internal.compute_combiner(keys, gate_separators, univariate_relation_parameters, alphas);

//             EXPECT_EQ(result_no_skipping, expected_result);
//             EXPECT_EQ(result_with_skipping, expected_result);
//         } else {
//             std::vector<std::shared_ptr<DeciderProvingKey>> keys_data(NUM_KEYS);

//             for (size_t idx = 0; idx < NUM_KEYS; idx++) {
//                 auto key = std::make_shared<DeciderProvingKey>();
//                 auto prover_polynomials = get_zero_prover_polynomials<Flavor>(
//                     /*log_circuit_size=*/1);
//                 restrict_to_standard_arithmetic_relation(prover_polynomials);
//                 key->proving_key.polynomials = std::move(prover_polynomials);
//                 key->proving_key.circuit_size = 2;
//                 key->proving_key.log_circuit_size = 1;
//                 keys_data[idx] = key;
//             }

//             DeciderProvingKeys keys{ keys_data };
//             PGInternal::UnivariateRelationSeparator alphas;
//             alphas.fill(bb::Univariate<FF, 12>(FF(0))); // focus on the arithmetic relation only

//             const auto create_add_gate = [](auto& polys, const size_t idx, FF w_l, FF w_r) {
//                 polys.w_l.at(idx) = w_l;
//                 polys.w_r.at(idx) = w_r;
//                 polys.w_o.at(idx) = w_l + w_r;
//                 polys.q_l.at(idx) = 1;
//                 polys.q_r.at(idx) = 1;
//                 polys.q_o.at(idx) = -1;
//             };

//             const auto create_mul_gate = [](auto& polys, const size_t idx, FF w_l, FF w_r) {
//                 polys.w_l.at(idx) = w_l;
//                 polys.w_r.at(idx) = w_r;
//                 polys.w_o.at(idx) = w_l * w_r;
//                 polys.q_m.at(idx) = 1;
//                 polys.q_o.at(idx) = -1;
//             };

//             create_add_gate(keys[0]->proving_key.polynomials, 0, 1, 2);
//             create_add_gate(keys[0]->proving_key.polynomials, 1, 0, 4);
//             create_add_gate(keys[1]->proving_key.polynomials, 0, 3, 4);
//             create_mul_gate(keys[1]->proving_key.polynomials, 1, 1, 4);

//             restrict_to_standard_arithmetic_relation(keys[0]->proving_key.polynomials);
//             restrict_to_standard_arithmetic_relation(keys[1]->proving_key.polynomials);

//             /* DeciderProvingKey 0                            DeciderProvingKey 1
//                 w_l w_r w_o q_m q_l q_r q_o q_c               w_l w_r w_o q_m q_l q_r q_o q_c
//                 1   2   3   0   1   1   -1  0                 3   4   7   0   1   1   -1  0
//                 0   4   4   0   1   1   -1  0                 1   4   4   1   0   0   -1  0             */

//             /* Lagrange-combined values, row index 0         Lagrange-combined values, row index 1
//                 in    0    1    2    3    4    5    6        in    0    1    2    3    4    5    6
//                 w_l   1    3    5    7    9   11   13        w_l   0    1    2    3    4    5    6
//                 w_r   2    4    6    8   10   12   14        w_r   4    4    4    4    4    4    4
//                 w_o   3    7   11   15   19   23   27        w_o   4    4    4    4    4    4    0
//                 q_m   0    0    0    0    0    0    0        q_m   0    1    2    3    4    5    6
//                 q_l   1    1    1    1    1    1    1        q_l   1    0   -1   -2   -3   -4   -5
//                 q_r   1    1    1    1    1    1    1        q_r   1    0   -1   -2   -3   -4   -5
//                 q_o  -1   -1   -1   -1   -1   -1   -1        q_o  -1   -1   -1   -1   -1   -1   -1
//                 q_c   0    0    0    0    0    0    0        q_c   0    0    0    0    0    0    0

//             relation value:
//                       0    0    0    0    0    0    0              0    0    6   18   36   60   90      */

//             GateSeparatorPolynomial<FF> gate_separators({ 2 }, /*log_num_monomials=*/1);
//             PGInternal::UnivariateRelationParametersNoOptimisticSkipping univariate_relation_parameters_no_skpping;
//             PGInternal::UnivariateRelationParameters univariate_relation_parameters;
//             auto result_no_skipping = pg_internal.compute_combiner_no_optimistic_skipping(
//                 keys, gate_separators, univariate_relation_parameters_no_skpping, alphas);
//             auto result_with_skipping =
//                 pg_internal.compute_combiner(keys, gate_separators, univariate_relation_parameters, alphas);
//             auto expected_result =
//                 Univariate<FF, 12>(std::array<FF, 12>{ 0, 0, 12, 36, 72, 120, 180, 252, 336, 432, 540, 660 });

//             EXPECT_EQ(result_no_skipping, expected_result);
//             EXPECT_EQ(result_with_skipping, expected_result);
//         }
//     };
//     run_test(true);
//     run_test(false);
// };