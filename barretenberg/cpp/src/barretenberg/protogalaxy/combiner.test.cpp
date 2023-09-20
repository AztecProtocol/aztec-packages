#include "barretenberg/protogalaxy/combiner.hpp"
#include "barretenberg/honk/flavor/standard.hpp"
#include "barretenberg/honk/utils/testing.hpp"
#include "barretenberg/proof_system/relations/relation_parameters.hpp"
#include <gtest/gtest.h>

namespace barretenberg::test_protogalaxy_prover {
using Flavor = proof_system::honk::flavor::Standard;
using Polynomial = typename Flavor::Polynomial;
using FF = typename Flavor::FF;
using RelationParameters = proof_system::RelationParameters<FF>;

TEST(Protogalaxy, Combiner)
{
    constexpr size_t NUM_INSTANCES = 2;
    auto run_test = [](bool is_random_input) {
        if (is_random_input) {
            Instances<Flavor, NUM_INSTANCES> instances;
            std::array<std::array<Polynomial, Flavor::NUM_ALL_ENTITIES>, NUM_INSTANCES> storage_arrays;
            auto relation_parameters = RelationParameters::get_random();
            ProtogalaxyProver<Flavor, Instances<Flavor, NUM_INSTANCES>> prover;
            auto pow_univariate = PowUnivariate<FF>(/*zeta_pow=*/2);
            auto alpha = FF(0); // focus on the arithmetic relation only

            size_t instance_idx = 0;
            for (auto& instance : instances) {
                auto [storage, prover_polynomials] = proof_system::honk::get_sequential_prover_polynomials<Flavor>(
                    /*log_circuit_size=*/1, instance_idx * 64);
                storage_arrays[instance_idx] = std::move(storage);
                instance = prover_polynomials;
                instance_idx++;
            }

            auto result = prover.compute_combiner(instances, relation_parameters, pow_univariate, alpha);
            auto expected_result = barretenberg::Univariate<FF, 6>(
                std::array<FF, 6>{ 21150, 3778492, 30367578, 117758328, 322795030, 721196340 });
            EXPECT_EQ(result, expected_result);
        } else {
            Instances<Flavor, NUM_INSTANCES> instances;
            std::array<std::array<Polynomial, Flavor::NUM_ALL_ENTITIES>, NUM_INSTANCES> storage_arrays;
            auto relation_parameters = RelationParameters();
            ProtogalaxyProver<Flavor, Instances<Flavor, NUM_INSTANCES>> prover;
            auto pow_univariate = PowUnivariate<FF>(/*zeta_pow=*/2);
            auto alpha = FF(0); // focus on the arithmetic relation only

            size_t instance_idx = 0;
            for (auto& instance : instances) {
                auto [storage, prover_polynomials] =
                    proof_system::honk::get_zero_prover_polynomials<Flavor>(/*log_circuit_size=*/1);
                storage_arrays[instance_idx] = std::move(storage);
                instance = prover_polynomials;
                instance_idx++;
            }

            const auto create_add_gate = [](auto& polys, const size_t idx, FF w_l, FF w_r) {
                polys.w_l[idx] = w_l;
                polys.w_r[idx] = w_r;
                polys.w_o[idx] = w_l + w_r;
                polys.q_l[idx] = 1;
                polys.q_r[idx] = 1;
                polys.q_o[idx] = -1;
            };

            create_add_gate(instances[0], 0, 1, 2);
            create_add_gate(instances[0], 1, 2, 3);
            create_add_gate(instances[1], 0, 3, 4);
            create_add_gate(instances[1], 1, 4, 5);

            /* Instance 0                               Instance 1
                w_l w_r w_o q_m q_l q_r q_o q_c          w_l w_r w_o q_m q_l q_r q_o q_c
                1   2   3   0   1   1   -1  0            3   4   7   0   1   1   -1  0
                2   3   5   0   1   1   -1  0            4   5  10   0   1   1   -1  1        */

            /* Lagrange-combined values, row index 0    Lagrange-combined values, row index 1
                in    0    1    2    3    4    5         in    0    1    2    3    4    5
                w_l   1    3    5    7    9   11         w_l   2    4    6    8   10   12
                w_r   2    4    6    8   10   12         w_r   3    5    7    9   11   13
                w_o   3    7   11   15   19   23         w_o   5   10   15   20   25   30
                q_m   0    0    0    0    0    0         q_m   0    0    0    0    0    0
                q_l   1    1    1    1    1    1         q_l   1    1    1    1    1    1
                q_r   1    1    1    1    1    1         q_r   1    1s    1    1    1    1
                q_o  -1   -1   -1   -1   -1   -1         q_o  -1   -1   -1   -1   -1   -1
                q_c   0    0    0    0    0    0         q_c   0    1    2    3    4    5     */

            /* sanity check */
            EXPECT_EQ(instances[0].q_c[0], FF(0));
            EXPECT_EQ(instances[0].w_o[1], FF(5));
            EXPECT_EQ(instances[1].q_m[0], FF(0));
            EXPECT_EQ(instances[1].w_r[1], FF(5));

            auto result = prover.compute_combiner(instances, relation_parameters, pow_univariate, alpha);
            auto expected_result = barretenberg::Univariate<FF, 6>(std::array<FF, 6>{ 0, 0, 0, 0, 0, 0 }); // WORKTODO
            EXPECT_EQ(result, expected_result);
        }
    };
    run_test(true);
    run_test(false);
};

} // namespace barretenberg::test_protogalaxy_prover
