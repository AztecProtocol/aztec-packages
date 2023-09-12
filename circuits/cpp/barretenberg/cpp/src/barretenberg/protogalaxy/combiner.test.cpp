#include "barretenberg/protogalaxy/combiner.hpp"
#include "barretenberg/honk/flavor/standard.hpp"
#include "barretenberg/proof_system/relations/relation_parameters.hpp"
#include <gtest/gtest.h>

namespace barretenberg::test_protogalaxy_prover {
using Flavor = proof_system::honk::flavor::Standard;
using FF = typename Flavor::FF;
using RelationParameters = proof_system::RelationParameters<FF>;
const size_t NUM_POLYNOMIALS = Flavor::NUM_ALL_ENTITIES;

TEST(Protogalaxy, Combiner)
{
    auto run_test = [](bool is_random_input) {
        if (is_random_input) {
            std::array<std::array<FF, 2>, NUM_POLYNOMIALS> input_polynomials;
            for (size_t i = 0; i < NUM_POLYNOMIALS; ++i) {
                input_polynomials[i] = { FF::random_element(), FF::random_element() };
            }

            auto relation_parameters = RelationParameters::get_random();
            Instances<Flavor, 2> instances;
            ProtogalaxyProver<Flavor, Instances<Flavor, 2>> prover;
            auto pow_univariate = PowUnivariate<FF>(2);
            FF alpha;

            [[maybe_unused]] auto result =
                prover.compute_combiner(instances, relation_parameters, pow_univariate, alpha);
        }
    };
    run_test(true);
};

} // namespace barretenberg::test_protogalaxy_prover
