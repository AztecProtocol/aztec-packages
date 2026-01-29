#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/pairing_points.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"
#include <gtest/gtest.h>

namespace bb::stdlib::recursion {

template <typename Builder> class PairingPointsTests : public testing::Test {
  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

using Curves = testing::Types<stdlib::bn254<UltraCircuitBuilder>, stdlib::bn254<MegaCircuitBuilder>>;
TYPED_TEST_SUITE(PairingPointsTests, Curves);

TYPED_TEST(PairingPointsTests, ConstructDefault)
{
    static constexpr size_t NUM_GATES_ADDED = 28;

    typename TypeParam::Builder builder;

    size_t num_gates = builder.num_gates();
    PairingPoints<TypeParam>::set_default_to_public(&builder);
    EXPECT_EQ(NUM_GATES_ADDED, builder.num_gates() - num_gates)
        << "There has been a change in the number of gates required to set default PairingPoints as public inputs.";

    EXPECT_TRUE(CircuitChecker::check(builder));
}

TYPED_TEST(PairingPointsTests, TestDefault)
{
    using Builder = TypeParam::Builder;
    using Group = PairingPoints<TypeParam>::Group;
    using CommitmentKey = bb::CommitmentKey<curve::BN254>;

    Builder builder;

    Group P0(DEFAULT_PAIRING_POINTS_P0_X, DEFAULT_PAIRING_POINTS_P0_Y, /*assert_on_curve=*/false);
    Group P1(DEFAULT_PAIRING_POINTS_P1_X, DEFAULT_PAIRING_POINTS_P1_Y, /*assert_on_curve=*/false);
    P0.convert_constant_to_fixed_witness(&builder);
    P1.convert_constant_to_fixed_witness(&builder);
    PairingPoints<TypeParam> pp(P0, P1);
    pp.set_public();
    EXPECT_TRUE(CircuitChecker::check(builder));

    // Validate default PairingPoints
    CommitmentKey commitment_key;
    bb::PairingPoints<curve::BN254> native_pp(P0.get_value(), P1.get_value());
    EXPECT_TRUE(native_pp.check()) << "Default PairingPoints are not valid pairing points.";
}

TYPED_TEST(PairingPointsTests, TaggingMechanismWorks)
{
    using Curve = TypeParam;
    using Builder = typename Curve::Builder;
    using PairingPoints = PairingPoints<Curve>;
    using Group = PairingPoints::Group;
    using Fr = PairingPoints::Fr;
    using NativeFr = typename Curve::ScalarFieldNative;

    Builder builder;

    Fr scalar_one = Fr::from_witness(&builder, NativeFr::random_element());
    Fr scalar_two = Fr::from_witness(&builder, NativeFr::random_element());
    Group P0 = Group::batch_mul({ Group::one(&builder) }, { scalar_one });
    Group P1 = Group::batch_mul({ Group::one(&builder) }, { scalar_two });

    // Check that no pairing points exist
    EXPECT_TRUE(builder.pairing_points_tagging.has_single_pairing_point_tag());

    PairingPoints pp_one = { P0, P1 };
    PairingPoints pp_two = { P0, P1 };

    // Check the tags
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_one.tag_index), 0U);
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_two.tag_index), 1U);

    // Check that there are two different pairing points in the builder
    EXPECT_FALSE(builder.pairing_points_tagging.has_single_pairing_point_tag());

    // Merge the tags
    pp_one.aggregate(pp_two);

    // Check that the tags have been merged
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_two.tag_index), 0U);
    EXPECT_TRUE(builder.pairing_points_tagging.has_single_pairing_point_tag());

    // Create two new pairing points and aggregate with aggregate_multiple
    PairingPoints pp_three = { P0, P1 };
    PairingPoints pp_four = { P0, P1 };

    // Check the tags
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_three.tag_index), 2U);
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_four.tag_index), 3U);

    // Check that there are two different pairing points in the builder
    EXPECT_FALSE(builder.pairing_points_tagging.has_single_pairing_point_tag());

    // Merge the tags
    std::vector<PairingPoints> pp_to_be_aggregated = { pp_one, pp_three, pp_four };
    PairingPoints aggregated_pp = PairingPoints::aggregate_multiple(pp_to_be_aggregated);

    // Check that the tags have been merged
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_one.tag_index), 4U);
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_two.tag_index), 4U);
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_three.tag_index), 4U);
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_four.tag_index), 4U);
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(aggregated_pp.tag_index), 4U);
    EXPECT_TRUE(builder.pairing_points_tagging.has_single_pairing_point_tag());
}

TYPED_TEST(PairingPointsTests, TaggingMechanismFails)
{

    using Curve = TypeParam;
    using Builder = typename Curve::Builder;
    using PairingPoints = PairingPoints<Curve>;
    using Group = PairingPoints::Group;
    using Fr = PairingPoints::Fr;
    using NativeFr = typename Curve::ScalarFieldNative;
    using Flavor = std::conditional_t<IsMegaBuilder<Builder>, MegaFlavor, UltraFlavor>;
    using ProverInstance = ProverInstance_<Flavor>;

    Builder builder;

    Fr scalar_one = Fr::from_witness(&builder, NativeFr::random_element());
    Fr scalar_two = Fr::from_witness(&builder, NativeFr::random_element());
    Group P0 = Group::batch_mul({ Group::one(&builder) }, { scalar_one });
    Group P1 = Group::batch_mul({ Group::one(&builder) }, { scalar_two });

    PairingPoints pp_one = { P0, P1 };
    PairingPoints pp_two = { P0, P1 };
    PairingPoints pp_three = { P0, P1 };

    // Check the tags
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_one.tag_index), 0U);
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_two.tag_index), 1U);
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_three.tag_index), 2U);

    // Check that there are different pairing points in the builder
    EXPECT_FALSE(builder.pairing_points_tagging.has_single_pairing_point_tag());

    // Merge the tags
    pp_one.aggregate(pp_two);

    // Check that the tags have not been merged
    EXPECT_FALSE(builder.pairing_points_tagging.has_single_pairing_point_tag());

    // Create a ProverInstance, expect failure because pairing points have not been aggregated
    EXPECT_THROW_WITH_MESSAGE(
        ProverInstance prover_instance(builder),
        "Pairing points must all be aggregated together. Either no pairing points should be created, or "
        "all created pairing points must be aggregated into a single pairing point. Found 2 different "
        "pairing points");

    // Aggregate pairing points
    pp_one.aggregate(pp_three);

    // Create a ProverInstance, expect failure because pairing points have not been set to public
    EXPECT_THROW_WITH_MESSAGE(
        ProverInstance prover_instance(builder),
        "Pairing points must be set to public in the circuit before constructing the ProverInstance.");

    stdlib::recursion::honk::DefaultIO<Builder> inputs;
    inputs.pairing_inputs = pp_one;
    inputs.set_public();

    // Construct Prover instance successfully
    ProverInstance prover_instance(builder);
}

TYPED_TEST(PairingPointsTests, CopyConstructorWorks)
{
    using Curve = TypeParam;
    using Builder = typename Curve::Builder;

    using PairingPoints = PairingPoints<Curve>;
    using Group = PairingPoints::Group;
    using Fr = Curve::ScalarField;
    using NativeFr = Curve::ScalarFieldNative;

    Builder builder;

    Fr scalar_one = Fr::from_witness(&builder, NativeFr::random_element());
    Fr scalar_two = Fr::from_witness(&builder, NativeFr::random_element());
    Group P0 = Group::batch_mul({ Group::one(&builder) }, { scalar_one });
    Group P1 = Group::batch_mul({ Group::one(&builder) }, { scalar_two });

    PairingPoints pp_original = { P0, P1 };
    PairingPoints pp_copy(pp_original);

    // Check that there is only one tag
    EXPECT_TRUE(builder.pairing_points_tagging.has_single_pairing_point_tag());

    // Check that the tags are the same
    BB_ASSERT_EQ(builder.pairing_points_tagging.get_tag(pp_original.tag_index),
                 builder.pairing_points_tagging.get_tag(pp_copy.tag_index));
}

TYPED_TEST(PairingPointsTests, AggregateMultipleWithDuplicatePoints)
{
    using Curve = TypeParam;
    using Builder = typename Curve::Builder;
    using PairingPoints = PairingPoints<Curve>;
    using Group = PairingPoints::Group;

    Builder builder;

    // Use default pairing points that are known to satisfy the pairing equation
    Group P0(DEFAULT_PAIRING_POINTS_P0_X, DEFAULT_PAIRING_POINTS_P0_Y, /*assert_on_curve=*/false);
    Group P1(DEFAULT_PAIRING_POINTS_P1_X, DEFAULT_PAIRING_POINTS_P1_Y, /*assert_on_curve=*/false);
    P0.convert_constant_to_fixed_witness(&builder);
    P1.convert_constant_to_fixed_witness(&builder);

    // Create duplicate pairing points (same P0, P1)
    PairingPoints pp_first = { P0, P1 };
    PairingPoints pp_second = { P0, P1 }; // Duplicate
    PairingPoints pp_third = { P0, P1 };  // Another duplicate

    // Test aggregate_multiple with all duplicate points
    // The n-1 optimization computes: P_agg = P₀ + r₁·P₁ + r₂·P₂
    // With duplicates: P_agg = P + r₁·P + r₂·P = (1 + r₁ + r₂)·P
    // This tests that the optimization handles the edge case where first point equals others
    std::vector<PairingPoints> pp_vector = { pp_first, pp_second, pp_third };
    PairingPoints aggregated = PairingPoints::aggregate_multiple(pp_vector);

    // Circuit should be valid
    EXPECT_TRUE(CircuitChecker::check(builder));

    // Verify tags are properly merged
    EXPECT_TRUE(builder.pairing_points_tagging.has_single_pairing_point_tag());

    // Verify the result is exactly what we expect: (1 + r₁ + r₂)·(P0, P1)
    // We replicate the challenge generation to compute the expected scalar
    using Fr = typename Curve::ScalarField;
    bb::StdlibTranscript<Builder> transcript{};
    for (size_t idx = 0; idx < 3; ++idx) {
        transcript.add_to_hash_buffer("first_component_" + std::to_string(idx), pp_vector[idx].P0);
        transcript.add_to_hash_buffer("second_component_" + std::to_string(idx), pp_vector[idx].P1);
    }
    std::array<std::string, 2> challenge_labels = { "pp_aggregation_challenge_1", "pp_aggregation_challenge_2" };
    std::array<Fr, 2> challenges = transcript.template get_challenges<Fr, 2>(challenge_labels);

    // Compute expected result: (1 + r₁ + r₂)·P0
    Fr total_scalar = Fr(1);
    for (const auto& challenge : challenges) {
        total_scalar += challenge;
    }
    Group expected_P0 = P0 * total_scalar;
    Group expected_P1 = P1 * total_scalar;

    // Verify the aggregated result matches the expected result
    EXPECT_EQ(aggregated.P0.get_value(), expected_P0.get_value()) << "Aggregated P0 should equal (1 + r₁ + r₂)·P0";
    EXPECT_EQ(aggregated.P1.get_value(), expected_P1.get_value()) << "Aggregated P1 should equal (1 + r₁ + r₂)·P1";

    // The result should still be a valid pairing point (scalar multiple of the original)
    bb::PairingPoints<typename Curve::NativeCurve> native_aggregated(aggregated.P0.get_value(),
                                                                     aggregated.P1.get_value());
    EXPECT_TRUE(native_aggregated.check())
        << "Aggregated duplicate pairing points should still satisfy pairing equation";
}

} // namespace bb::stdlib::recursion
