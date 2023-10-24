
#include "instances.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/honk/proof_system/grand_product_library.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/srs/factories/file_crs_factory.hpp"
#include <gtest/gtest.h>

namespace proof_system::honk::instance_tests {

template <class Flavor> class InstancesTests : public testing::Test {
    using FF = typename Flavor::FF;
    using Builder = typename Flavor::CircuitBuilder;

  public:
    static void test_parameters_to_univariates()
    {
        using Instances = ProverInstances_<Flavor, 2>;
        using Instance = typename Instances::Instance;

        Builder builder1;
        auto instance1 = std::make_shared<Instance>(builder1);
        instance1->relation_parameters.eta = 1;

        Builder builder2;
        builder2.add_variable(3);
        auto instance2 = std::make_shared<Instance>(builder2);
        instance2->relation_parameters.eta = 3;

        Instances instances{ { instance1, instance2 } };
        instances.parameters_to_univariates();

        Univariate<FF, 12> expected_eta{ { 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23 } };
        EXPECT_EQ(instances.relation_parameters.eta, expected_eta);
    };
};

using FlavorTypes = testing::Types<flavor::Ultra>;
TYPED_TEST_SUITE(InstancesTests, FlavorTypes);

TYPED_TEST(InstancesTests, ParametersToUnivariates)
{
    TestFixture::test_parameters_to_univariates();
}

} // namespace proof_system::honk::instance_tests